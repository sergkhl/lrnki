import { randomUUID } from "node:crypto";
import type { SelfAssessmentItem, DerivedGraphLayer, NewResponseLogRow, ResponseSource, SelfReportRating } from "@lrnki/domain-core";
import type { ResponseLogStorePort } from "@lrnki/ports";
import { prerequisiteAncestors } from "./prerequisiteDag";

// Calibration mode (U4, R7/R8/R10). A self-report sweep scoped to the chosen
// target's prerequisite ANCESTORS, plus optional propagation of "I know X" DOWN the
// prerequisite DAG so a learner reporting a downstream concept seeds prior mastery on
// its ancestors (reducing questions asked). Every path here is source-agnostic so
// synthetic prefill (U7) and Admin Lab resubmission (U8) reuse the SAME single append
// code path. Nothing here mutates the asserted graph or the Derived Graph Layer.

// Evidence weights encode signal strength (graded > self-report; directly-rated >
// propagated). The fold ranks graded over self-report by signal type; the weight
// lets the estimator and Admin Lab tell a seeded row from a claimed one (R8).
export const SELF_REPORT_EVIDENCE_WEIGHT = 0.3;
export const PROPAGATED_SELF_REPORT_EVIDENCE_WEIGHT = 0.15;

export type CalibrationItem = {
  derivedNodeId: string;
  studyItemId: string;
  difficulty: number;
};

export type SelfReportInput = {
  derivedNodeId: string;
  studyItemId: string;
  rating: SelfReportRating;
  // A row SEEDED by down-DAG propagation, not directly rated. Carried at a lower
  // evidence weight so seeded and claimed rows stay distinguishable in the log.
  propagated?: boolean;
};

type StudyItemLike = Pick<SelfAssessmentItem, "derivedNodeId" | "studyItemId">;

function nodeStudyItemIndex(layer: DerivedGraphLayer, studyItems: StudyItemLike[]) {
  const studyItemByNode = new Map(studyItems.map((studyItem) => [studyItem.derivedNodeId, studyItem.studyItemId] as const));
  const nodeIds = new Set(layer.derivedNodes.map((node) => node.derivedNodeId));
  const difficultyByNode = new Map(layer.difficulties.map((difficulty) => [difficulty.derivedNodeId, difficulty.score] as const));
  return { studyItemByNode, nodeIds, difficultyByNode };
}

// Calibration set = the target's prerequisite-ancestor derived nodes that have a
// studyItem (R7). Ordered hardest-first so a learner calibrates the most demanding
// downstream prerequisites first (origin: Key Decisions). Pure.
export function buildCalibrationSet(input: {
  layer: DerivedGraphLayer;
  targetDerivedNodeId: string;
  studyItems: StudyItemLike[];
}): CalibrationItem[] {
  const { studyItemByNode, nodeIds, difficultyByNode } = nodeStudyItemIndex(input.layer, input.studyItems);
  if (!nodeIds.has(input.targetDerivedNodeId)) throw new Error(`buildCalibrationSet: target node ${input.targetDerivedNodeId} is not in this enrichment.`);

  const ancestorNodes = prerequisiteAncestors(input.targetDerivedNodeId, input.layer.prerequisiteEdges);
  const items: CalibrationItem[] = [];
  for (const derivedNodeId of ancestorNodes) {
    const studyItemId = studyItemByNode.get(derivedNodeId);
    if (!studyItemId) continue; // a node without a verifiable studyItem stays out of the sweep
    items.push({ derivedNodeId, studyItemId, difficulty: difficultyByNode.get(derivedNodeId) ?? 0 });
  }
  return items.sort((a, b) => b.difficulty - a.difficulty || a.derivedNodeId.localeCompare(b.derivedNodeId));
}

// Down-DAG propagation (R8). A "good"/"easy" rating on a concept seeds a weaker,
// flagged self-report row on each prerequisite ANCESTOR anchor that was not directly
// rated — so reporting a downstream concept implies prior mastery of what it builds
// on, and those ancestors are not separately asked (AE3). "again"/"hard" never
// propagate. Pure; returns ONLY the seeded rows for the caller to append alongside
// the direct ratings in one batch.
export function propagateSelfReport(input: {
  layer: DerivedGraphLayer;
  directRatings: SelfReportInput[];
  studyItems: StudyItemLike[];
}): SelfReportInput[] {
  const { studyItemByNode } = nodeStudyItemIndex(input.layer, input.studyItems);
  const directlyRated = new Set(input.directRatings.map((rating) => rating.derivedNodeId));
  const seededByNode = new Map<string, SelfReportInput>();

  // Propagate only along edges the router TRUSTS (R6): mirror `buildReadiness`'s
  // `!edge.uncertain` filter so "I know it" seeds exactly the prerequisites readiness
  // itself credits. Walking all edges would over-seed a whole connected component through
  // distrusted edges — and through uncertain-edge cycles credit the goal (the recorded
  // defect). `prerequisiteAncestors`' seen-set still terminates on any residual cycle.
  const certainEdges = input.layer.prerequisiteEdges.filter((edge) => !edge.uncertain);

  for (const rated of input.directRatings) {
    if (rated.rating !== "good" && rated.rating !== "easy") continue; // only positive recall propagates
    for (const ancestorNode of prerequisiteAncestors(rated.derivedNodeId, certainEdges)) {
      if (directlyRated.has(ancestorNode) || seededByNode.has(ancestorNode)) continue;
      const studyItemId = studyItemByNode.get(ancestorNode);
      if (!studyItemId) continue;
      // Seed the same positive rating, flagged propagated (carried at lower weight).
      seededByNode.set(ancestorNode, { derivedNodeId: ancestorNode, studyItemId, rating: rated.rating, propagated: true });
    }
  }
  return [...seededByNode.values()];
}

// Append ONE calibration batch of self_report rows (R7, R10). Re-calibration calls
// this again with a fresh batchId; nothing is overwritten (the store is append-only).
export async function appendSelfReportBatch(input: {
  learnerStateRef: string;
  responseLog: ResponseLogStorePort;
  ratings: SelfReportInput[];
  responseSource: ResponseSource;
  batchId?: string;
}): Promise<{ batchId: string; appended: NewResponseLogRow[] }> {
  const batchId = input.batchId ?? randomUUID();
  let seq = await input.responseLog.nextAttemptSeq(input.learnerStateRef);
  const appended: NewResponseLogRow[] = input.ratings.map((rating) => ({
    responseId: randomUUID(),
    learnerStateRef: input.learnerStateRef,
    studyItemId: rating.studyItemId,
    derivedNodeId: rating.derivedNodeId,
    signalType: "self_report",
    selfReportRating: rating.rating,
    judgedOutcome: null,
    gradedScore: null,
    evidenceWeight: rating.propagated ? PROPAGATED_SELF_REPORT_EVIDENCE_WEIGHT : SELF_REPORT_EVIDENCE_WEIGHT,
    responseSource: input.responseSource,
    graderIdentity: null,
    batchId,
    attemptSeq: seq++,
    submittedAnswer: null
  }));
  await input.responseLog.append(appended);
  return { batchId, appended };
}
