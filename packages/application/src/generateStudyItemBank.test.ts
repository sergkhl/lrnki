import assert from "node:assert/strict";
import test from "node:test";
import type {
  ConceptLesson,
  ConceptLessonDraft,
  ConceptLessonRedundancyJudgment,
  DerivedGraphLayer,
  GraphSnapshot,
  ImpostorItemDraft,
  LessonAbsentNode,
  MatchingItemDraft,
  OptionSelectItemDraft,
  PublishedEvidencePassage,
  RejectedStudyItem,
  StudyItem
} from "@lrnki/domain-core";
import { currentOperationContext } from "@lrnki/domain-core/operation-context";
import { installNodeOperationContext } from "@lrnki/domain-core/operation-context-node";
import type { ConceptLessonGenerationPort, ConceptLessonRedundancyJudgmentPort, ConceptLessonStorePort, EnrichmentRunStorePort, GraphVersionStorePort, MatchingAssignmentVerificationPort, RunProgressReporterPort, StageErrorDetail, StudyItemBankStorePort, StudyItemGenerationPort, AnswerKeyVerificationPort } from "@lrnki/ports";
import {
  generateStudyItemBank as generateStudyItemBankApplication,
  OPTION_SELECT_GENERATION_ATTEMPTS
} from "./generateStudyItemBank";
import { SOURCE_EXTRACTIVE_DEFINITION_LESSON_GENERATOR } from "./assembleConceptLesson";
import { NON_LLM_STAGES } from "./runProgressReporter";
import { qualifiedSourceExpeditionAssetConfigHash } from "./sourceExpedition";
import { sourceOptionExactReferenceQuestion } from "./sourceOptionExactReference";
import { STUDY_ITEM_BANK_STAGE_GROUP } from "./topicExpeditionStageProfile";

installNodeOperationContext();

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
      groundingOrigin: "llm_grounded" as const,
      definitions: [{ passageType: "definition" as const, text: "Pointer arithmetic computes addresses.", groundingOrigin: "llm_grounded" as const, headingPath: [], locator: {}, verbatimCheck: { disposition: "not_applicable_by_grounding" as const, rationale: "generated" } }],
      mentions: [],
      groundingAnchorReferences: [],
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

type ReporterCall =
  | { method: "beginOperation"; operationType: string; operationId: string }
  | { method: "enterStage"; stage: string }
  | { method: "completeStage"; stage: string; ok: boolean; errorDetail?: StageErrorDetail }
  | { method: "completeOperation"; status: string };

function recordingReporter(): { reporter: RunProgressReporterPort; calls: ReporterCall[] } {
  const calls: ReporterCall[] = [];
  return {
    calls,
    reporter: {
      async beginOperation(input) { calls.push({ method: "beginOperation", operationType: input.operationType, operationId: input.operationId }); },
      async enterStage(input) { calls.push({ method: "enterStage", stage: input.stage }); },
      async recordProgress() {},
      async completeStage(input) { calls.push({ method: "completeStage", stage: input.stage, ok: input.ok, errorDetail: input.errorDetail }); },
      async completeOperation(input) { calls.push({ method: "completeOperation", status: input.status }); },
      async touch() {}
    }
  };
}

// The study-item generators are shown LESSON grounding, never the node's raw grounding: a
// section's passage id is positional in the lesson (`${derivedNodeId}:s${sectionIndex}`) and a
// bullet's is `${...}:i${bulletIndex}` (plan 2026-08-05-001 D10). Positional identity is what
// makes two same-kind cited sections addressable apart. `goodLessonDraft` and its variants put
// their definition section at index 1, so that is the id an option-select cites.
function lessonPassageId(derivedNodeId: string, sectionIndex: number): string {
  return `${derivedNodeId}:s${sectionIndex}`;
}

function osDraft(correctQuote: string, distractors: [string, string, string] = ["Stack", "Register", "Cache"], passageId = lessonPassageId("node-c1", 1)): OptionSelectItemDraft {
  return {
    itemType: "option_select",
    question: "Where is memory governed?",
    explanation: "The lesson states memory is governed by this concept.",
    options: [
      { text: "Heap", isCorrect: true, provenance: "source", citation: { passageId, evidenceQuote: correctQuote } },
      ...distractors.map((text) => ({ text, isCorrect: false, provenance: "generated" as const }))
    ],
    explorableTerms: []
  };
}

function bindOptionDraftToInput(
  draft: OptionSelectItemDraft,
  input: Parameters<StudyItemGenerationPort["generateOptionSelect"]>[0]
): OptionSelectItemDraft {
  const correctProvenance = input.groundingProvenance === "generated" ? "generated" : "source";
  return {
    ...draft,
    question: input.groundingProvenance === "generated"
      ? `Which statement accurately describes ${input.node.canonicalLabel}?`
      : sourceOptionExactReferenceQuestion(input.node.canonicalLabel),
    explanation: input.correctAnswer.text,
    options: draft.options.map((option) => option.isCorrect
      ? {
          ...option,
          text: input.correctAnswer.text,
          provenance: correctProvenance
        }
      : option
    )
  };
}

// A valid lesson draft: gist + a source-cited definition + applications, meeting the R3
// minimum. The definition cites `passageId` with `defQuote` so the assembler verifies it
// verbatim and the resulting source section feeds option-select's grounding (U7).
function goodLessonDraft(passageId: string, defQuote: string): ConceptLessonDraft {
  const words = defQuote.split(" ");
  const leadingFragment = words.slice(0, Math.min(3, words.length)).join(" ");
  const trailingFragment = words.slice(Math.max(0, words.length - 3)).join(" ");
  return {
    sections: [
      { kind: "gist", text: defQuote },
      { kind: "definition", text: defQuote, citation: { passageId, evidenceQuote: defQuote } },
      { kind: "applications", text: defQuote, items: [leadingFragment, trailingFragment] }
    ],
    explorableTerms: []
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
    truths: [
      { text: "True statement one.", citation: { passageId: p.passageId, evidenceQuote: p.text } },
      { text: "True statement two.", citation: { passageId: p.passageId, evidenceQuote: p.text } },
      { text: "True statement three.", citation: { passageId: p.passageId, evidenceQuote: p.text } }
    ],
    lie: { text: "A planted lie about this node.", reveal: "The fourth statement is false.", lieSource: "generated" },
    explorableTerms: []
  };
}

function matchingDraftFrom(passages: { passageId: string; text: string }[]): MatchingItemDraft {
  const p = passages[0];
  return {
    itemType: "matching",
    question: "Match each clue to its description.",
    pairs: [
      { promptText: "Clue one", matchText: "Description one", citation: { passageId: p.passageId, evidenceQuote: p.text } },
      { promptText: "Clue two", matchText: "Description two", citation: { passageId: p.passageId, evidenceQuote: p.text } },
      { promptText: "Clue three", matchText: "Description three", citation: { passageId: p.passageId, evidenceQuote: p.text } }
    ],
    explorableTerms: []
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
  matching?: Record<string, MatchingItemDraft | "throw" | "absent">;
  onGenerate?: () => void;
  onGenerateOptionSelect?: (input: Parameters<StudyItemGenerationPort["generateOptionSelect"]>[0]) => void;
  onGenerateImpostor?: () => void;
}): StudyItemGenerationPort {
  return {
    model: "mock-gen",
    async generateOptionSelect(input) {
      opts.onGenerate?.();
      opts.onGenerateOptionSelect?.(input);
      const draft = opts.optionSelect?.[input.node.derivedNodeId];
      if (draft === undefined) throw new Error(`no canned option-select draft for ${input.node.derivedNodeId}`);
      if (draft === "throw") throw new Error("option-select generation failed");
      return bindOptionDraftToInput(draft, input);
    },
    async generateImpostor(input) {
      opts.onGenerateImpostor?.();
      const override = opts.impostor?.[input.node.derivedNodeId];
      if (override === "throw") throw new Error("impostor generation failed");
      if (override === "absent") {
        // A guard-failing draft (wrong truth count) so the node is recorded impostor-absent.
        return { ...impDraftFrom(input.groundingPassages), truths: [] } as unknown as ImpostorItemDraft;
      }
      if (override) return override;
      return impDraftFrom(input.groundingPassages);
    },
    async generateMatching(input) {
      const override = opts.matching?.[input.node.derivedNodeId];
      if (override === "throw") throw new Error("matching generation failed");
      if (override === "absent") return { ...matchingDraftFrom(input.groundingPassages), pairs: [] };
      if (override) return override;
      return matchingDraftFrom(input.groundingPassages);
    }
  };
}

