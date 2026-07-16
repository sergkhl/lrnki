import assert from "node:assert/strict";
import test from "node:test";
import type { ConceptLessonDraft } from "@lrnki/domain-core";
import { assembleConceptLesson } from "./assembleConceptLesson";
import type { NodeGrounding } from "./selectNodeGrounding";

const node = {
  derivedNodeId: "node-1",
  canonicalLabel: "Ownership",
  graphVersionId: "gv-1",
  enrichmentId: "enr-1"
};

const sourceGrounding: NodeGrounding = {
  provenance: "source_cep",
  passages: [
    { passageId: "b1", kind: "definition", text: "Ownership is a set of rules that govern memory.", sourceResourceId: "res-1", sourceBlockId: "b1" }
  ],
  definesLiteral: "the rules governing memory"
};

const generatedGrounding: NodeGrounding = {
  provenance: "generated",
  passages: [
    { passageId: "node-1:definition:0", kind: "definition", text: "A minted explanation of the concept.", derivedNodeId: "node-1" }
  ],
  definesLiteral: "A minted explanation of the concept."
};

function assemble(draft: ConceptLessonDraft, grounding: NodeGrounding) {
  return assembleConceptLesson({ conceptLessonId: "lesson-1", node, generatingModel: "test-model", configHash: "cfg", grounding, draft });
}

// Covers AE2, R6/R7/R8. A definition whose quote verifies verbatim against a source passage
// becomes a source-cited section; a synthesized intuition stays generated with no source id.
test("a verbatim-verifying definition is source-cited; the intuition is generated", () => {
  const draft: ConceptLessonDraft = {
    explorableTerms: [],
    sections: [
      { kind: "gist", text: "Each value has a single owner." },
      { kind: "intuition", text: "Think of it as a one-way handoff." },
      { kind: "definition", text: "Ownership is a set of rules that govern memory.", citation: { passageId: "b1", evidenceQuote: "Ownership is a set of rules that govern memory." } },
      { kind: "applications", text: "Move semantics build on ownership." }
    ]
  };
  const result = assemble(draft, sourceGrounding);
  assert.equal(result.kind, "lesson");
  if (result.kind !== "lesson") return;
  assert.equal(result.lesson.conceptLessonId, "lesson-1");
  const definition = result.lesson.sections.find((s) => s.kind === "definition")!;
  assert.equal(definition.groundingProvenance, "source_cep");
  assert.ok(definition.citation && definition.citation.provenance === "source");
  if (definition.citation.provenance === "source") {
    assert.equal(definition.citation.sourceBlockId, "b1");
    // byte-exact quote → matchKind "exact" (grounding fidelity, inspectable)
    assert.equal(definition.citation.matchKind, "exact");
  }
  const intuition = result.lesson.sections.find((s) => s.kind === "intuition")!;
  assert.equal(intuition.groundingProvenance, "generated");
  assert.equal(intuition.citation, undefined);
});

test("a definition matching only after normalization records matchKind: normalized", () => {
  const grounding: NodeGrounding = {
    provenance: "source_cep",
    passages: [
      { passageId: "b1", kind: "definition", text: "Ownership is a **set of rules** that govern memory.", sourceResourceId: "res-1", sourceBlockId: "b1" }
    ],
    definesLiteral: "the rules governing memory"
  };
  const draft: ConceptLessonDraft = {
    explorableTerms: [],
    sections: [
      { kind: "gist", text: "Each value has a single owner." },
      { kind: "definition", text: "Ownership is a set of rules that govern memory.", citation: { passageId: "b1", evidenceQuote: "Ownership is a set of rules that govern memory." } },
      { kind: "applications", text: "Move semantics build on ownership." }
    ]
  };
  const result = assemble(draft, grounding);
  assert.equal(result.kind, "lesson");
  if (result.kind !== "lesson") return;
  const definition = result.lesson.sections.find((s) => s.kind === "definition")!;
  assert.ok(definition.citation && definition.citation.provenance === "source");
  if (definition.citation.provenance === "source") assert.equal(definition.citation.matchKind, "normalized");
});

// A substantive section that is itself a verbatim substring of grounding is source-cited
// even if the model forgot the draft citation fields. This remains a provable match.
test("an uncited substantive section is source-cited when its text verifies against grounding", () => {
  const draft: ConceptLessonDraft = {
    explorableTerms: [],
    sections: [
      { kind: "gist", text: "Each value has a single owner." },
      { kind: "definition", text: "Ownership is a set of rules that govern memory." },
      { kind: "applications", text: "Move semantics build on ownership." }
    ]
  };
  const result = assemble(draft, sourceGrounding);
  assert.equal(result.kind, "lesson");
  if (result.kind !== "lesson") return;
  const definition = result.lesson.sections.find((s) => s.kind === "definition")!;
  assert.equal(definition.groundingProvenance, "source_cep");
  assert.ok(definition.citation && definition.citation.provenance === "source");
});

// Covers AE1, R3, R4. A node with no notation/formula grounding produces gist, intuition,
// definition, examples, applications and NO formulas section — no placeholder.
test("a node with no formula grounding produces no formulas section and no placeholder", () => {
  const draft: ConceptLessonDraft = {
    explorableTerms: [],
    sections: [
      { kind: "gist", text: "Gist." },
      { kind: "intuition", text: "Intuition." },
      { kind: "definition", text: "Ownership is a set of rules that govern memory.", citation: { passageId: "b1", evidenceQuote: "Ownership is a set of rules that govern memory." } },
      { kind: "examples", text: "An example." },
      { kind: "applications", text: "Applications." }
    ]
  };
  const result = assemble(draft, sourceGrounding);
  assert.equal(result.kind, "lesson");
  if (result.kind !== "lesson") return;
  assert.equal(result.lesson.sections.some((s) => s.kind === "formulas"), false);
  assert.deepEqual(result.lesson.sections.map((s) => s.kind), ["gist", "intuition", "definition", "examples", "applications"]);
});

