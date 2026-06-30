import assert from "node:assert/strict";
import test from "node:test";
import type {
  ConceptLesson,
  ConceptLessonDraft,
  DerivedGraphLayer,
  GraphSnapshot,
  ImpostorItemDraft,
  LessonAbsentNode,
  OptionSelectItemDraft,
  PublishedEvidencePassage,
  RejectedStudyItem,
  StudyItem
} from "@lrnki/domain-core";
import { currentOperationTag } from "@lrnki/domain-core/operation-tag-context";
import { installNodeOperationTagContext } from "@lrnki/domain-core/operation-tag-context-node";
import type { ConceptLessonGenerationPort, ConceptLessonStorePort, EnrichmentRunStorePort, GraphVersionStorePort, StudyItemBankStorePort, StudyItemGenerationPort } from "@lrnki/ports";
import { generateStudyItemBank, OPTION_SELECT_GENERATION_ATTEMPTS } from "./generateStudyItemBank";

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

// A guard-passing impostor draft derived from the FIRST grounding passage the orchestrator
// hands the generator: three truths citing that passage's full text (distinct statement text,
// same quote — the guard only requires impostor-vs-truth distinctness) plus one generated lie.
function impDraftFrom(passages: { passageId: string; text: string }[]): ImpostorItemDraft {
  const p = passages[0];
  return {
    itemType: "impostor",
    question: "Which statement is false?",
    statements: [
      { text: "True statement one.", isImpostor: false, citation: { passageId: p.passageId, evidenceQuote: p.text } },
      { text: "True statement two.", isImpostor: false, citation: { passageId: p.passageId, evidenceQuote: p.text } },
      { text: "True statement three.", isImpostor: false, citation: { passageId: p.passageId, evidenceQuote: p.text } },
      { text: "A planted lie about this node.", isImpostor: true }
    ],
    reveal: "The fourth statement is false.",
    lieSource: "generated"
  };
}

