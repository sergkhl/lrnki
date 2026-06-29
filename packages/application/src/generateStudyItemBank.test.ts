import assert from "node:assert/strict";
import test from "node:test";
import type {
  DerivedGraphLayer,
  GraphSnapshot,
  OptionSelectItemDraft,
  PublishedEvidencePassage,
  RejectedStudyItem,
  StudyItem
} from "@lrnki/domain-core";
import { currentOperationTag } from "@lrnki/domain-core/operation-tag-context";
import { installNodeOperationTagContext } from "@lrnki/domain-core/operation-tag-context-node";
import type { EnrichmentRunStorePort, GraphVersionStorePort, StudyItemBankStorePort, StudyItemGenerationPort } from "@lrnki/ports";
import { generateStudyItemBank } from "./generateStudyItemBank";

installNodeOperationTagContext();

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

function anchorNode(conceptId = "c1", label = "Ownership") {
  return {
    nodeKind: "anchor" as const,
    derivedNodeId: `node-${conceptId}`,
    conceptId,
    groundingOrigin: "document_anchored" as const,
    role: "anchor" as const,
    layer: "asserted" as const,
    canonicalLabel: label,
    normalizedLabel: label.toLowerCase(),
    declaredDomain: "software engineering",
    aliases: []
  };
}

// A rescued source_mentioned enrichment node carrying a verified passage (definition or
// mention) — the node shape the rescue seam now emits with real Definition Passages (U4).
function sourceMentionedNode(opts: { id?: string; label?: string; passageType?: "definition" | "mention"; quote: string; blockId?: string }) {
  const blockId = opts.blockId ?? "def-1";
  return {
    nodeKind: "enrichment" as const,
    derivedNodeId: opts.id ?? "node-rescued",
    groundingOrigin: "source_mentioned" as const,
    role: "prerequisite" as const,
    layer: "derived" as const,
    canonicalLabel: opts.label ?? "Heap allocation",
    normalizedLabel: (opts.label ?? "Heap allocation").toLowerCase(),
    declaredDomain: "software engineering",
    aliases: [],
    groundingPassages: [{
      passageType: opts.passageType ?? "definition",
      text: opts.quote,
      groundingOrigin: "source_mentioned" as const,
      sourceResourceId: "src",
      sourceBlockId: blockId,
      evidenceQuote: opts.quote,
      headingPath: [],
      locator: {},
      verbatimCheck: { disposition: "verified" as const, sourceResourceId: "src", sourceBlockId: blockId }
    }]
  };
}

// A minted llm_grounded enrichment node — its study items must stay `generated` provenance.
function llmGroundedNode(opts: { id?: string; label?: string } = {}) {
  const id = opts.id ?? "node-minted";
  return {
    nodeKind: "enrichment" as const,
    derivedNodeId: id,
    groundingOrigin: "llm_grounded" as const,
    mintingReason: "assumed_prerequisite" as const,
    role: "prerequisite" as const,
    layer: "derived" as const,
    canonicalLabel: opts.label ?? "Pointer arithmetic",
    normalizedLabel: (opts.label ?? "Pointer arithmetic").toLowerCase(),
    declaredDomain: "software engineering",
    aliases: [],
    groundingBundle: {
      derivedNodeId: id,
      groundingOrigin: "llm_grounded" as const,
      definitions: [{ passageType: "definition" as const, text: "Pointer arithmetic computes addresses.", groundingOrigin: "llm_grounded" as const, headingPath: [], locator: {}, verbatimCheck: { disposition: "not_applicable_by_grounding" as const, rationale: "generated" } }],
      mentions: [],
      scaffoldedAnchorConceptIds: [],
      generatingModel: "mock",
      rationale: "r"
    }
  };
}

function enrichmentStoreReturning(layer: DerivedGraphLayer): EnrichmentRunStorePort {
  return {
    async persist() { /* unused */ },
    async getLayer() { return layer; }
  } as unknown as EnrichmentRunStorePort;
}