// Matches the fixtures' planted lies, every one of which names itself in its own text
// ("A planted lie about this node.", "A plausible-but-false claim.", "a lie"). No fixture
// truth or option text does, so this one predicate separates keyed lies from everything else
// without a hard-coded roster that would silently rot as fixtures are added.
const FIXTURE_LIE = /\b(lie|false)\b/i;
const FIXTURE_OPTION_KEYS = new Set([
  "Ownership is a set of rules that govern memory in Rust.",
  "A definition restating the concept."
]);

// A key-verification stub that admits every local fixture without reading a server key. The
// option-select fixture constructor above consistently uses one visible truth text, so this double
// can return the strict true/false matrix U5 now requires from only the key-hidden request. Impostor
// keeps its older negative-only envelope: its planted lie is false and its other claims are unclear.
function keyVerifierPassing(): AnswerKeyVerificationPort {
  return {
    model: "mock-verifier",
    async verify(input) {
      return input.candidates.map((candidate) => ({
        ordinal: candidate.ordinal,
        verdict: input.itemType === "option_select"
          ? FIXTURE_OPTION_KEYS.has(candidate.text) ? "claim_true" as const : "claim_false" as const
          : FIXTURE_LIE.test(candidate.text) ? "claim_false" as const : "unclear" as const,
        reason: "stub verdict"
      }));
    }
  };
}

// A Matching Assignment Verification stub that admits every fixture board by returning `unclear`
// for every cell. It CANNOT do what `keyVerifierPassing` does and confirm the key, because the
// presentation deliberately hides which cell is keyed — the match numbering is a text sort, not
// the pair ordinal. That is the point of the presentation, and this stub is the cheapest proof of
// it: a stub that could rubber-stamp the diagonal would mean the judge could too. Every test that
// composes a bank therefore also asserts, incidentally, that an all-`unclear` grid admits (D5/D6).
function matchingVerifierPassing(): MatchingAssignmentVerificationPort {
  return {
    model: "mock-matching-verifier",
    async verify(input) {
      return input.prompts.flatMap((prompt) =>
        input.matches.map((match) => ({
          promptOrdinal: prompt.ordinal,
          matchOrdinal: match.ordinal,
          verdict: "unclear" as const,
          reason: "stub verdict"
        }))
      );
    }
  };
}

type GenerateStudyItemBankInput = Parameters<typeof generateStudyItemBankApplication>[0];
type GenerateStudyItemBankTestInput = Omit<
  GenerateStudyItemBankInput,
  "conceptLessonRedundancyJudge" | "sourceAssetQualification"
> & Partial<Pick<
  GenerateStudyItemBankInput,
  "conceptLessonRedundancyJudge" | "sourceAssetQualification"
>>;

function sourceAssetQualificationPassing(): GenerateStudyItemBankInput["sourceAssetQualification"] {
  return {
    sourceEvidenceRead: {
      async readSourceEvidence(references) {
        return references.map((reference) => ({
          ...reference,
          sourceTitle: "Generated test source",
          blockType: "paragraph",
          headingPath: [],
          text: [
            ownershipDef,
            "Borrowing lets code reference values without taking ownership.",
            "Lifetimes describe how long references remain valid.",
            "Heap allocation means the memory must be requested from the memory allocator at runtime.",
            "Borrowing lets you reference a value without taking ownership."
          ].join("\n")
        }));
      }
    },
    sourceSupportVerifier: {
      model: "mock-source-support",
      async verify() {
        return { disposition: "supported", reason: "stub source-support verdict" };
      }
    }
  };
}

// Production composition requires both semantic dependencies. Most deterministic tests are about
// later bank mechanics, so this local constructor supplies explicit pass-through doubles while
// allowing focused tests to override either dependency.
function generateStudyItemBank(input: GenerateStudyItemBankTestInput) {
  return generateStudyItemBankApplication({
    ...input,
    conceptLessonRedundancyJudge:
      input.conceptLessonRedundancyJudge ?? redundancyJudgeReturning([]),
    sourceAssetQualification:
      input.sourceAssetQualification ?? sourceAssetQualificationPassing()
  });
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

function redundancyJudgeReturning(verdicts: ConceptLessonRedundancyJudgment[]): ConceptLessonRedundancyJudgmentPort {
  return {
    model: "mock-redundancy",
    async judge() { return verdicts; }
  };
}

function capturingLessonStore(): {
  store: ConceptLessonStorePort;
  lessons: ConceptLesson[];
  candidateLessons: ConceptLesson[];
  absent: LessonAbsentNode[];
  configHashes: string[];
} {
  const lessons: ConceptLesson[] = [];
  const candidateLessons: ConceptLesson[] = [];
  const absent: LessonAbsentNode[] = [];
  const configHashes: string[] = [];
  const store: ConceptLessonStorePort = {
    async persist(input) {
      configHashes.push(input.configHash);
      lessons.push(...input.lessons);
      candidateLessons.push(...(input.candidateLessons ?? []));
      absent.push(...input.absent);
    },
    async getLesson(id) { return lessons.find((l) => l.derivedNodeId === id); },
    async listLessonsForEnrichment() { return lessons; },
    async listAbsentForEnrichment() { return absent; }
  };
  return { store, lessons, candidateLessons, absent, configHashes };
}

function capturingStore(): {
  store: StudyItemBankStorePort;
  persisted: StudyItem[];
  candidateStudyItems: StudyItem[];
  persistedRejected: RejectedStudyItem[];
} {
  const persisted: StudyItem[] = [];
  const candidateStudyItems: StudyItem[] = [];
  const persistedRejected: RejectedStudyItem[] = [];
  const store: StudyItemBankStorePort = {
    async persist(input) {
      persisted.push(...input.studyItems);
      candidateStudyItems.push(...(input.candidateStudyItems ?? []));
      persistedRejected.push(...input.rejected);
    },
    async getStudyItem() { return undefined; },
    async getStudyItemById() { return undefined; },
    async listStudyItemsForEnrichment() { return persisted; },
    async supportedItemTypes(derivedNodeId) {
      return [...new Set(persisted.filter((item) => item.derivedNodeId === derivedNodeId).map((item) => item.itemType))].sort();
    }
  };
  return { store, persisted, candidateStudyItems, persistedRejected };
}

function typesFor(items: StudyItem[], derivedNodeId: string): string[] {
  return items.filter((item) => item.derivedNodeId === derivedNodeId).map((item) => item.itemType).sort();
}

const ownershipDef = "Ownership is a set of rules that govern memory in Rust.";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("a node whose lesson grounds an option-select that passes the guard persists one item and one lesson", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store, persisted, candidateStudyItems, persistedRejected } = capturingStore();
  const lessonStore = capturingLessonStore();
  const { reporter, calls } = recordingReporter();
  let optionSelectInput: Parameters<StudyItemGenerationPort["generateOptionSelect"]>[0] | undefined;
  const result = await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": goodLessonDraft("b1", ownershipDef) } }),
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: lessonStore.store,
    studyItemGeneration: generationReturning({
      optionSelect: { "node-c1": osDraft("rules that govern memory") },
      onGenerateOptionSelect(input) { optionSelectInput = input; }
    }),
    studyItemBankStore: store,
    newConceptLessonId: () => "lesson-node-c1",
    reporter
  });

  // All three stages run: the node carries option-select, matching, AND impostor items (KTD7).
  assert.equal(result.studyItems.length, 3);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.lessons.length, 1);
  assert.equal(result.lessonAbsent.length, 0);
  assert.deepEqual(typesFor(persisted, "node-c1"), ["impostor", "matching", "option_select"]);
  assert.deepEqual(persistedRejected, []);
  assert.equal(candidateStudyItems.length, 1);
  assert.equal(candidateStudyItems[0]?.itemType, "option_select");
  assert.equal(candidateStudyItems[0]?.configHash, "cfg-1");
  assert.equal(
    persisted.find((item) => item.itemType === "option_select")?.configHash,
    qualifiedSourceExpeditionAssetConfigHash("cfg-1")
  );
  // The lesson is persisted through the lesson store, with a source-cited definition section.
  assert.equal(lessonStore.lessons.length, 1);
  assert.equal(lessonStore.lessons[0].conceptLessonId, "lesson-node-c1", "the application mints the stable lesson identity before persistence");
  assert.ok(lessonStore.lessons[0].sections.some((s) => s.kind === "definition" && s.groundingProvenance === "source_cep"));
  assert.deepEqual(optionSelectInput?.correctAnswer, {
    text: ownershipDef,
    citation: {
      passageId: lessonPassageId("node-c1", 1),
      evidenceQuote: ownershipDef
    }
  }, "option generation receives an exact learner-visible lesson claim with that unit's resolved evidence");
  const settlementStageNames = new Set<string>([
    STUDY_ITEM_BANK_STAGE_GROUP.sourceMaterialClaimSupport.stage,
    STUDY_ITEM_BANK_STAGE_GROUP.optionSelectKeyVerification.stage
  ]);
  const settlementStages = calls.flatMap((call) =>
    (call.method === "enterStage" || call.method === "completeStage") &&
      settlementStageNames.has(call.stage)
      ? [`${call.method}:${call.stage}`]
      : []
  );
  assert.deepEqual(settlementStages, [
    `enterStage:${STUDY_ITEM_BANK_STAGE_GROUP.sourceMaterialClaimSupport.stage}`,
    `completeStage:${STUDY_ITEM_BANK_STAGE_GROUP.sourceMaterialClaimSupport.stage}`,
    `enterStage:${STUDY_ITEM_BANK_STAGE_GROUP.sourceMaterialClaimSupport.stage}`,
    `completeStage:${STUDY_ITEM_BANK_STAGE_GROUP.sourceMaterialClaimSupport.stage}`
  ], "lesson and option support own separate brackets; exact-reference truth is deterministic");
});

