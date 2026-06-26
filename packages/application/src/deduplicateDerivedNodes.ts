import type {
  CanonicalSelectionReason,
  DerivedGraphNode,
  NodeMergeRecord
} from "@lrnki/domain-core";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type { NodeEmbeddingPort, NodeMergeAdjudicationPort } from "@lrnki/ports";
import { mapWithConcurrency } from "./mapWithConcurrency";
import { passthroughStageBracket, type StageBracket } from "./runProgressReporter";

// Semantic deduplication of the Derived Graph Layer node set (plan U3, ADR-0012/0019,
// AGENTS rule 20). Runs AFTER the derived node set is assembled (anchors ∪ enrichment
// nodes) and BEFORE per-node prerequisite judging, so duplicate nodes never reach the
// judge and prerequisite chains form on the COLLAPSED set (KTD4).
//
// The pass strictly separates PROPOSE from DECIDE:
//   - embeddings PROPOSE within-domain near-duplicate candidate pairs by cosine
//     (recall-generous threshold, bounded top-N per node) — they never merge;
//   - a cross-family LLM adjudicator DECIDES each proposed pair (precision) — raw cosine
//     never decides, and a very-high-similarity pair is still routed to the adjudicator.
//
// Fail-closed everywhere (R13): an embedding failure skips that domain (no merge,
// surfaced); an adjudicator throw degrades that pair to keep_distinct. The pass runs
// only when BOTH ports are provided (opt-in like node minting); omitting either leaves
// the node set identical.
//
// Published identity is never touched (R7/KTD6): an anchor always wins canonical
// selection, so a merge only ever removes a derived ENRICHMENT node. A transitive
// cluster that would absorb two anchors is a published-identity collision the derived
// layer refuses — it is skipped, not silently resolved.

// Per-node text reduction the stage needs (built by the caller from contextOf so the
// stage stays decoupled from the published CEP map). `evidence` is the node's verbatim
// definition/mention quotes; `label` + first evidence form the embed text, and a bounded
// slice is the adjudicator's evidence for each side.
export type DedupNodeContext = { label: string; aliases: string[]; evidence: string[] };

export type DedupConfig = {
  // Recall-generous within-domain cosine floor a pair must clear to be PROPOSED. The
  // adjudicator supplies precision, so this stays generous (tuned in the U7 rule-14 pass).
  similarityThreshold: number;
  // Bounded top-N proposed pairs per node, keeping adjudication ~O(n) in the small-graph
  // regime and avoiding a quadratic blow-up on a dense domain.
  maxPairsPerNode: number;
  // Bound on evidence quotes shown to the adjudicator per side (prompt-size cap).
  maxEvidencePerNode: number;
  // Bounded concurrency for adjudication calls (mirrors the judge's bound).
  adjudicationConcurrency: number;
};

export const DEFAULT_DEDUP_CONFIG: DedupConfig = {
  // Recall-generous floor (R2): the adjudicator, not this threshold, is the precision
  // gate. Calibrated to the qwen3-embedding-8b cosine scale in the U7 rule-14 probe,
  // where genuine same-concept near-duplicates scored ≥ 0.72 and clearly-distinct
  // same-domain concepts scored ≤ 0.66 — a model-scale calibration, not fixture-fitting.
  // The probe confirmed the adjudicator keeps a borderline proposed pair distinct, so a
  // generous floor only adds adjudication calls, never a wrong merge.
  similarityThreshold: 0.7,
  maxPairsPerNode: 4,
  maxEvidencePerNode: 3,
  adjudicationConcurrency: 4
};

const PROPOSING_SIGNAL = "embedding_cosine" as const;

export type DeduplicateResult = {
  // The collapsed node set: absorbed enrichment nodes removed, each canonical node's
  // aliases extended with the absorbed surface labels (R6).
  nodes: DerivedGraphNode[];
  // One record per absorbed node (R5), with full propose + decide + canonical-selection
  // provenance.
  merges: NodeMergeRecord[];
  // Absorbed verbatim evidence keyed by canonical derived-node id, threaded into the
  // canonical node's prerequisite-judge context at runtime (R6).
  absorbedGroundingByCanonical: Map<string, string[]>;
};

// Surfaced (never swallowed) fail-closed events for the worker/operator (R13).
export type DedupUnavailable =
  | { kind: "embedding"; declaredDomain: string; reason: string }
  | { kind: "adjudication"; aId: string; bId: string; reason: string };

