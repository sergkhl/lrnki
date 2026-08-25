import { randomUUID } from "node:crypto";
import type { GeneratedGroundingBundle, ScaffoldDetour, ScaffoldNodePayload, ScaffoldStep } from "@lrnki/domain-core";
import type { GeneratedScaffoldStepForAudit, ScaffoldDetourStorePort, ScaffoldReferenceActivity, ScaffoldReferenceActivityReadPort, SourceExpeditionAssetExpectation } from "@lrnki/ports";
import type { Sql, TransactionSql } from "postgres";
import { currentSourceExpeditionAssetsMatch } from "./PostgresLearnerExpeditionStore";
import { hydrateConceptLessonRows, hydrateStudyItemRows, type LessonRow, type StudyItemRow } from "./PostgresLearnerLoopStores";

// Learner-Scoped Scaffold Detour persistence (plan 2026-07-12-002 U2, KTD2, ADR-0037). The
// aggregate lives across two tables: `learner_scaffold_detours` (identity + lifecycle +
// claim/fence) and its ordered `learner_scaffold_steps` (payload-on-step). Steps are immutable
// once published; the neutral supersede lifecycle is deliberately NOT mirrored. Every write is
// scoped to the owning learner. Idempotency and the claim fence are enforced at the DB (unique
// key + token comparison) so concurrent creates and competing claims resolve to one detour and
// one active attempt.

type DetourRow = {
  detour_id: string;
  learner_state_ref: string;
  enrichment_id: string;
  parent_derived_node_id: string;
  term: string;
  normalized_term: string;
  status: ScaffoldDetour["status"];
  latest_operation_id: string | null;
  claim_token: string | null;
  created_at: string;
  updated_at: string;
};

type StepRow = {
  scaffold_step_id: string;
  detour_id: string;
  ordinal: number;
  kind: "reference" | "generated";
  referenced_derived_node_id: string | null;
  referenced_concept_lesson_id: string | null;
  referenced_study_item_id: string | null;
  payload: ScaffoldNodePayload | null;
  grounding_bundle: GeneratedGroundingBundle | null;
  lesson_read_at: string | null;
};

function toStep(row: StepRow): ScaffoldStep {
  if (row.kind === "reference") {
    return {
      scaffoldStepId: row.scaffold_step_id,
      ordinal: row.ordinal,
      kind: "reference",
      referencedDerivedNodeId: row.referenced_derived_node_id as string,
      referencedConceptLessonId: row.referenced_concept_lesson_id as string,
      referencedStudyItemId: row.referenced_study_item_id as string
    };
  }
  return {
    scaffoldStepId: row.scaffold_step_id,
    ordinal: row.ordinal,
    kind: "generated",
    payload: row.payload as ScaffoldNodePayload,
    groundingBundle: row.grounding_bundle as GeneratedGroundingBundle,
    lessonReadAt: row.lesson_read_at === null ? null : new Date(row.lesson_read_at).toISOString()
  };
}