test("a false-accepting verifier cannot promote a mention into a definition lesson or item", async () => {
  const mention = "A revision names the forecast used for one scheduled decision.";
  const node = sourceMentionedNode({
    id: "node-forecast",
    label: "Decision forecast",
    passageType: "mention",
    quote: mention,
    blockId: "mention-1"
  });
  const lessonStore = capturingLessonStore();
  const itemStore = capturingStore();
  let supportCalls = 0;
  let itemGenerationCalls = 0;
  const forbiddenItemGeneration: StudyItemGenerationPort = {
    model: "must-not-run",
    async generateOptionSelect() {
      itemGenerationCalls += 1;
      throw new Error("option-select generation must not run");
    },
    async generateMatching() {
      itemGenerationCalls += 1;
      throw new Error("matching generation must not run");
    },
    async generateImpostor() {
      itemGenerationCalls += 1;
      throw new Error("impostor generation must not run");
    }
  };
  const result = await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshotWith([])),
    enrichmentStore: enrichmentStoreReturning(layerWith([node])),
    conceptLessonGeneration: lessonGenerationReturning({
      lessons: {
        "node-forecast": {
          sections: [{
            kind: "definition",
            text: mention,
            citation: { passageId: "mention-1", evidenceQuote: mention }
          }],
          explorableTerms: []
        }
      }
    }),
    sourceAssetQualification: {
      sourceEvidenceRead: {
        async readSourceEvidence() { return []; }
      },
      sourceSupportVerifier: {
        model: "false-accepting-source-support",
        async verify() {
          supportCalls += 1;
          return { disposition: "supported", reason: "Incorrectly accepted." };
        }
      }
    },
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: lessonStore.store,
    studyItemGeneration: forbiddenItemGeneration,
    studyItemBankStore: itemStore.store,
    newConceptLessonId: () => "candidate-lesson"
  });

  assert.equal(supportCalls, 0, "the typed passage-role floor runs before neural spend");
  assert.equal(itemGenerationCalls, 0);
  assert.deepEqual(result.lessons, []);
  assert.deepEqual(result.studyItems, []);
  assert.equal(result.lessonAbsent.length, 1);
  assert.equal(lessonStore.candidateLessons.length, 1);
  assert.equal(lessonStore.candidateLessons[0]?.sections[0]?.groundingProvenance, "generated");
  assert.equal(lessonStore.candidateLessons[0]?.sections[0]?.citation, undefined);
});

test("a source graph with an unavailable support verifier persists its candidate and calls no item generator", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const lessonStore = capturingLessonStore();
  const itemStore = capturingStore();
  let sourceReads = 0;
  let itemGenerationCalls = 0;
  const forbiddenItemGeneration: StudyItemGenerationPort = {
    model: "must-not-run",
    async generateOptionSelect() {
      itemGenerationCalls += 1;
      throw new Error("option-select generation must not run");
    },
    async generateMatching() {
      itemGenerationCalls += 1;
      throw new Error("matching generation must not run");
    },
    async generateImpostor() {
      itemGenerationCalls += 1;
      throw new Error("impostor generation must not run");
    }
  };

  const result = await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGenerationReturning({
      lessons: { "node-c1": goodLessonDraft("b1", ownershipDef) }
    }),
    sourceAssetQualification: {
      sourceEvidenceRead: {
        async readSourceEvidence(references) {
          sourceReads += 1;
          return references.map((reference) => ({
            ...reference,
            sourceTitle: "Generated ownership source",
            blockType: "paragraph",
            headingPath: [],
            text: ownershipDef
          }));
        }
      },
      sourceSupportVerifier: {
        model: "unavailable-source-support",
        async verify() {
          throw new Error("source-support transport unavailable");
        }
      }
    },
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: lessonStore.store,
    studyItemGeneration: forbiddenItemGeneration,
    studyItemBankStore: itemStore.store,
    newConceptLessonId: () => "candidate-lesson"
  });

  assert.equal(sourceReads, 1);
  assert.equal(itemGenerationCalls, 0);
  assert.deepEqual(result.lessons, []);
  assert.deepEqual(result.studyItems, []);
  assert.equal(result.lessonAbsent[0]?.reason,
    "source-support verification was unavailable; the candidate remains inspection-only");
  assert.equal(lessonStore.candidateLessons.length, 1);
  assert.equal(lessonStore.candidateLessons[0]?.conceptLessonId, "candidate-lesson");
  assert.equal(lessonStore.candidateLessons[0]?.configHash, "cfg-1");
  assert.deepEqual(lessonStore.configHashes, [qualifiedSourceExpeditionAssetConfigHash("cfg-1")]);
  assert.deepEqual(itemStore.persistedRejected.map((row) => row.itemType).sort(), [
    "impostor",
    "matching",
    "option_select"
  ]);
});

test("structural blueprint pre-gate rejects matching and impostor when the lesson is too sparse", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store } = capturingStore();
  const { reporter, calls } = recordingReporter();
  const sparseLesson: ConceptLessonDraft = {
    explorableTerms: [],
    sections: [
      { kind: "definition", text: ownershipDef, citation: { passageId: "b1", evidenceQuote: ownershipDef } }
    ]
  };
  const result = await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": sparseLesson } }),
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generationReturning({ optionSelect: { "node-c1": osDraft("rules that govern memory", ["Stack", "Register", "Cache"], lessonPassageId("node-c1", 0)) } }),
    studyItemBankStore: store,
    reporter
  });

  assert.deepEqual(typesFor(result.studyItems, "node-c1"), ["option_select"]);
  assert.deepEqual(result.rejected.map((row) => `${row.itemType}:${row.reason.startsWith("blueprint:")}`).sort(), ["impostor:true", "matching:true"]);
  const opened = new Set(calls.flatMap((call) => call.method === "enterStage" ? [call.stage] : []));
  assert.equal(opened.has(STUDY_ITEM_BANK_STAGE_GROUP.optionSelectGeneration.stage), true);
  assert.equal(opened.has(STUDY_ITEM_BANK_STAGE_GROUP.optionSelectKeyVerification.stage), false);
  assert.equal(opened.has(STUDY_ITEM_BANK_STAGE_GROUP.matchingGeneration.stage), false);
  assert.equal(opened.has(STUDY_ITEM_BANK_STAGE_GROUP.matchingAssignmentVerification.stage), false);
  assert.equal(opened.has(STUDY_ITEM_BANK_STAGE_GROUP.impostorGeneration.stage), false);
  assert.equal(opened.has(STUDY_ITEM_BANK_STAGE_GROUP.impostorKeyVerification.stage), false);
});

