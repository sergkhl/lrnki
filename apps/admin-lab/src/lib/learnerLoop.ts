import {
  computeLearnerPath,
  loadResponseLogLearnerState,
  gradeAndAppend,
  classifyAdaptedNodes,
  foldConceptMastery,
  ADAPTIVE_MASTERY_THRESHOLD,
  type AdaptedNodeClassification
} from "@lrnki/application";
import type { JudgedOutcome, ResponseLogRow, SelfReportRating } from "@lrnki/domain-core";
import { createDatabaseClient, PostgresResponseLogStore } from "@lrnki/infrastructure-postgres";
import type {
  AnswerGradingJudgePort,
  ArtifactRepositoryPort,
  EnrichmentRunStorePort,
  LearnerPathStorePort,
  LearnerStatePort,
  ResponseLogStorePort
} from "@lrnki/ports";
import { getEnrichmentDetail } from "./enrichments";
import type { DerivedGraphDetail } from "./derivedGraph";

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
  derivedNodeId: string;
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
  const byNode = new Map<string, ResponseLogRow[]>();
  for (const row of rows) byNode.set(row.derivedNodeId, [...(byNode.get(row.derivedNodeId) ?? []), row]);

  const conflicts: ConceptConflict[] = [];
  for (const [derivedNodeId, nodeRows] of byNode) {
    const ordered = [...nodeRows].sort((a, b) => a.attemptSeq - b.attemptSeq);
    const selfReports = ordered.filter((row) => row.signalType === "self_report");
    const graded = ordered.filter((row) => row.signalType === "graded");
    if (selfReports.length === 0 || graded.length === 0) continue;

    const activeSelfReport = selfReports[selfReports.length - 1].selfReportRating as SelfReportRating;
    const latestGraded = graded[graded.length - 1].judgedOutcome as JudgedOutcome;
    const claimedKnown = KNOWN_RATINGS.includes(activeSelfReport);

    if (claimedKnown && latestGraded === "incorrect") {
      conflicts.push({ derivedNodeId, kind: "claimed_known_but_failed", activeSelfReport, latestGraded });
    } else if (!claimedKnown && latestGraded === "correct") {
      conflicts.push({ derivedNodeId, kind: "claimed_unknown_but_passed", activeSelfReport, latestGraded });
    }
  }
  return conflicts;
}

// --- Read loaders ----------------------------------------------------------

export type LearnerStateSummary = {
  learnerStateRef: string;
  latestResponseAt: string;
  responseCount: number;
  selfReportCount: number;
  gradedCount: number;
  conflictCount: number;
};

export type LearnerResponseView = {
  responseId: string;
  attemptSeq: number;
  derivedNodeId: string;
  nodeLabel: string;
  studyItemId: string;
  question: string;
  answerKey: string | null;
  signalType: string;
  selfReportRating: string | null;
  judgedOutcome: string | null;
  gradedScore: number | null;
  responseSource: string;
  graderIdentity: string | null;
  submittedAnswer: string | null;
  createdAt: string;
};

export type LearnerLoopDetail = {
  learnerStateRef: string;
  responses: LearnerResponseView[];
  conflicts: ConceptConflict[];
  // Existing paths for this learner, so a resubmit knows which path(s) to recompute.
  paths: { enrichmentId: string; targetDerivedNodeId: string; targetLabel: string }[];
  coverage: PathStudyItemCoverage[];
  // The learner's folded per-derived-node mastery (EXPERIMENT_ONLY trust) and a
  // synthetic-vs-human response-source tally — both feed the adapted-graph overlay (R1, R3).
  masteryByNode: Record<string, number>;
  responseSourceSummary: ResponseSourceSummary;
};

// --- Pure overlay helpers (U2) ---------------------------------------------

export type ResponseSourceSummary = { synthetic: number; human: number; total: number };

// Tally a learner's rows by response source so the page can badge data origin, keeping
// seeded synthetic rows distinguishable from real ones (R3). `total` includes any
// source outside synthetic|human so the badge never silently under-counts.
export function summarizeResponseSources(rows: { responseSource: string }[]): ResponseSourceSummary {
  let synthetic = 0;
  let human = 0;
  for (const row of rows) {
    if (row.responseSource === "synthetic") synthetic += 1;
    else if (row.responseSource === "human") human += 1;
  }
  return { synthetic, human, total: rows.length };
}