function osDraft(correctQuote: string, distractors: [string, string, string] = ["Stack", "Register", "Cache"], passageId = "b1"): OptionSelectItemDraft {
  return {
    itemType: "option_select",
    question: "Where is memory governed?",
    options: [
      { text: "Heap", isCorrect: true, provenance: "source", citation: { passageId, evidenceQuote: correctQuote } },
      ...distractors.map((text) => ({ text, isCorrect: false, provenance: "generated" as const }))
    ]
  };
}

// Canned generator: OS drafts keyed by derivedNodeId, or the literal "throw" to
// simulate a generation failure. These are INPUT FIXTURES exercising the deterministic
// envelope (ADR-0013) — no assertion is ever made on the model's judgment content.
function generationReturning(opts: {
  optionSelect?: Record<string, OptionSelectItemDraft | "throw">;
  onGenerate?: () => void;
}): StudyItemGenerationPort {
  return {
    model: "mock-gen",
    async generateOptionSelect(input) {
      opts.onGenerate?.();
      const draft = opts.optionSelect?.[input.node.derivedNodeId];
      if (draft === undefined) throw new Error(`no canned option-select draft for ${input.node.derivedNodeId}`);
      if (draft === "throw") throw new Error("option-select generation failed");
      return draft;
    }
  };
}

function capturingStore(): { store: StudyItemBankStorePort; persisted: StudyItem[]; persistedRejected: RejectedStudyItem[] } {
  const persisted: StudyItem[] = [];
  const persistedRejected: RejectedStudyItem[] = [];
  const store: StudyItemBankStorePort = {
    async persist(input) { persisted.push(...input.studyItems); persistedRejected.push(...input.rejected); },
    async getStudyItem() { return undefined; },
    async listStudyItemsForEnrichment() { return persisted; },
    async supportedItemTypes(derivedNodeId) {
      return [...new Set(persisted.filter((item) => item.derivedNodeId === derivedNodeId).map((item) => item.itemType))].sort();
    }
  };
  return { store, persisted, persistedRejected };
}

function typesFor(items: StudyItem[], derivedNodeId: string): string[] {
  return items.filter((item) => item.derivedNodeId === derivedNodeId).map((item) => item.itemType).sort();
}

const ownershipDef = "Ownership is a set of rules that govern memory in Rust.";

test("a node whose option-select passes the guard persists one option-select item", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store, persisted, persistedRejected } = capturingStore();
  const result = await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    studyItemGeneration: generationReturning({
      optionSelect: { "node-c1": osDraft("rules that govern memory") }
    }),
    studyItemBankStore: store
  });

  assert.equal(result.studyItems.length, 1);
  assert.equal(result.rejected.length, 0);
  assert.deepEqual(typesFor(persisted, "node-c1"), ["option_select"]);
  assert.deepEqual(persistedRejected, []);
});

test("the study-item operation context reaches generation calls", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store } = capturingStore();
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    studyItemGeneration: generationReturning({
      optionSelect: { "node-c1": osDraft("rules that govern memory") },
      onGenerate: () => assert.equal(currentOperationTag(), "enr-1")
    }),
    studyItemBankStore: store
  });
});

test("an option-select guard rejection records the node as rejected", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store, persisted, persistedRejected } = capturingStore();
  // Duplicate distractors fail the structural guard (not a grounding failure).
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    studyItemGeneration: generationReturning({
      optionSelect: { "node-c1": osDraft("rules that govern memory", ["Same", "Same", "Cache"]) }
    }),
    studyItemBankStore: store
  });

  assert.deepEqual(typesFor(persisted, "node-c1"), []);
  assert.equal(persistedRejected.length, 1);
  assert.deepEqual(await store.supportedItemTypes("node-c1"), []);
});

test("a node with no usable grounding yields no items and one rejection, without calling the generator", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Empty" }]);
  const { store, persisted, persistedRejected } = capturingStore();
  let generatorCalled = false;
  const generation: StudyItemGenerationPort = {
    model: "mock",
    async generateOptionSelect() { generatorCalled = true; throw new Error("should not be called"); }
  };
  const result = await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    studyItemGeneration: generation,
    studyItemBankStore: store
  });

  assert.equal(persisted.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.match(persistedRejected[0].reason, /no usable grounding/);
  assert.equal(generatorCalled, false);
});