test("redundant non-substantive lesson sections are retried once then dropped", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const lessonStore = capturingLessonStore();
  const { reporter, calls } = recordingReporter();
  let redundancyCalls = 0;
  const result = await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": goodLessonDraft("b1", ownershipDef) } }),
    conceptLessonRedundancyJudge: {
      model: "mock-redundancy",
      async judge() {
        redundancyCalls += 1;
        return [{ sectionKind: "gist", verdict: "redundant", redundantWith: "definition", reason: "repeats the definition" }];
      }
    },
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: lessonStore.store,
    studyItemGeneration: generationReturning({ optionSelect: { "node-c1": osDraft("rules that govern memory") } }),
    studyItemBankStore: capturingStore().store,
    reporter
  });

  assert.equal(result.lessons.length, 1);
  assert.equal(result.lessons[0].sections.some((section) => section.kind === "gist"), false);
  assert.equal(result.lessonAbsent.length, 0);
  assert.equal(lessonStore.lessons[0].sections.some((section) => section.kind === "gist"), false);
  assert.equal(redundancyCalls, 2, "the initial lesson and retry are judged");
  const redundancyStage = STUDY_ITEM_BANK_STAGE_GROUP.lessonRedundancyJudgment.stage;
  assert.equal(calls.filter((call) => call.method === "enterStage" && call.stage === redundancyStage).length, 1);
  assert.equal(calls.filter((call) => call.method === "completeStage" && call.stage === redundancyStage).length, 1);
  const lessonEnter = calls.findIndex((call) => call.method === "enterStage" && call.stage === STUDY_ITEM_BANK_STAGE_GROUP.conceptLessonGeneration.stage);
  const redundancyEnter = calls.findIndex((call) => call.method === "enterStage" && call.stage === redundancyStage);
  const redundancyComplete = calls.findIndex((call) => call.method === "completeStage" && call.stage === redundancyStage);
  const lessonComplete = calls.findIndex((call) => call.method === "completeStage" && call.stage === STUDY_ITEM_BANK_STAGE_GROUP.conceptLessonGeneration.stage);
  assert.ok(lessonEnter < redundancyEnter && redundancyEnter < redundancyComplete && redundancyComplete < lessonComplete);
});

test("the required lesson-redundancy dependency opens its aggregate stage for an assembled lesson", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { reporter, calls } = recordingReporter();
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": goodLessonDraft("b1", ownershipDef) } }),
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generationReturning({ optionSelect: { "node-c1": osDraft("rules that govern memory") } }),
    studyItemBankStore: capturingStore().store,
    reporter
  });
  assert.equal(
    calls.some((call) => call.method === "enterStage" && call.stage === STUDY_ITEM_BANK_STAGE_GROUP.lessonRedundancyJudgment.stage),
    true
  );
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
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generationReturning({
      optionSelect: { "node-c1": osDraft("rules that govern memory") },
      onGenerate: () => assert.equal(currentOperationContext()?.operationId, "enr-1")
    }),
    studyItemBankStore: store
  });
});

test("missing enrichment leaves a failed study-item timeline with load-stage error detail", async () => {
  const { reporter, calls } = recordingReporter();

  await assert.rejects(
    () => generateStudyItemBank({
      enrichmentId: "missing-enr",
      configHash: "cfg-1",
      graphStore: graphStoreReturning(snapshotWith([])),
      enrichmentStore: { async getLayer() { return undefined; } } as unknown as EnrichmentRunStorePort,
      conceptLessonGeneration: lessonGenerationReturning({}),
      answerKeyVerification: keyVerifierPassing(),
      matchingAssignmentVerification: matchingVerifierPassing(),
      conceptLessonStore: capturingLessonStore().store,
      studyItemGeneration: generationReturning({}),
      studyItemBankStore: capturingStore().store,
      reporter
    }),
    /missing-enr/
  );

  assert.deepEqual(calls[0], { method: "beginOperation", operationType: "study_items", operationId: "missing-enr" });
  assert.deepEqual(calls[1], { method: "enterStage", stage: NON_LLM_STAGES.load });
  assert.equal(calls[2].method, "completeStage");
  assert.equal((calls[2] as { stage: string; ok: boolean }).stage, NON_LLM_STAGES.load);
  assert.equal((calls[2] as { ok: boolean }).ok, false);
  assert.match((calls[2] as { errorDetail?: StageErrorDetail }).errorDetail?.message ?? "", /missing-enr/);
  assert.deepEqual(calls.at(-1), { method: "completeOperation", status: "failed" });
  assert.ok(!calls.some((call) => call.method === "completeOperation" && (call as { status: string }).status === "succeeded"));
});

test("concurrent per-node generation persists items and rejections in input order", async () => {
  const nodes = [
    anchorNode("c1", "Ownership"),
    anchorNode("c2", "Borrowing"),
    anchorNode("c3", "Lifetimes")
  ];
  const defs = new Map([
    ["node-c1", { blockId: "b1", text: ownershipDef, delay: 20 }],
    ["node-c2", { blockId: "b2", text: "Borrowing lets code reference values without taking ownership.", delay: 10 }],
    ["node-c3", { blockId: "b3", text: "Lifetimes describe how long references remain valid.", delay: 1 }]
  ]);
  const snapshot = snapshotWith([
    { conceptId: "c1", label: "Ownership", definitions: [passage("b1", defs.get("node-c1")!.text)] },
    { conceptId: "c2", label: "Borrowing", definitions: [passage("b2", defs.get("node-c2")!.text)] },
    { conceptId: "c3", label: "Lifetimes", definitions: [passage("b3", defs.get("node-c3")!.text)] }
  ]);
  const { store, persisted, persistedRejected } = capturingStore();
  const lessonStore = capturingLessonStore();
  const conceptLessonGeneration: ConceptLessonGenerationPort = {
    model: "mock-lesson",
    async generate(input) {
      const def = defs.get(input.node.derivedNodeId)!;
      await sleep(def.delay);
      return goodLessonDraft(def.blockId, def.text);
    }
  };
  const studyItemGeneration: StudyItemGenerationPort = {
    model: "mock-gen",
    async generateOptionSelect(input) {
      await sleep(defs.get(input.node.derivedNodeId)!.delay);
      if (input.node.derivedNodeId !== "node-c1") throw new Error("option-select generation failed");
      return bindOptionDraftToInput(osDraft("rules that govern memory"), input);
    },
    async generateImpostor(input) {
      await sleep(defs.get(input.node.derivedNodeId)!.delay);
      return impDraftFrom(input.groundingPassages);
    },
    async generateMatching(input) {
      await sleep(defs.get(input.node.derivedNodeId)!.delay);
      return matchingDraftFrom(input.groundingPassages);
    }
  };
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith(nodes)),
    conceptLessonGeneration,
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: lessonStore.store,
    studyItemGeneration,
    studyItemBankStore: store,
    concurrency: 3
  });

  assert.deepEqual(lessonStore.lessons.map((lesson) => lesson.derivedNodeId), ["node-c1", "node-c2", "node-c3"]);
  assert.deepEqual(persisted.map((item) => `${item.derivedNodeId}/${item.itemType}`), [
    "node-c1/option_select",
    "node-c1/matching",
    "node-c2/matching",
    "node-c3/matching",
    "node-c1/impostor",
    "node-c2/impostor",
    "node-c3/impostor"
  ]);
  assert.deepEqual(persistedRejected.map((item) => `${item.derivedNodeId}/${item.itemType}`), [
    "node-c2/option_select",
    "node-c3/option_select"
  ]);
});

