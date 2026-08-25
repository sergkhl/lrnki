import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnchorProjectionNode, NodeIdentityRelationship, SourceMentionedEnrichmentNode } from "@lrnki/domain-core";
import type { NodeEmbeddingPort, NodeMergeAdjudicationPort } from "@lrnki/ports";
import { STAGE_TAGS } from "@lrnki/domain-core";
import { candidatePairsByDomain, cosineSimilarity, deduplicateDerivedNodes, type DedupConfig, type DedupNodeContext } from "./deduplicateDerivedNodes";
import type { StageBracket } from "./runProgressReporter";

// Recording stage bracket tracking open/close order and peak concurrency per name, so a
// test asserts exactly-one-bracket-per-phase and no same-name overlap (U2/KTD2).
function recordingStage() {
  const opened: string[] = [];
  const peakByName = new Map<string, number>();
  const liveByName = new Map<string, number>();
  const stage: StageBracket = async (name, fn) => {
    opened.push(name);
    const live = (liveByName.get(name) ?? 0) + 1;
    liveByName.set(name, live);
    peakByName.set(name, Math.max(peakByName.get(name) ?? 0, live));
    try {
      return await fn();
    } finally {
      liveByName.set(name, (liveByName.get(name) ?? 1) - 1);
    }
  };
  return { stage, opened, peakByName };
}

// Deterministic-envelope tests for the dedup orchestration (plan U3, R12). Canned
// embedding vectors and canned adjudicator decisions are INPUT FIXTURES exercising the
// deterministic propose→decide→apply transform, union-find, canonical selection, and
// fail-closed behavior — NEVER an assertion about which pair *should* merge (AGENTS
// rule 11/19). No real model, no DB.

function anchor(id: string, label: string, domain: string, aliases: string[] = []): AnchorProjectionNode {
  return {
    nodeKind: "anchor",
    derivedNodeId: id,
    conceptId: `concept-${id}`,
    groundingOrigin: "document_anchored",
    role: "anchor",
    layer: "asserted",
    canonicalLabel: label,
    normalizedLabel: label.toLowerCase(),
    declaredDomain: domain,
    aliases
  };
}

function enrichment(id: string, label: string, domain: string, aliases: string[] = []): SourceMentionedEnrichmentNode {
  return {
    nodeKind: "enrichment",
    derivedNodeId: id,
    groundingOrigin: "source_mentioned",
    role: "prerequisite",
    layer: "derived",
    canonicalLabel: label,
    normalizedLabel: label.toLowerCase(),
    declaredDomain: domain,
    aliases,
    groundingPassages: []
  };
}

const embedTextOf = (context: DedupNodeContext): string => (context.evidence[0] ? `${context.label}: ${context.evidence[0]}` : context.label);

// Embedding stub keyed by the exact embed text the stage builds, so vector lookup is
// order-independent. Optionally throws when a domain's texts include a marker (R13).
function embeddingStub(vectorByText: Map<string, number[]>, throwIfTextIncludes?: string): NodeEmbeddingPort {
  return {
    model: "stub-embedding",
    async embed(texts: string[]): Promise<number[][]> {
      if (throwIfTextIncludes && texts.some((text) => text.includes(throwIfTextIncludes))) throw new Error("embedding unavailable");
      return texts.map((text) => vectorByText.get(text) ?? [0, 0]);
    }
  };
}

// Adjudicator stub recording its calls; `decide` returns the canned relationship per pair.
function adjudicatorStub(
  decide: (a: { label: string }, b: { label: string }) => NodeIdentityRelationship | "throw"
): NodeMergeAdjudicationPort & { calls: number } {
  const stub = {
    calls: 0,
    model: "stub-adjudicator",
    async adjudicate(input: { a: { label: string }; b: { label: string } }) {
      stub.calls += 1;
      const relationship = decide(input.a, input.b);
      if (relationship === "throw") throw new Error("adjudicator unavailable");
      return { relationship, rationale: `${relationship}: ${input.a.label} / ${input.b.label}` };
    }
  };
  return stub;
}

const config: DedupConfig = { similarityThreshold: 0.8, maxPairsPerNode: 8, maxEvidencePerNode: 3, adjudicationConcurrency: 4 };

function contextMap(entries: [string, DedupNodeContext][]): Map<string, DedupNodeContext> {
  return new Map(entries);
}

