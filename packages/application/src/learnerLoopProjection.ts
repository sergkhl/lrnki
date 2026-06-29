import type { CalibrationVerdict, JudgedOutcome, ResponseLogRow } from "@lrnki/domain-core";
import type {
  DerivedGraphDetail,
  EnrichmentInspectionReadPort,
  LearnerLoopPathScope,
  LearnerLoopReadPort,
  LearnerStatePort,
  PathStudyItemCoverage
} from "@lrnki/ports";
import { foldConceptMastery } from "./responseLogLearnerState";
import { ADAPTIVE_MASTERY_THRESHOLD, classifyAdaptedNodes, type AdaptedNodeClassification } from "./adaptivePathProjection";

// Pure learner-loop projection folds (ADR-0027 projection compute, KTD7). These turn a
// learner's already-loaded verdicts + response rows into the conflict, mastery, source,
// and learner-summary views the learner-loop surface renders. They are store-free and
// data-in/data-out, so both the Admin Lab and the forthcoming Learner Application reuse
// one definition (AGENTS rule 18); the DB-bound reading use-cases over the read port live
// in the same package and call these. The reading use-cases (getLearnerLoopDetail /
// listLearnerStates / getLearnerAdaptedGraphs) and the read-port row shapes are added by
// the learner-loop read port; this module owns only the pure folds.

// --- Conflict detection (R12, AE3) -----------------------------------------

export type ConflictKind = "claimed_known_but_failed" | "claimed_unknown_but_passed";

export type ConceptConflict = {
  derivedNodeId: string;
  kind: ConflictKind;
  verdict: CalibrationVerdict["verdict"];
  latestGraded: JudgedOutcome;
};

// A calibration↔graded conflict (R12, AE3): VERDICT-vs-graded. A node whose mutable verdict
// says `known` but whose LATEST graded outcome is `incorrect` (claimed-known-but-failed), or
// whose verdict says `learn` but whose latest graded is `correct` (claimed-unknown-but-passed).
// Requires BOTH a verdict and a graded row; agreement is never flagged. Calibration/graded
// coexistence is SURFACED here, never silently resolved by a precedence rule (KTD7). Pure over
// the learner's verdicts + rows.
export function detectConflicts(verdicts: CalibrationVerdict[], gradedRows: ResponseLogRow[]): ConceptConflict[] {
  const verdictByNode = new Map(verdicts.map((verdict) => [verdict.derivedNodeId, verdict.verdict] as const));
  const latestGradedByNode = new Map<string, ResponseLogRow>();
  for (const row of gradedRows) {
    if (row.signalType !== "graded") continue;
    const current = latestGradedByNode.get(row.derivedNodeId);
    if (!current || row.attemptSeq > current.attemptSeq) latestGradedByNode.set(row.derivedNodeId, row);
  }

  const conflicts: ConceptConflict[] = [];
  for (const [derivedNodeId, verdict] of verdictByNode) {
    const graded = latestGradedByNode.get(derivedNodeId);
    if (!graded) continue;
    const latestGraded = graded.judgedOutcome as JudgedOutcome;
    if (verdict === "known" && latestGraded === "incorrect") {
      conflicts.push({ derivedNodeId, kind: "claimed_known_but_failed", verdict, latestGraded });
    } else if (verdict === "learn" && latestGraded === "correct") {
      conflicts.push({ derivedNodeId, kind: "claimed_unknown_but_passed", verdict, latestGraded });
    }
  }
  return conflicts.sort((a, b) => a.derivedNodeId.localeCompare(b.derivedNodeId));
}

// --- Mastery + response-source folds (shared with the study projection) -----

export type ResponseSourceSummary = { synthetic: number; human: number; total: number };

// Tally a learner's rows by response source so a surface can badge data origin, keeping
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
// as the loaders return them — this does NOT re-query (fold what is already loaded).
export function buildMasteryMap(rows: ResponseLogRow[]): Record<string, number> {
  const byNode = new Map<string, ResponseLogRow[]>();
  for (const row of rows) byNode.set(row.derivedNodeId, [...(byNode.get(row.derivedNodeId) ?? []), row]);
  const masteryByNode: Record<string, number> = {};
  for (const [derivedNodeId, nodeRows] of byNode) masteryByNode[derivedNodeId] = foldConceptMastery(nodeRows);
  return masteryByNode;
}

// Dedupe a learner's path scopes to distinct enrichments, keeping the first occurrence.
// Callers pass paths latest-first (loaders return them `created_at DESC`), so the kept row
// is the most recent path per enrichment — resubmits append new path rows, and without this
// a surface would render duplicate panel-pairs for one enrichment.
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

// --- Learner-state summaries -----------------------------------------------

export type LearnerStateSummary = {
  learnerStateRef: string;
  latestResponseAt: string | null;
  responseCount: number;
  // How many nodes the learner marked `known`.
  knownVerdictCount: number;
  gradedCount: number;
  conflictCount: number;
};

export type TimestampedResponseLogRow = ResponseLogRow & { createdAt: string };