test("option-select, matching, and impostor stages overlap and still persist in canonical type order", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store, persisted } = capturingStore();
  let releaseOptionSelect!: () => void;
  let releaseMatching!: () => void;
  let releaseImpostor!: () => void;
  const optionSelectGate = new Promise<void>((resolve) => { releaseOptionSelect = resolve; });
  const matchingGate = new Promise<void>((resolve) => { releaseMatching = resolve; });
  const impostorGate = new Promise<void>((resolve) => { releaseImpostor = resolve; });
  const started: string[] = [];
  const generation: StudyItemGenerationPort = {
    model: "mock-gen",
    async generateOptionSelect(input) {
      started.push("option_select");
      await optionSelectGate;
      return bindOptionDraftToInput(osDraft("rules that govern memory"), input);
    },
    async generateMatching(input) {
      started.push("matching");
      await matchingGate;
      return matchingDraftFrom(input.groundingPassages);
    },
    async generateImpostor(input) {
      started.push("impostor");
      await impostorGate;
      return impDraftFrom(input.groundingPassages);
    }
  };
  const generationPromise = generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": goodLessonDraft("b1", ownershipDef) } }),
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generation,
    studyItemBankStore: store
  });

  await new Promise((resolve) => setImmediate(resolve));
  const allStagesStarted = [...started];
  releaseImpostor();
  releaseMatching();
  releaseOptionSelect();
  assert.deepEqual(allStagesStarted, ["option_select", "matching", "impostor"]);
  await generationPromise;
  assert.deepEqual(persisted.map((item) => item.itemType), ["option_select", "matching", "impostor"]);
});

test("an option-select guard rejection records the node as rejected", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store, persisted, persistedRejected } = capturingStore();
  const { reporter, calls } = recordingReporter();
  // Duplicate distractors fail the structural guard (not a grounding failure).
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": goodLessonDraft("b1", ownershipDef) } }),
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generationReturning({ optionSelect: { "node-c1": osDraft("rules that govern memory", ["Same", "Same", "Cache"]) } }),
    studyItemBankStore: store,
    reporter
  });

  // Option-select is rejected (its guard miss), but the matching/impostor stages still ground an item.
  assert.deepEqual(typesFor(persisted, "node-c1"), ["impostor", "matching"]);
  const optionSelectRejections = persistedRejected.filter((r) => r.itemType === "option_select");
  assert.equal(optionSelectRejections.length, 1);
  assert.deepEqual(await store.supportedItemTypes("node-c1"), ["impostor", "matching"]);
  const opened = new Set(calls.flatMap((call) => call.method === "enterStage" ? [call.stage] : []));
  assert.equal(opened.has(STUDY_ITEM_BANK_STAGE_GROUP.optionSelectGeneration.stage), true);
  assert.equal(opened.has(STUDY_ITEM_BANK_STAGE_GROUP.optionSelectKeyVerification.stage), false);
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
    async generateImpostor() { impostorGeneratorCalled = true; throw new Error("should not be called"); },
    async generateMatching() { throw new Error("should not be called"); }
  };
  const result = await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGen,
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: lessonStore.store,
    studyItemGeneration: generation,
    studyItemBankStore: store
  });

  assert.equal(persisted.length, 0);
  // The lesson is absent with the unusable-grounding reason (no generator is even called).
  assert.equal(lessonStore.absent.length, 1);
  assert.match(lessonStore.absent[0].reason, /no usable grounding/);
  assert.equal(lessonGeneratorCalled, false);
  // R10/R9: no item type is generated for a lesson-absent node; it is rejected per type,
  // each referencing the absent lesson (keyed independently — KTD8).
  assert.equal(result.rejected.length, 3);
  const reasonsByType = new Map(persistedRejected.map((r) => [r.itemType, r.reason] as const));
  assert.match(reasonsByType.get("option_select")!, /lesson is absent/);
  assert.match(reasonsByType.get("matching")!, /lesson is absent/);
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
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generationReturning({ optionSelect: { "node-c1": "throw", "node-c2": osDraft("rules that govern memory", ["Stack", "Register", "Cache"], lessonPassageId("node-c2", 1)) } }),
    studyItemBankStore: store
  });

  // Only node-c1's option-select is rejected; both nodes' matching/impostor items ground from their lessons.
  assert.equal(result.rejected.filter((r) => r.itemType === "option_select").length, 1);
  assert.deepEqual(typesFor(persisted, "node-c1"), ["impostor", "matching"]);
  assert.deepEqual(typesFor(persisted, "node-c2"), ["impostor", "matching", "option_select"]);
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
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generationReturning({ optionSelect: { "node-c1": osDraft("a fact never stated in the passage") } }),
    studyItemBankStore: store
  });

  // The ungrounded option-select is rejected; matching/impostor still ground from the lesson.
  assert.deepEqual(typesFor(persisted, "node-c1"), ["impostor", "matching"]);
});

test("an option-select guard miss gets one INFORMED retry carrying the first attempt's reason", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store, persisted } = capturingStore();
  let calls = 0;
  const retryFeedbacks: (string | undefined)[] = [];
  const retryingGeneration: StudyItemGenerationPort = {
    model: "mock-gen",
    async generateOptionSelect(input) {
      calls += 1;
      retryFeedbacks.push(input.retryFeedback);
      return bindOptionDraftToInput(
        calls === 1 ? osDraft("a fact never stated in the passage") : osDraft("rules that govern memory"),
        input
      );
    },
    async generateImpostor(input) {
      // A guard-passing impostor from the grounding so the node also carries an impostor item.
      const p = input.groundingPassages[0];
      return {
        itemType: "impostor",
        question: "Which is false?",
        truths: [
          { text: "t1", citation: { passageId: p.passageId, evidenceQuote: p.text } },
          { text: "t2", citation: { passageId: p.passageId, evidenceQuote: p.text } },
          { text: "t3", citation: { passageId: p.passageId, evidenceQuote: p.text } }
        ],
        lie: { text: "a lie", reveal: "The fourth is false.", lieSource: "generated" },
        explorableTerms: []
      };
    },
    async generateMatching(input) {
      return matchingDraftFrom(input.groundingPassages);
    }
  };
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": goodLessonDraft("b1", ownershipDef) } }),
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: retryingGeneration,
    studyItemBankStore: store
  });

  assert.equal(calls, OPTION_SELECT_GENERATION_ATTEMPTS);
  assert.deepEqual(typesFor(persisted, "node-c1"), ["impostor", "matching", "option_select"]);
  // Without the first attempt's reason the retry is a blind re-roll of the same failing call —
  // the shape matching and impostor already had.
  assert.equal(retryFeedbacks[0], undefined);
  assert.match(retryFeedbacks[1] ?? "", /citation does not verify against grounding/);
});

test("a multi-span source synthesis falls back to one exact Definition Passage while retaining the raw candidate", async () => {
  const secondDefinition = "Borrowing lets code reference values without taking ownership.";
  const snapshot = snapshotWith([{
    conceptId: "c1",
    label: "Ownership",
    definitions: [passage("b1", ownershipDef), passage("b2", secondDefinition)]
  }]);
  const { store, persisted } = capturingStore();
  const lessonStore = capturingLessonStore();
  let lessonCalls = 0;
  const multiSpanDraft: ConceptLessonDraft = {
    explorableTerms: [],
    sections: [
      { kind: "definition", text: `${ownershipDef} ${secondDefinition}` }
    ]
  };
  const result = await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: {
      model: "mock-lesson",
      async generate() {
        lessonCalls += 1;
        return multiSpanDraft;
      }
    },
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: lessonStore.store,
    studyItemGeneration: generationReturning({
      optionSelect: {
        "node-c1": osDraft(ownershipDef, ["Stack", "Register", "Cache"], lessonPassageId("node-c1", 0))
      }
    }),
    studyItemBankStore: store
  });

  assert.equal(lessonCalls, 2, "the existing bounded retry runs before the deterministic fallback");
  assert.equal(result.lessons.length, 1);
  assert.equal(lessonStore.lessons.length, 1);
  assert.equal(lessonStore.lessons[0]?.generatingModel, SOURCE_EXTRACTIVE_DEFINITION_LESSON_GENERATOR);
  assert.deepEqual(lessonStore.lessons[0]?.sections, [{
    kind: "definition",
    text: ownershipDef,
    groundingProvenance: "source_cep",
    citation: {
      provenance: "source",
      sourceResourceId: "res-1",
      sourceBlockId: "b1",
      evidenceQuote: ownershipDef,
      matchKind: "exact"
    }
  }]);
  assert.equal(persisted.filter((item) => item.itemType === "option_select").length, 1);
  assert.equal(lessonStore.candidateLessons.length, 1);
  assert.equal(lessonStore.candidateLessons[0]?.sections[0]?.text, `${ownershipDef} ${secondDefinition}`);
  assert.equal(lessonStore.candidateLessons[0]?.sections[0]?.groundingProvenance, "generated");
  assert.notEqual(
    lessonStore.candidateLessons[0]?.conceptLessonId,
    lessonStore.lessons[0]?.conceptLessonId,
    "the raw neural candidate and code-owned fallback retain distinct identities"
  );
  assert.deepEqual(lessonStore.absent, []);
});