test("opt-in: omitting either port is a no-op (identical nodes, no merges)", async () => {
  const nodes = [anchor("a1", "X", "d"), enrichment("z9", "X variant", "d")];
  const result = await deduplicateDerivedNodes({ nodes, contextByNodeId: new Map(), config });
  assert.deepEqual(result.nodes, nodes);
  assert.equal(result.merges.length, 0);
});

test("AE3: a pair far above threshold is still routed to the adjudicator (no auto-merge on score)", async () => {
  const nodes = [enrichment("e1", "Alpha", "d"), enrichment("e2", "Alpha prime", "d")];
  const ctx = contextMap([
    ["e1", { label: "Alpha", aliases: [], evidence: [] }],
    ["e2", { label: "Alpha prime", aliases: [], evidence: [] }]
  ]);
  const vectors = new Map<string, number[]>([["Alpha", [1, 0]], ["Alpha prime", [1, 0]]]); // cosine 1.0
  const adjudicator = adjudicatorStub(() => "unrelated_or_unclear");
  const result = await deduplicateDerivedNodes({ nodes, contextByNodeId: ctx, embedding: embeddingStub(vectors), adjudicator, config });
  assert.equal(adjudicator.calls, 1, "score 1.0 still consults the adjudicator");
  assert.equal(result.merges.length, 0, "non-equivalence ⇒ no merge");
  assert.equal(result.nodes.length, 2);
});

test("AE1: a merge removes the absorbed node, aliases the canonical, unions evidence, and records provenance", async () => {
  const nodes = [anchor("a1", "Ownership", "rust"), enrichment("z9", "Ownership (Rust)", "rust", ["owning"])];
  const ctx = contextMap([
    ["a1", { label: "Ownership", aliases: [], evidence: ["who owns a value"] }],
    ["z9", { label: "Ownership (Rust)", aliases: ["owning"], evidence: ["the owner frees memory"] }]
  ]);
  const vectors = new Map<string, number[]>([
    [embedTextOf(ctx.get("a1")!), [1, 0]],
    [embedTextOf(ctx.get("z9")!), [1, 0]]
  ]);
  const adjudicator = adjudicatorStub(() => "equivalent");
  const result = await deduplicateDerivedNodes({ nodes, contextByNodeId: ctx, embedding: embeddingStub(vectors), adjudicator, config });

  assert.equal(result.nodes.length, 1, "absorbed node removed");
  const canonical = result.nodes[0];
  assert.equal(canonical.derivedNodeId, "a1", "anchor is canonical");
  assert.equal(canonical.nodeKind, "anchor");
  assert.equal((canonical as AnchorProjectionNode).conceptId, "concept-a1", "published conceptId untouched (R7)");
  assert.ok(canonical.aliases.includes("Ownership (Rust)"), "absorbed label kept as alias (R6)");
  assert.ok(canonical.aliases.includes("owning"), "absorbed alias preserved");
  assert.deepEqual(result.absorbedGroundingByCanonical.get("a1"), ["the owner frees memory"], "absorbed evidence threaded to canonical (R6)");

  assert.equal(result.merges.length, 1);
  const merge = result.merges[0];
  assert.equal(merge.canonicalDerivedNodeId, "a1");
  assert.equal(merge.absorbedDerivedNodeId, "z9");
  assert.equal(merge.absorbedLabel, "Ownership (Rust)");
  assert.equal(merge.proposingSignal, "embedding_cosine");
  assert.ok(merge.proposingScore > 0.99);
  assert.equal(merge.canonicalSelectionReason, "anchor_over_enrichment");
  assert.ok(merge.rationale.startsWith("equivalent"));
});

test("AE2: a non-equivalent relationship leaves both nodes and records no merge", async () => {
  const nodes = [enrichment("e1", "Stack", "d"), enrichment("e2", "Heap", "d")];
  const ctx = contextMap([
    ["e1", { label: "Stack", aliases: [], evidence: [] }],
    ["e2", { label: "Heap", aliases: [], evidence: [] }]
  ]);
  const vectors = new Map<string, number[]>([["Stack", [1, 0]], ["Heap", [1, 0]]]);
  const result = await deduplicateDerivedNodes({ nodes, contextByNodeId: ctx, embedding: embeddingStub(vectors), adjudicator: adjudicatorStub(() => "associated_distinct"), config });
  assert.equal(result.nodes.length, 2);
  assert.equal(result.merges.length, 0);
});