// Canned generators keyed by derivedNodeId, or the literal "throw" to simulate a failure.
// INPUT FIXTURES exercising the deterministic envelope (ADR-0013) — no assertion is ever made
// on the model's judgment content. By default `generateImpostor` derives a guard-passing
// impostor from the grounding it is handed, so a node with a usable lesson carries both item
// types; pass `impostor` to override per node (a draft, "throw", or "absent" to skip).
function generationReturning(opts: {
  optionSelect?: Record<string, OptionSelectItemDraft | "throw">;
  impostor?: Record<string, ImpostorItemDraft | "throw" | "absent">;
  onGenerate?: () => void;
  onGenerateImpostor?: () => void;
}): StudyItemGenerationPort {
  return {
    model: "mock-gen",
    async generateOptionSelect(input) {
      opts.onGenerate?.();
      const draft = opts.optionSelect?.[input.node.derivedNodeId];
      if (draft === undefined) throw new Error(`no canned option-select draft for ${input.node.derivedNodeId}`);
      if (draft === "throw") throw new Error("option-select generation failed");
      return draft;
    },
    async generateImpostor(input) {
      opts.onGenerateImpostor?.();
      const override = opts.impostor?.[input.node.derivedNodeId];
      if (override === "throw") throw new Error("impostor generation failed");
      if (override === "absent") {
        // A guard-failing draft (zero impostors) so the node is recorded impostor-absent.
        return { ...impDraftFrom(input.groundingPassages), statements: impDraftFrom(input.groundingPassages).statements.map((s) => ({ ...s, isImpostor: false })) };
      }
      if (override) return override;
      return impDraftFrom(input.groundingPassages);
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

  // Both stages run: the node carries an option-select AND an impostor item (KTD7).
  assert.equal(result.studyItems.length, 2);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.lessons.length, 1);
  assert.equal(result.lessonAbsent.length, 0);
  assert.deepEqual(typesFor(persisted, "node-c1"), ["impostor", "option_select"]);
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

  // Option-select is rejected (its guard miss), but the impostor stage still grounds an item.
  assert.deepEqual(typesFor(persisted, "node-c1"), ["impostor"]);
  const optionSelectRejections = persistedRejected.filter((r) => r.itemType === "option_select");
  assert.equal(optionSelectRejections.length, 1);
  assert.deepEqual(await store.supportedItemTypes("node-c1"), ["impostor"]);
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
  let impostorGeneratorCalled = false;
  const generation: StudyItemGenerationPort = {
    model: "mock",
    async generateOptionSelect() { osGeneratorCalled = true; throw new Error("should not be called"); },
    async generateImpostor() { impostorGeneratorCalled = true; throw new Error("should not be called"); }
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
  // R10/R9: neither item type is generated for a lesson-absent node; it is rejected per type,
  // each referencing the absent lesson (keyed independently — KTD8).
  assert.equal(result.rejected.length, 2);
  const reasonsByType = new Map(persistedRejected.map((r) => [r.itemType, r.reason] as const));
  assert.match(reasonsByType.get("option_select")!, /lesson is absent/);
  assert.match(reasonsByType.get("impostor")!, /lesson is absent/);
  assert.equal(osGeneratorCalled, false);
  assert.equal(impostorGeneratorCalled, false);
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

  // Only node-c1's option-select is rejected; both nodes' impostors ground from their lessons.
  assert.equal(result.rejected.filter((r) => r.itemType === "option_select").length, 1);
  assert.deepEqual(typesFor(persisted, "node-c1"), ["impostor"]);
  assert.deepEqual(typesFor(persisted, "node-c2"), ["impostor", "option_select"]);
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

  // The ungrounded option-select is rejected; the impostor still grounds from the lesson.
  assert.deepEqual(typesFor(persisted, "node-c1"), ["impostor"]);
});

test("an option-select guard miss gets one fresh generation attempt before rejection", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store, persisted } = capturingStore();
  let calls = 0;
  const retryingGeneration: StudyItemGenerationPort = {
    model: "mock-gen",
    async generateOptionSelect() {
      calls += 1;
      return calls === 1 ? osDraft("a fact never stated in the passage") : osDraft("rules that govern memory");
    },
    async generateImpostor(input) {
      // A guard-passing impostor from the grounding so the node also carries an impostor item.
      const p = input.groundingPassages[0];
      return {
        itemType: "impostor",
        question: "Which is false?",
        statements: [
          { text: "t1", isImpostor: false, citation: { passageId: p.passageId, evidenceQuote: p.text } },
          { text: "t2", isImpostor: false, citation: { passageId: p.passageId, evidenceQuote: p.text } },
          { text: "t3", isImpostor: false, citation: { passageId: p.passageId, evidenceQuote: p.text } },
          { text: "a lie", isImpostor: true }
        ],
        reveal: "The fourth is false.",
        lieSource: "generated"
      };
    }
  };
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": goodLessonDraft("b1", ownershipDef) } }),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: retryingGeneration,
    studyItemBankStore: store
  });

  assert.equal(calls, OPTION_SELECT_GENERATION_ATTEMPTS);
  assert.deepEqual(typesFor(persisted, "node-c1"), ["impostor", "option_select"]);
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
    // generated, and option-select grounds in the generated lesson section with the selector's
    // canonical generated passage id.
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-minted": goodLessonDraft("node-minted:definition:0", generatedDef) } }),
    conceptLessonStore: lessonStore.store,
    studyItemGeneration: generationReturning({ optionSelect: { "node-minted": osDraft(cite, ["Stack", "Register", "Cache"], "node-minted:definition:0") } }),
    studyItemBankStore: store
  });

  assert.ok(lessonStore.lessons.length === 1 && lessonStore.lessons[0].sections.every((s) => s.groundingProvenance === "generated"), "the minted node's whole lesson is generated-labeled");
  assert.ok(persisted.length >= 1);
  assert.ok(persisted.every((item) => item.groundingProvenance === "generated"), "minted nodes stay generated provenance");
});

function impDraftCiting(passageId: string, quote: string, opts: { lieSource?: "sibling" | "generated"; siblingLabel?: string } = {}): ImpostorItemDraft {
  return {
    itemType: "impostor",
    question: "Which statement is false?",
    statements: [
      { text: "Truth one about the node.", isImpostor: false, citation: { passageId, evidenceQuote: quote } },
      { text: "Truth two about the node.", isImpostor: false, citation: { passageId, evidenceQuote: quote } },
      { text: "Truth three about the node.", isImpostor: false, citation: { passageId, evidenceQuote: quote } },
      { text: "A plausible-but-false claim.", isImpostor: true }
    ],
    reveal: "The fourth is false.",
    lieSource: opts.lieSource ?? "generated",
    ...(opts.siblingLabel ? { siblingLabel: opts.siblingLabel } : {})
  };
}

