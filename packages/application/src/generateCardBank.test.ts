import assert from "node:assert/strict";
import test from "node:test";
import type { Card, CardDraft, DerivedGraphLayer, GraphSnapshot, PublishedEvidencePassage, RejectedCard } from "@lrnki/domain-core";
import type { CardBankStorePort, CardGenerationPort, EnrichmentRunStorePort, GraphVersionStorePort } from "@lrnki/ports";
import { generateCardBank } from "./generateCardBank";

function passage(sourceBlockId: string, evidenceQuote: string): PublishedEvidencePassage {
  return { sourceResourceId: "res-1", sourceBlockId, evidenceQuote, headingPath: [], locator: {} };
}

function snapshotWith(profiles: { conceptId: string; label: string; definitions?: PublishedEvidencePassage[]; mentions?: PublishedEvidencePassage[] }[]): GraphSnapshot {
  return {
    graphVersionId: "gv-1",
    baseGraphVersionId: null,
    concepts: profiles.map((p) => ({
      conceptId: p.conceptId,
      iri: `urn:lrnki:concept:${p.conceptId}`,
      canonicalLabel: p.label,
      normalizedLabel: p.label.toLowerCase(),
      declaredDomain: "software engineering",
      aliases: [],
      trustTier: "curated_source_grounded",
      homograph: false,
      groundingOrigin: "document_anchored",
      role: "anchor",
      layer: "asserted"
    })),
    evidenceProfiles: profiles.map((p) => ({
      conceptId: p.conceptId,
      definitions: p.definitions ?? [],
      mentions: p.mentions ?? [],
      assertions: []
    }))
  };
}

function graphStoreReturning(snapshot: GraphSnapshot): GraphVersionStorePort {
  return {
    async getPublishedSnapshot() { return snapshot; },
    async getLatestPublishedSnapshot() { return snapshot; },
    async existingConceptIdentities() { return []; },
    async publish() { /* unused */ }
  } as unknown as GraphVersionStorePort;
}

function layerWith(nodes: DerivedGraphLayer["derivedNodes"]): DerivedGraphLayer {
  return {
    enrichmentId: "enr-1",
    graphVersionId: "gv-1",
    enrichmentConfigHash: "cfg",
    judgeModel: "mock",
    derivedNodes: nodes,
    prerequisiteEdges: [],
    difficulties: []
  };
}

function anchorNode(conceptId = "c1") {
  return {
    nodeKind: "anchor" as const,
    derivedNodeId: `node-${conceptId}`,
    conceptId,
    groundingOrigin: "document_anchored" as const,
    role: "anchor" as const,
    layer: "asserted" as const,
    canonicalLabel: "Ownership",
    normalizedLabel: "ownership",
    declaredDomain: "software engineering",
    aliases: []
  };
}

function enrichmentStoreReturning(layer: DerivedGraphLayer): EnrichmentRunStorePort {
  return {
    async persist() { /* unused */ },
    async getLayer() { return layer; }
  } as unknown as EnrichmentRunStorePort;
}

function cardGenerationReturning(draftByNode: Record<string, CardDraft>): CardGenerationPort {
  return {
    model: "mock-card-gen",
    async generate(input) {
      const draft = draftByNode[input.node.derivedNodeId];
      if (!draft) throw new Error(`no canned draft for ${input.node.derivedNodeId}`);
      return draft;
    }
  };
}

function capturingStore(): { store: CardBankStorePort; persisted: Card[]; persistedRejected: RejectedCard[] } {
  const persisted: Card[] = [];
  const persistedRejected: RejectedCard[] = [];
  const store: CardBankStorePort = {
    async persist(input) { persisted.push(...input.cards); persistedRejected.push(...input.rejected); },
    async getCard() { return undefined; },
    async listCardsForEnrichment() { return persisted; }
  };
  return { store, persisted, persistedRejected };
}

test("a card whose citation quote is a verbatim substring of the cited CEP passage persists with citations intact", async () => {
  const snapshot = snapshotWith([
    { conceptId: "c1", label: "Ownership", definitions: [passage("b1", "Ownership is a set of rules that govern memory in Rust.")] }
  ]);
  const layer = layerWith([anchorNode("c1")]);
  const { store, persisted } = capturingStore();
  const result = await generateCardBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layer),
    cardGeneration: cardGenerationReturning({
      "node-c1": { question: "What governs memory?", answerKey: "A set of rules.", selfReportPrompt: "Confident?", citations: [{ sourceBlockId: "b1", evidenceQuote: "rules that govern memory" }] }
    }),
    cardBankStore: store,
    newCardId: () => "card-1"
  });

  assert.equal(result.cards.length, 1);
  assert.equal(result.rejected.length, 0);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].citations.length, 1);
  assert.equal(persisted[0].derivedNodeId, "node-c1");
  assert.equal(persisted[0].groundingProvenance, "source_cep");
  assert.equal(persisted[0].citations[0].provenance, "source");
  assert.equal(persisted[0].citations[0].provenance === "source" ? persisted[0].citations[0].sourceResourceId : "", "res-1", "sourceResourceId resolved from the published passage");
  assert.equal(persisted[0].generatingModel, "mock-card-gen");
});