test("AE5/R13: an adjudicator throw fails closed to no merge (nodes unchanged, surfaced)", async () => {
  const nodes = [enrichment("e1", "Alpha", "d"), enrichment("e2", "Alpha2", "d")];
  const ctx = contextMap([
    ["e1", { label: "Alpha", aliases: [], evidence: [] }],
    ["e2", { label: "Alpha2", aliases: [], evidence: [] }]
  ]);
  const vectors = new Map<string, number[]>([["Alpha", [1, 0]], ["Alpha2", [1, 0]]]);
  let unavailable = 0;
  const result = await deduplicateDerivedNodes({
    nodes,
    contextByNodeId: ctx,
    embedding: embeddingStub(vectors),
    adjudicator: adjudicatorStub(() => "throw"),
    config,
    onUnavailable: (event) => {
      if (event.kind === "adjudication") unavailable += 1;
    }
  });
  assert.equal(result.merges.length, 0);
  assert.equal(result.nodes.length, 2);
  assert.equal(unavailable, 1, "fail-closed event surfaced, never silent");
});

test("R13 (propose side): an embedding failure skips only that domain", async () => {
  const nodes = [
    enrichment("a1", "FAILME one", "broken"),
    enrichment("a2", "FAILME two", "broken"),
    enrichment("b1", "Good one", "ok"),
    enrichment("b2", "Good two", "ok")
  ];
  const ctx = contextMap([
    ["a1", { label: "FAILME one", aliases: [], evidence: [] }],
    ["a2", { label: "FAILME two", aliases: [], evidence: [] }],
    ["b1", { label: "Good one", aliases: [], evidence: [] }],
    ["b2", { label: "Good two", aliases: [], evidence: [] }]
  ]);
  const vectors = new Map<string, number[]>([
    ["Good one", [1, 0]],
    ["Good two", [1, 0]]
  ]);
  let embeddingFailures = 0;
  const result = await deduplicateDerivedNodes({
    nodes,
    contextByNodeId: ctx,
    embedding: embeddingStub(vectors, "FAILME"),
    adjudicator: adjudicatorStub(() => "equivalent"),
    config,
    onUnavailable: (event) => {
      if (event.kind === "embedding") embeddingFailures += 1;
    }
  });
  assert.equal(embeddingFailures, 1, "the broken domain surfaced one embedding failure");
  // broken domain: both nodes survive (no merge); ok domain: one merge.
  assert.ok(result.nodes.some((node) => node.derivedNodeId === "a1") && result.nodes.some((node) => node.derivedNodeId === "a2"));
  assert.equal(result.merges.length, 1, "the healthy domain still merged");
  assert.equal(result.merges[0].declaredDomain, "ok");
});

test("KTD6: enrichment↔enrichment ties break by evidence count then stable id", async () => {
  // e2 has more evidence than e1 ⇒ e2 canonical, reason higher_evidence_count.
  const nodes = [enrichment("e1", "Alpha", "d"), enrichment("e2", "Alpha2", "d")];
  const ctx = contextMap([
    ["e1", { label: "Alpha", aliases: [], evidence: ["one"] }],
    ["e2", { label: "Alpha2", aliases: [], evidence: ["one", "two"] }]
  ]);
  const vectors = new Map<string, number[]>([
    [embedTextOf(ctx.get("e1")!), [1, 0]],
    [embedTextOf(ctx.get("e2")!), [1, 0]]
  ]);
  const result = await deduplicateDerivedNodes({ nodes, contextByNodeId: ctx, embedding: embeddingStub(vectors), adjudicator: adjudicatorStub(() => "equivalent"), config });
  assert.equal(result.nodes[0].derivedNodeId, "e2", "more-evidence node is canonical");
  assert.equal(result.merges[0].canonicalSelectionReason, "higher_evidence_count");

  // Equal evidence ⇒ lower stable id wins, reason stable_id_tiebreak.
  const ctxTie = contextMap([
    ["e1", { label: "Alpha", aliases: [], evidence: ["one"] }],
    ["e2", { label: "Alpha2", aliases: [], evidence: ["two"] }]
  ]);
  const vectorsTie = new Map<string, number[]>([
    [embedTextOf(ctxTie.get("e1")!), [1, 0]],
    [embedTextOf(ctxTie.get("e2")!), [1, 0]]
  ]);
  const tie = await deduplicateDerivedNodes({ nodes, contextByNodeId: ctxTie, embedding: embeddingStub(vectorsTie), adjudicator: adjudicatorStub(() => "equivalent"), config });
  assert.equal(tie.nodes[0].derivedNodeId, "e1", "lower id wins the tie");
  assert.equal(tie.merges[0].canonicalSelectionReason, "stable_id_tiebreak");
});