export async function deduplicateDerivedNodes(input: {
  nodes: DerivedGraphNode[];
  contextByNodeId: Map<string, DedupNodeContext>;
  embedding?: NodeEmbeddingPort;
  adjudicator?: NodeMergeAdjudicationPort;
  config?: DedupConfig;
  onUnavailable?: (event: DedupUnavailable) => void;
  // Stage-bracket seam (U2): the whole PROPOSE phase is one `node-embedding` bracket and
  // the whole DECIDE phase one `node-merge-adjudication` bracket — phase-level, NOT
  // per-call, because adjudication runs concurrently and per-call same-name brackets would
  // overlap and mis-pair (KTD2/KTD3). Each call still self-tags its cost with the same fine
  // name, so cost joins regardless of the wall-clock envelope. Defaults to a passthrough.
  stage?: StageBracket;
}): Promise<DeduplicateResult> {
  const { nodes, contextByNodeId, embedding, adjudicator } = input;
  // Opt-in: without BOTH ports the pass is a no-op (KTD7) — identical node set, no merges,
  // and no stage rows (a no-op dedup never appears in the timeline).
  if (!embedding || !adjudicator) {
    return { nodes, merges: [], absorbedGroundingByCanonical: new Map() };
  }
  const config = input.config ?? DEFAULT_DEDUP_CONFIG;
  const stage = input.stage ?? passthroughStageBracket;

  // PROPOSE — embed per Declared Domain so a per-domain embedding failure skips only that
  // domain (R13). Cross-domain pairs are never proposed (R1): candidatePairsByDomain
  // groups by domain and a node without a vector (failed domain) forms no pair.
  const vectorByNodeId = new Map<string, number[]>();
  const byDomain = groupByDomain(nodes);
  // One `node-embedding` bracket spans the whole per-domain embedding loop (KTD3): the
  // phase wall-clock under the fine name, while each `embedding.embed` self-tags its cost.
  await stage(STAGE_TAGS.nodeEmbedding, async () => {
    for (const [domain, members] of byDomain) {
      const texts = members.map((node) => embedText(contextByNodeId.get(node.derivedNodeId)));
      try {
        const vectors = await embedding.embed(texts);
        members.forEach((node, index) => {
          if (vectors[index]) vectorByNodeId.set(node.derivedNodeId, vectors[index]);
        });
      } catch (error) {
        // Fail closed: this domain produces no merges; other domains are unaffected. The
        // bracket still closes ok — a surfaced per-domain failure is not a stage failure.
        input.onUnavailable?.({ kind: "embedding", declaredDomain: domain, reason: reasonOf(error) });
      }
    }
  });

  const pairs = candidatePairsByDomain(nodes, vectorByNodeId, config.similarityThreshold, config.maxPairsPerNode);

  // DECIDE — adjudicate each proposed pair. Bounded concurrency, results collected in
  // deterministic pair order. A throw degrades the pair to keep_distinct (fail-closed),
  // surfaced via onUnavailable; the adjudicator never auto-merges on score alone (AE3).
  // One `node-merge-adjudication` bracket spans the whole concurrent batch (KTD3): a single
  // open/close pair per dedup run, so the persisted duration is the batch's wall-clock and
  // no two same-name brackets overlap (KTD2). Each call self-tags its own cost.
  const decisions = await stage(STAGE_TAGS.nodeMergeAdjudication, () =>
    mapWithConcurrency(pairs, config.adjudicationConcurrency, async (pair) => {
      const a = contextByNodeId.get(pair.aId);
      const b = contextByNodeId.get(pair.bId);
      try {
        const decision = await adjudicator.adjudicate({
          declaredDomain: pair.declaredDomain,
          a: { label: a?.label ?? "", aliases: a?.aliases ?? [], evidence: (a?.evidence ?? []).slice(0, config.maxEvidencePerNode) },
          b: { label: b?.label ?? "", aliases: b?.aliases ?? [], evidence: (b?.evidence ?? []).slice(0, config.maxEvidencePerNode) }
        });
        return { pair, merge: decision.decision === "merge", rationale: decision.rationale };
      } catch (error) {
        input.onUnavailable?.({ kind: "adjudication", aId: pair.aId, bId: pair.bId, reason: reasonOf(error) });
        return { pair, merge: false, rationale: "" };
      }
    })
  );

  // APPLY — union the merged pairs (transitive clusters collapse to one canonical),
  // then select canonical + absorb deterministically (KTD6).
  const mergedEdges = decisions
    .filter((decision) => decision.merge)
    .map((decision) => ({ aId: decision.pair.aId, bId: decision.pair.bId, score: decision.pair.score, rationale: decision.rationale }));
  return applyClusters(nodes, contextByNodeId, mergedEdges);
}

// --- Pure, model-free helpers (exported for deterministic-envelope tests) ----------

