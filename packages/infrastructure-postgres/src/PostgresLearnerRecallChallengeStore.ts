import { randomUUID } from "node:crypto";
import type { StudyItem } from "@lrnki/domain-core";
import type {
  AppendRecallEventResult,
  NewRecallChallengeEvent,
  RecallChallenge,
  RecallChallengeEvent,
  RecallChallengeLineupEntry,
  RecallChallengeRecord,
  RecallChallengeScopeKind,
  RecallChallengeStorePort
} from "@lrnki/ports";
import type { Sql } from "postgres";
import { hydrateStudyItemRows, type StudyItemRow } from "./PostgresLearnerLoopStores";

// Recall Challenge persistence (plan 2026-07-13-003 U2, KTD2). The challenge row materializes
// `active|won|abandoned` for indexed queries; the immutable lineup + append-only events are the
// replayable authority the application fold re-derives combat state from. `appendEvent` is the
// ONLY transition write: it serializes per challenge with a row lock, dedupes on the client-held
// attempt/operation reference, rejects a stale sequence, and materializes a terminal status in
// the SAME transaction. Nothing here touches `response_log` (KTD4).
export class PostgresLearnerRecallChallengeStore implements RecallChallengeStorePort {
  constructor(private readonly sql: Sql) {}

  async create(input: {
    challengeId: string;
    learnerStateRef: string;
    enrichmentId: string;
    scopeKind: RecallChallengeScopeKind;
    scopeAnchorDerivedNodeId: string;
    lineup: { studyItemId: string; derivedNodeId: string }[];
  }): Promise<{ created: boolean }> {
    try {
      await this.sql.begin(async (tx) => {
        await tx`
          INSERT INTO recall_challenges (challenge_id, learner_state_ref, enrichment_id, scope_kind, scope_anchor_derived_node_id, status)
          VALUES (${input.challengeId}, ${input.learnerStateRef}, ${input.enrichmentId}, ${input.scopeKind}, ${input.scopeAnchorDerivedNodeId}, 'active')`;
        for (const [lineupIndex, entry] of input.lineup.entries()) {
          await tx`
            INSERT INTO recall_challenge_lineup (challenge_id, lineup_index, study_item_id, derived_node_id)
            VALUES (${input.challengeId}, ${lineupIndex}, ${entry.studyItemId}, ${entry.derivedNodeId})`;
        }
      });
      return { created: true };
    } catch (error) {
      // The one-active-per-scope partial unique (KTD2): a concurrent or repeated create loses
      // to the existing active challenge, which the caller resumes instead.
      if ((error as { code?: string }).code === "23505") return { created: false };
      throw error;
    }
  }

  async getForLearner(input: { challengeId: string; learnerStateRef: string }): Promise<RecallChallengeRecord | undefined> {
    const [row] = await this.sql<ChallengeRow[]>`
      SELECT challenge_id, learner_state_ref, enrichment_id, scope_kind, scope_anchor_derived_node_id, status, created_at, updated_at
      FROM recall_challenges
      WHERE challenge_id = ${input.challengeId} AND learner_state_ref = ${input.learnerStateRef}`;
    if (!row) return undefined;
    return this.loadRecord(row);
  }

  async getActiveForScope(input: {
    learnerStateRef: string;
    enrichmentId: string;
    scopeKind: RecallChallengeScopeKind;
    scopeAnchorDerivedNodeId: string;
  }): Promise<RecallChallengeRecord | undefined> {
    const [row] = await this.sql<ChallengeRow[]>`
      SELECT challenge_id, learner_state_ref, enrichment_id, scope_kind, scope_anchor_derived_node_id, status, created_at, updated_at
      FROM recall_challenges
      WHERE learner_state_ref = ${input.learnerStateRef} AND enrichment_id = ${input.enrichmentId}
        AND scope_kind = ${input.scopeKind} AND scope_anchor_derived_node_id = ${input.scopeAnchorDerivedNodeId}
        AND status = 'active'`;
    if (!row) return undefined;
    return this.loadRecord(row);
  }