export function summarizeLearnerStates(rows: TimestampedResponseLogRow[], verdicts: CalibrationVerdict[]): LearnerStateSummary[] {
  const rowsByLearner = new Map<string, TimestampedResponseLogRow[]>();
  for (const row of rows) rowsByLearner.set(row.learnerStateRef, [...(rowsByLearner.get(row.learnerStateRef) ?? []), row]);
  const verdictsByLearner = new Map<string, CalibrationVerdict[]>();
  for (const verdict of verdicts) verdictsByLearner.set(verdict.learnerStateRef, [...(verdictsByLearner.get(verdict.learnerStateRef) ?? []), verdict]);

  // A learner appears if it has rows OR verdicts (a freshly-calibrated learner with no
  // graded answers yet still belongs in the list).
  const learnerRefs = new Set<string>([...rowsByLearner.keys(), ...verdictsByLearner.keys()]);

  return [...learnerRefs]
    .map((learnerStateRef) => {
      const learnerRows = rowsByLearner.get(learnerStateRef) ?? [];
      const learnerVerdicts = verdictsByLearner.get(learnerStateRef) ?? [];
      const latestResponseAt = learnerRows.length > 0
        ? learnerRows.reduce((latest, row) => (row.createdAt > latest ? row.createdAt : latest), learnerRows[0].createdAt)
        : null;
      return {
        learnerStateRef,
        latestResponseAt,
        responseCount: learnerRows.length,
        knownVerdictCount: learnerVerdicts.filter((verdict) => verdict.verdict === "known").length,
        gradedCount: learnerRows.filter((row) => row.signalType === "graded").length,
        conflictCount: detectConflicts(learnerVerdicts, learnerRows).length
      };
    })
    .sort((a, b) => (b.latestResponseAt ?? "").localeCompare(a.latestResponseAt ?? "") || a.learnerStateRef.localeCompare(b.learnerStateRef));
}

// --- Reading use-cases over the Learner Loop read port ----------------------

export type LearnerResponseView = {
  responseId: string;
  attemptSeq: number;
  derivedNodeId: string;
  nodeLabel: string;
  studyItemId: string;
  question: string;
  signalType: string;
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
  paths: LearnerLoopPathScope[];
  coverage: PathStudyItemCoverage[];
  // The learner's folded per-derived-node mastery (EXPERIMENT_ONLY trust) and a
  // synthetic-vs-human response-source tally — both feed the adapted-graph overlay (R3).
  masteryByNode: Record<string, number>;
  responseSourceSummary: ResponseSourceSummary;
};

// The learner-state list (ADR-0027 projection): summarize every learner's responses +
// verdicts. Reads through the injected read port; folds with the pure `summarizeLearnerStates`.
export async function listLearnerStates(loopRead: LearnerLoopReadPort): Promise<LearnerStateSummary[]> {
  const [rows, verdicts] = await Promise.all([loopRead.listAllResponses(), loopRead.listAllVerdicts()]);
  return summarizeLearnerStates(rows, verdicts);
}

// One learner's loop detail (ADR-0027 projection): load the joined history, verdicts,
// path scopes, and coverage through the read port, then add the conflict/mastery/summary
// folds. No write port is imported, so it structurally cannot mutate learner state (R10).
export async function getLearnerLoopDetail(loopRead: LearnerLoopReadPort, learnerStateRef: string): Promise<LearnerLoopDetail> {
  const [rows, verdicts, paths, coverage] = await Promise.all([
    loopRead.listResponsesForLearner(learnerStateRef),
    loopRead.listVerdictsForLearner(learnerStateRef),
    loopRead.listPathScopesForLearner(learnerStateRef),
    loopRead.listCoverageForLearner(learnerStateRef)
  ]);
  const logRows: ResponseLogRow[] = rows;
  return {
    learnerStateRef,
    responses: rows.map((row) => ({
      responseId: row.responseId,
      attemptSeq: row.attemptSeq,
      derivedNodeId: row.derivedNodeId,
      nodeLabel: row.nodeLabel,
      studyItemId: row.studyItemId,
      question: row.question,
      signalType: row.signalType,
      judgedOutcome: row.judgedOutcome,
      gradedScore: row.gradedScore,
      responseSource: row.responseSource,
      graderIdentity: row.graderIdentity,
      submittedAnswer: row.submittedAnswer,
      createdAt: row.createdAt
    })),
    conflicts: detectConflicts(verdicts, logRows),
    paths,
    coverage,
    masteryByNode: buildMasteryMap(logRows),
    responseSourceSummary: summarizeResponseSources(logRows)
  };
}

// --- Adapted-graph overlay use-case (R3, KTD7) -----------------------------

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

// One adapted-graph scope per DISTINCT enrichment in the learner's paths (KTD7) — the piece
// the Learner Application most directly reuses. Read + projection only: it composes the
// learner-loop detail with the read-only `EnrichmentInspectionReadPort` and the pure
// `classifyAdaptedNodes`. No write port is imported (R10).
export async function getLearnerAdaptedGraphs(
  loopRead: LearnerLoopReadPort,
  enrichmentRead: EnrichmentInspectionReadPort,
  learnerStateRef: string
): Promise<LearnerAdaptedGraphs> {
  const detail = await getLearnerLoopDetail(loopRead, learnerStateRef);

  // A synchronous LearnerStatePort over the already-folded mastery map (do not re-query).
  const learnerState: LearnerStatePort = {
    learnerStateRef,
    mastery: (derivedNodeId: string) => detail.masteryByNode[derivedNodeId] ?? 0
  };

  const graphs: LearnerAdaptedGraph[] = [];
  for (const scope of dedupeEnrichmentScopes(detail.paths)) {
    const enrichmentDetail = await enrichmentRead.getDerivedGraphDetail(scope.enrichmentId);
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