function toDetour(row: DetourRow, steps: ScaffoldStep[]): ScaffoldDetour {
  return {
    detourId: row.detour_id,
    learnerStateRef: row.learner_state_ref,
    enrichmentId: row.enrichment_id,
    parentDerivedNodeId: row.parent_derived_node_id,
    term: row.term,
    normalizedTerm: row.normalized_term,
    status: row.status,
    latestOperationId: row.latest_operation_id,
    claimToken: row.claim_token,
    steps: [...steps].sort((a, b) => a.ordinal - b.ordinal),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

export class PostgresLearnerScaffoldStore implements ScaffoldDetourStorePort {
  constructor(private readonly sql: Sql) {}

  private async stepsFor(tx: Sql | TransactionSql, detourId: string): Promise<ScaffoldStep[]> {
    const rows = await tx<StepRow[]>`
      SELECT scaffold_step_id, detour_id, ordinal, kind, referenced_derived_node_id, referenced_concept_lesson_id, referenced_study_item_id, payload, grounding_bundle, lesson_read_at
      FROM learner_scaffold_steps WHERE detour_id = ${detourId} ORDER BY ordinal`;
    return rows.map(toStep);
  }

  async upsertPending(input: {
    learnerStateRef: string; enrichmentId: string; parentDerivedNodeId: string; term: string; normalizedTerm: string;
  }): Promise<ScaffoldDetour> {
    return this.sql.begin(async (tx) => {
      // Concurrency-safe idempotent create: ON CONFLICT DO NOTHING lets exactly one racer insert
      // the generating aggregate; every racer then reads the single durable row FOR UPDATE.
      await tx`
        INSERT INTO learner_scaffold_detours (detour_id, learner_state_ref, enrichment_id, parent_derived_node_id, term, normalized_term, status)
        VALUES (${randomUUID()}, ${input.learnerStateRef}, ${input.enrichmentId}, ${input.parentDerivedNodeId}, ${input.term}, ${input.normalizedTerm}, 'generating')
        ON CONFLICT (learner_state_ref, enrichment_id, parent_derived_node_id, normalized_term) DO NOTHING`;
      const [row] = await tx<DetourRow[]>`
        SELECT detour_id, learner_state_ref, enrichment_id, parent_derived_node_id, term, normalized_term, status, latest_operation_id, claim_token, created_at, updated_at
        FROM learner_scaffold_detours
        WHERE learner_state_ref = ${input.learnerStateRef} AND enrichment_id = ${input.enrichmentId}
          AND parent_derived_node_id = ${input.parentDerivedNodeId} AND normalized_term = ${input.normalizedTerm}
        FOR UPDATE`;
      let steps = await this.stepsFor(tx, row.detour_id);
      // Restore (R18): a hidden detour with published content returns to `ready`; without
      // content it restarts `generating`.
      if (row.status === "hidden") {
        const restored: ScaffoldDetour["status"] = steps.length > 0 ? "ready" : "generating";
        await tx`UPDATE learner_scaffold_detours SET status = ${restored}, updated_at = now() WHERE detour_id = ${row.detour_id}`;
        row.status = restored;
      }
      steps = await this.stepsFor(tx, row.detour_id);
      return toDetour(row, steps);
    });
  }

  async upsertReadyReference(input: {
    learnerStateRef: string;
    enrichmentId: string;
    parentDerivedNodeId: string;
    term: string;
    normalizedTerm: string;
    expectedAssets: SourceExpeditionAssetExpectation;
    reference: {
      referencedDerivedNodeId: string;
      referencedConceptLessonId: string;
      referencedStudyItemId: string;
    };
  }): Promise<ScaffoldDetour | undefined> {
    const lessonIds = [...new Set(input.expectedAssets.currentConceptLessonIds)];
    const itemIds = [...new Set(input.expectedAssets.currentStudyItemIds)];
    if (
      lessonIds.length === 0
      || itemIds.length === 0
      || !lessonIds.includes(input.reference.referencedConceptLessonId)
      || !itemIds.includes(input.reference.referencedStudyItemId)
    ) return undefined;

    return this.sql.begin(async (tx) => {
      // Recheck the exact active Source Expedition snapshot inside the publication transaction.
      // The application already qualified the snapshot; these locks close the authorize→write
      // race without teaching this generic store how that identity is derived.
      if (!await currentSourceExpeditionAssetsMatch(tx, input.enrichmentId, input.expectedAssets)) {
        return undefined;
      }
      const [owned] = await tx<{ learner_expedition_id: string }[]>`
        SELECT learner_expedition_id
        FROM learner_expeditions
        WHERE learner_state_ref = ${input.learnerStateRef}
          AND enrichment_id = ${input.enrichmentId}
          AND kind = 'source'
          AND status = 'ready'
          AND active
          AND asset_set_identity = ${input.expectedAssets.assetSetIdentity}
        FOR SHARE`;
      if (!owned) return undefined;

      const [validPin] = await tx<{ valid: boolean }[]>`
        SELECT EXISTS (
          SELECT 1
          FROM derived_graph_nodes parent
          JOIN derived_graph_nodes target
            ON target.derived_node_id = ${input.reference.referencedDerivedNodeId}
           AND target.enrichment_id = ${input.enrichmentId}
           AND target.declared_domain = parent.declared_domain
          JOIN concept_lessons cl
            ON cl.concept_lesson_id = ${input.reference.referencedConceptLessonId}
           AND cl.derived_node_id = target.derived_node_id
           AND cl.enrichment_id = ${input.enrichmentId}
           AND cl.superseded_at IS NULL
          JOIN study_items si
            ON si.study_item_id = ${input.reference.referencedStudyItemId}
           AND si.derived_node_id = target.derived_node_id
           AND si.enrichment_id = ${input.enrichmentId}
           AND si.item_type = 'option_select'
           AND si.superseded_at IS NULL
          WHERE parent.derived_node_id = ${input.parentDerivedNodeId}
            AND parent.enrichment_id = ${input.enrichmentId}
        ) AS valid`;
      if (!validPin?.valid) return undefined;

      await tx`
        INSERT INTO learner_scaffold_detours (
          detour_id, learner_state_ref, enrichment_id, parent_derived_node_id,
          term, normalized_term, status
        ) VALUES (
          ${randomUUID()}, ${input.learnerStateRef}, ${input.enrichmentId},
          ${input.parentDerivedNodeId}, ${input.term}, ${input.normalizedTerm}, 'ready'
        )
        ON CONFLICT (learner_state_ref, enrichment_id, parent_derived_node_id, normalized_term)
        DO NOTHING`;
      const [row] = await tx<DetourRow[]>`
        SELECT detour_id, learner_state_ref, enrichment_id, parent_derived_node_id, term,
               normalized_term, status, latest_operation_id, claim_token, created_at, updated_at
        FROM learner_scaffold_detours
        WHERE learner_state_ref = ${input.learnerStateRef}
          AND enrichment_id = ${input.enrichmentId}
          AND parent_derived_node_id = ${input.parentDerivedNodeId}
          AND normalized_term = ${input.normalizedTerm}
        FOR UPDATE`;

      const [existing] = await tx<{ scaffold_step_id: string }[]>`
        SELECT scaffold_step_id
        FROM learner_scaffold_steps
        WHERE detour_id = ${row.detour_id}
          AND kind = 'reference'
          AND referenced_derived_node_id = ${input.reference.referencedDerivedNodeId}
          AND referenced_concept_lesson_id = ${input.reference.referencedConceptLessonId}
          AND referenced_study_item_id = ${input.reference.referencedStudyItemId}
        LIMIT 1`;
      if (!existing) {
        const [ordinal] = await tx<{ next_ordinal: number }[]>`
          SELECT COALESCE(MAX(ordinal) + 1, 0)::int AS next_ordinal
          FROM learner_scaffold_steps
          WHERE detour_id = ${row.detour_id}`;
        await tx`
          INSERT INTO learner_scaffold_steps (
            scaffold_step_id, detour_id, ordinal, kind, referenced_derived_node_id,
            referenced_concept_lesson_id, referenced_study_item_id
          ) VALUES (
            ${randomUUID()}, ${row.detour_id}, ${ordinal.next_ordinal}, 'reference',
            ${input.reference.referencedDerivedNodeId},
            ${input.reference.referencedConceptLessonId},
            ${input.reference.referencedStudyItemId}
          )`;
      }

      // Direct reference publication fences any obsolete in-flight generated attempt. Its
      // operation id and immutable generated rows remain as historical audit evidence.
      await tx`
        UPDATE learner_scaffold_detours
        SET status = 'ready', claim_token = NULL, claimed_at = NULL, updated_at = now()
        WHERE detour_id = ${row.detour_id}`;
      const [ready] = await tx<DetourRow[]>`
        SELECT detour_id, learner_state_ref, enrichment_id, parent_derived_node_id, term,
               normalized_term, status, latest_operation_id, claim_token, created_at, updated_at
        FROM learner_scaffold_detours
        WHERE detour_id = ${row.detour_id}`;
      return toDetour(ready, await this.stepsFor(tx, ready.detour_id));
    });
  }

  async getById(detourId: string): Promise<ScaffoldDetour | undefined> {
    const [row] = await this.sql<DetourRow[]>`
      SELECT detour_id, learner_state_ref, enrichment_id, parent_derived_node_id, term, normalized_term, status, latest_operation_id, claim_token, created_at, updated_at
      FROM learner_scaffold_detours WHERE detour_id = ${detourId}`;
    if (!row) return undefined;
    return toDetour(row, await this.stepsFor(this.sql, detourId));
  }

  async listActiveForLearnerEnrichment(learnerStateRef: string, enrichmentId: string): Promise<ScaffoldDetour[]> {
    const rows = await this.sql<DetourRow[]>`
      SELECT detour_id, learner_state_ref, enrichment_id, parent_derived_node_id, term, normalized_term, status, latest_operation_id, claim_token, created_at, updated_at
      FROM learner_scaffold_detours
      WHERE learner_state_ref = ${learnerStateRef} AND enrichment_id = ${enrichmentId} AND status <> 'hidden'
      ORDER BY created_at`;
    const detours: ScaffoldDetour[] = [];
    for (const row of rows) detours.push(toDetour(row, await this.stepsFor(this.sql, row.detour_id)));
    return detours;
  }

  // ONE staleness predicate, shared by claim-next and fail-exhausted (only the attempts
  // comparison differs), mirroring the topic expedition store. A `generating` detour is dead —
  // reclaimable or failable — when it was never claimed, or its claim aged past the window AND
  // its operation heartbeat did too. COALESCE covers the crash window where a fresh op id is
  // installed but the operation_runs row was never inserted: the detour's own updated_at stands
  // in for the missing heartbeat, so no row is permanently untouchable.
  private generatingStaleness(staleBefore: Date) {
    return this.sql`
      d.status = 'generating'
      AND (
        d.claimed_at IS NULL
        OR (
          d.claimed_at < ${staleBefore}
          AND COALESCE(opr.last_progress_at, d.updated_at) < ${staleBefore}
        )
      )`;
  }

  async claimNextGenerating(input: { staleBefore: Date; maxAttempts: number }): Promise<ScaffoldDetour | undefined> {
    // A fresh UUID is BOTH the operation id (stage/spend attribution) and the fencing token
    // (KTD7): the terminal publish compares claim_token, and the operation records stages under
    // latest_operation_id — the same value.
    const token = randomUUID();
    const [row] = await this.sql<DetourRow[]>`
      WITH candidate AS (
        SELECT d.detour_id
        FROM learner_scaffold_detours d
        LEFT JOIN operation_runs opr
          ON opr.operation_id = d.latest_operation_id
         AND opr.operation_type = 'scaffold'
        WHERE ${this.generatingStaleness(input.staleBefore)}
          AND d.generation_attempts < ${input.maxAttempts}
        ORDER BY d.created_at ASC
        LIMIT 1
        FOR UPDATE OF d SKIP LOCKED
      )
      UPDATE learner_scaffold_detours d
      SET latest_operation_id = ${token},
          claim_token = ${token},
          claimed_at = now(),
          generation_attempts = d.generation_attempts + 1,
          updated_at = now()
      FROM candidate
      WHERE d.detour_id = candidate.detour_id
      RETURNING d.detour_id, d.learner_state_ref, d.enrichment_id, d.parent_derived_node_id, d.term, d.normalized_term, d.status, d.latest_operation_id, d.claim_token, d.created_at, d.updated_at`;
    if (!row) return undefined;
    return toDetour(row, await this.stepsFor(this.sql, row.detour_id));
  }

  async failExhaustedGenerating(input: { staleBefore: Date; maxAttempts: number }): Promise<number> {
    const rows = await this.sql<{ detour_id: string }[]>`
      WITH candidate AS (
        SELECT d.detour_id
        FROM learner_scaffold_detours d
        LEFT JOIN operation_runs opr
          ON opr.operation_id = d.latest_operation_id
         AND opr.operation_type = 'scaffold'
        WHERE ${this.generatingStaleness(input.staleBefore)}
          AND d.generation_attempts >= ${input.maxAttempts}
        FOR UPDATE OF d SKIP LOCKED
      )
      UPDATE learner_scaffold_detours d
      SET status = 'failed', claim_token = null, claimed_at = null, updated_at = now()
      FROM candidate
      WHERE d.detour_id = candidate.detour_id
      RETURNING d.detour_id`;
    return rows.length;
  }

  async publishReady(input: { detourId: string; claimToken: string; steps: ScaffoldStep[] }): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      const [row] = await tx<{ claim_token: string | null; status: ScaffoldDetour["status"] }[]>`
        SELECT claim_token, status FROM learner_scaffold_detours WHERE detour_id = ${input.detourId} FOR UPDATE`;
      // Fence: a stale/lost token or a non-generating detour publishes nothing (KTD9).
      if (!row || row.status !== "generating" || row.claim_token !== input.claimToken) return false;
      for (const step of input.steps) {
        if (step.kind === "reference") {
          const [valid] = await tx<{ valid: boolean }[]>`
            SELECT EXISTS (
              SELECT 1
              FROM learner_scaffold_detours d
              JOIN derived_graph_nodes parent ON parent.derived_node_id = d.parent_derived_node_id
              JOIN concept_lessons cl
                ON cl.concept_lesson_id = ${step.referencedConceptLessonId}
               AND cl.derived_node_id = ${step.referencedDerivedNodeId}
              JOIN study_items si
                ON si.study_item_id = ${step.referencedStudyItemId}
               AND si.derived_node_id = ${step.referencedDerivedNodeId}
               AND si.item_type = 'option_select'
              JOIN derived_graph_nodes target ON target.derived_node_id = ${step.referencedDerivedNodeId}
              WHERE d.detour_id = ${input.detourId}
                AND cl.enrichment_id = d.enrichment_id
                AND si.enrichment_id = d.enrichment_id
                AND target.enrichment_id = d.enrichment_id
                AND target.declared_domain = parent.declared_domain
            ) AS valid`;
          if (!valid?.valid) throw new Error(`reference step ${step.scaffoldStepId} does not pin same-layer, same-domain option-select assets`);
          await tx`
            INSERT INTO learner_scaffold_steps (scaffold_step_id, detour_id, ordinal, kind, referenced_derived_node_id, referenced_concept_lesson_id, referenced_study_item_id)
            VALUES (${step.scaffoldStepId}, ${input.detourId}, ${step.ordinal}, 'reference', ${step.referencedDerivedNodeId}, ${step.referencedConceptLessonId}, ${step.referencedStudyItemId})`;
        } else {
          await tx`
            INSERT INTO learner_scaffold_steps (scaffold_step_id, detour_id, ordinal, kind, payload, grounding_bundle, lesson_read_at)
            VALUES (${step.scaffoldStepId}, ${input.detourId}, ${step.ordinal}, 'generated', ${tx.json(step.payload)}, ${tx.json(step.groundingBundle)}, ${step.lessonReadAt})`;
        }
      }
      await tx`UPDATE learner_scaffold_detours SET status = 'ready', claim_token = NULL, updated_at = now() WHERE detour_id = ${input.detourId}`;
      return true;
    });
  }

  async releaseClaim(input: { detourId: string; claimToken: string }): Promise<boolean> {
    const rows = await this.sql`
      UPDATE learner_scaffold_detours
      SET claim_token = NULL, claimed_at = NULL, updated_at = now()
      WHERE detour_id = ${input.detourId} AND status = 'generating' AND claim_token = ${input.claimToken}
      RETURNING detour_id`;
    return rows.length === 1;
  }

  async markFailed(input: { detourId: string; claimToken: string }): Promise<boolean> {
    const rows = await this.sql`
      UPDATE learner_scaffold_detours SET status = 'failed', claim_token = NULL, updated_at = now()
      WHERE detour_id = ${input.detourId} AND status = 'generating' AND claim_token = ${input.claimToken}
      RETURNING detour_id`;
    return rows.length === 1;
  }

  async restartGenerating(input: { detourId: string; learnerStateRef: string }): Promise<ScaffoldDetour | undefined> {
    const rows = await this.sql`
      UPDATE learner_scaffold_detours
      SET status = 'generating', latest_operation_id = NULL, claim_token = NULL, claimed_at = NULL, generation_attempts = 0, updated_at = now()
      WHERE detour_id = ${input.detourId} AND learner_state_ref = ${input.learnerStateRef} AND status = 'failed'
      RETURNING detour_id`;
    if (rows.length !== 1) return undefined;
    return this.getById(input.detourId);
  }

  async hide(input: { detourId: string; learnerStateRef: string }): Promise<boolean> {
    // Hide a ready detour or dismiss a failed one; content + evidence are preserved (R18).
    const rows = await this.sql`
      UPDATE learner_scaffold_detours SET status = 'hidden', claim_token = NULL, updated_at = now()
      WHERE detour_id = ${input.detourId} AND learner_state_ref = ${input.learnerStateRef} AND status IN ('ready', 'failed')
      RETURNING detour_id`;
    return rows.length === 1;
  }

  async getStep(input: { scaffoldStepId: string; learnerStateRef: string }): Promise<{ step: ScaffoldStep; detourId: string } | undefined> {
    const [row] = await this.sql<StepRow[]>`
      SELECT s.scaffold_step_id, s.detour_id, s.ordinal, s.kind, s.referenced_derived_node_id, s.referenced_concept_lesson_id, s.referenced_study_item_id, s.payload, s.grounding_bundle, s.lesson_read_at
      FROM learner_scaffold_steps s
      JOIN learner_scaffold_detours d ON d.detour_id = s.detour_id
      WHERE s.scaffold_step_id = ${input.scaffoldStepId} AND d.learner_state_ref = ${input.learnerStateRef}`;
    if (!row) return undefined;
    return { step: toStep(row), detourId: row.detour_id };
  }

  async markLessonRead(input: { scaffoldStepId: string; learnerStateRef: string; readAt: string }): Promise<void> {
    // Only a generated step (with a payload) records a lesson read; a reference step's neutral
    // lesson-read rides the existing neutral lesson_reads path.
    await this.sql`
      UPDATE learner_scaffold_steps s
      SET lesson_read_at = ${input.readAt}
      FROM learner_scaffold_detours d
      WHERE s.detour_id = d.detour_id AND s.scaffold_step_id = ${input.scaffoldStepId}
        AND d.learner_state_ref = ${input.learnerStateRef} AND s.kind = 'generated'`;
  }

  async listGeneratedStepsForAudit(enrichmentId?: string): Promise<GeneratedScaffoldStepForAudit[]> {
    // Scaffold-content audit read seam (plan 2026-07-16-001 U1, KTD1). A clean relational join:
    // generated step → its detour (term, enrichment) → the parent derived node (label + Declared
    // Domain). Reference steps are filtered out (they carry no generated payload). Ordered
    // deterministically so re-runs and evidence diffs are stable.
    const rows = await this.sql<AuditStepRow[]>`
      SELECT s.scaffold_step_id, s.detour_id, s.payload, s.grounding_bundle, d.enrichment_id, d.term,
             n.canonical_label AS parent_label, n.declared_domain
      FROM learner_scaffold_steps s
      JOIN learner_scaffold_detours d ON d.detour_id = s.detour_id
      JOIN derived_graph_nodes n ON n.derived_node_id = d.parent_derived_node_id
      WHERE s.kind = 'generated'
        ${enrichmentId ? this.sql`AND d.enrichment_id = ${enrichmentId}` : this.sql``}
      ORDER BY d.created_at, s.ordinal`;
    return rows.map((row) => ({
      detourId: row.detour_id,
      scaffoldStepId: row.scaffold_step_id,
      enrichmentId: row.enrichment_id,
      declaredDomain: row.declared_domain,
      term: row.term,
      parentLabel: row.parent_label,
      payload: row.payload as ScaffoldNodePayload,
      groundingBundle: row.grounding_bundle as GeneratedGroundingBundle
    }));
  }
}

