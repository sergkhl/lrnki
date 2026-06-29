import assert from "node:assert/strict";
import test from "node:test";
import type {
  ConceptLesson,
  ConceptLessonDraft,
  DerivedGraphLayer,
  GraphSnapshot,
  LessonAbsentNode,
  OptionSelectItemDraft,
  PublishedEvidencePassage,
  RejectedStudyItem,
  StudyItem
} from "@lrnki/domain-core";
import { currentOperationTag } from "@lrnki/domain-core/operation-tag-context";
import { installNodeOperationTagContext } from "@lrnki/domain-core/operation-tag-context-node";
import type { ConceptLessonGenerationPort, ConceptLessonStorePort, EnrichmentRunStorePort, GraphVersionStorePort, StudyItemBankStorePort, StudyItemGenerationPort } from "@lrnki/ports";
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

// A valid lesson draft: gist + a source-cited definition + applications, meeting the R3
// minimum. The definition cites `passageId` with `defQuote` so the assembler verifies it
// verbatim and the resulting source section feeds option-select's grounding (U7).
function goodLessonDraft(passageId: string, defQuote: string): ConceptLessonDraft {
  return {
    sections: [
      { kind: "gist", text: "A one-line gist." },
      { kind: "definition", text: "A definition restating the source.", citation: { passageId, evidenceQuote: defQuote } },
      { kind: "applications", text: "How it connects to neighbors." }
    ]
  };
}

// Canned generators keyed by derivedNodeId, or the literal "throw" to simulate a failure.
// INPUT FIXTURES exercising the deterministic envelope (ADR-0013) — no assertion is ever made
// on the model's judgment content.
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

function lessonGenerationReturning(opts: {
  lessons?: Record<string, ConceptLessonDraft | "throw">;
}): ConceptLessonGenerationPort {
  return {
    model: "mock-lesson",
    async generate(input) {
      const draft = opts.lessons?.[input.node.derivedNodeId];
      if (draft === undefined) throw new Error(`no canned lesson draft for ${input.node.derivedNodeId}`);
      if (draft === "throw") throw new Error("lesson generation failed");
      return draft;
    }
  };
}

function capturingLessonStore(): { store: ConceptLessonStorePort; lessons: ConceptLesson[]; absent: LessonAbsentNode[] } {
  const lessons: ConceptLesson[] = [];
  const absent: LessonAbsentNode[] = [];
  const store: ConceptLessonStorePort = {
    async persist(input) { lessons.push(...input.lessons); absent.push(...input.absent); },
    async getLesson(id) { return lessons.find((l) => l.derivedNodeId === id); },
    async listLessonsForEnrichment() { return lessons; },
    async listAbsentForEnrichment() { return absent; }
  };
  return { store, lessons, absent };
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

test("a node whose lesson grounds an option-select that passes the guard persists one item and one lesson", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store, persisted, persistedRejected } = capturingStore();
  const lessonStore = capturingLessonStore();
  const result = await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": goodLessonDraft("b1", ownershipDef) } }),
    conceptLessonStore: lessonStore.store,
    studyItemGeneration: generationReturning({ optionSelect: { "node-c1": osDraft("rules that govern memory") } }),
    studyItemBankStore: store
  });

  assert.equal(result.studyItems.length, 1);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.lessons.length, 1);
  assert.equal(result.lessonAbsent.length, 0);
  assert.deepEqual(typesFor(persisted, "node-c1"), ["option_select"]);
  assert.deepEqual(persistedRejected, []);
  // The lesson is persisted through the lesson store, with a source-cited definition section.
  assert.equal(lessonStore.lessons.length, 1);
  assert.ok(lessonStore.lessons[0].sections.some((s) => s.kind === "definition" && s.groundingProvenance === "source_cep"));
});

test("the study-item operation context reaches generation calls", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store } = capturingStore();
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": goodLessonDraft("b1", ownershipDef) } }),
    conceptLessonStore: capturingLessonStore().store,
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
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": goodLessonDraft("b1", ownershipDef) } }),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generationReturning({ optionSelect: { "node-c1": osDraft("rules that govern memory", ["Same", "Same", "Cache"]) } }),
    studyItemBankStore: store
  });

  assert.deepEqual(typesFor(persisted, "node-c1"), []);
  assert.equal(persistedRejected.length, 1);
  assert.deepEqual(await store.supportedItemTypes("node-c1"), []);
});