// Standard cosine similarity. Returns 0 when either vector has zero magnitude or the
// lengths differ (a malformed pairing never proposes a merge).
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Within-domain candidate near-duplicate pairs by cosine (R1/R2). Pairs form ONLY inside
// a Declared Domain and ONLY between nodes that both have a vector (a failed domain
// contributes none). Each node keeps its top-N highest-similarity partners above the
// threshold; the undirected pair set is deduped and returned in a deterministic order
// (by score desc, then id). An anchor↔anchor pair is never proposed — dedup never
// decides published identity (KTD1/KTD6). This proposes only; it never merges.
export function candidatePairsByDomain(
  nodes: Pick<DerivedGraphNode, "derivedNodeId" | "declaredDomain" | "nodeKind">[],
  vectorByNodeId: Map<string, number[]>,
  threshold: number,
  maxPairsPerNode: number
): { aId: string; bId: string; declaredDomain: string; score: number }[] {
  const byDomain = new Map<string, typeof nodes>();
  for (const node of nodes) {
    const existing = byDomain.get(node.declaredDomain);
    if (existing) existing.push(node);
    else byDomain.set(node.declaredDomain, [node]);
  }
  const kindById = new Map(nodes.map((node) => [node.derivedNodeId, node.nodeKind] as const));
  const seen = new Set<string>();
  const pairs: { aId: string; bId: string; declaredDomain: string; score: number }[] = [];
  for (const [domain, members] of byDomain) {
    const withVectors = members.filter((node) => vectorByNodeId.has(node.derivedNodeId));
    for (const node of withVectors) {
      const self = vectorByNodeId.get(node.derivedNodeId)!;
      const scored = withVectors
        .filter((other) => other.derivedNodeId !== node.derivedNodeId)
        // Never propose an anchor↔anchor pair (published-identity is out of scope).
        .filter((other) => node.nodeKind === "enrichment" || other.nodeKind === "enrichment")
        .map((other) => ({ id: other.derivedNodeId, score: cosineSimilarity(self, vectorByNodeId.get(other.derivedNodeId)!) }))
        .filter((candidate) => candidate.score >= threshold)
        .sort((x, y) => y.score - x.score || x.id.localeCompare(y.id))
        .slice(0, maxPairsPerNode);
      for (const candidate of scored) {
        const [aId, bId] = node.derivedNodeId < candidate.id ? [node.derivedNodeId, candidate.id] : [candidate.id, node.derivedNodeId];
        // Defensive: never emit an anchor↔anchor pair even if both sides top-N each other.
        if (kindById.get(aId) === "anchor" && kindById.get(bId) === "anchor") continue;
        const key = `${aId} ${bId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ aId, bId, declaredDomain: domain, score: candidate.score });
      }
    }
  }
  // Deterministic global order so adjudication + replay are stable (R8).
  return pairs.sort((x, y) => y.score - x.score || x.aId.localeCompare(y.aId) || x.bId.localeCompare(y.bId));
}

// --- internal ----------------------------------------------------------------------

function groupByDomain(nodes: DerivedGraphNode[]): Map<string, DerivedGraphNode[]> {
  const byDomain = new Map<string, DerivedGraphNode[]>();
  for (const node of nodes) {
    const existing = byDomain.get(node.declaredDomain);
    if (existing) existing.push(node);
    else byDomain.set(node.declaredDomain, [node]);
  }
  return byDomain;
}

function embedText(context: DedupNodeContext | undefined): string {
  if (!context) return "";
  const first = context.evidence[0];
  return first ? `${context.label}: ${first}` : context.label;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type MergedEdge = { aId: string; bId: string; score: number; rationale: string };

// Union-find over merged edges + deterministic canonical selection + absorption (KTD6).
function applyClusters(
  nodes: DerivedGraphNode[],
  contextByNodeId: Map<string, DedupNodeContext>,
  mergedEdges: MergedEdge[]
): DeduplicateResult {
  if (mergedEdges.length === 0) {
    return { nodes, merges: [], absorbedGroundingByCanonical: new Map() };
  }
  const nodeById = new Map(nodes.map((node) => [node.derivedNodeId, node] as const));
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) && parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string): void => {
    parent.set(a, parent.get(a) ?? a);
    parent.set(b, parent.get(b) ?? b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const edge of mergedEdges) union(edge.aId, edge.bId);

  // Cluster member ids by root.
  const clusters = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    const list = clusters.get(root) ?? [];
    list.push(id);
    clusters.set(root, list);
  }

  const evidenceCount = (id: string): number => contextByNodeId.get(id)?.evidence.length ?? 0;
  const absorbedIds = new Set<string>();
  const aliasAdditionsByCanonical = new Map<string, string[]>();
  const absorbedGroundingByCanonical = new Map<string, string[]>();
  const merges: NodeMergeRecord[] = [];

  for (const memberIds of clusters.values()) {
    if (memberIds.length < 2) continue;
    const members = memberIds.map((id) => nodeById.get(id)).filter((node): node is DerivedGraphNode => Boolean(node));
    const anchors = members.filter((node) => node.nodeKind === "anchor");
    // Two+ anchors in one cluster ⇒ a published-identity collision the derived layer must
    // not resolve (R7). Refuse the whole cluster; no merge, nodes untouched.
    if (anchors.length >= 2) continue;

    const canonical = selectCanonical(members, evidenceCount);
    for (const member of members) {
      if (member.derivedNodeId === canonical.derivedNodeId) continue;
      absorbedIds.add(member.derivedNodeId);
      const reason = canonicalSelectionReason(canonical, member, evidenceCount);
      const edge = bestIncidentEdge(member.derivedNodeId, mergedEdges);
      const absorbedContext = contextByNodeId.get(member.derivedNodeId);
      const absorbedEvidence = absorbedContext?.evidence ?? [];
      // Canonical absorbs the surface label + aliases of the merged node (R6).
      const aliasAdds = aliasAdditionsByCanonical.get(canonical.derivedNodeId) ?? [];
      aliasAdds.push(member.canonicalLabel, ...member.aliases);
      aliasAdditionsByCanonical.set(canonical.derivedNodeId, aliasAdds);
      // Absorbed evidence threaded into the canonical's judge context (R6).
      const grounding = absorbedGroundingByCanonical.get(canonical.derivedNodeId) ?? [];
      grounding.push(...absorbedEvidence);
      absorbedGroundingByCanonical.set(canonical.derivedNodeId, grounding);
      merges.push({
        declaredDomain: canonical.declaredDomain,
        canonicalDerivedNodeId: canonical.derivedNodeId,
        canonicalLabel: canonical.canonicalLabel,
        canonicalNodeKind: canonical.nodeKind,
        absorbedDerivedNodeId: member.derivedNodeId,
        absorbedLabel: member.canonicalLabel,
        absorbedAliases: member.aliases,
        absorbedNodeKind: member.nodeKind,
        absorbedEvidence,
        proposingSignal: PROPOSING_SIGNAL,
        proposingScore: edge?.score ?? 0,
        rationale: edge?.rationale ?? "",
        canonicalSelectionReason: reason
      });
    }
  }

  const collapsed = nodes
    .filter((node) => !absorbedIds.has(node.derivedNodeId))
    .map((node) => {
      const adds = aliasAdditionsByCanonical.get(node.derivedNodeId);
      if (!adds || adds.length === 0) return node;
      const aliases = dedupeAliases(node.canonicalLabel, [...node.aliases, ...adds]);
      return { ...node, aliases };
    });

  return { nodes: collapsed, merges, absorbedGroundingByCanonical };
}

// Canonical wins: an anchor over any enrichment node; among same-kind, more evidence,
// then lower stable id (KTD6).
function selectCanonical(members: DerivedGraphNode[], evidenceCount: (id: string) => number): DerivedGraphNode {
  return [...members].sort((a, b) => {
    if (a.nodeKind !== b.nodeKind) return a.nodeKind === "anchor" ? -1 : 1;
    const byEvidence = evidenceCount(b.derivedNodeId) - evidenceCount(a.derivedNodeId);
    if (byEvidence !== 0) return byEvidence;
    return a.derivedNodeId.localeCompare(b.derivedNodeId);
  })[0];
}

function canonicalSelectionReason(
  canonical: DerivedGraphNode,
  absorbed: DerivedGraphNode,
  evidenceCount: (id: string) => number
): CanonicalSelectionReason {
  if (canonical.nodeKind === "anchor" && absorbed.nodeKind === "enrichment") return "anchor_over_enrichment";
  if (evidenceCount(canonical.derivedNodeId) > evidenceCount(absorbed.derivedNodeId)) return "higher_evidence_count";
  return "stable_id_tiebreak";
}

// The highest-score merged edge incident to an absorbed node (its proposing provenance);
// ties break by the neighbor id for determinism.
function bestIncidentEdge(nodeId: string, mergedEdges: MergedEdge[]): MergedEdge | undefined {
  return mergedEdges
    .filter((edge) => edge.aId === nodeId || edge.bId === nodeId)
    .sort((x, y) => y.score - x.score || neighbor(x, nodeId).localeCompare(neighbor(y, nodeId)))[0];
}

function neighbor(edge: MergedEdge, nodeId: string): string {
  return edge.aId === nodeId ? edge.bId : edge.aId;
}

function dedupeAliases(canonicalLabel: string, aliases: string[]): string[] {
  const seen = new Set<string>([canonicalLabel.trim().toLowerCase()]);
  const result: string[] = [];
  for (const alias of aliases) {
    const key = alias.trim().toLowerCase();
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    result.push(alias);
  }
  return result;
}