test("an uncited mention-only candidate remains inspectable and cannot trigger the Definition Passage fallback", async () => {
  const mention = "Borrowing lets you reference a value without taking ownership.";
  const { store, persisted, persistedRejected } = capturingStore();
  const lessonStore = capturingLessonStore();
  const synthesizedLesson: ConceptLessonDraft = {
    explorableTerms: [],
    sections: [{ kind: "definition", text: "Borrowing is a broad reference-management mechanism." }]
  };
  const result = await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshotWith([])),
    enrichmentStore: enrichmentStoreReturning(layerWith([
      sourceMentionedNode({
        id: "node-borrow",
        label: "Borrowing",
        passageType: "mention",
        quote: mention,
        blockId: "m-1"
      })
    ])),
    conceptLessonGeneration: lessonGenerationReturning({
      lessons: { "node-borrow": synthesizedLesson }
    }),
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: lessonStore.store,
    studyItemGeneration: generationReturning({ optionSelect: {} }),
    studyItemBankStore: store
  });

  assert.deepEqual(persisted, []);
  assert.equal(result.lessons.length, 0);
  assert.equal(lessonStore.lessons.length, 0);
  assert.equal(lessonStore.candidateLessons.length, 1);
  assert.equal(lessonStore.candidateLessons[0]?.sections[0]?.groundingProvenance, "generated");
  assert.equal(lessonStore.absent.length, 1);
  assert.deepEqual(
    persistedRejected.map((row) => row.itemType).sort(),
    ["impostor", "matching", "option_select"]
  );
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
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generationReturning({ optionSelect: { "node-rescued": osDraft(cite, ["Stack", "Register", "Cache"], lessonPassageId("node-rescued", 1)) } }),
    studyItemBankStore: store
  });

  assert.ok(persisted.length >= 1, "the rescued definition produced study items");
  assert.ok(persisted.every((item) => item.groundingProvenance === "source_mentioned"), "rescued definitions ground source_mentioned items, not generated");
});

test("a rescued mention-only node still yields source_mentioned items through an example", async () => {
  const m = "Borrowing lets you reference a value without taking ownership.";
  const cite = "reference a value without taking ownership";
  const { store, persisted } = capturingStore();
  const lessonStore = capturingLessonStore();
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshotWith([])),
    enrichmentStore: enrichmentStoreReturning(layerWith([sourceMentionedNode({ id: "node-borrow", label: "Borrowing", passageType: "mention", quote: m, blockId: "m-1" })])),
    conceptLessonGeneration: lessonGenerationReturning({
      lessons: {
        "node-borrow": {
          sections: [{
            kind: "examples",
            text: m,
            citation: { passageId: "m-1", evidenceQuote: m }
          }],
          explorableTerms: []
        }
      }
    }),
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: lessonStore.store,
    studyItemGeneration: generationReturning({ optionSelect: { "node-borrow": osDraft(cite, ["Stack", "Register", "Cache"], lessonPassageId("node-borrow", 0)) } }),
    studyItemBankStore: store
  });

  assert.ok(persisted.length >= 1);
  assert.ok(persisted.every((item) => item.groundingProvenance === "source_mentioned"));
  assert.equal(lessonStore.lessons[0]?.sections[0]?.kind, "examples");
  assert.equal(lessonStore.lessons[0]?.sections[0]?.groundingProvenance, "source_mentioned");
});

test("a minted llm_grounded node on a source graph remains an inspection-only candidate", async () => {
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
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: lessonStore.store,
    studyItemGeneration: generationReturning({ optionSelect: { "node-minted": osDraft(cite, ["Stack", "Register", "Cache"], lessonPassageId("node-minted", 1)) } }),
    studyItemBankStore: store
  });

  assert.equal(lessonStore.lessons.length, 0);
  assert.equal(lessonStore.candidateLessons.length, 1);
  assert.ok(lessonStore.candidateLessons[0]?.sections.every((section) =>
    section.groundingProvenance === "generated"
  ), "the preserved candidate remains honestly generated-labeled");
  assert.equal(lessonStore.absent.length, 1);
  assert.deepEqual(persisted, []);
});

function impDraftCiting(passageId: string, quote: string, opts: { lieSource?: "sibling" | "generated"; siblingLabel?: string } = {}): ImpostorItemDraft {
  return {
    itemType: "impostor",
    question: "Which statement is false?",
    truths: [
      { text: "Truth one about the node.", citation: { passageId, evidenceQuote: quote } },
      { text: "Truth two about the node.", citation: { passageId, evidenceQuote: quote } },
      { text: "Truth three about the node.", citation: { passageId, evidenceQuote: quote } }
    ],
    lie: {
      text: "A plausible-but-false claim.",
      reveal: "The fourth is false.",
      lieSource: opts.lieSource ?? "generated",
      ...(opts.siblingLabel ? { siblingLabel: opts.siblingLabel } : {})
    },
    explorableTerms: []
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
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generationReturning({
      optionSelect: { "node-c1": osDraft("rules that govern memory") },
      impostor: { "node-c1": impDraftCiting(lessonPassageId("node-c1", 1), "rules that govern memory", { lieSource: "sibling", siblingLabel: "Borrowing" }) }
    }),
    studyItemBankStore: store
  });

  const impostor = persisted.find((item) => item.itemType === "impostor");
  assert.ok(impostor && impostor.itemType === "impostor");
  if (impostor.itemType !== "impostor") return;
  const lie = impostor.statements.find((s) => s.isImpostor);
  assert.ok(lie?.isImpostor);
  assert.equal(lie.lieSource, "sibling");
  assert.equal(lie.siblingLabel, "Borrowing");
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
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generationReturning({
      optionSelect: { "node-c1": osDraft("rules that govern memory") },
      impostor: { "node-c1": impDraftCiting(lessonPassageId("node-c1", 1), "rules that govern memory", { lieSource: "generated" }) }
    }),
    studyItemBankStore: store
  });

  const impostor = persisted.find((item) => item.itemType === "impostor");
  assert.ok(impostor && impostor.itemType === "impostor");
  if (impostor.itemType !== "impostor") return;
  const lie = impostor.statements.find((s) => s.isImpostor);
  assert.ok(lie?.isImpostor);
  assert.equal(lie.lieSource, "generated");
  assert.equal(lie.siblingLabel, undefined);
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
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generationReturning({
      optionSelect: { "node-c1": osDraft("rules that govern memory") },
      impostor: { "node-c1": "absent" }
    }),
    studyItemBankStore: store
  });

  // Option-select and matching still persist; the impostor is recorded absent with a guard reason.
  assert.deepEqual(typesFor(persisted, "node-c1"), ["matching", "option_select"]);
  const impostorRejection = persistedRejected.find((r) => r.itemType === "impostor");
  assert.ok(impostorRejection, "a per-type impostor rejection is recorded");
  assert.match(impostorRejection!.reason, /exactly 3 true statements/i);
  // The run does not fail.
  assert.equal(result.studyItems.some((item) => item.itemType === "option_select"), true);
});

