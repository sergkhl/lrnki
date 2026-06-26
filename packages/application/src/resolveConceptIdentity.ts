import type {
  ConceptIdentityDecision,
  ConceptIdentityRef,
  ConceptIdentityResolutionOutcome
} from "@lrnki/domain-core";
import type { NodeEmbeddingPort, NodeMergeAdjudicationPort } from "@lrnki/ports";
import { cosineSimilarity, DEFAULT_DEDUP_CONFIG } from "./deduplicateDerivedNodes";
import { mapWithConcurrency } from "./mapWithConcurrency";

// Published-Concept Semantic Identity Resolution (plan 2026-06-26-002, ADR-0015,
// ADR-0012, AGENTS rule 20). Runs BEFORE the deterministic Graph-Version Build over the
// union of the base version's published Concepts and the selected runs' admitted-core
// candidates, and returns recorded merge / distinct / quarantine decisions the build
// consumes. The build never makes a model call, so the seam keeps publication
// replayable (KTD1, R8).
//
// PROPOSE / DECIDE / APPLY, exactly mirroring deduplicateDerivedNodes:
//   - embeddings PROPOSE within-domain near-duplicate candidate pairs by cosine
//     (recall-generous floor, bounded top-N) — they never decide identity (R3);
//   - a cross-family LLM adjudicator DECIDES each proposed pair (precision-first);
//   - union-find collapses merged pairs into clusters, then each cluster is classified
//     by its count of already-PUBLISHED members (KTD4):
//       0 or 1 published → `merge` (case C mints once / case A keeps the published IRI);
//       2 or more published → `quarantine` (case B — the build refuses, R7).
//
// Fail closed everywhere (R9/KTD6): a per-domain embedding failure yields no merge for
// that domain and is surfaced; an adjudicator throw degrades that pair to `distinct`; no
// failure path silently changes authoritative identity. The pass runs only when BOTH
// ports are supplied (opt-in, KTD7); omitting either returns no decisions.

// One identity representative the worker feeds in — a base published Concept OR a
// selected run's core candidate. The operation first collapses these to ONE
// representative per (declaredDomain, normalizedLabel) (KTD5), unioning aliases +
// definitions and OR-ing `published`, so it only ever proposes pairs between distinct
// identity keys the build does not already union by exact match.
export type ConceptIdentityCandidate = {
  declaredDomain: string;
  normalizedLabel: string;
  canonicalLabel: string;
  aliases: string[];
  // Verbatim Definition-Passage spans (R2): part of the embed text and the adjudicator
  // evidence, and recorded on each decision for R4 provenance.
  definitions: string[];
  // Already present in existingConceptIdentities() — i.e. an anchor. Drives the case
  // A/B/C cluster classification (KTD4).
  published: boolean;
};

export type ConceptIdentityResolutionConfig = {
  // Recall-generous within-domain cosine floor a pair must clear to be PROPOSED. The
  // adjudicator supplies precision, so this stays generous (recalibrated in U5 on the
  // qwen3-embedding-8b scale, mirroring the derived pass's U7 probe).
  similarityThreshold: number;
  // Bounded top-N proposed pairs per representative (keeps adjudication ~O(n)).
  maxPairsPerNode: number;
  // Bound on definition spans shown to the adjudicator per side (prompt-size cap).
  maxEvidencePerNode: number;
  // Bounded concurrency for adjudication calls.
  adjudicationConcurrency: number;
};

// Seeds from the derived pass's defaults (KTD2/KTD8); the exact floor/top-N are
// recalibrated against the embedding model's own scale in U5.
export const DEFAULT_IDENTITY_RESOLUTION_CONFIG: ConceptIdentityResolutionConfig = {
  similarityThreshold: DEFAULT_DEDUP_CONFIG.similarityThreshold,
  maxPairsPerNode: DEFAULT_DEDUP_CONFIG.maxPairsPerNode,
  maxEvidencePerNode: DEFAULT_DEDUP_CONFIG.maxEvidencePerNode,
  adjudicationConcurrency: DEFAULT_DEDUP_CONFIG.adjudicationConcurrency
};

const PROPOSING_SIGNAL = "embedding_cosine" as const;

