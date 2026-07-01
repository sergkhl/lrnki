import type { ConceptDifficulty, InferredPrerequisiteEdge } from "@lrnki/domain-core";

// ---------------------------------------------------------------------------
// Symbolic half of Graph Enrichment (ADR-0019). These helpers are PURE and
// DETERMINISTIC: no model calls, no store, no clock. The LLM proposes edges;
// this module disposes — weak-edge cut, cycle removal, transitive reduction,
// DAG-depth difficulty, prerequisite traversal. Every helper sorts its inputs
// so the same edge set always yields the same result (replay guarantee).
// Convention: an edge means `prerequisiteDerivedNodeId` MUST precede `dependentDerivedNodeId`.
// ---------------------------------------------------------------------------

type Edge = InferredPrerequisiteEdge;
// The minimal directed-edge shape the ancestor/topology helpers read — just the two endpoint
// ids. Both `InferredPrerequisiteEdge` and loader-facing graph edges satisfy it structurally.
export type PrerequisiteEdgeRef = Pick<Edge, "prerequisiteDerivedNodeId" | "dependentDerivedNodeId">;

function sortEdges(edges: Edge[]): Edge[] {
  return [...edges].sort(
    (a, b) =>
      a.prerequisiteDerivedNodeId.localeCompare(b.prerequisiteDerivedNodeId) ||
      a.dependentDerivedNodeId.localeCompare(b.dependentDerivedNodeId)
  );
}

function addToList<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const existing = m.get(k);
  if (existing) existing.push(v);
  else m.set(k, [v]);
}

// Drop edges below the confidence floor (weak-edge cut). Best practice warns that
// keeping weak edges over-merges/over-links the graph (ADR-0012 context).
export function cutWeakEdges(edges: Edge[], minConfidence: number): { kept: Edge[]; cut: Edge[] } {
  const kept: Edge[] = [];
  const cut: Edge[] = [];
  for (const e of sortEdges(edges)) (e.confidence >= minConfidence ? kept : cut).push(e);
  return { kept, cut };
}

// Acyclicity verifier. Returns one cycle's edges as an ordered path (deterministic DFS
// back-edge detection over sorted input), or null if the graph is acyclic. No edge is ever
// dropped here: the consensus-ordering module routes aggregate-cycle edges to `uncertain`
// and removes them from the certain set. The sorted-input DFS makes the SAME edge set
// always yield the SAME violating cycle, so replayed enrichment re-derives the same route.
export function findCycleEdges(edges: Edge[]): Edge[] | null {
  const adj = new Map<string, Edge[]>();
  const nodes = new Set<string>();
  for (const e of sortEdges(edges)) {
    nodes.add(e.prerequisiteDerivedNodeId);
    nodes.add(e.dependentDerivedNodeId);
    addToList(adj, e.prerequisiteDerivedNodeId, e);
  }
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>([...nodes].map((n) => [n, WHITE]));
  const pathStack: Edge[] = [];
  let cycle: Edge[] | null = null;

  const visit = (u: string): boolean => {
    color.set(u, GRAY);
    for (const e of adj.get(u) ?? []) {
      const v = e.dependentDerivedNodeId;
      if (color.get(v) === GRAY) {
        // Back edge: reconstruct the cycle v -> ... -> u -> v from the path stack.
        const collected: Edge[] = [];
        for (let i = pathStack.length - 1; i >= 0; i--) {
          collected.push(pathStack[i]);
          if (pathStack[i].prerequisiteDerivedNodeId === v) break;
        }
        collected.reverse();
        collected.push(e);
        cycle = collected;
        return true;
      }
      if (color.get(v) === WHITE) {
        pathStack.push(e);
        if (visit(v)) return true;
        pathStack.pop();
      }
    }
    color.set(u, BLACK);
    return false;
  };

  for (const n of [...nodes].sort((a, b) => a.localeCompare(b))) {
    if (color.get(n) === WHITE && visit(n)) break;
  }
  return cycle;
}

// Transitive reduction of a DAG (run AFTER the acyclicity envelope): drop edge (u,v) when a
// path u -> ... -> v of length >= 2 already exists. The reduction of a DAG is
// unique, so testing each edge against the full reachable set is correct.
export function transitiveReduction(edges: Edge[]): { edges: Edge[]; removed: Edge[] } {
  const sorted = sortEdges(edges);
  const adj = new Map<string, Set<string>>();
  for (const e of sorted) {
    const set = adj.get(e.prerequisiteDerivedNodeId) ?? new Set<string>();
    set.add(e.dependentDerivedNodeId);
    adj.set(e.prerequisiteDerivedNodeId, set);
  }
  const reachableSkippingDirect = (u: string, v: string): boolean => {
    const stack = [...(adj.get(u) ?? [])].filter((w) => w !== v);
    const seen = new Set<string>();
    while (stack.length) {
      const n = stack.pop() as string;
      if (n === v) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      for (const w of adj.get(n) ?? []) stack.push(w);
    }
    return false;
  };
  const kept: Edge[] = [];
  const removed: Edge[] = [];
  for (const e of sorted) {
    if (reachableSkippingDirect(e.prerequisiteDerivedNodeId, e.dependentDerivedNodeId)) removed.push(e);
    else kept.push(e);
  }
  return { edges: kept, removed };
}