test("a vetoed impostor gets one regeneration informed by the offending candidate, then persists", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store, persisted, persistedRejected } = capturingStore();
  const retryFeedbacks: (string | undefined)[] = [];
  let impostorVerifications = 0;
  const verifier: AnswerKeyVerificationPort = {
    model: "mock-verifier",
    async verify(input) {
      if (input.itemType === "impostor") impostorVerifications += 1;
      const lieIsFalse = input.itemType !== "impostor" || impostorVerifications > 1;
      return input.candidates.map((candidate) => ({
        ordinal: candidate.ordinal,
        verdict: input.itemType === "option_select"
          ? FIXTURE_OPTION_KEYS.has(candidate.text) ? "claim_true" as const : "claim_false" as const
          : FIXTURE_LIE.test(candidate.text)
          // First impostor pass: the planted lie is judged TRUE of the node, which is exactly
          // the item ADR-0026 refuses to ship. Second pass: it is proven false.
          ? (lieIsFalse ? "claim_false" as const : "claim_true" as const)
          : "unclear" as const,
        reason: lieIsFalse ? "false for this node" : "actually true of this node"
      }));
    }
  };
  const generation: StudyItemGenerationPort = {
    model: "mock-gen",
    async generateOptionSelect(input) {
      return bindOptionDraftToInput(osDraft("rules that govern memory"), input);
    },
    async generateImpostor(input) {
      retryFeedbacks.push(input.retryFeedback);
      return impDraftCiting(lessonPassageId("node-c1", 1), "rules that govern memory", { lieSource: "generated" });
    },
    async generateMatching(input) {
      return matchingDraftFrom(input.groundingPassages);
    }
  };
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": goodLessonDraft("b1", ownershipDef) } }),
    answerKeyVerification: verifier,
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generation,
    studyItemBankStore: store
  });

  assert.equal(impostorVerifications, 2, "the vetoed item is verified again after regeneration");
  assert.equal(retryFeedbacks.length, 2);
  assert.equal(retryFeedbacks[0], undefined, "the generation phase's first attempt carries no feedback");
  // The feedback must NAME the offending candidate — a bare "rejected" tells the generator
  // nothing it can act on, which is the same defect U1 fixed for option-select's blind re-roll.
  assert.match(retryFeedbacks[1]!, /impostor key verification rejected the item: the planted lie "A plausible-but-false claim\." was not judged false/);
  assert.deepEqual(typesFor(persisted, "node-c1"), ["impostor", "matching", "option_select"]);
  assert.deepEqual(persistedRejected, []);
});

test("an ambiguous matching board is vetoed, regenerated with cell-level feedback, and rejected when the retry repeats it", async () => {
  // The whole point of plan 2026-08-07-001: a board where one match answers TWO prompts marks a
  // learner wrong for a defensible answer, and every pair on it is individually true — so key
  // verification could never see it. The fixture generator returns the same board on the retry,
  // so this also pins that the second veto is FINAL: no third round.
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store, persisted, persistedRejected } = capturingStore();
  const matchingFeedbacks: (string | undefined)[] = [];
  let verifications = 0;
  const matchingVerifier: MatchingAssignmentVerificationPort = {
    model: "mock-matching-verifier",
    async verify(input) {
      verifications += 1;
      return input.prompts.flatMap((prompt) =>
        input.matches.map((match) => ({
          promptOrdinal: prompt.ordinal,
          matchOrdinal: match.ordinal,
          // "Description one" fits every prompt — the subsumption shape the frozen
          // `Seawater density` defect had. Addressed by TEXT, because the presentation hides
          // which pair ordinal a match number belongs to.
          verdict: match.text === "Description one" ? "fits" as const : "unclear" as const,
          reason: match.text === "Description one" ? "this answer covers every listed aspect" : "undecided"
        }))
      );
    }
  };
  const generation: StudyItemGenerationPort = {
    model: "mock-gen",
    async generateOptionSelect(input) {
      return bindOptionDraftToInput(osDraft("rules that govern memory"), input);
    },
    async generateImpostor(input) { return impDraftFrom(input.groundingPassages); },
    async generateMatching(input) {
      matchingFeedbacks.push(input.retryFeedback);
      return matchingDraftFrom(input.groundingPassages);
    }
  };
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": goodLessonDraft("b1", ownershipDef) } }),
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifier,
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generation,
    studyItemBankStore: store
  });

  assert.equal(verifications, 2, "the vetoed board is verified again after exactly one regeneration");
  assert.equal(matchingFeedbacks.length, 2);
  assert.equal(matchingFeedbacks[0], undefined, "the generation phase's first attempt carries no feedback");
  // The feedback must name the OFFENDING CELLS, not merely report a rejection: the generator
  // cannot re-choose an aspect it is not told collided.
  assert.match(matchingFeedbacks[1]!, /matching assignment verification rejected the item: match "Description one" also fits prompt "Clue two", which is keyed to "Description two"/);
  assert.deepEqual(typesFor(persisted, "node-c1"), ["impostor", "option_select"]);
  const matchingRejection = persistedRejected.find((row) => row.itemType === "matching");
  assert.ok(matchingRejection, "the rejected board is an inspectable rejected row");
  assert.match(matchingRejection!.reason, /matching assignment verification rejected the item/);
});

test("matching assignment verification unavailable admits the board unverified", async () => {
  // D6, and the opposite disposition to impostor's: every matching pair still carries a verbatim
  // mechanical anchor (matching never opted into the generated-passage rung), so its worst
  // failure is a `partial` grade rather than a taught falsehood. Dropping instead would gut a
  // third of the bank under the upstream throttling real traffic has already shown.
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store, persisted, persistedRejected } = capturingStore();
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": goodLessonDraft("b1", ownershipDef) } }),
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: {
      model: "mock-matching-verifier",
      async verify() { throw new Error("judge offline"); }
    },
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generationReturning({ optionSelect: { "node-c1": osDraft("rules that govern memory") } }),
    studyItemBankStore: store
  });

  assert.deepEqual(typesFor(persisted, "node-c1"), ["impostor", "matching", "option_select"]);
  assert.deepEqual(persistedRejected, []);
});

test("key verification unavailable drops an impostor but cannot affect exact-reference source options", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store, persisted, persistedRejected } = capturingStore();
  let optionVerificationCalls = 0;
  const verifier: AnswerKeyVerificationPort = {
    model: "mock-verifier",
    async verify(input) {
      if (input.itemType === "option_select") optionVerificationCalls += 1;
      throw new Error("judge offline");
    }
  };
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": goodLessonDraft("b1", ownershipDef) } }),
    answerKeyVerification: verifier,
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generationReturning({
      optionSelect: { "node-c1": osDraft("rules that govern memory") },
      impostor: { "node-c1": impDraftCiting(lessonPassageId("node-c1", 1), "rules that govern memory", { lieSource: "generated" }) }
    }),
    studyItemBankStore: store
  });

  // Exact-reference option truth is mechanical: the application owns the question and copied
  // lesson key, and normalized distractors must differ. The semantic verifier still owns the
  // impostor family, so its transport failure rejects that candidate only.
  assert.deepEqual(typesFor(persisted, "node-c1"), ["matching", "option_select"]);
  const impostorRejection = persistedRejected.find((item) => item.itemType === "impostor");
  assert.ok(impostorRejection);
  assert.match(impostorRejection.reason, /^impostor key verification unavailable: judge offline/);
  const optionRejection = persistedRejected.find((item) => item.itemType === "option_select");
  assert.equal(optionRejection, undefined);
  assert.equal(optionVerificationCalls, 0);
});