export class PostgresScaffoldReferenceActivityRead implements ScaffoldReferenceActivityReadPort {
  constructor(private readonly sql: Sql) {}

  async listForLearnerEnrichment(input: { learnerStateRef: string; enrichmentId: string }): Promise<ScaffoldReferenceActivity[]> {
    const rows = await this.sql<PinnedReferenceRow[]>`
      SELECT s.scaffold_step_id, s.detour_id, s.referenced_derived_node_id, s.referenced_concept_lesson_id, s.referenced_study_item_id
      FROM learner_scaffold_steps s
      JOIN learner_scaffold_detours d ON d.detour_id = s.detour_id
      WHERE s.kind = 'reference' AND d.learner_state_ref = ${input.learnerStateRef}
        AND d.enrichment_id = ${input.enrichmentId} AND d.status <> 'hidden'
      ORDER BY d.created_at, s.ordinal`;
    return this.hydrate(rows);
  }

  async getForLearnerStep(input: { learnerStateRef: string; scaffoldStepId: string }): Promise<ScaffoldReferenceActivity | undefined> {
    const rows = await this.sql<PinnedReferenceRow[]>`
      SELECT s.scaffold_step_id, s.detour_id, s.referenced_derived_node_id, s.referenced_concept_lesson_id, s.referenced_study_item_id
      FROM learner_scaffold_steps s
      JOIN learner_scaffold_detours d ON d.detour_id = s.detour_id
      WHERE s.kind = 'reference' AND s.scaffold_step_id = ${input.scaffoldStepId}
        AND d.learner_state_ref = ${input.learnerStateRef} AND d.status = 'ready'`;
    const [activity] = await this.hydrate(rows);
    return activity;
  }