test("an option-select generation that throws rejects only that node and continues the run", async () => {
  const snapshot = snapshotWith([
    { conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] },
    { conceptId: "c2", label: "Borrowing", definitions: [passage("b1", ownershipDef)] }
  ]);
  const { store, persisted } = capturingStore();
  const result = await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1"), anchorNode("c2", "Borrowing")])),
    studyItemGeneration: generationReturning({
      optionSelect: { "node-c1": "throw", "node-c2": osDraft("rules that govern memory") }
    }),
    studyItemBankStore: store
  });

  assert.equal(result.rejected.length, 1);
  assert.deepEqual(typesFor(persisted, "node-c1"), []);
  assert.deepEqual(typesFor(persisted, "node-c2"), ["option_select"]);
});

test("an option-select whose correct answer cites text absent from grounding is rejected", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store, persisted } = capturingStore();
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    studyItemGeneration: generationReturning({
      optionSelect: { "node-c1": osDraft("a fact never stated in the passage") }
    }),
    studyItemBankStore: store
  });

  assert.deepEqual(typesFor(persisted, "node-c1"), []);
});

test("supportedItemTypes per node equals the set of types actually persisted across a small layer", async () => {
  const snapshot = snapshotWith([
    { conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] },
    { conceptId: "c2", label: "Borrowing", definitions: [passage("b1", ownershipDef)] }
  ]);
  const { store } = capturingStore();
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1"), anchorNode("c2", "Borrowing")])),
    studyItemGeneration: generationReturning({
      // node-c1 gets an option-select; node-c2's option-select is guard-rejected.
      optionSelect: { "node-c1": osDraft("rules that govern memory"), "node-c2": osDraft("rules that govern memory", ["Same", "Same", "Cache"]) }
    }),
    studyItemBankStore: store
  });

  assert.deepEqual(await store.supportedItemTypes("node-c1"), ["option_select"]);
  assert.deepEqual(await store.supportedItemTypes("node-c2"), []);
});

test("a rescued node with a verified DEFINITION passage yields source_mentioned study items (R5/U4)", async () => {
  const def = "Heap allocation means the memory must be requested from the memory allocator at runtime.";
  const cite = "the memory must be requested from the memory allocator at runtime";
  const { store, persisted } = capturingStore();
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshotWith([])),
    enrichmentStore: enrichmentStoreReturning(layerWith([sourceMentionedNode({ quote: def })])),
    studyItemGeneration: generationReturning({
      optionSelect: { "node-rescued": osDraft(cite, ["Stack", "Register", "Cache"], "def-1") }
    }),
    studyItemBankStore: store
  });

  assert.ok(persisted.length >= 1, "the rescued definition produced study items");
  assert.ok(persisted.every((item) => item.groundingProvenance === "source_mentioned"), "rescued definitions ground source_mentioned items, not generated");
});

test("a rescued mention-only node still yields source_mentioned items (no regression, U4)", async () => {
  const m = "Borrowing lets you reference a value without taking ownership.";
  const cite = "reference a value without taking ownership";
  const { store, persisted } = capturingStore();
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshotWith([])),
    enrichmentStore: enrichmentStoreReturning(layerWith([sourceMentionedNode({ id: "node-borrow", label: "Borrowing", passageType: "mention", quote: m, blockId: "m-1" })])),
    studyItemGeneration: generationReturning({
      optionSelect: { "node-borrow": osDraft(cite, ["Stack", "Register", "Cache"], "m-1") }
    }),
    studyItemBankStore: store
  });

  assert.ok(persisted.length >= 1);
  assert.ok(persisted.every((item) => item.groundingProvenance === "source_mentioned"));
});

test("a minted llm_grounded node still yields generated provenance (U4)", async () => {
  const cite = "computes addresses";
  const { store, persisted } = capturingStore();
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshotWith([])),
    enrichmentStore: enrichmentStoreReturning(layerWith([llmGroundedNode()])),
    studyItemGeneration: generationReturning({
      optionSelect: { "node-minted": osDraft(cite, ["Stack", "Register", "Cache"], "node-minted:definition:0") }
    }),
    studyItemBankStore: store
  });

  assert.ok(persisted.length >= 1);
  assert.ok(persisted.every((item) => item.groundingProvenance === "generated"), "minted nodes stay generated provenance");
});