// Fold a learner's rows to a per-derived-node mastery map, reusing `foldConceptMastery`
// (graded outranks self-report; latest graded wins). Rows must be ordered by attempt_seq,
// as the loader returns them — this does NOT re-query (KTD: fold what is already loaded).
export function buildMasteryMap(rows: ResponseLogRow[]): Record<string, number> {
  const byNode = new Map<string, ResponseLogRow[]>();
  for (const row of rows) byNode.set(row.derivedNodeId, [...(byNode.get(row.derivedNodeId) ?? []), row]);
  const masteryByNode: Record<string, number> = {};
  for (const [derivedNodeId, nodeRows] of byNode) masteryByNode[derivedNodeId] = foldConceptMastery(nodeRows);
  return masteryByNode;
}

// Dedupe a learner's path scopes to distinct enrichments, keeping the first occurrence.
// Callers pass paths latest-first (the loader returns them `created_at DESC`), so the kept
// row is the most recent path per enrichment — resubmits append new path rows, and without
// this the page would render duplicate panel-pairs for one enrichment (Risks).
export function dedupeEnrichmentScopes<T extends { enrichmentId: string }>(paths: T[]): T[] {
  const seen = new Set<string>();
  const distinct: T[] = [];
  for (const path of paths) {
    if (seen.has(path.enrichmentId)) continue;
    seen.add(path.enrichmentId);
    distinct.push(path);
  }
  return distinct;
}

export type PathStudyItemCoverage = {
  enrichmentId: string;
  targetDerivedNodeId: string;
  targetLabel: string;
  steps: PathStudyItemCoverageStep[];
};

export type PathStudyItemCoverageStep = {
  position: number;
  derivedNodeId: string;
  label: string;
  groundingOrigin: string;
  includedReason: string;
  studyItem: { studyItemId: string; question: string; provenance: "source_cep" | "source_mentioned" | "generated" } | null;
  fallbackReason: string | null;
};

type TimestampedResponseLogRow = ResponseLogRow & { createdAt: string };