test("a card whose citation quote is not in any cited passage is rejected fail-closed and recorded as a durable no-card fact", async () => {
  const snapshot = snapshotWith([
    { conceptId: "c1", label: "Ownership", definitions: [passage("b1", "Ownership is a set of rules that govern memory.")] }
  ]);
  const layer = layerWith([anchorNode("c1")]);
  const { store, persisted, persistedRejected } = capturingStore();
  const result = await generateCardBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layer),
    cardGeneration: cardGenerationReturning({
      "node-c1": { question: "Q?", answerKey: "A.", selfReportPrompt: "Confident?", citations: [{ sourceBlockId: "b1", evidenceQuote: "a fact never stated in the passage" }] }
    }),
    cardBankStore: store,
    newCardId: () => "card-1"
  });

  assert.equal(result.cards.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0].reason, /unverifiable/);
  assert.equal(persisted.length, 0, "no card is persisted for an unverifiable draft");
  // The rejection is a durable fact (not just a return value): the store receives it
  // so the no-card frontier fallback can surface the real reason instead of guessing.
  assert.deepEqual(persistedRejected, [{ derivedNodeId: "node-c1", canonicalLabel: "Ownership", reason: result.rejected[0].reason }]);
});

test("an anchor with no definition passage still produces a card from a mention", async () => {
  const snapshot = snapshotWith([
    { conceptId: "c1", label: "Borrowing", mentions: [passage("b2", "Borrowing lets you reference a value without taking ownership.")] }
  ]);
  const layer = layerWith([anchorNode("c1")]);
  const { store, persisted } = capturingStore();
  const result = await generateCardBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layer),
    cardGeneration: cardGenerationReturning({
      "node-c1": { question: "What is borrowing?", answerKey: "Referencing without taking ownership.", selfReportPrompt: "Confident?", citations: [{ sourceBlockId: "b2", evidenceQuote: "reference a value without taking ownership" }] }
    }),
    cardBankStore: store,
    newCardId: () => "card-1"
  });

  assert.equal(result.cards.length, 1, "thin CEP (mentions only) still yields a card");
  assert.equal(persisted[0].citations[0].provenance === "source" ? persisted[0].citations[0].sourceBlockId : "", "b2");
});

test("an anchor with no citable CEP passages is rejected without calling the generator", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Empty" }]);
  const layer = layerWith([anchorNode("c1")]);
  const { store } = capturingStore();
  let generatorCalled = false;
  const result = await generateCardBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layer),
    cardGeneration: {
      model: "mock",
      async generate() { generatorCalled = true; throw new Error("should not be called"); }
    },
    cardBankStore: store
  });
  assert.equal(result.cards.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.equal(generatorCalled, false);
});

test("source-mentioned and generated enrichment nodes verify against their own grounding provenance", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership" }]);
  const layer = layerWith([
    {
      nodeKind: "enrichment",
      derivedNodeId: "source-node",
      groundingOrigin: "source_mentioned",
      role: "prerequisite",
      layer: "derived",
      canonicalLabel: "Scope",
      normalizedLabel: "scope",
      declaredDomain: "software engineering",
      aliases: [],
      groundingPassages: [{
        passageType: "mention",
        text: "Scope controls where a binding can be used.",
        groundingOrigin: "source_mentioned",
        sourceResourceId: "res-1",
        sourceBlockId: "b-source",
        evidenceQuote: "Scope controls where a binding can be used.",
        headingPath: [],
        locator: {},
        verbatimCheck: { disposition: "verified", sourceResourceId: "res-1", sourceBlockId: "b-source" }
      }]
    },
    {
      nodeKind: "enrichment",
      derivedNodeId: "generated-node",
      groundingOrigin: "llm_grounded",
      mintingReason: "assumed_prerequisite",
      role: "prerequisite",
      layer: "derived",
      canonicalLabel: "Move semantics",
      normalizedLabel: "move semantics",
      declaredDomain: "software engineering",
      aliases: [],
      groundingBundle: {
        derivedNodeId: "generated-node",
        groundingOrigin: "llm_grounded",
        definitions: [{
          passageType: "definition",
          text: "Move semantics transfer a resource from one binding to another.",
          groundingOrigin: "llm_grounded",
          headingPath: [],
          locator: {},
          verbatimCheck: { disposition: "not_applicable_by_grounding", rationale: "generated grounding" }
        }],
        mentions: [],
        scaffoldedAnchorConceptIds: ["c1"],
        generatingModel: "mock",
        rationale: "fixture"
      }
    }
  ]);
  const { store, persisted } = capturingStore();
  const result = await generateCardBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layer),
    cardGeneration: cardGenerationReturning({
      "source-node": { question: "What does scope control?", answerKey: "Where a binding can be used.", selfReportPrompt: "Confident?", citations: [{ sourceBlockId: "b-source", evidenceQuote: "where a binding can be used" }] },
      "generated-node": { question: "What do move semantics transfer?", answerKey: "A resource between bindings.", selfReportPrompt: "Confident?", citations: [{ sourceBlockId: "generated-node:definition:0", evidenceQuote: "transfer a resource from one binding to another" }] }
    }),
    cardBankStore: store,
    newCardId: (() => {
      let i = 0;
      return () => `card-${++i}`;
    })()
  });

  assert.equal(result.cards.length, 2);
  assert.equal(persisted.find((card) => card.derivedNodeId === "source-node")?.groundingProvenance, "source_mentioned");
  const generated = persisted.find((card) => card.derivedNodeId === "generated-node");
  assert.equal(generated?.groundingProvenance, "generated");
  assert.equal(generated?.citations[0].provenance, "generated");
});