// Surfaced (never swallowed) fail-closed events for the worker/operator (R9).
export type ConceptIdentityUnavailable =
  | { kind: "embedding"; declaredDomain: string; reason: string }
  | { kind: "adjudication"; aKey: string; bKey: string; reason: string };

export type ConceptIdentityResolutionResult = {
  decisions: ConceptIdentityDecision[];
  configHash: string;
};

const identityKey = (declaredDomain: string, normalizedLabel: string): string => `${declaredDomain}::${normalizedLabel}`;

export async function resolveConceptIdentity(input: {
  candidates: ConceptIdentityCandidate[];
  embedding?: NodeEmbeddingPort;
  adjudicator?: NodeMergeAdjudicationPort;
  config?: ConceptIdentityResolutionConfig;
  onUnavailable?: (event: ConceptIdentityUnavailable) => void;
}): Promise<ConceptIdentityResolutionResult> {
  const config = input.config ?? DEFAULT_IDENTITY_RESOLUTION_CONFIG;
  const configHash = hashConfig(config);
  const { embedding, adjudicator } = input;

  // Opt-in: without BOTH ports the pass is a no-op (KTD7) — no decisions, the build
  // falls back to exact-label-only identity (the calibration baseline).
  if (!embedding || !adjudicator) return { decisions: [], configHash };

  // Collapse to one identity representative per (declaredDomain, normalizedLabel) (KTD5).
  const representativesByKey = collapseToRepresentatives(input.candidates);
  const representatives = [...representativesByKey.values()];

  // PROPOSE — embed per Declared Domain so a per-domain embedding failure skips only
  // that domain (R9). Cross-domain pairs are never proposed (R1).
  const vectorByKey = new Map<string, number[]>();
  const byDomain = groupByDomain(representatives);
  for (const [domain, members] of byDomain) {
    const texts = members.map((member) => embedText(member));
    try {
      const vectors = await embedding.embed(texts);
      members.forEach((member, index) => {
        if (vectors[index]) vectorByKey.set(member.key, vectors[index]);
      });
    } catch (error) {
      input.onUnavailable?.({ kind: "embedding", declaredDomain: domain, reason: reasonOf(error) });
    }
  }

  const pairs = candidatePairsByDomain(representatives, vectorByKey, config.similarityThreshold, config.maxPairsPerNode);

  // DECIDE — adjudicate each proposed pair with bounded concurrency. A throw degrades
  // the pair to keep_distinct (fail-closed), surfaced via onUnavailable.
  const refByKey = new Map(representatives.map((member) => [member.key, member] as const));
  const decided = await mapWithConcurrency(pairs, config.adjudicationConcurrency, async (pair) => {
    const a = refByKey.get(pair.aKey)!;
    const b = refByKey.get(pair.bKey)!;
    try {
      const decision = await adjudicator.adjudicate({
        declaredDomain: pair.declaredDomain,
        a: { label: a.canonicalLabel, aliases: a.aliases, evidence: a.definitions.slice(0, config.maxEvidencePerNode) },
        b: { label: b.canonicalLabel, aliases: b.aliases, evidence: b.definitions.slice(0, config.maxEvidencePerNode) }
      });
      return { pair, merge: decision.decision === "merge", rationale: decision.rationale };
    } catch (error) {
      input.onUnavailable?.({ kind: "adjudication", aKey: pair.aKey, bKey: pair.bKey, reason: reasonOf(error) });
      return { pair, merge: false, rationale: "" };
    }
  });

  // APPLY — union the merged pairs, classify each cluster, and record decisions.
  const decisions = classifyDecisions(decided, refByKey, adjudicator.model, configHash);
  return { decisions, configHash };
}

// --- Pure, model-free helpers (exported for deterministic-envelope tests) -----------

type Representative = ConceptIdentityRef & { key: string };