test("Covers AE3/R3: a node with no usable grounding is recorded lesson-absent and yields no item, without calling either generator", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Empty" }]);
  const { store, persisted, persistedRejected } = capturingStore();
  const lessonStore = capturingLessonStore();
  let lessonGeneratorCalled = false;
  const lessonGen: ConceptLessonGenerationPort = {
    model: "mock-lesson",
    async generate() { lessonGeneratorCalled = true; throw new Error("should not be called"); }
  };
  let osGeneratorCalled = false;
  const generation: StudyItemGenerationPort = {
    model: "mock",
    async generateOptionSelect() { osGeneratorCalled = true; throw new Error("should not be called"); }
  };
  const result = await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGen,
    conceptLessonStore: lessonStore.store,
    studyItemGeneration: generation,
    studyItemBankStore: store
  });

  assert.equal(persisted.length, 0);
  // The lesson is absent with the unusable-grounding reason (no generator is even called).
  assert.equal(lessonStore.absent.length, 1);
  assert.match(lessonStore.absent[0].reason, /no usable grounding/);
  assert.equal(lessonGeneratorCalled, false);
  // R10: option-select is not generated for a lesson-absent node; it is rejected referencing it.
  assert.equal(result.rejected.length, 1);
  assert.match(persistedRejected[0].reason, /lesson is absent/);
  assert.equal(osGeneratorCalled, false);
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
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": goodLessonDraft("b1", ownershipDef), "node-c2": goodLessonDraft("b1", ownershipDef) } }),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generationReturning({ optionSelect: { "node-c1": "throw", "node-c2": osDraft("rules that govern memory") } }),
    studyItemBankStore: store
  });

  assert.equal(result.rejected.length, 1);
  assert.deepEqual(typesFor(persisted, "node-c1"), []);
  assert.deepEqual(typesFor(persisted, "node-c2"), ["option_select"]);
});

test("an option-select whose correct answer cites text absent from the lesson grounding is rejected", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store, persisted } = capturingStore();
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": goodLessonDraft("b1", ownershipDef) } }),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generationReturning({ optionSelect: { "node-c1": osDraft("a fact never stated in the passage") } }),
    studyItemBankStore: store
  });

  assert.deepEqual(typesFor(persisted, "node-c1"), []);
});

test("Covers R10: option-select grounds in the lesson's source-cited section; a lesson with no grounded section yields no item", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store, persisted, persistedRejected } = capturingStore();
  // A lesson that meets the minimum but whose substantive section is uncited (all synthesized):
  // there is no grounded section to anchor an item, so option-select is rejected.
  const synthesizedLesson: ConceptLessonDraft = {
    sections: [
      { kind: "gist", text: "Gist." },
      { kind: "examples", text: "An example with no citation." },
      { kind: "applications", text: "Applications." }
    ]
  };
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": synthesizedLesson } }),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generationReturning({ optionSelect: { "node-c1": osDraft("rules that govern memory") } }),
    studyItemBankStore: store
  });

  assert.deepEqual(typesFor(persisted, "node-c1"), []);
  assert.match(persistedRejected[0].reason, /no grounded sections/);
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
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-rescued": goodLessonDraft("def-1", def) } }),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generationReturning({ optionSelect: { "node-rescued": osDraft(cite, ["Stack", "Register", "Cache"], "def-1") } }),
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
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-borrow": goodLessonDraft("m-1", m) } }),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generationReturning({ optionSelect: { "node-borrow": osDraft(cite, ["Stack", "Register", "Cache"], "m-1") } }),
    studyItemBankStore: store
  });

  assert.ok(persisted.length >= 1);
  assert.ok(persisted.every((item) => item.groundingProvenance === "source_mentioned"));
});

test("Covers AE5: a minted llm_grounded node yields a generated lesson and generated-provenance items (U4/U7)", async () => {
  const generatedDef = "Pointer arithmetic computes addresses.";
  const cite = "computes addresses";
  const { store, persisted } = capturingStore();
  const lessonStore = capturingLessonStore();
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshotWith([])),
    enrichmentStore: enrichmentStoreReturning(layerWith([llmGroundedNode()])),
    // The minted node's lesson cites its generated grounding passage; the assembler keeps it
    // generated, and option-select grounds in the generated lesson section keyed by node:kind.
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-minted": goodLessonDraft("node-minted:definition:0", generatedDef) } }),
    conceptLessonStore: lessonStore.store,
    studyItemGeneration: generationReturning({ optionSelect: { "node-minted": osDraft(cite, ["Stack", "Register", "Cache"], "node-minted:definition") } }),
    studyItemBankStore: store
  });

  assert.ok(lessonStore.lessons.length === 1 && lessonStore.lessons[0].sections.every((s) => s.groundingProvenance === "generated"), "the minted node's whole lesson is generated-labeled");
  assert.ok(persisted.length >= 1);
  assert.ok(persisted.every((item) => item.groundingProvenance === "generated"), "minted nodes stay generated provenance");
});