test("Covers AE1: a sibling-sourced impostor passes the guard and persists with its siblingLabel", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store, persisted } = capturingStore();
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": goodLessonDraft("b1", ownershipDef) } }),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generationReturning({
      optionSelect: { "node-c1": osDraft("rules that govern memory") },
      impostor: { "node-c1": impDraftCiting("b1", "rules that govern memory", { lieSource: "sibling", siblingLabel: "Borrowing" }) }
    }),
    studyItemBankStore: store
  });

  const impostor = persisted.find((item) => item.itemType === "impostor");
  assert.ok(impostor && impostor.itemType === "impostor");
  if (impostor.itemType !== "impostor") return;
  assert.equal(impostor.lieSource, "sibling");
  assert.equal(impostor.siblingLabel, "Borrowing");
  assert.equal(impostor.statements.filter((s) => s.isImpostor).length, 1);
});

test("Covers AE2: a model returning lieSource 'generated' produces a generated-labeled impostor", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store, persisted } = capturingStore();
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": goodLessonDraft("b1", ownershipDef) } }),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generationReturning({
      optionSelect: { "node-c1": osDraft("rules that govern memory") },
      impostor: { "node-c1": impDraftCiting("b1", "rules that govern memory", { lieSource: "generated" }) }
    }),
    studyItemBankStore: store
  });

  const impostor = persisted.find((item) => item.itemType === "impostor");
  assert.ok(impostor && impostor.itemType === "impostor");
  if (impostor.itemType !== "impostor") return;
  assert.equal(impostor.lieSource, "generated");
  assert.equal(impostor.siblingLabel, undefined);
});

test("Covers AE2: a node whose impostor fails the guard twice is recorded impostor-absent and the run continues", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store, persisted, persistedRejected } = capturingStore();
  const result = await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": goodLessonDraft("b1", ownershipDef) } }),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generationReturning({
      optionSelect: { "node-c1": osDraft("rules that govern memory") },
      impostor: { "node-c1": "absent" }
    }),
    studyItemBankStore: store
  });

  // Option-select still persists; the impostor is recorded absent with a guard reason.
  assert.deepEqual(typesFor(persisted, "node-c1"), ["option_select"]);
  const impostorRejection = persistedRejected.find((r) => r.itemType === "impostor");
  assert.ok(impostorRejection, "a per-type impostor rejection is recorded");
  assert.match(impostorRejection!.reason, /exactly one impostor/i);
  // The run does not fail.
  assert.equal(result.studyItems.some((item) => item.itemType === "option_select"), true);
});

test("rule 18: both stages derive grounding from the same lesson passages for a node", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store } = capturingStore();
  let optionSelectPassages: { passageId: string; text: string }[] = [];
  let impostorPassages: { passageId: string; text: string }[] = [];
  const recordingGeneration: StudyItemGenerationPort = {
    model: "mock-gen",
    async generateOptionSelect(input) {
      optionSelectPassages = input.groundingPassages.map((p) => ({ passageId: p.passageId, text: p.text }));
      return osDraft("rules that govern memory");
    },
    async generateImpostor(input) {
      impostorPassages = input.groundingPassages.map((p) => ({ passageId: p.passageId, text: p.text }));
      return impDraftCiting("b1", "rules that govern memory");
    }
  };
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": goodLessonDraft("b1", ownershipDef) } }),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: recordingGeneration,
    studyItemBankStore: store
  });

  assert.deepEqual(impostorPassages, optionSelectPassages);
  assert.ok(impostorPassages.length > 0);
});

test("a minted lesson with no surviving citation can still anchor generated option-select from substantive lesson prose", async () => {
  const generatedDef = "Pointer arithmetic calculates target memory addresses from a base address and an offset.";
  const cite = "target memory addresses";
  const { store, persisted } = capturingStore();
  const lessonStore = capturingLessonStore();
  const uncitedGeneratedLesson: ConceptLessonDraft = {
    sections: [
      { kind: "gist", text: "A one-line gist." },
      { kind: "definition", text: generatedDef },
      { kind: "applications", text: "How it connects to neighbors." }
    ]
  };
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshotWith([])),
    enrichmentStore: enrichmentStoreReturning(layerWith([llmGroundedNode()])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-minted": uncitedGeneratedLesson } }),
    conceptLessonStore: lessonStore.store,
    studyItemGeneration: generationReturning({ optionSelect: { "node-minted": osDraft(cite, ["Stack", "Register", "Cache"], "node-minted:definition:lesson") } }),
    studyItemBankStore: store
  });

  assert.ok(persisted.length >= 1);
  assert.ok(persisted.every((item) => item.groundingProvenance === "generated"));
});