// Covers AE3, KTD4. A draft that cannot meet the minimum (no substantive section) is recorded
// lesson-absent with a reason — not a thin or all-synthesized lesson.
test("a draft missing every substantive section is recorded lesson-absent", () => {
  const draft: ConceptLessonDraft = {
    explorableTerms: [],
    sections: [
      { kind: "gist", text: "Gist." },
      { kind: "applications", text: "Applications." }
    ]
  };
  const result = assemble(draft, sourceGrounding);
  assert.equal(result.kind, "absent");
  if (result.kind !== "absent") return;
  assert.equal(result.absent.derivedNodeId, "node-1");
  assert.ok(result.absent.reason.length > 0);
});

// Covers AE5, R3, R7. An llm_grounded minted node is teachable: its substantive section is
// generated from its bundle and the whole lesson is generated-labeled; it meets the minimum.
test("a minted node's generated substantive section satisfies the minimum (whole lesson generated)", () => {
  const draft: ConceptLessonDraft = {
    explorableTerms: [],
    sections: [
      { kind: "gist", text: "Gist." },
      { kind: "definition", text: "A minted explanation of the concept.", citation: { passageId: "node-1:definition:0", evidenceQuote: "A minted explanation of the concept." } },
      { kind: "applications", text: "Applications." }
    ]
  };
  const result = assemble(draft, generatedGrounding);
  assert.equal(result.kind, "lesson");
  if (result.kind !== "lesson") return;
  assert.ok(result.lesson.sections.every((s) => s.groundingProvenance === "generated"));
  const definition = result.lesson.sections.find((s) => s.kind === "definition")!;
  assert.ok(definition.citation && definition.citation.provenance === "generated");
});

// Covers R8. A citation whose quote does NOT verify verbatim against its passage is demoted to
// generated (citation dropped), never persisted as a source quote.
test("an unverifiable citation is demoted to generated and never persisted as a source quote", () => {
  const draft: ConceptLessonDraft = {
    explorableTerms: [],
    sections: [
      { kind: "gist", text: "Gist." },
      { kind: "definition", text: "A claim the source never makes.", citation: { passageId: "b1", evidenceQuote: "this quote is nowhere in the passage" } },
      { kind: "applications", text: "Applications." }
    ]
  };
  const result = assemble(draft, sourceGrounding);
  assert.equal(result.kind, "lesson");
  if (result.kind !== "lesson") return;
  const definition = result.lesson.sections.find((s) => s.kind === "definition")!;
  assert.equal(definition.groundingProvenance, "generated");
  assert.equal(definition.citation, undefined);
});

// A diagram descriptor on a section is carried through to the assembled section.
test("a diagram descriptor is carried through assembly", () => {
  const draft: ConceptLessonDraft = {
    explorableTerms: [],
    sections: [
      { kind: "gist", text: "Gist." },
      { kind: "definition", text: "Ownership is a set of rules that govern memory.", citation: { passageId: "b1", evidenceQuote: "Ownership is a set of rules that govern memory." } },
      { kind: "applications", text: "Applications.", diagram: { caption: "A vs B", spec: "A relates to B" } }
    ]
  };
  const result = assemble(draft, sourceGrounding);
  assert.equal(result.kind, "lesson");
  if (result.kind !== "lesson") return;
  assert.deepEqual(result.lesson.sections.find((s) => s.kind === "applications")!.diagram, { caption: "A vs B", spec: "A relates to B" });
});

// Duplicate kinds are de-duplicated (first wins) and sections are ordered canonically.
test("duplicate kinds collapse to the first and sections order canonically", () => {
  const draft: ConceptLessonDraft = {
    explorableTerms: [],
    sections: [
      { kind: "applications", text: "Applications." },
      { kind: "definition", text: "Ownership is a set of rules that govern memory.", citation: { passageId: "b1", evidenceQuote: "Ownership is a set of rules that govern memory." } },
      { kind: "gist", text: "First gist." },
      { kind: "gist", text: "Second gist (dropped)." }
    ]
  };
  const result = assemble(draft, sourceGrounding);
  assert.equal(result.kind, "lesson");
  if (result.kind !== "lesson") return;
  assert.deepEqual(result.lesson.sections.map((s) => s.kind), ["gist", "definition", "applications"]);
  assert.equal(result.lesson.sections[0].text, "First gist.");
});

test("list items survive assembly only for list-kind sections", () => {
  const draft: ConceptLessonDraft = {
    explorableTerms: [],
    sections: [
      { kind: "gist", text: "Gist about ownership." },
      { kind: "definition", text: "Ownership is a set of rules that govern memory.", citation: { passageId: "b1", evidenceQuote: "Ownership is a set of rules that govern memory." } },
      { kind: "applications", text: "Use ownership to reason about moves.", items: ["Track the owner.", "Avoid dangling references."] },
      { kind: "formulas", text: "No formula.", items: ["Should not render as a list."] }
    ]
  };
  const result = assemble(draft, sourceGrounding);
  assert.equal(result.kind, "lesson");
  if (result.kind !== "lesson") return;
  assert.deepEqual(result.lesson.sections.find((s) => s.kind === "applications")?.items, ["Track the owner.", "Avoid dangling references."]);
  assert.equal(result.lesson.sections.find((s) => s.kind === "formulas")?.items, undefined);
});