  private async hydrate(rows: PinnedReferenceRow[]): Promise<ScaffoldReferenceActivity[]> {
    if (rows.length === 0) return [];
    const lessonIds = [...new Set(rows.map((row) => row.referenced_concept_lesson_id))];
    const itemIds = [...new Set(rows.map((row) => row.referenced_study_item_id))];
    const [lessonRows, itemRows] = await Promise.all([
      this.sql<LessonRow[]>`
        SELECT concept_lesson_id, graph_version_id, enrichment_id, derived_node_id, canonical_label, explorable_terms, generating_model, config_hash
        FROM concept_lessons WHERE concept_lesson_id IN ${this.sql(lessonIds)}`,
      this.sql<StudyItemRow[]>`
        SELECT study_item_id, item_type, graph_version_id, enrichment_id, derived_node_id, grounding_provenance, question, explanation, facet, explorable_terms, generating_model, config_hash
        FROM study_items WHERE study_item_id IN ${this.sql(itemIds)} AND item_type = 'option_select'`
    ]);
    const [lessons, items] = await Promise.all([
      hydrateConceptLessonRows(this.sql, lessonRows),
      hydrateStudyItemRows(this.sql, itemRows)
    ]);
    const lessonById = new Map(lessons.map((lesson) => [lesson.conceptLessonId, lesson]));
    const itemById = new Map(items.filter((item) => item.itemType === "option_select").map((item) => [item.studyItemId, item]));
    return rows.map((row) => {
      const lesson = lessonById.get(row.referenced_concept_lesson_id);
      const item = itemById.get(row.referenced_study_item_id);
      if (!lesson || !item) throw new Error(`pinned scaffold reference ${row.scaffold_step_id} could not be hydrated`);
      return {
        scaffoldStepId: row.scaffold_step_id,
        detourId: row.detour_id,
        referencedDerivedNodeId: row.referenced_derived_node_id,
        lesson,
        item
      };
    });
  }
}

type PinnedReferenceRow = {
  scaffold_step_id: string;
  detour_id: string;
  referenced_derived_node_id: string;
  referenced_concept_lesson_id: string;
  referenced_study_item_id: string;
};

type AuditStepRow = {
  scaffold_step_id: string;
  detour_id: string;
  payload: ScaffoldNodePayload | null;
  grounding_bundle: GeneratedGroundingBundle | null;
  enrichment_id: string;
  term: string;
  parent_label: string;
  declared_domain: string;
};