// Longest-path depth from a source (no prerequisites) = topological depth.
// depth = 0 for a concept with no prerequisites, else 1 + max(prerequisite depths).
export function topologicalDepth(derivedNodeIds: string[], edges: PrerequisiteEdgeRef[]): Map<string, number> {
  const prerequisitesOf = new Map<string, string[]>();
  for (const id of derivedNodeIds) prerequisitesOf.set(id, []);
  for (const e of edges) {
    if (!prerequisitesOf.has(e.prerequisiteDerivedNodeId)) prerequisitesOf.set(e.prerequisiteDerivedNodeId, []);
    addToList(prerequisitesOf, e.dependentDerivedNodeId, e.prerequisiteDerivedNodeId);
  }
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const compute = (node: string): number => {
    const cached = depth.get(node);
    if (cached !== undefined) return cached;
    if (visiting.has(node)) return 0; // defensive cycle guard; graph should be acyclic
    visiting.add(node);
    const prereqs = prerequisitesOf.get(node) ?? [];
    const value = prereqs.length === 0 ? 0 : 1 + Math.max(...prereqs.map(compute));
    visiting.delete(node);
    depth.set(node, value);
    return value;
  };
  for (const id of [...prerequisitesOf.keys()].sort((a, b) => a.localeCompare(b))) compute(id);
  return depth;
}

// Transitive prerequisite ancestors of a target — everything that must precede it. The
// caller pre-filters to the edge set it trusts (e.g. `!uncertain`); this walk does not
// re-filter. The seen-set terminates on any residual cycle.
export function prerequisiteAncestors(targetDerivedNodeId: string, edges: ReadonlyArray<PrerequisiteEdgeRef>): Set<string> {
  const prerequisitesOf = new Map<string, string[]>();
  for (const e of edges) addToList(prerequisitesOf, e.dependentDerivedNodeId, e.prerequisiteDerivedNodeId);
  const ancestors = new Set<string>();
  const stack = [targetDerivedNodeId];
  while (stack.length) {
    const node = stack.pop() as string;
    for (const prereq of prerequisitesOf.get(node) ?? []) {
      if (!ancestors.has(prereq)) {
        ancestors.add(prereq);
        stack.push(prereq);
      }
    }
  }
  return ancestors;
}

// Deterministic topological order (Kahn). Ties are broken by `tieBreak` (default
// lexical), letting the projection prefer easier ready concepts first.
export function topologicalOrder(
  derivedNodeIds: string[],
  edges: PrerequisiteEdgeRef[],
  tieBreak: (a: string, b: string) => number = (a, b) => a.localeCompare(b)
): string[] {
  const nodes = new Set(derivedNodeIds);
  for (const e of edges) {
    nodes.add(e.prerequisiteDerivedNodeId);
    nodes.add(e.dependentDerivedNodeId);
  }
  const indegree = new Map<string, number>([...nodes].map((n) => [n, 0]));
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    indegree.set(e.dependentDerivedNodeId, (indegree.get(e.dependentDerivedNodeId) ?? 0) + 1);
    addToList(adj, e.prerequisiteDerivedNodeId, e.dependentDerivedNodeId);
  }
  const ready = [...nodes].filter((n) => (indegree.get(n) ?? 0) === 0).sort(tieBreak);
  const order: string[] = [];
  while (ready.length) {
    const node = ready.shift() as string;
    order.push(node);
    for (const next of adj.get(node) ?? []) {
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if (indegree.get(next) === 0) {
        ready.push(next);
        ready.sort(tieBreak);
      }
    }
  }
  return order;
}

// Deterministic DAG-depth difficulty component producer. The production difficulty
// method is neural intrinsic difficulty; learner-calibrated IRT/BT remains deferred
// until learner-response data exists.
export function dagDepthDifficulty(derivedNodeIds: string[], edges: Edge[]): ConceptDifficulty[] {
  const depth = topologicalDepth(derivedNodeIds, edges);
  const fanIn = new Map<string, number>();
  for (const e of edges) fanIn.set(e.dependentDerivedNodeId, (fanIn.get(e.dependentDerivedNodeId) ?? 0) + 1);
  const maxDepth = Math.max(1, ...[...depth.values()]);
  return derivedNodeIds.map((derivedNodeId) => {
    const topoDepth = depth.get(derivedNodeId) ?? 0;
    return {
      derivedNodeId,
      score: topoDepth / maxDepth,
      method: "dag-depth-mock",
      // Structural-only producer: no neural subscore is consulted, so the rationale is
      // empty. Its output is read only for `components`/`score` inside intrinsic fusion
      // and is never persisted as a ConceptDifficulty row.
      neuralRationale: "",
      components: { topoDepth, fanIn: fanIn.get(derivedNodeId) ?? 0 }
    };
  });
}