  async listForLearnerEnrichment(input: { learnerStateRef: string; enrichmentId: string }): Promise<RecallChallenge[]> {
    const rows = await this.sql<ChallengeRow[]>`
      SELECT challenge_id, learner_state_ref, enrichment_id, scope_kind, scope_anchor_derived_node_id, status, created_at, updated_at
      FROM recall_challenges
      WHERE learner_state_ref = ${input.learnerStateRef} AND enrichment_id = ${input.enrichmentId}
      ORDER BY created_at ASC`;
    return rows.map(toChallenge);
  }

  async appendEvent(input: {
    challengeId: string;
    learnerStateRef: string;
    expectedSeq: number;
    event: NewRecallChallengeEvent;
    materializeStatus?: "won" | "abandoned";
  }): Promise<AppendRecallEventResult> {
    return this.sql.begin(async (tx) => {
      const [challenge] = await tx<{ status: string }[]>`
        SELECT status FROM recall_challenges
        WHERE challenge_id = ${input.challengeId} AND learner_state_ref = ${input.learnerStateRef}
        FOR UPDATE`;
      if (!challenge) return "conflict" as const;

      // Idempotent replay BEFORE the status gate: a retried final-ward answer arrives after the
      // same transaction already materialized `won`, and must read as its committed self.
      const [existing] = "attemptRef" in input.event
        ? await tx<{ event_id: string }[]>`
            SELECT event_id FROM recall_challenge_events WHERE challenge_id = ${input.challengeId} AND attempt_ref = ${input.event.attemptRef}`
        : await tx<{ event_id: string }[]>`
            SELECT event_id FROM recall_challenge_events WHERE challenge_id = ${input.challengeId} AND operation_ref = ${input.event.operationRef}`;
      if (existing) return "duplicate" as const;

      if (challenge.status !== "active") return "conflict" as const;

      const [{ next_seq: nextSeq }] = await tx<{ next_seq: number }[]>`
        SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM recall_challenge_events WHERE challenge_id = ${input.challengeId}`;
      if (Number(nextSeq) !== input.expectedSeq) return "stale" as const;

      const event = input.event;
      if ("attemptRef" in event) {
        await tx`
          INSERT INTO recall_challenge_events (event_id, challenge_id, seq, kind, attempt_ref, study_item_id, prompt_id, chosen_id, correct, recovery_phase, response_duration_ms)
          VALUES (${randomUUID()}, ${input.challengeId}, ${input.expectedSeq}, ${event.kind}, ${event.attemptRef}, ${event.studyItemId}, ${event.promptId}, ${event.chosenId}, ${event.correct}, ${event.recoveryPhase}, ${event.responseDurationMs})`;
      } else {
        await tx`
          INSERT INTO recall_challenge_events (event_id, challenge_id, seq, kind, operation_ref)
          VALUES (${randomUUID()}, ${input.challengeId}, ${input.expectedSeq}, ${event.kind}, ${event.operationRef})`;
      }
      if (input.materializeStatus) {
        await tx`
          UPDATE recall_challenges SET status = ${input.materializeStatus}, updated_at = now()
          WHERE challenge_id = ${input.challengeId}`;
      } else {
        await tx`UPDATE recall_challenges SET updated_at = now() WHERE challenge_id = ${input.challengeId}`;
      }
      return "appended" as const;
    });
  }

  async priorExposure(input: { learnerStateRef: string; enrichmentId: string }): Promise<Record<string, number>> {
    const rows = await this.sql<{ study_item_id: string; exposure: string }[]>`
      SELECT l.study_item_id, COUNT(*) AS exposure
      FROM recall_challenge_lineup l
      JOIN recall_challenges c ON c.challenge_id = l.challenge_id
      WHERE c.learner_state_ref = ${input.learnerStateRef} AND c.enrichment_id = ${input.enrichmentId}
      GROUP BY l.study_item_id`;
    return Object.fromEntries(rows.map((row) => [row.study_item_id, Number(row.exposure)]));
  }