function rowToResponseLogRow(row: ResponseRow): TimestampedResponseLogRow {
  return {
    responseId: row.response_id,
    learnerStateRef: row.learner_state_ref,
    studyItemId: row.study_item_id,
    derivedNodeId: row.derived_node_id,
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
  response_id: string; learner_state_ref: string; study_item_id: string; derived_node_id: string; signal_type: string;
  self_report_rating: string | null; judged_outcome: string | null; graded_score: number | null;
  evidence_weight: number; response_source: string; grader_identity: string | null; batch_id: string | null;
  attempt_seq: number; submitted_answer: string | null; created_at: string;
};

export function summarizeLearnerStates(rows: TimestampedResponseLogRow[]): LearnerStateSummary[] {
  const byLearner = new Map<string, TimestampedResponseLogRow[]>();
  for (const row of rows) byLearner.set(row.learnerStateRef, [...(byLearner.get(row.learnerStateRef) ?? []), row]);

  return [...byLearner.entries()]
    .map(([learnerStateRef, learnerRows]) => ({
      learnerStateRef,
      latestResponseAt: learnerRows.reduce((latest, row) => row.createdAt > latest ? row.createdAt : latest, learnerRows[0].createdAt),
      responseCount: learnerRows.length,
      selfReportCount: learnerRows.filter((r) => r.signalType === "self_report").length,
      gradedCount: learnerRows.filter((r) => r.signalType === "graded").length,
      conflictCount: detectConflicts(learnerRows).length
    }))
    .sort((a, b) => b.latestResponseAt.localeCompare(a.latestResponseAt) || a.learnerStateRef.localeCompare(b.learnerStateRef));
}

export async function listLearnerStates(): Promise<LearnerStateSummary[] | undefined> {
  return withClient(async (sql) => {
    const rows = await sql<ResponseRow[]>`
      SELECT response_id, learner_state_ref, study_item_id, derived_node_id, signal_type, self_report_rating,
             judged_outcome, graded_score, evidence_weight, response_source, grader_identity, batch_id,
             attempt_seq, submitted_answer, created_at
      FROM response_log ORDER BY learner_state_ref, attempt_seq`;
    return summarizeLearnerStates(rows.map(rowToResponseLogRow));
  });
}

export async function getLearnerLoopDetail(learnerStateRef: string): Promise<LearnerLoopDetail | undefined> {
  return withClient(async (sql) => {
    const rows = await sql<(ResponseRow & { concept_label: string; question: string; answer_key: string })[]>`
      SELECT rl.response_id, rl.learner_state_ref, rl.study_item_id, rl.derived_node_id, rl.signal_type, rl.self_report_rating,
             rl.judged_outcome, rl.graded_score, rl.evidence_weight, rl.response_source, rl.grader_identity, rl.batch_id,
             rl.attempt_seq, rl.submitted_answer, rl.created_at,
             n.canonical_label AS concept_label, cd.question, cd.answer_key
      FROM response_log rl
      JOIN derived_graph_nodes n ON n.derived_node_id = rl.derived_node_id
      JOIN study_items cd ON cd.study_item_id = rl.study_item_id
      WHERE rl.learner_state_ref = ${learnerStateRef}
      ORDER BY rl.attempt_seq`;
    const logRows = rows.map(rowToResponseLogRow);
    const pathRows = await sql<{ enrichment_id: string; target_derived_node_id: string; target_label: string }[]>`
      SELECT p.enrichment_id, p.target_derived_node_id, n.canonical_label AS target_label
      FROM learner_paths p JOIN derived_graph_nodes n ON n.derived_node_id = p.target_derived_node_id
      WHERE p.learner_state_ref = ${learnerStateRef}
      ORDER BY p.created_at DESC`;
    const coverageRows = await sql<{
      enrichment_id: string; target_derived_node_id: string; target_label: string; position: number; derived_node_id: string;
      label: string; grounding_origin: string; included_reason: string; study_item_id: string | null; question: string | null; grounding_provenance: string | null; rejection_reason: string | null;
    }[]>`
      SELECT p.enrichment_id, p.target_derived_node_id, tn.canonical_label AS target_label,
             s.position, s.derived_node_id, n.canonical_label AS label, n.grounding_origin,
             s.included_reason, c.study_item_id, c.question, c.grounding_provenance, rc.reason AS rejection_reason
      FROM learner_paths p
      JOIN derived_graph_nodes tn ON tn.derived_node_id = p.target_derived_node_id
      JOIN learner_path_steps s ON s.learner_path_id = p.learner_path_id
      JOIN derived_graph_nodes n ON n.derived_node_id = s.derived_node_id
      LEFT JOIN study_items c ON c.derived_node_id = s.derived_node_id AND c.item_type = 'self_assessment'
      LEFT JOIN rejected_study_items rc ON rc.derived_node_id = s.derived_node_id
      WHERE p.learner_state_ref = ${learnerStateRef}
      ORDER BY p.created_at DESC, s.position`;
    const coverageByPath = new Map<string, PathStudyItemCoverage>();
    for (const row of coverageRows) {
      const key = `${row.enrichment_id}:${row.target_derived_node_id}`;
      let coverage = coverageByPath.get(key);
      if (!coverage) {
        coverage = { enrichmentId: row.enrichment_id, targetDerivedNodeId: row.target_derived_node_id, targetLabel: row.target_label, steps: [] };
        coverageByPath.set(key, coverage);
      }
      coverage.steps.push({
        position: Number(row.position),
        derivedNodeId: row.derived_node_id,
        label: row.label,
        groundingOrigin: row.grounding_origin,
        includedReason: row.included_reason,
        studyItem: row.study_item_id && row.question && row.grounding_provenance
          ? { studyItemId: row.study_item_id, question: row.question, provenance: row.grounding_provenance as NonNullable<PathStudyItemCoverageStep["studyItem"]>["provenance"] }
          : null,
        fallbackReason: row.study_item_id ? null : (row.rejection_reason ?? fallbackReasonFor(row.grounding_origin))
      });
    }

    return {
      learnerStateRef,
      responses: rows.map((row) => ({
        responseId: row.response_id,
        attemptSeq: Number(row.attempt_seq),
        derivedNodeId: row.derived_node_id,
        nodeLabel: row.concept_label,
        studyItemId: row.study_item_id,
        question: row.question,
        answerKey: row.answer_key,
        signalType: row.signal_type,
        selfReportRating: row.self_report_rating,
        judgedOutcome: row.judged_outcome,
        gradedScore: row.graded_score === null ? null : Number(row.graded_score),
        responseSource: row.response_source,
        graderIdentity: row.grader_identity,
        submittedAnswer: row.submitted_answer,
        createdAt: new Date(row.created_at).toISOString()
      })),
      conflicts: detectConflicts(logRows),
      paths: pathRows.map((row) => ({ enrichmentId: row.enrichment_id, targetDerivedNodeId: row.target_derived_node_id, targetLabel: row.target_label })),
      coverage: [...coverageByPath.values()],
      masteryByNode: buildMasteryMap(logRows),
      responseSourceSummary: summarizeResponseSources(logRows)
    };
  });
}

// --- Adapted-graph overlay loader (U2, R1/R3/R12) --------------------------

export type LearnerAdaptedGraph = {
  enrichmentId: string;
  targetDerivedNodeId: string;
  targetLabel: string;
  // The enrichment's Derived Graph Layer (read-only) and the learner's mastered /
  // frontier / locked classification over it.
  detail: DerivedGraphDetail;
  classification: AdaptedNodeClassification;
};

export type LearnerAdaptedGraphs = {
  learnerStateRef: string;
  responseSourceSummary: ResponseSourceSummary;
  graphs: LearnerAdaptedGraph[];
};

// One adapted-graph scope per DISTINCT enrichment in the learner's paths (KTD4/KTD5).
// Read + projection only: it composes the read-only `getLearnerLoopDetail` and
// `getEnrichmentDetail` with the pure `classifyAdaptedNodes`. No write port is imported,
// so it structurally cannot mutate a published graph or the Derived Graph Layer (R12).
export async function getLearnerAdaptedGraphs(learnerStateRef: string): Promise<LearnerAdaptedGraphs | undefined> {
  const detail = await getLearnerLoopDetail(learnerStateRef);
  if (!detail) return undefined;

  // A synchronous LearnerStatePort over the already-folded mastery map (do not re-query).
  const learnerState: LearnerStatePort = {
    learnerStateRef,
    mastery: (derivedNodeId: string) => detail.masteryByNode[derivedNodeId] ?? 0
  };

  const graphs: LearnerAdaptedGraph[] = [];
  for (const scope of dedupeEnrichmentScopes(detail.paths)) {
    const enrichmentDetail = await getEnrichmentDetail(scope.enrichmentId);
    if (!enrichmentDetail) continue;
    const classification = classifyAdaptedNodes({
      nodeIds: enrichmentDetail.nodes.map((node) => node.derivedNodeId),
      prerequisiteEdges: enrichmentDetail.edges,
      difficulties: enrichmentDetail.nodes.map((node) => ({ derivedNodeId: node.derivedNodeId, score: node.difficulty })),
      learnerState,
      masteryThreshold: ADAPTIVE_MASTERY_THRESHOLD
    });
    graphs.push({
      enrichmentId: scope.enrichmentId,
      targetDerivedNodeId: scope.targetDerivedNodeId,
      targetLabel: scope.targetLabel,
      detail: enrichmentDetail,
      classification
    });
  }
  return { learnerStateRef, responseSourceSummary: detail.responseSourceSummary, graphs };
}

// Generic fallback used ONLY when a step's node has neither a study item nor a persisted
// rejection row (e.g. study items were never generated for the enrichment). When a real
// rejection exists, the coverage view shows its persisted reason instead of this guess.
function fallbackReasonFor(groundingOrigin: string): string {
  if (groundingOrigin === "llm_grounded") return "Generated prerequisite, not directly recall-tested yet.";
  if (groundingOrigin === "source_mentioned") return "Source-mentioned prerequisite, not directly recall-tested yet.";
  return "Anchor node, not directly recall-tested yet.";
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
  studyItem: { studyItemId: string; derivedNodeId: string; question: string; answerKey: string };
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
    studyItem: deps.studyItem,
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
    const learnerState = await loadResponseLogLearnerState({
      responseLog: deps.responseLog,
      learnerStateRef: deps.learnerStateRef
    });
    // Re-project to the SAME stored target so the path keeps its identity and is
    // replaced (not orphaned); the updated mastery changes what is pruned.
    await computeLearnerPath({
      learnerPathId: deps.newPathId(),
      enrichmentId: path.enrichmentId,
      targetDerivedNodeId: path.targetDerivedNodeId,
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
