import type { Concept, ConceptDifficulty, InferredPrerequisiteEdge } from "@lrnki/domain-core";
import type { DifficultyPort } from "@lrnki/ports";

// ---------------------------------------------------------------------------
// Symbolic half of Graph Enrichment (ADR-0019). These helpers are PURE and
// DETERMINISTIC: no model calls, no store, no clock. The LLM proposes edges;
// this module disposes — weak-edge cut, cycle removal, transitive reduction,
// DAG-depth difficulty, prerequisite traversal. Every helper sorts its inputs
// so the same edge set always yields the same result (replay guarantee).
// Convention: an edge means `prerequisiteConceptId` MUST precede `dependentConceptId`.
// ---------------------------------------------------------------------------

type Edge = InferredPrerequisiteEdge;

const edgeKey = (e: Pick<Edge, "prerequisiteConceptId" | "dependentConceptId">): string =>
  `${e.prerequisiteConceptId}->${e.dependentConceptId}`;

function sortEdges(edges: Edge[]): Edge[] {
  return [...edges].sort(
    (a, b) =>
      a.prerequisiteConceptId.localeCompare(b.prerequisiteConceptId) ||
      a.dependentConceptId.localeCompare(b.dependentConceptId)
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

// Find one cycle's edges (deterministic DFS), or null if the graph is acyclic.
function findCycleEdges(edges: Edge[]): Edge[] | null {
  const adj = new Map<string, Edge[]>();
  const nodes = new Set<string>();
  for (const e of sortEdges(edges)) {
    nodes.add(e.prerequisiteConceptId);
    nodes.add(e.dependentConceptId);
    addToList(adj, e.prerequisiteConceptId, e);
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
      const v = e.dependentConceptId;
      if (color.get(v) === GRAY) {
        // Back edge: reconstruct the cycle v -> ... -> u -> v from the path stack.
        const collected: Edge[] = [];
        for (let i = pathStack.length - 1; i >= 0; i--) {
          collected.push(pathStack[i]);
          if (pathStack[i].prerequisiteConceptId === v) break;
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

// Break every cycle by removing the lowest-confidence edge on each cycle found.
// Deterministic: sorted inputs + lowest-confidence (earliest on ties) selection.
// Self-loops (should never occur — the boundary excludes them) are removed first.
export function removeCycles(edges: Edge[]): { edges: Edge[]; removed: Edge[] } {
  const removed: Edge[] = [];
  let working = sortEdges(edges).filter((e) => {
    if (e.prerequisiteConceptId === e.dependentConceptId) {
      removed.push(e);
      return false;
    }
    return true;
  });
  for (;;) {
    const cycle = findCycleEdges(working);
    if (!cycle) break;
    const weakest = cycle.reduce((min, e) => (e.confidence < min.confidence ? e : min), cycle[0]);
    removed.push(weakest);
    working = working.filter((e) => edgeKey(e) !== edgeKey(weakest));
  }
  return { edges: working, removed };
}

// Transitive reduction of a DAG (run AFTER removeCycles): drop edge (u,v) when a
// path u -> ... -> v of length >= 2 already exists. The reduction of a DAG is
// unique, so testing each edge against the full reachable set is correct.
export function transitiveReduction(edges: Edge[]): { edges: Edge[]; removed: Edge[] } {
  const sorted = sortEdges(edges);
  const adj = new Map<string, Set<string>>();
  for (const e of sorted) {
    const set = adj.get(e.prerequisiteConceptId) ?? new Set<string>();
    set.add(e.dependentConceptId);
    adj.set(e.prerequisiteConceptId, set);
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
    if (reachableSkippingDirect(e.prerequisiteConceptId, e.dependentConceptId)) removed.push(e);
    else kept.push(e);
  }
  return { edges: kept, removed };
}

// Longest-path depth from a source (no prerequisites) = topological depth.
// depth = 0 for a concept with no prerequisites, else 1 + max(prerequisite depths).
export function topologicalDepth(conceptIds: string[], edges: Edge[]): Map<string, number> {
  const prerequisitesOf = new Map<string, string[]>();
  for (const id of conceptIds) prerequisitesOf.set(id, []);
  for (const e of edges) {
    if (!prerequisitesOf.has(e.prerequisiteConceptId)) prerequisitesOf.set(e.prerequisiteConceptId, []);
    addToList(prerequisitesOf, e.dependentConceptId, e.prerequisiteConceptId);
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

// Transitive prerequisite ancestors of a target — everything that must precede it.
export function prerequisiteAncestors(targetConceptId: string, edges: Edge[]): Set<string> {
  const prerequisitesOf = new Map<string, string[]>();
  for (const e of edges) addToList(prerequisitesOf, e.dependentConceptId, e.prerequisiteConceptId);
  const ancestors = new Set<string>();
  const stack = [targetConceptId];
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
  conceptIds: string[],
  edges: Edge[],
  tieBreak: (a: string, b: string) => number = (a, b) => a.localeCompare(b)
): string[] {
  const nodes = new Set(conceptIds);
  for (const e of edges) {
    nodes.add(e.prerequisiteConceptId);
    nodes.add(e.dependentConceptId);
  }
  const indegree = new Map<string, number>([...nodes].map((n) => [n, 0]));
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    indegree.set(e.dependentConceptId, (indegree.get(e.dependentConceptId) ?? 0) + 1);
    addToList(adj, e.prerequisiteConceptId, e.dependentConceptId);
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

// Mock baseline difficulty (ADR-0019): normalized topological depth + raw fan-in,
// kept as interpretable `components` so the score is never an opaque number.
// Bradley-Terry calibration replaces this behind the same shape later.
export function dagDepthDifficulty(conceptIds: string[], edges: Edge[]): ConceptDifficulty[] {
  const depth = topologicalDepth(conceptIds, edges);
  const fanIn = new Map<string, number>();
  for (const e of edges) fanIn.set(e.dependentConceptId, (fanIn.get(e.dependentConceptId) ?? 0) + 1);
  const maxDepth = Math.max(1, ...[...depth.values()]);
  return conceptIds.map((conceptId) => {
    const topoDepth = depth.get(conceptId) ?? 0;
    return {
      conceptId,
      score: topoDepth / maxDepth,
      method: "dag-depth-mock",
      components: { topoDepth, fanIn: fanIn.get(conceptId) ?? 0 }
    };
  });
}

// The mock DifficultyPort: a thin wrapper so the slice swaps in Bradley-Terry by
// changing the injected port, never the projection upstream (the seam discipline).
export const dagDepthDifficultyPort: DifficultyPort = {
  method: "dag-depth-mock",
  async score({ concepts, prerequisiteEdges }: { concepts: Concept[]; prerequisiteEdges: Edge[] }) {
    return dagDepthDifficulty(
      concepts.map((c) => c.conceptId),
      prerequisiteEdges
    );
  }
};