  async listWonScopes(input: { learnerStateRef: string; enrichmentId: string }): Promise<{
    scopeKind: RecallChallengeScopeKind;
    scopeAnchorDerivedNodeId: string;
    challengeId: string;
  }[]> {
    // First victory per scope (KTD3): later rematch wins collapse to the one permanent
    // formation record.
    const rows = await this.sql<{ scope_kind: RecallChallengeScopeKind; scope_anchor_derived_node_id: string; challenge_id: string }[]>`
      SELECT DISTINCT ON (scope_kind, scope_anchor_derived_node_id) scope_kind, scope_anchor_derived_node_id, challenge_id
      FROM recall_challenges
      WHERE learner_state_ref = ${input.learnerStateRef} AND enrichment_id = ${input.enrichmentId} AND status = 'won'
      ORDER BY scope_kind, scope_anchor_derived_node_id, updated_at ASC`;
    return rows.map((row) => ({ scopeKind: row.scope_kind, scopeAnchorDerivedNodeId: row.scope_anchor_derived_node_id, challengeId: row.challenge_id }));
  }

  async hydrateLineupItems(input: { challengeId: string }): Promise<StudyItem[]> {
    // NO `superseded_at IS NULL` filter (KTD4): a durable lineup keeps resolving its items by
    // FK identity across Study Item Bank regeneration. Scope is exactly this challenge's
    // lineup rows — normal session projections still read only current bank items.
    const rows = await this.sql<StudyItemRow[]>`
      SELECT si.study_item_id, si.item_type, si.graph_version_id, si.enrichment_id, si.derived_node_id, si.grounding_provenance, si.question, si.explanation, si.facet, si.explorable_terms, si.generating_model, si.config_hash
      FROM recall_challenge_lineup l
      JOIN study_items si ON si.study_item_id = l.study_item_id
      WHERE l.challenge_id = ${input.challengeId}
      ORDER BY l.lineup_index`;
    return hydrateStudyItemRows(this.sql, rows);
  }

  private async loadRecord(row: ChallengeRow): Promise<RecallChallengeRecord> {
    const [lineupRows, eventRows] = await Promise.all([
      this.sql<LineupRow[]>`
        SELECT lineup_index, study_item_id, derived_node_id
        FROM recall_challenge_lineup WHERE challenge_id = ${row.challenge_id} ORDER BY lineup_index`,
      this.sql<EventRow[]>`
        SELECT seq, kind, attempt_ref, operation_ref, study_item_id, prompt_id, chosen_id, correct, recovery_phase, response_duration_ms
        FROM recall_challenge_events WHERE challenge_id = ${row.challenge_id} ORDER BY seq`
    ]);
    return {
      challenge: toChallenge(row),
      lineup: lineupRows.map((entry): RecallChallengeLineupEntry => ({
        lineupIndex: entry.lineup_index,
        studyItemId: entry.study_item_id,
        derivedNodeId: entry.derived_node_id
      })),
      events: eventRows.map(toEvent)
    };
  }
}

type ChallengeRow = {
  challenge_id: string;
  learner_state_ref: string;
  enrichment_id: string;
  scope_kind: RecallChallengeScopeKind;
  scope_anchor_derived_node_id: string;
  status: RecallChallenge["status"];
  created_at: Date;
  updated_at: Date;
};

type LineupRow = { lineup_index: number; study_item_id: string; derived_node_id: string };

type EventRow = {
  seq: number;
  kind: RecallChallengeEvent["kind"];
  attempt_ref: string | null;
  operation_ref: string | null;
  study_item_id: string | null;
  prompt_id: string | null;
  chosen_id: string | null;
  correct: boolean | null;
  recovery_phase: boolean | null;
  response_duration_ms: number | null;
};

function toChallenge(row: ChallengeRow): RecallChallenge {
  return {
    challengeId: row.challenge_id,
    learnerStateRef: row.learner_state_ref,
    enrichmentId: row.enrichment_id,
    scopeKind: row.scope_kind,
    scopeAnchorDerivedNodeId: row.scope_anchor_derived_node_id,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function toEvent(row: EventRow): RecallChallengeEvent {
  if (row.kind === "selection_answer" || row.kind === "matching_pair") {
    return {
      seq: row.seq,
      kind: row.kind,
      attemptRef: row.attempt_ref as string,
      studyItemId: row.study_item_id as string,
      promptId: row.prompt_id,
      chosenId: row.chosen_id as string,
      correct: row.correct as boolean,
      recoveryPhase: row.recovery_phase as boolean,
      responseDurationMs: row.response_duration_ms
    };
  }
  return { seq: row.seq, kind: row.kind, operationRef: row.operation_ref as string };
}