test("a generated-citation fallback candidate drops before source answer-key verification", async () => {
  // The lesson's applications bullets are generated passages, so a quote that verifies
  // nowhere resolves through D9 rung 3 — the item exists only because a judge was expected to
  // check the claim its citation no longer anchors. With no verdict, that expectation failed.
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store, persisted, persistedRejected } = capturingStore();
  let optionVerificationCalls = 0;
  const verifier: AnswerKeyVerificationPort = {
    model: "mock-verifier",
    async verify(input) {
      if (input.itemType === "option_select") optionVerificationCalls += 1;
      throw new Error("judge offline");
    }
  };
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": goodLessonDraft("b1", ownershipDef) } }),
    answerKeyVerification: verifier,
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: generationReturning({
      optionSelect: { "node-c1": osDraft("a paraphrase the model never copied back", ["Stack", "Register", "Cache"], `${lessonPassageId("node-c1", 2)}:i0`) }
    }),
    studyItemBankStore: store
  });

  assert.equal(persisted.some((item) => item.itemType === "option_select"), false);
  const rejection = persistedRejected.find((item) => item.itemType === "option_select");
  assert.ok(rejection);
  assert.match(rejection.reason, /key_citation: exactly one source-cited key required/);
  assert.equal(optionVerificationCalls, 0, "a structurally non-source key cannot spend a truth-verifier call");
});

test("source-grounded lesson with no verified substantive citation gets one feedback retry", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Ownership", definitions: [passage("b1", ownershipDef)] }]);
  const { store, persisted } = capturingStore();
  const lessonStore = capturingLessonStore();
  const retryFeedbacks: (string | undefined)[] = [];
  const lessonGeneration: ConceptLessonGenerationPort = {
    model: "mock-lesson",
    async generate(input) {
      retryFeedbacks.push(input.retryFeedback);
      return retryFeedbacks.length === 1
        ? { sections: [{ kind: "gist", text: "Gist." }, { kind: "definition", text: "Uncited definition." }, { kind: "applications", text: "Applications." }], explorableTerms: [] }
        : goodLessonDraft("b1", ownershipDef);
    }
  };
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGeneration,
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: lessonStore.store,
    studyItemGeneration: generationReturning({ optionSelect: { "node-c1": osDraft("rules that govern memory") } }),
    studyItemBankStore: store
  });

  assert.equal(retryFeedbacks.length, 2);
  assert.equal(retryFeedbacks[0], undefined);
  assert.match(retryFeedbacks[1]!, /no verified source citation/i);
  assert.ok(lessonStore.lessons[0].sections.some((section) => section.kind === "definition" && section.groundingProvenance === "source_cep"));
  assert.ok(persisted.length > 0);
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
      return bindOptionDraftToInput(osDraft("rules that govern memory"), input);
    },
    async generateImpostor(input) {
      impostorPassages = input.groundingPassages.map((p) => ({ passageId: p.passageId, text: p.text }));
      return impDraftCiting(lessonPassageId("node-c1", 1), "rules that govern memory");
    },
    async generateMatching(input) {
      return matchingDraftFrom(input.groundingPassages);
    }
  };
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    enrichmentStore: enrichmentStoreReturning(layerWith([anchorNode("c1")])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-c1": goodLessonDraft("b1", ownershipDef) } }),
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: capturingLessonStore().store,
    studyItemGeneration: recordingGeneration,
    studyItemBankStore: store
  });

  assert.deepEqual(impostorPassages, optionSelectPassages);
  assert.ok(impostorPassages.length > 0);
});

test("a minted uncited lesson on a source graph is preserved without reaching option-select", async () => {
  const generatedDef = "Pointer arithmetic calculates target memory addresses from a base address and an offset.";
  const cite = "target memory addresses";
  const { store, persisted } = capturingStore();
  const lessonStore = capturingLessonStore();
  const uncitedGeneratedLesson: ConceptLessonDraft = {
    explorableTerms: [],
    sections: [
      { kind: "gist", text: "A one-line gist." },
      { kind: "definition", text: generatedDef },
      { kind: "applications", text: "How it connects to neighbors.", items: ["Pointer arithmetic supports address calculations."] }
    ]
  };
  await generateStudyItemBank({
    enrichmentId: "enr-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshotWith([])),
    enrichmentStore: enrichmentStoreReturning(layerWith([llmGroundedNode()])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-minted": uncitedGeneratedLesson } }),
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: lessonStore.store,
    studyItemGeneration: generationReturning({ optionSelect: { "node-minted": osDraft(cite, ["Stack", "Register", "Cache"], lessonPassageId("node-minted", 1)) } }),
    studyItemBankStore: store
  });

  assert.deepEqual(persisted, []);
  assert.equal(lessonStore.lessons.length, 0);
  assert.equal(lessonStore.candidateLessons.length, 1);
  assert.equal(lessonStore.candidateLessons[0]?.sections[1]?.text, generatedDef);
  assert.equal(lessonStore.absent.length, 1);
});

// --- U7: study assets over a synthetic (source-less) layer ---------------------

function syntheticNode(opts: { id?: string; label?: string; def: string }) {
  const id = opts.id ?? "node-syn";
  return {
    nodeKind: "enrichment" as const,
    derivedNodeId: id,
    groundingOrigin: "llm_grounded" as const,
    // A synthetic_primary node carries NO mintingReason.
    role: "synthetic_primary" as const,
    layer: "derived" as const,
    canonicalLabel: opts.label ?? "Photosynthesis",
    normalizedLabel: (opts.label ?? "Photosynthesis").toLowerCase(),
    declaredDomain: "biology",
    aliases: [],
    groundingBundle: {
      groundingOrigin: "llm_grounded" as const,
      definitions: [{ passageType: "definition" as const, text: opts.def, groundingOrigin: "llm_grounded" as const, headingPath: [], locator: {}, verbatimCheck: { disposition: "not_applicable_by_grounding" as const, rationale: "generated" } }],
      mentions: [],
      groundingAnchorReferences: [],
      generatingModel: "mock",
      rationale: "topic concept"
    }
  };
}

function syntheticLayer(nodes: DerivedGraphLayer["derivedNodes"]): DerivedGraphLayer {
  return { enrichmentId: "enr-syn", graphVersionId: null, enrichmentConfigHash: "synthetic-topic-generation", judgeModel: "mock", derivedNodes: nodes, prerequisiteEdges: [], difficulties: [] };
}

function generatedLessonDraft(nodeId: string, def: string): ConceptLessonDraft {
  return {
    sections: [
      { kind: "gist", text: "A one-line gist." },
      { kind: "definition", text: "A definition restating the concept.", citation: { passageId: `${nodeId}:definition:0`, evidenceQuote: def } },
      { kind: "applications", text: "How it connects to neighbors." }
    ],
    explorableTerms: []
  };
}

test("Covers R9: study items + lessons generate over a synthetic (null-version) layer with generated provenance only", async () => {
  const def = "Photosynthesis converts light energy into chemical energy.";
  const node = syntheticNode({ def });
  const { store, persisted } = capturingStore();
  const lessonStore = capturingLessonStore();
  // A graphStore that throws if consulted proves the synthetic path reads NO published snapshot.
  const graphStore = { async getPublishedSnapshot() { throw new Error("synthetic layer must not read a published snapshot"); } } as unknown as GraphVersionStorePort;
  const result = await generateStudyItemBank({
    enrichmentId: "enr-syn",
    configHash: "cfg-syn",
    graphStore,
    enrichmentStore: enrichmentStoreReturning(syntheticLayer([node])),
    conceptLessonGeneration: lessonGenerationReturning({ lessons: { "node-syn": generatedLessonDraft("node-syn", def) } }),
    answerKeyVerification: keyVerifierPassing(),
    matchingAssignmentVerification: matchingVerifierPassing(),
    conceptLessonStore: lessonStore.store,
    studyItemGeneration: generationReturning({ optionSelect: { "node-syn": osDraft(def, ["Respiration", "Osmosis", "Diffusion"], lessonPassageId("node-syn", 1)) } }),
    studyItemBankStore: store
  });

  assert.equal(result.graphVersionId, null, "the result carries the synthetic layer's null version");
  assert.equal(result.lessons.length, 1);
  assert.equal(result.lessons[0].graphVersionId, null);
  assert.ok(persisted.length >= 1, "at least one study item generated over the synthetic node");
  // No source-citation arm: every synthetic item + lesson section is generated provenance.
  for (const item of persisted) {
    assert.equal(item.graphVersionId, null);
    assert.equal(item.groundingProvenance, "generated");
  }
  for (const lesson of lessonStore.lessons) {
    assert.equal(lesson.graphVersionId, null);
    assert.ok(lesson.sections.every((section) => section.groundingProvenance === "generated"));
  }
});