// One representative per (declaredDomain, normalizedLabel): union aliases + definitions,
// OR `published`, keep the first-seen canonicalLabel for stability (KTD5).
export function collapseToRepresentatives(candidates: ConceptIdentityCandidate[]): Map<string, Representative> {
  const byKey = new Map<string, Representative>();
  for (const candidate of candidates) {
    const key = identityKey(candidate.declaredDomain, candidate.normalizedLabel);
    const existing = byKey.get(key);
    if (existing) {
      for (const alias of candidate.aliases) if (!existing.aliases.includes(alias)) existing.aliases.push(alias);
      for (const definition of candidate.definitions) if (!existing.definitions.includes(definition)) existing.definitions.push(definition);
      existing.published = existing.published || candidate.published;
    } else {
      byKey.set(key, {
        key,
        declaredDomain: candidate.declaredDomain,
        normalizedLabel: candidate.normalizedLabel,
        canonicalLabel: candidate.canonicalLabel,
        aliases: [...candidate.aliases],
        definitions: [...candidate.definitions],
        published: candidate.published
      });
    }
  }
  return byKey;
}

// Within-domain candidate near-duplicate pairs by cosine (R1/R3). Pairs form ONLY inside
// a Declared Domain and ONLY between representatives that both have a vector (a failed
// domain contributes none). Each keeps its top-N highest-similarity partners above the
// floor; the undirected set is deduped and returned in a deterministic order. Proposes
// only; it never merges.
export function candidatePairsByDomain(
  representatives: { key: string; declaredDomain: string }[],
  vectorByKey: Map<string, number[]>,
  threshold: number,
  maxPairsPerNode: number
): { aKey: string; bKey: string; declaredDomain: string; score: number }[] {
  const byDomain = new Map<string, { key: string; declaredDomain: string }[]>();
  for (const member of representatives) {
    const existing = byDomain.get(member.declaredDomain);
    if (existing) existing.push(member);
    else byDomain.set(member.declaredDomain, [member]);
  }
  const seen = new Set<string>();
  const pairs: { aKey: string; bKey: string; declaredDomain: string; score: number }[] = [];
  for (const [domain, members] of byDomain) {
    const withVectors = members.filter((member) => vectorByKey.has(member.key));
    for (const member of withVectors) {
      const self = vectorByKey.get(member.key)!;
      const scored = withVectors
        .filter((other) => other.key !== member.key)
        .map((other) => ({ key: other.key, score: cosineSimilarity(self, vectorByKey.get(other.key)!) }))
        .filter((candidate) => candidate.score >= threshold)
        .sort((x, y) => y.score - x.score || x.key.localeCompare(y.key))
        .slice(0, maxPairsPerNode);
      for (const candidate of scored) {
        const [aKey, bKey] = member.key < candidate.key ? [member.key, candidate.key] : [candidate.key, member.key];
        const dedupeKey = `${aKey} ${bKey}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        pairs.push({ aKey, bKey, declaredDomain: domain, score: candidate.score });
      }
    }
  }
  return pairs.sort((x, y) => y.score - x.score || x.aKey.localeCompare(y.aKey) || x.bKey.localeCompare(y.bKey));
}

type DecidedPair = {
  pair: { aKey: string; bKey: string; declaredDomain: string; score: number };
  merge: boolean;
  rationale: string;
};

// Union-find over merged pairs + per-cluster publication-state classification (KTD4).
// Emits one `merge`/`quarantine` decision per multi-member cluster and one `distinct`
// decision per adjudicated-distinct pair (R4).
export function classifyDecisions(
  decided: DecidedPair[],
  refByKey: Map<string, Representative>,
  decidingModel: string,
  configHash: string
): ConceptIdentityDecision[] {
  const mergedEdges = decided.filter((decision) => decision.merge);

  // Union-find over merged edges.
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
  for (const edge of mergedEdges) union(edge.pair.aKey, edge.pair.bKey);

  const clusters = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    const list = clusters.get(root) ?? [];
    list.push(id);
    clusters.set(root, list);
  }

  const bestScoreInCluster = (memberKeys: Set<string>): number =>
    mergedEdges
      .filter((edge) => memberKeys.has(edge.pair.aKey) && memberKeys.has(edge.pair.bKey))
      .reduce((max, edge) => Math.max(max, edge.pair.score), 0);
  const bestRationaleInCluster = (memberKeys: Set<string>): string => {
    const edges = mergedEdges
      .filter((edge) => memberKeys.has(edge.pair.aKey) && memberKeys.has(edge.pair.bKey))
      .sort((x, y) => y.pair.score - x.pair.score);
    return edges[0]?.rationale ?? "";
  };

  const decisions: ConceptIdentityDecision[] = [];
  // Stable cluster order by lowest member key so replay is deterministic.
  const orderedClusters = [...clusters.values()]
    .filter((memberKeys) => memberKeys.length >= 2)
    .map((memberKeys) => [...memberKeys].sort())
    .sort((a, b) => a[0].localeCompare(b[0]));

  for (const memberKeys of orderedClusters) {
    const keySet = new Set(memberKeys);
    const members = memberKeys.map((key) => refByKey.get(key)!).filter(Boolean);
    const publishedMembers = members.filter((member) => member.published);
    const declaredDomain = members[0].declaredDomain;
    const score = bestScoreInCluster(keySet);
    const rationale = bestRationaleInCluster(keySet);

    if (publishedMembers.length >= 2) {
      // Case B: two-or-more already-published members — a published-identity collision the
      // build must refuse rather than re-key (R7, KTD4). No survivor; quarantine the cluster.
      decisions.push(decision("quarantine", declaredDomain, members.map(toRef), null, score, rationale, decidingModel, configHash));
      continue;
    }
    // Case A (1 published) / Case C (0 published): canonicalize automatically.
    const survivor = selectSurvivor(members);
    decisions.push(
      decision(
        "merge",
        declaredDomain,
        // Survivor first, then absorbed members in stable key order.
        [survivor, ...members.filter((member) => member.key !== survivor.key)].map(toRef),
        survivor.normalizedLabel,
        score,
        rationale,
        decidingModel,
        configHash
      )
    );
  }

  // Record every adjudicated-distinct pair (R4), in deterministic pair order.
  for (const distinct of decided.filter((decision) => !decision.merge)) {
    const a = refByKey.get(distinct.pair.aKey)!;
    const b = refByKey.get(distinct.pair.bKey)!;
    decisions.push(
      decision("distinct", distinct.pair.declaredDomain, [toRef(a), toRef(b)], null, distinct.pair.score, distinct.rationale, decidingModel, configHash)
    );
  }
  return decisions;
}

// Case A survivor = the single published member; case C survivor = the deterministic
// new pick (most definitions, then lowest stable key) so replay is stable (KTD8).
function selectSurvivor(members: Representative[]): Representative {
  const published = members.filter((member) => member.published);
  if (published.length === 1) return published[0];
  return [...members].sort((a, b) => b.definitions.length - a.definitions.length || a.key.localeCompare(b.key))[0];
}

// --- internal -----------------------------------------------------------------------

function decision(
  outcome: ConceptIdentityResolutionOutcome,
  declaredDomain: string,
  members: ConceptIdentityRef[],
  survivorNormalizedLabel: string | null,
  proposingScore: number,
  rationale: string,
  decidingModel: string,
  configHash: string
): ConceptIdentityDecision {
  return {
    outcome,
    declaredDomain,
    members,
    survivorNormalizedLabel,
    proposingSignal: PROPOSING_SIGNAL,
    proposingScore,
    rationale,
    decidingModel,
    configHash
  };
}

function toRef(member: Representative): ConceptIdentityRef {
  return {
    declaredDomain: member.declaredDomain,
    normalizedLabel: member.normalizedLabel,
    canonicalLabel: member.canonicalLabel,
    aliases: member.aliases,
    definitions: member.definitions,
    published: member.published
  };
}

function groupByDomain(representatives: Representative[]): Map<string, Representative[]> {
  const byDomain = new Map<string, Representative[]>();
  for (const member of representatives) {
    const existing = byDomain.get(member.declaredDomain);
    if (existing) existing.push(member);
    else byDomain.set(member.declaredDomain, [member]);
  }
  return byDomain;
}

// Embed text = canonical label + aliases + first definition span (R2). A bare label is
// avoided so two surface forms of one concept embed near each other on their meaning,
// not just their string.
function embedText(member: Representative): string {
  const head = [member.canonicalLabel, ...member.aliases].join(" ");
  const definition = member.definitions[0];
  return definition ? `${head}: ${definition}` : head;
}

function hashConfig(config: ConceptIdentityResolutionConfig): string {
  return `identity-res-v1:thr=${config.similarityThreshold},topN=${config.maxPairsPerNode}`;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
