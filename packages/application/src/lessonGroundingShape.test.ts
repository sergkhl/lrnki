import assert from "node:assert/strict";
import test from "node:test";
import type { ConceptLesson, ConceptLessonSection } from "@lrnki/domain-core";
import { lessonGroundingShape, lessonOptionSelectAnswer } from "./lessonGroundingShape";

function lessonOf(sections: ConceptLessonSection[], derivedNodeId = "dn-1"): ConceptLesson {
  return {
    conceptLessonId: "lesson-1",
    derivedNodeId,
    graphVersionId: "gv-1",
    enrichmentId: "en-1",
    generatingModel: "test-model",
    configHash: "cfg-1",
    canonicalLabel: "Ownership",
    sections,
    explorableTerms: []
  };
}

function generatedSection(kind: ConceptLessonSection["kind"], text: string, passageText: string, items?: string[]): ConceptLessonSection {
  return {
    kind,
    text,
    ...(items ? { items } : {}),
    groundingProvenance: "generated",
    citation: { provenance: "generated", derivedNodeId: "dn-1", passageText }
  };
}

function sourceSection(kind: ConceptLessonSection["kind"], quote: string, items?: string[]): ConceptLessonSection {
  return {
    kind,
    text: quote,
    ...(items ? { items } : {}),
    groundingProvenance: "source_cep",
    citation: { provenance: "source", sourceResourceId: "res-1", sourceBlockId: "blk-1", evidenceQuote: quote, matchKind: "exact" }
  };
}

// The defect that destroyed half the Study Item Bank on the 2026-08-05 shared run: passage
// identity was derived from the section KIND, which collapses every non-definition section to
// `mention`, so two cited sections rendered as two prompt bullets carrying one id. Quoting the
// second while citing the shared id was an unavoidable, undiagnosable rejection.
test("two same-kind cited sections are addressable apart", () => {
  const shape = lessonGroundingShape(lessonOf([
    generatedSection("examples", "Examples.", "An owner is the binding responsible for a value."),
    generatedSection("applications", "Applications.", "Ownership transfers when a value is moved.")
  ]));
  assert.ok(shape);
  assert.deepEqual(shape.passages.map((p) => p.passageId), ["dn-1:s0", "dn-1:s1"]);
  assert.equal(shape.passages[0].kind, "mention");
  assert.equal(shape.passages[1].kind, "mention", "both collapse to the same rendered kind, and that no longer costs them their identity");
});

test("every passage id in a multi-section, multi-bullet lesson is unique", () => {
  const shape = lessonGroundingShape(lessonOf([
    sourceSection("definition", "Ownership is a set of rules that govern memory."),
    generatedSection("examples", "Examples.", "A move ends the previous owner's responsibility.", ["Moving a String.", "Cloning a String."]),
    { kind: "applications", text: "Applications.", items: ["Freeing at scope exit.", "Passing to a function."], groundingProvenance: "generated" }
  ]));
  assert.ok(shape);
  assert.deepEqual(shape.passages.map((p) => p.passageId), [
    "dn-1:s0",
    "dn-1:s1", "dn-1:s1:i0", "dn-1:s1:i1",
    "dn-1:s2:i0", "dn-1:s2:i1"
  ]);
  assert.equal(new Set(shape.passages.map((p) => p.passageId)).size, shape.passages.length);
  // The uncited `applications` BODY is not grounding — only its bullets are.
  assert.equal(shape.passages.some((p) => p.text === "Applications."), false);
});

// D10: a model-written bullet is not source text. Labeling one `source` because its parent
// section happened to carry a source citation is the provenance masquerade ADR-0026 forbids.
test("a bullet under a source-cited section is generated grounding, never source", () => {
  const shape = lessonGroundingShape(lessonOf([
    sourceSection("definition", "Ownership is a set of rules that govern memory.", ["Each value has one owner.", "The owner frees the value."])
  ]));
  assert.ok(shape);
  const [section, ...bullets] = shape.passages;
  assert.ok("sourceResourceId" in section, "the cited section itself keeps its source ids");
  assert.equal(bullets.length, 2);
  for (const bullet of bullets) {
    assert.equal("sourceResourceId" in bullet, false);
    assert.equal("derivedNodeId" in bullet && bullet.derivedNodeId, "dn-1");
  }
});

test("provenance comes from the first source-cited section; an all-generated lesson is generated", () => {
  const sourced = lessonGroundingShape(lessonOf([
    generatedSection("gist", "Gist.", "A short gist of the concept."),
    sourceSection("definition", "Ownership is a set of rules that govern memory.")
  ]));
  assert.equal(sourced?.provenance, "source_cep");

  const generated = lessonGroundingShape(lessonOf([
    generatedSection("definition", "A definition.", "Ownership names one responsible binding.")
  ]));
  assert.equal(generated?.provenance, "generated");
});

test("repeated text yields one passage, so the pre-gate's count stays a count of DISTINCT grounding", () => {
  const repeated = "Each value has exactly one owner.";
  const shape = lessonGroundingShape(lessonOf([
    generatedSection("definition", "A definition.", repeated, [`  ${repeated.toUpperCase()} `]),
    generatedSection("examples", "Examples.", repeated)
  ]));
  assert.ok(shape);
  assert.deepEqual(shape.passages.map((p) => p.passageId), ["dn-1:s0"]);
});

test("a lesson with no citation, no substantive body, and no bullets yields no grounding", () => {
  assert.equal(lessonGroundingShape(lessonOf([
    { kind: "gist", text: "Gist.", groundingProvenance: "generated" },
    { kind: "intuition", text: "Intuition.", groundingProvenance: "generated" }
  ])), null);
});

test("option-select answer copies learner-visible definition text while retaining its source evidence", () => {
  const lesson = lessonOf([{
    kind: "definition",
    text: "A pointer is the address of a memory location returned by an allocator.",
    groundingProvenance: "source_mentioned",
    citation: {
      provenance: "source",
      sourceResourceId: "res-1",
      sourceBlockId: "blk-1",
      evidenceQuote: "returns a pointer, which is the address of that location",
      matchKind: "exact"
    }
  }], "dn-pointer");

  assert.deepEqual(lessonOptionSelectAnswer(lesson), {
    text: "A pointer is the address of a memory location returned by an allocator.",
    citation: {
      passageId: "dn-pointer:s0",
      evidenceQuote: "returns a pointer, which is the address of that location"
    }
  });
});

test("option-select answer uses the first grounded item when a lesson has no definition", () => {
  const lesson = lessonOf([{
    kind: "examples",
    text: "Examples include:",
    items: ["A move transfers ownership to a new binding.", "A copy leaves the source valid."],
    groundingProvenance: "generated"
  }]);

  assert.deepEqual(lessonOptionSelectAnswer(lesson), {
    text: "A move transfers ownership to a new binding.",
    citation: {
      passageId: "dn-1:s0:i0",
      evidenceQuote: "A move transfers ownership to a new binding."
    }
  });
});

test("option-select answer is absent when the lesson has no substantive teaching unit", () => {
  assert.equal(lessonOptionSelectAnswer(lessonOf([
    { kind: "gist", text: "A framing hook.", groundingProvenance: "generated" }
  ])), null);
});
