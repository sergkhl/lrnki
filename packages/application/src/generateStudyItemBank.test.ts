import assert from "node:assert/strict";
import test from "node:test";
import type {
  DerivedGraphLayer,
  GraphSnapshot,
  OptionSelectItemDraft,
  PublishedEvidencePassage,
  RejectedStudyItem,
  SelfAssessmentItemDraft,
  StudyItem
} from "@lrnki/domain-core";
import type { EnrichmentRunStorePort, GraphVersionStorePort, StudyItemBankStorePort, StudyItemGenerationPort } from "@lrnki/ports";
import { generateStudyItemBank } from "./generateStudyItemBank";

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

function enrichmentStoreReturning(layer: DerivedGraphLayer): EnrichmentRunStorePort {
  return {
    async persist() { /* unused */ },
    async getLayer() { return layer; }
  } as unknown as EnrichmentRunStorePort;
}

function saDraft(quote: string, passageId = "b1"): SelfAssessmentItemDraft {
  return { itemType: "self_assessment", question: "What governs memory?", answerKey: "A set of rules.", selfReportPrompt: "Confident?", citations: [{ passageId, evidenceQuote: quote }] };
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

// Canned generator: SA / OS drafts keyed by derivedNodeId, or the literal "throw" to
// simulate a generation failure. These are INPUT FIXTURES exercising the deterministic
// envelope (ADR-0013) — no assertion is ever made on the model's judgment content.
function generationReturning(opts: {
  selfAssessment?: Record<string, SelfAssessmentItemDraft | "throw">;
  optionSelect?: Record<string, OptionSelectItemDraft | "throw">;
}): StudyItemGenerationPort {
  return {
    model: "mock-gen",
    async generate(input) {
      const draft = opts.selfAssessment?.[input.node.derivedNodeId];
      if (draft === undefined) throw new Error(`no canned self-assessment draft for ${input.node.derivedNodeId}`);
      if (draft === "throw") throw new Error("self-assessment generation failed");
      return draft;
    },
    async generateOptionSelect(input) {
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

test("a node whose self-assessment verifies and whose option-select passes the guard persists both", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store, persisted, persistedRejected } = capturingStore();
  const result = await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    studyItemGeneration: generationReturning({
      selfAssessment: { "node-c1": saDraft("rules that govern memory") },
      optionSelect: { "node-c1": osDraft("rules that govern memory") }
    }),
    studyItemBankStore: store
  });

  assert.equal(result.studyItems.length, 2);
  assert.equal(result.rejected.length, 0);
  assert.deepEqual(typesFor(persisted, "node-c1"), ["option_select", "self_assessment"]);
  assert.deepEqual(persistedRejected, []);
});

test("Covers AE5/R13: self-assessment verifies but the option-select guard rejects → only self_assessment; node NOT rejected", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store, persisted, persistedRejected } = capturingStore();
  // Duplicate distractors fail the structural guard (not a grounding failure).
  const result = await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    studyItemGeneration: generationReturning({
      selfAssessment: { "node-c1": saDraft("rules that govern memory") },
      optionSelect: { "node-c1": osDraft("rules that govern memory", ["Same", "Same", "Cache"]) }
    }),
    studyItemBankStore: store
  });

  assert.deepEqual(typesFor(persisted, "node-c1"), ["self_assessment"]);
  assert.equal(persistedRejected.length, 0, "a node with a self_assessment item is cardless-for-studying, not rejected");
  assert.deepEqual(await store.supportedItemTypes("node-c1"), ["self_assessment"]);
});

test("a node with no usable grounding yields no items and one rejection, without calling the generator", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Empty" }]);
  const { store, persisted, persistedRejected } = capturingStore();
  let generatorCalled = false;
  const generation: StudyItemGenerationPort = {
    model: "mock",
    async generate() { generatorCalled = true; throw new Error("should not be called"); },
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

test("an option-select generation that throws leaves the self-assessment item persisted and continues the run", async () => {
  const snapshot = snapshotWith([
    { conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] },
    { conceptId: "c2", label: "Borrowing", definitions: [passage("b1", ownershipDef)] }
  ]);
  const { store, persisted, persistedRejected } = capturingStore();
  const result = await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1"), anchorNode("c2", "Borrowing")])),
    studyItemGeneration: generationReturning({
      selfAssessment: { "node-c1": saDraft("rules that govern memory"), "node-c2": saDraft("rules that govern memory") },
      optionSelect: { "node-c1": "throw", "node-c2": osDraft("rules that govern memory") }
    }),
    studyItemBankStore: store
  });

  assert.equal(result.rejected.length, 0, "an option-select throw never rejects the node");
  assert.deepEqual(typesFor(persisted, "node-c1"), ["self_assessment"]);
  assert.deepEqual(typesFor(persisted, "node-c2"), ["option_select", "self_assessment"]);
});

test("an option-select whose correct answer cites text absent from grounding drops only that type", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store, persisted } = capturingStore();
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    studyItemGeneration: generationReturning({
      selfAssessment: { "node-c1": saDraft("rules that govern memory") },
      optionSelect: { "node-c1": osDraft("a fact never stated in the passage") }
    }),
    studyItemBankStore: store
  });

  assert.deepEqual(typesFor(persisted, "node-c1"), ["self_assessment"], "ungrounded correct answer drops option-select, self-assessment unaffected");
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
      selfAssessment: { "node-c1": saDraft("rules that govern memory"), "node-c2": saDraft("rules that govern memory") },
      // node-c1 gets both; node-c2's option-select is guard-rejected (duplicate options).
      optionSelect: { "node-c1": osDraft("rules that govern memory"), "node-c2": osDraft("rules that govern memory", ["Same", "Same", "Cache"]) }
    }),
    studyItemBankStore: store
  });

  assert.deepEqual(await store.supportedItemTypes("node-c1"), ["option_select", "self_assessment"]);
  assert.deepEqual(await store.supportedItemTypes("node-c2"), ["self_assessment"]);
});