test("union-find: A~B and B~C collapse to one canonical with two records", async () => {
  const nodes = [enrichment("e1", "A", "d"), enrichment("e2", "B", "d"), enrichment("e3", "C", "d")];
  const ctx = contextMap([
    ["e1", { label: "A", aliases: [], evidence: [] }],
    ["e2", { label: "B", aliases: [], evidence: [] }],
    ["e3", { label: "C", aliases: [], evidence: [] }]
  ]);
  // Vectors so cos(A,B) and cos(B,C) clear 0.85 but cos(A,C) does not.
  const vectors = new Map<string, number[]>([
    ["A", [1, 0]],
    ["B", [0.95, 0.3122]],
    ["C", [0.8, 0.6]]
  ]);
  const transitiveConfig: DedupConfig = { ...config, similarityThreshold: 0.85 };
  const result = await deduplicateDerivedNodes({ nodes, contextByNodeId: ctx, embedding: embeddingStub(vectors), adjudicator: adjudicatorStub(() => "equivalent"), config: transitiveConfig });
  assert.equal(result.nodes.length, 1, "single canonical survives");
  assert.equal(result.merges.length, 2, "one record per absorbed node, no duplicates");
  const canonicalIds = new Set(result.merges.map((merge) => merge.canonicalDerivedNodeId));
  assert.equal(canonicalIds.size, 1, "both records share one canonical");
});

test("two anchors in one cluster are refused (published-identity collision, R7)", async () => {
  // a1 ~ e2 ~ a3 transitively pulls two anchors into one cluster ⇒ no merge at all.
  const nodes = [anchor("a1", "A", "d"), enrichment("e2", "B", "d"), anchor("a3", "C", "d")];
  const ctx = contextMap([
    ["a1", { label: "A", aliases: [], evidence: [] }],
    ["e2", { label: "B", aliases: [], evidence: [] }],
    ["a3", { label: "C", aliases: [], evidence: [] }]
  ]);
  const vectors = new Map<string, number[]>([
    ["A", [1, 0]],
    ["B", [0.95, 0.3122]],
    ["C", [0.8, 0.6]]
  ]);
  const transitiveConfig: DedupConfig = { ...config, similarityThreshold: 0.85 };
  const result = await deduplicateDerivedNodes({ nodes, contextByNodeId: ctx, embedding: embeddingStub(vectors), adjudicator: adjudicatorStub(() => "equivalent"), config: transitiveConfig });
  assert.equal(result.nodes.length, 3, "no node absorbed when a cluster holds two anchors");
  assert.equal(result.merges.length, 0);
});

// --- U2 stage bracketing -----------------------------------------------------------

// A run with both ports records exactly one node-embedding bracket (whole PROPOSE phase)
// and one node-merge-adjudication bracket (whole concurrent DECIDE batch), never `dedup`,
// and the adjudication bracket never overlaps itself despite concurrency > 1 (KTD2/KTD3).
test("U2: one node-embedding + one node-merge-adjudication bracket, no overlap, no `dedup`", async () => {
  const nodes = [enrichment("e1", "Alpha", "d"), enrichment("e2", "Alpha2", "d"), enrichment("e3", "Alpha3", "d")];
  const ctx = contextMap([
    ["e1", { label: "Alpha", aliases: [], evidence: [] }],
    ["e2", { label: "Alpha2", aliases: [], evidence: [] }],
    ["e3", { label: "Alpha3", aliases: [], evidence: [] }]
  ]);
  // All three identical ⇒ three proposed pairs adjudicated concurrently (concurrency 4).
  const vectors = new Map<string, number[]>([["Alpha", [1, 0]], ["Alpha2", [1, 0]], ["Alpha3", [1, 0]]]);
  const { stage, opened, peakByName } = recordingStage();
  await deduplicateDerivedNodes({
    nodes,
    contextByNodeId: ctx,
    embedding: embeddingStub(vectors),
    adjudicator: adjudicatorStub(() => "unrelated_or_unclear"),
    config,
    stage
  });
  assert.equal(opened.filter((s) => s === STAGE_TAGS.nodeEmbedding).length, 1, "exactly one embedding bracket");
  assert.equal(opened.filter((s) => s === STAGE_TAGS.nodeMergeAdjudication).length, 1, "exactly one adjudication bracket");
  assert.ok(!opened.includes("dedup"), "no coarse dedup stage");
  assert.equal(peakByName.get(STAGE_TAGS.nodeMergeAdjudication), 1, "the concurrent batch is one non-overlapping bracket");
});

