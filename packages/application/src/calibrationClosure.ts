import type { ResponseLogRow } from "@lrnki/domain-core";
import { prerequisiteAncestors } from "./prerequisiteDag";
import type { ReadinessEdge } from "./adaptivePathProjection";

// The deterministic heart of graph-dissolved calibration (R8/R11/R12/R13/R14). Three
// PURE functions over a fixture DAG — no store, no clock, no model — so the same inputs
// always yield the same prune, the same composition, and the same restoration suggestion
// (the replay guarantee the success criteria rest on). The Admin Lab loader and a future
// Learner app share these one definitions (AGENTS rule 18).

// Mastery a calibration `known` node is credited (≥ ADAPTIVE_MASTERY_THRESHOLD, so the
// classifier prunes it). A discrete intent, never a weighted/probabilistic score (KTD3).
export const CALIBRATION_KNOWN_MASTERY = 1.0;

// The trusted-edge prerequisite DOWN-CLOSURE of the `known` set (R8, R11). For each
// `known` node X the closure is `{X} ∪ prerequisiteAncestors(X)` over the caller's
// trusted edges; the union over all `known` nodes is the set treated as mastered via
// calibration. Edges are filtered to `!uncertain` here so "I knew it" credits exactly the
// prerequisites readiness itself trusts — never crediting the goal through an uncertain
// edge, and terminating on an uncertain-edge cycle via `prerequisiteAncestors`' seen-set.
// Pure, ordering-independent, idempotent.
export function pruneClosure(knownNodeIds: Iterable<string>, edges: ReadinessEdge[]): Set<string> {
  const trustedEdges = edges.filter((edge) => !edge.uncertain);
  const closure = new Set<string>();
  for (const known of knownNodeIds) {
    closure.add(known);
    for (const ancestor of prerequisiteAncestors(known, trustedEdges)) closure.add(ancestor);
  }
  return closure;
}

// The composed mastery, with calibration/graded coexistence SURFACED rather than silently
// resolved (R12, AE3). A node in the `known` down-closure is mastered VIA CALIBRATION even
// when a graded row says otherwise; an un-pruned node takes its graded mastery; a node with
// neither is absent (the consumer defaults it to 0). When a `known`-closure node ALSO has a
// graded signal, the coexistence is recorded — the deliberate removal of the old "graded
// always outranks self-report" precedence (KTD4): we no longer pick a winner here.
export type ComposedMastery = {
  masteryByNode: Record<string, number>;
  // `known`-closure nodes that also carry a graded signal — surfaced for the Admin Lab
  // read-out, never dropped (R12). `gradedMastery` is what the graded fold alone would say.
  calibrationGradedCoexistence: { derivedNodeId: string; gradedMastery: number }[];
};

export function composeMastery(input: { knownClosure: Set<string>; gradedByNode: Map<string, number> }): ComposedMastery {
  const masteryByNode: Record<string, number> = {};
  const calibrationGradedCoexistence: { derivedNodeId: string; gradedMastery: number }[] = [];

  for (const [derivedNodeId, gradedMastery] of input.gradedByNode) {
    masteryByNode[derivedNodeId] = gradedMastery;
  }
  // Calibration overrides graded for the closure, AND we record the coexistence so it is
  // visible rather than resolved by a hidden rule.
  for (const derivedNodeId of [...input.knownClosure].sort()) {
    if (input.gradedByNode.has(derivedNodeId)) {
      calibrationGradedCoexistence.push({ derivedNodeId, gradedMastery: input.gradedByNode.get(derivedNodeId)! });
    }
    masteryByNode[derivedNodeId] = CALIBRATION_KNOWN_MASTERY;
  }
  return { masteryByNode, calibrationGradedCoexistence };
}

// Struggle = the latest graded outcome for a node is `incorrect` (R13). Derived from the
// existing graded rows — no new measurement type. A later `correct` (or `partial`) clears
// an earlier `incorrect`. Returns the struggled node ids, sorted. Rows need not be
// pre-ordered: the latest is selected by `attemptSeq`.
export function struggledNodes(gradedRows: ResponseLogRow[]): string[] {
  const latestByNode = new Map<string, ResponseLogRow>();
  for (const row of gradedRows) {
    if (row.signalType !== "graded") continue;
    const current = latestByNode.get(row.derivedNodeId);
    if (!current || row.attemptSeq > current.attemptSeq) latestByNode.set(row.derivedNodeId, row);
  }
  const struggled: string[] = [];
  for (const [derivedNodeId, row] of latestByNode) {
    if (row.judgedOutcome === "incorrect") struggled.push(derivedNodeId);
  }
  return struggled.sort();
}

// Restoration suggestions (R14). For each struggled node, its PRUNED prerequisite
// ancestors — trusted-edge ancestors that the learner had marked `known` (so they are in
// the closure and were skipped). Accepting a suggestion clears that `known` verdict
// (returns the node to the gap) in U7. Derived on read, never persisted (KTD6, minimal
// v1: no ranking, no thresholds). A struggled node whose ancestors are all un-pruned maps
// to an empty list (present, so the caller can say "nothing to restore"); a non-struggled
// node is absent entirely.
export function suggestRestorations(input: { struggledNodeIds: string[]; knownClosure: Set<string>; edges: ReadinessEdge[] }): Record<string, string[]> {
  const trustedEdges = input.edges.filter((edge) => !edge.uncertain);
  const suggestions: Record<string, string[]> = {};
  for (const struggledNodeId of input.struggledNodeIds) {
    const prunedAncestors = [...prerequisiteAncestors(struggledNodeId, trustedEdges)]
      .filter((ancestor) => input.knownClosure.has(ancestor))
      .sort();
    suggestions[struggledNodeId] = prunedAncestors;
  }
  return suggestions;
}
