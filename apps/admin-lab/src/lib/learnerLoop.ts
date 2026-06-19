import {
  computeLearnerPath,
  loadResponseLogLearnerState,
  gradeAndAppend,
  ADAPTIVE_MASTERY_THRESHOLD
} from "@lrnki/application";
import type { JudgedOutcome, ResponseLogRow, SelfReportRating } from "@lrnki/domain-core";
import { createDatabaseClient, PostgresResponseLogStore } from "@lrnki/infrastructure-postgres";
import type {
  AnswerGradingJudgePort,
  ArtifactRepositoryPort,
  EnrichmentRunStorePort,
  LearnerPathStorePort,
  ResponseLogStorePort
} from "@lrnki/ports";

type Sql = ReturnType<typeof createDatabaseClient>;

// Server-only loaders + pure logic for the Admin Lab learner-loop surface (U8). The
// read loaders follow the existing read-only `withClient` pattern; the write path
// (resubmit) is Admin Lab's FIRST mutation, and it mutates LEARNER STATE ONLY — it
// appends to response_log and re-persists a learner_path, never a published graph or
// the Derived Graph Layer (AGENTS rule 12, R15).

async function withClient<T>(fn: (sql: Sql) => Promise<T>): Promise<T | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const sql = createDatabaseClient();
  try {
    return await fn(sql);
  } catch {
    return undefined;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// --- Conflict detection (R16) ----------------------------------------------

export type ConflictKind = "claimed_known_but_failed" | "claimed_unknown_but_passed";

export type ConceptConflict = {
  conceptId: string;
  kind: ConflictKind;
  activeSelfReport: SelfReportRating;
  latestGraded: JudgedOutcome;
};

const KNOWN_RATINGS: SelfReportRating[] = ["good", "easy"];

// A deliberate calibration signal (R16): a concept whose ACTIVE self-report says
// known but whose LATEST graded says incorrect (claimed-known-but-failed), or the
// reverse (claimed-unknown-but-passed). Requires both signal types for that concept;
// agreement is never flagged. Pure over a learner's rows.
export function detectConflicts(rows: ResponseLogRow[]): ConceptConflict[] {
  const byConcept = new Map<string, ResponseLogRow[]>();
  for (const row of rows) byConcept.set(row.conceptId, [...(byConcept.get(row.conceptId) ?? []), row]);

  const conflicts: ConceptConflict[] = [];
  for (const [conceptId, conceptRows] of byConcept) {
    const ordered = [...conceptRows].sort((a, b) => a.attemptSeq - b.attemptSeq);
    const selfReports = ordered.filter((row) => row.signalType === "self_report");
    const graded = ordered.filter((row) => row.signalType === "graded");
    if (selfReports.length === 0 || graded.length === 0) continue;

    const activeSelfReport = selfReports[selfReports.length - 1].selfReportRating as SelfReportRating;
    const latestGraded = graded[graded.length - 1].judgedOutcome as JudgedOutcome;
    const claimedKnown = KNOWN_RATINGS.includes(activeSelfReport);

    if (claimedKnown && latestGraded === "incorrect") {
      conflicts.push({ conceptId, kind: "claimed_known_but_failed", activeSelfReport, latestGraded });
    } else if (!claimedKnown && latestGraded === "correct") {
      conflicts.push({ conceptId, kind: "claimed_unknown_but_passed", activeSelfReport, latestGraded });
    }
  }
  return conflicts;
}

// --- Read loaders ----------------------------------------------------------

export type LearnerStateSummary = {
  learnerStateRef: string;
  responseCount: number;
  selfReportCount: number;
  gradedCount: number;
  conflictCount: number;
};

export type LearnerResponseView = {
  responseId: string;
  attemptSeq: number;
  conceptId: string;
  conceptLabel: string;
  cardId: string;
  question: string;
  answerKey: string;
  signalType: string;
  selfReportRating: string | null;
  judgedOutcome: string | null;
  gradedScore: number | null;
  responseSource: string;
  graderIdentity: string | null;
  submittedAnswer: string | null;
};

export type LearnerLoopDetail = {
  learnerStateRef: string;
  responses: LearnerResponseView[];
  conflicts: ConceptConflict[];
  // Existing paths for this learner, so a resubmit knows which path(s) to recompute.
  paths: { enrichmentId: string; targetDerivedNodeId: string; targetLabel: string }[];
};

function rowToResponseLogRow(row: ResponseRow): ResponseLogRow {
  return {
    responseId: row.response_id,
    learnerStateRef: row.learner_state_ref,
    cardId: row.card_id,
    conceptId: row.concept_id,
    signalType: row.signal_type as ResponseLogRow["signalType"],
    selfReportRating: row.self_report_rating as ResponseLogRow["selfReportRating"],
    judgedOutcome: row.judged_outcome as ResponseLogRow["judgedOutcome"],
    gradedScore: row.graded_score === null ? null : Number(row.graded_score),
    evidenceWeight: Number(row.evidence_weight),
    responseSource: row.response_source as ResponseLogRow["responseSource"],
    graderIdentity: row.grader_identity,
    batchId: row.batch_id,
    attemptSeq: Number(row.attempt_seq),
    submittedAnswer: row.submitted_answer,
    createdAt: new Date(row.created_at).toISOString()
  };
}

type ResponseRow = {
  response_id: string; learner_state_ref: string; card_id: string; concept_id: string; signal_type: string;
  self_report_rating: string | null; judged_outcome: string | null; graded_score: number | null;
  evidence_weight: number; response_source: string; grader_identity: string | null; batch_id: string | null;
  attempt_seq: number; submitted_answer: string | null; created_at: string;
};

export async function listLearnerStates(): Promise<LearnerStateSummary[] | undefined> {
  return withClient(async (sql) => {
    const rows = await sql<ResponseRow[]>`
      SELECT response_id, learner_state_ref, card_id, concept_id, signal_type, self_report_rating,
             judged_outcome, graded_score, evidence_weight, response_source, grader_identity, batch_id,
             attempt_seq, submitted_answer, created_at
      FROM response_log ORDER BY learner_state_ref, attempt_seq`;
    const byLearner = new Map<string, ResponseLogRow[]>();
    for (const row of rows) {
      const mapped = rowToResponseLogRow(row);
      byLearner.set(mapped.learnerStateRef, [...(byLearner.get(mapped.learnerStateRef) ?? []), mapped]);
    }
    return [...byLearner.entries()].map(([learnerStateRef, learnerRows]) => ({
      learnerStateRef,
      responseCount: learnerRows.length,
      selfReportCount: learnerRows.filter((r) => r.signalType === "self_report").length,
      gradedCount: learnerRows.filter((r) => r.signalType === "graded").length,
      conflictCount: detectConflicts(learnerRows).length
    }));
  });
}

export async function getLearnerLoopDetail(learnerStateRef: string): Promise<LearnerLoopDetail | undefined> {
  return withClient(async (sql) => {
    const rows = await sql<(ResponseRow & { concept_label: string; question: string; answer_key: string })[]>`
      SELECT rl.response_id, rl.learner_state_ref, rl.card_id, rl.concept_id, rl.signal_type, rl.self_report_rating,
             rl.judged_outcome, rl.graded_score, rl.evidence_weight, rl.response_source, rl.grader_identity, rl.batch_id,
             rl.attempt_seq, rl.submitted_answer, rl.created_at,
             c.normalized_label AS concept_label, cd.question, cd.answer_key
      FROM response_log rl
      JOIN concepts c ON c.concept_id = rl.concept_id
      JOIN cards cd ON cd.card_id = rl.card_id
      WHERE rl.learner_state_ref = ${learnerStateRef}
      ORDER BY rl.attempt_seq`;
    const logRows = rows.map(rowToResponseLogRow);
    const pathRows = await sql<{ enrichment_id: string; target_derived_node_id: string; target_label: string }[]>`
      SELECT p.enrichment_id, p.target_derived_node_id, n.canonical_label AS target_label
      FROM learner_paths p JOIN derived_graph_nodes n ON n.derived_node_id = p.target_derived_node_id
      WHERE p.learner_state_ref = ${learnerStateRef}
      ORDER BY p.created_at DESC`;

    return {
      learnerStateRef,
      responses: rows.map((row) => ({
        responseId: row.response_id,
        attemptSeq: Number(row.attempt_seq),
        conceptId: row.concept_id,
        conceptLabel: row.concept_label,
        cardId: row.card_id,
        question: row.question,
        answerKey: row.answer_key,
        signalType: row.signal_type,
        selfReportRating: row.self_report_rating,
        judgedOutcome: row.judged_outcome,
        gradedScore: row.graded_score === null ? null : Number(row.graded_score),
        responseSource: row.response_source,
        graderIdentity: row.grader_identity,
        submittedAnswer: row.submitted_answer
      })),
      conflicts: detectConflicts(logRows),
      paths: pathRows.map((row) => ({ enrichmentId: row.enrichment_id, targetDerivedNodeId: row.target_derived_node_id, targetLabel: row.target_label }))
    };
  });
}

// --- Resubmit + recompute (the first write) --------------------------------

// Append a new graded row for an operator-edited answer, then recompute and
// re-persist the learner's adaptive path(s) from the updated log. The original row
// stays intact (the log is append-only, R5/AE5). This composes already-tested
// application pieces (U5 gradeAndAppend + U6 estimator + projection) and touches
// ONLY learner-loop stores — there is no graph or derived-layer write port here, so
// it structurally cannot mutate a published graph (R15, AGENTS rule 12).
export async function resubmitAndRecompute(deps: {
  learnerStateRef: string;
  card: { cardId: string; conceptId: string; question: string; answerKey: string };
  declaredDomain: string;
  submittedAnswer: string;
  paths: { enrichmentId: string; targetDerivedNodeId: string }[];
  judge: AnswerGradingJudgePort;
  responseLog: ResponseLogStorePort;
  enrichmentStore: EnrichmentRunStorePort;
  pathStore: LearnerPathStorePort;
  artifacts: ArtifactRepositoryPort;
  newPathId: () => string;
}): Promise<{ judgedOutcome: JudgedOutcome; recomputedPaths: number }> {
  const { judgment } = await gradeAndAppend({
    learnerStateRef: deps.learnerStateRef,
    card: deps.card,
    declaredDomain: deps.declaredDomain,
    submittedAnswer: deps.submittedAnswer,
    judge: deps.judge,
    responseLog: deps.responseLog,
    responseSource: "human"
  });

  let recomputed = 0;
  for (const path of deps.paths) {
    const layer = await deps.enrichmentStore.getLayer(path.enrichmentId);
    if (!layer) continue;
    const nodeByConcept = new Map<string, string>();
    for (const node of layer.derivedNodes) if (node.nodeKind === "anchor") nodeByConcept.set(node.conceptId, node.derivedNodeId);
    const learnerState = await loadResponseLogLearnerState({
      responseLog: deps.responseLog,
      learnerStateRef: deps.learnerStateRef,
      conceptToNodeResolver: (conceptId) => nodeByConcept.get(conceptId)
    });
    // Re-project to the SAME stored target so the path keeps its identity and is
    // replaced (not orphaned); the updated mastery changes what is pruned.
    await computeLearnerPath({
      learnerPathId: deps.newPathId(),
      enrichmentId: path.enrichmentId,
      targetConceptId: path.targetDerivedNodeId,
      enrichmentStore: deps.enrichmentStore,
      learnerState,
      pathStore: deps.pathStore,
      artifacts: deps.artifacts,
      masteryThreshold: ADAPTIVE_MASTERY_THRESHOLD
    });
    recomputed++;
  }
  return { judgedOutcome: judgment.outcome, recomputedPaths: recomputed };
}

// Bind the real Postgres response-log store for the server action (read side reuses
// withClient; the action manages its own client lifecycle).
export function createResponseLogStore(sql: Sql): ResponseLogStorePort {
  return new PostgresResponseLogStore(sql);
}