// The opt-in no-op path (a missing port) emits no stage brackets — a no-op dedup never
// appears in the timeline.
test("U2: the opt-in no-op (missing port) emits no stage brackets", async () => {
  const nodes = [enrichment("e1", "X", "d"), enrichment("e2", "Y", "d")];
  const { stage, opened } = recordingStage();
  await deduplicateDerivedNodes({ nodes, contextByNodeId: new Map(), config, stage });
  assert.deepEqual(opened, [], "no embedding or adjudication bracket when the pass is a no-op");
});

// A per-domain embedding failure still closes the single node-embedding bracket (surfaced,
// not stranded), and the adjudication bracket still opens once over the empty pair set.
test("U2: an embedding failure does not strand the embedding bracket", async () => {
  const nodes = [enrichment("a1", "FAILME one", "broken"), enrichment("a2", "FAILME two", "broken")];
  const ctx = contextMap([
    ["a1", { label: "FAILME one", aliases: [], evidence: [] }],
    ["a2", { label: "FAILME two", aliases: [], evidence: [] }]
  ]);
  const { stage, opened, peakByName } = recordingStage();
  await deduplicateDerivedNodes({
    nodes,
    contextByNodeId: ctx,
    embedding: embeddingStub(new Map(), "FAILME"),
    adjudicator: adjudicatorStub(() => "equivalent"),
    config,
    stage
  });
  assert.equal(opened.filter((s) => s === STAGE_TAGS.nodeEmbedding).length, 1);
  assert.equal(peakByName.get(STAGE_TAGS.nodeEmbedding), 1, "the embedding bracket opened and closed once");
});

test("candidatePairsByDomain: cross-domain pairs never proposed (R1)", () => {
  const nodes = [enrichment("e1", "X", "d1"), enrichment("e2", "X", "d2")];
  const vectorByNodeId = new Map<string, number[]>([["e1", [1, 0]], ["e2", [1, 0]]]); // identical
  const pairs = candidatePairsByDomain(nodes, vectorByNodeId, 0.8, 8);
  assert.equal(pairs.length, 0, "different declared domains never pair");
});

test("candidatePairsByDomain: below-threshold excluded; anchor↔anchor never proposed; top-N respected", () => {
  const nodes = [enrichment("e1", "X", "d"), enrichment("e2", "Y", "d"), enrichment("e3", "Z", "d")];
  const vectorByNodeId = new Map<string, number[]>([
    ["e1", [1, 0]],
    ["e2", [1, 0]], // cos 1.0 with e1
    ["e3", [0, 1]] // cos 0 with both
  ]);
  const pairs = candidatePairsByDomain(nodes, vectorByNodeId, 0.8, 8);
  assert.equal(pairs.length, 1, "only the above-threshold pair");
  assert.deepEqual([pairs[0].aId, pairs[0].bId], ["e1", "e2"]);

  // anchor↔anchor never proposed even at cosine 1.0.
  const anchors = [anchor("a1", "X", "d"), anchor("a2", "Y", "d")];
  const av = new Map<string, number[]>([["a1", [1, 0]], ["a2", [1, 0]]]);
  assert.equal(candidatePairsByDomain(anchors, av, 0.8, 8).length, 0);

  // top-N bound: with maxPairsPerNode 1, a node keeps only its single best partner.
  const cluster = [enrichment("e1", "X", "d"), enrichment("e2", "Y", "d"), enrichment("e3", "Z", "d")];
  const cv = new Map<string, number[]>([["e1", [1, 0]], ["e2", [1, 0]], ["e3", [1, 0]]]); // all identical
  const bounded = candidatePairsByDomain(cluster, cv, 0.8, 1);
  for (const id of ["e1", "e2", "e3"]) {
    assert.ok(bounded.filter((pair) => pair.aId === id || pair.bId === id).length <= 2, "each node bounded");
  }
});

test("cosineSimilarity: identical vectors 1, orthogonal 0, zero-magnitude 0, ragged 0", () => {
  assert.ok(Math.abs(cosineSimilarity([1, 2, 3], [1, 2, 3]) - 1) < 1e-9);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
  assert.equal(cosineSimilarity([1, 0], [1, 0, 0]), 0);
});
