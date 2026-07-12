import assert from "node:assert/strict";
import { test } from "node:test";
import { isStageTag, STAGE_TAGS } from "./index";
import type {
  ConceptLesson,
  ConceptLessonSection,
  ConceptLessonSectionDraft,
  LessonAbsentNode,
  StudyItemCitation
} from "./index";

// The lesson stage carries its own spend tag so the cost ⋈ wall-clock join key stays
// closed even though it rides inside the `study_items` operation (KTD1, R-cost).
test("concept-lesson-generation is a recognized stage tag", () => {
  assert.equal(STAGE_TAGS.conceptLessonGeneration, "concept-lesson-generation");
  assert.equal(isStageTag("concept-lesson-generation"), true);
});

// R6/R7/R8: a generated section reuses the StudyItemCitation generated arm (no source
// id) and a source-cited section reuses the source arm. These are type-shape assertions
// — the authoritative provenance re-derivation lives at the assembly boundary (U6).
test("a generated section reuses the generated citation arm and carries no source id", () => {
  const generatedCitation: StudyItemCitation = {
    provenance: "generated",
    derivedNodeId: "node-1",
    passageText: "an analogy synthesized for the learner"
  };
  const intuition: ConceptLessonSection = {
    kind: "intuition",
    text: "Think of it as a one-way handoff.",
    groundingProvenance: "generated",
    citation: generatedCitation
  };
  assert.equal(intuition.groundingProvenance, "generated");
  assert.equal(intuition.citation?.provenance, "generated");
  // The generated arm structurally cannot carry a sourceResourceId.
  assert.equal("sourceResourceId" in (intuition.citation ?? {}), false);
});

test("a source-cited definition section reuses the source citation arm", () => {
  const sourceCitation: StudyItemCitation = {
    provenance: "source",
    sourceResourceId: "res-1",
    sourceBlockId: "block-7",
    evidenceQuote: "Ownership is Rust's most unique feature.",
    matchKind: "exact"
  };
  const definition: ConceptLessonSection = {
    kind: "definition",
    text: "Ownership is Rust's most unique feature.",
    groundingProvenance: "source_cep",
    citation: sourceCitation
  };
  assert.equal(definition.citation?.provenance, "source");
  if (definition.citation?.provenance === "source") {
    assert.equal(definition.citation.sourceBlockId, "block-7");
  }
});

// R3: a valid lesson meets the minimum — a gist, ≥1 application, and ≥1 substantive
// section. The ConceptLesson shape carries ordered sections keyed to the node.
test("a minimal valid lesson carries gist + application + one substantive section", () => {
  const lesson: ConceptLesson = {
    derivedNodeId: "node-1",
    graphVersionId: "gv-1",
    enrichmentId: "enr-1",
    generatingModel: "deepseek-v4-flash",
    configHash: "cfg-1",
    canonicalLabel: "Ownership",
    sections: [
      { kind: "gist", text: "Each value has a single owner.", groundingProvenance: "generated" },
      {
        kind: "definition",
        text: "Ownership governs which binding frees a value.",
        groundingProvenance: "source_cep",
        citation: {
          provenance: "source",
          sourceResourceId: "res-1",
          sourceBlockId: "block-1",
          evidenceQuote: "Ownership governs which binding frees a value.",
          matchKind: "exact"
        }
      },
      { kind: "applications", text: "Move semantics build on ownership.", groundingProvenance: "generated" }
    ],
    explorableTerms: []
  };
  const kinds = lesson.sections.map((section) => section.kind);
  assert.ok(kinds.includes("gist"));
  assert.ok(kinds.includes("applications"));
  assert.ok(kinds.some((kind) => kind === "definition" || kind === "examples" || kind === "formulas"));
});

// R14: an optional generated diagram descriptor rides on a section; absence is valid.
test("a section may carry an optional diagram descriptor", () => {
  const section: ConceptLessonSection = {
    kind: "examples",
    text: "A vector of owned strings.",
    groundingProvenance: "generated",
    diagram: { caption: "Owned vs borrowed", spec: "graph LR; A-->B" }
  };
  assert.equal(section.diagram?.caption, "Owned vs borrowed");
});

// A draft section cites by passageId + quote (verified at the boundary, U6).
test("a draft section cites a grounding passage by id and quote", () => {
  const draft: ConceptLessonSectionDraft = {
    kind: "definition",
    text: "Ownership governs which binding frees a value.",
    citation: { passageId: "block-1", evidenceQuote: "Ownership governs which binding frees a value." }
  };
  assert.equal(draft.citation?.passageId, "block-1");
});

// R3/KTD4: a node whose grounding cannot meet the minimum is recorded lesson-absent
// with a reason — mirrors RejectedStudyItem so the operator surface reuses one shape.
test("a lesson-absent node carries a reason", () => {
  const absent: LessonAbsentNode = {
    derivedNodeId: "node-2",
    canonicalLabel: "Sparse concept",
    reason: "no usable grounding passages"
  };
  assert.equal(absent.reason, "no usable grounding passages");
});
