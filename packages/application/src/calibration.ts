import { randomUUID } from "node:crypto";
import type { Card, DerivedGraphLayer, NewResponseLogRow, ResponseSource, SelfReportRating } from "@lrnki/domain-core";
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
  conceptId: string;
  cardId: string;
  derivedNodeId: string;
  difficulty: number;
};

export type SelfReportInput = {
  conceptId: string;
  cardId: string;
  rating: SelfReportRating;
  // A row SEEDED by down-DAG propagation, not directly rated. Carried at a lower
  // evidence weight so seeded and claimed rows stay distinguishable in the log.
  propagated?: boolean;
};

type CardLike = Pick<Card, "conceptId" | "cardId">;

// Resolve the anchor-node ⇄ concept bridge once. Only anchor nodes carry a
// concept_id (and thus a card); enrichment prerequisite nodes are dropped here.
function anchorBridges(layer: DerivedGraphLayer, cards: CardLike[]) {
  const cardByConcept = new Map(cards.map((card) => [card.conceptId, card.cardId] as const));
  const nodeByConcept = new Map<string, string>();
  const conceptByNode = new Map<string, string>();
  for (const node of layer.derivedNodes) {
    if (node.nodeKind === "anchor") {
      nodeByConcept.set(node.conceptId, node.derivedNodeId);
      conceptByNode.set(node.derivedNodeId, node.conceptId);
    }
  }
  const difficultyByNode = new Map(layer.difficulties.map((difficulty) => [difficulty.conceptId, difficulty.score] as const));
  return { cardByConcept, nodeByConcept, conceptByNode, difficultyByNode };
}

// Calibration set = the target's prerequisite-ancestor ANCHOR concepts that have a
// card (R7). Ordered hardest-first so a learner calibrates the most demanding
// downstream prerequisites first (origin: Key Decisions). Pure.
export function buildCalibrationSet(input: {
  layer: DerivedGraphLayer;
  targetConceptId: string;
  cards: CardLike[];
}): CalibrationItem[] {
  const { cardByConcept, nodeByConcept, conceptByNode, difficultyByNode } = anchorBridges(input.layer, input.cards);
  const targetNode = nodeByConcept.get(input.targetConceptId);
  if (!targetNode) throw new Error(`buildCalibrationSet: target concept ${input.targetConceptId} is not an anchor in this enrichment.`);

  const ancestorNodes = prerequisiteAncestors(targetNode, input.layer.prerequisiteEdges);
  const items: CalibrationItem[] = [];
  for (const derivedNodeId of ancestorNodes) {
    const conceptId = conceptByNode.get(derivedNodeId);
    if (!conceptId) continue; // enrichment prerequisite node — no concept, no card
    const cardId = cardByConcept.get(conceptId);
    if (!cardId) continue; // anchor without a card (thin CEP) stays out of the sweep
    items.push({ conceptId, cardId, derivedNodeId, difficulty: difficultyByNode.get(derivedNodeId) ?? 0 });
  }
  return items.sort((a, b) => b.difficulty - a.difficulty || a.conceptId.localeCompare(b.conceptId));
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
  cards: CardLike[];
}): SelfReportInput[] {
  const { cardByConcept, nodeByConcept, conceptByNode } = anchorBridges(input.layer, input.cards);
  const directlyRated = new Set(input.directRatings.map((rating) => rating.conceptId));
  const seededByConcept = new Map<string, SelfReportInput>();

  for (const rated of input.directRatings) {
    if (rated.rating !== "good" && rated.rating !== "easy") continue; // only positive recall propagates
    const node = nodeByConcept.get(rated.conceptId);
    if (!node) continue;
    for (const ancestorNode of prerequisiteAncestors(node, input.layer.prerequisiteEdges)) {
      const conceptId = conceptByNode.get(ancestorNode);
      if (!conceptId || directlyRated.has(conceptId) || seededByConcept.has(conceptId)) continue;
      const cardId = cardByConcept.get(conceptId);
      if (!cardId) continue;
      // Seed the same positive rating, flagged propagated (carried at lower weight).
      seededByConcept.set(conceptId, { conceptId, cardId, rating: rated.rating, propagated: true });
    }
  }
  return [...seededByConcept.values()];
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
    cardId: rating.cardId,
    conceptId: rating.conceptId,
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
