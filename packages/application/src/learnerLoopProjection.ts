import type { CalibrationVerdict, JudgedOutcome, ResponseLogRow } from "@lrnki/domain-core";
import { foldConceptMastery } from "./responseLogLearnerState";

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
