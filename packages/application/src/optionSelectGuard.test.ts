import assert from "node:assert/strict";
import test from "node:test";
import type { OptionSelectItemDraft, StudyItemOptionDraft } from "@lrnki/domain-core";
import { validateOptionSelectItem, type OptionSelectGrounding } from "./optionSelectGuard";

// A deterministic option-id minter so assertions can name option ids.
function sequentialIds(): () => string {
  let n = 0;
  return () => `opt-${++n}`;
}

// Source-grounded context whose single passage backs the verbatim correct answer.
function sourceGrounding(): OptionSelectGrounding {
  return {
    studyItemId: "si-1",
    graphVersionId: "gv-1",
    enrichmentId: "en-1",
    derivedNodeId: "dn-1",
    groundingProvenance: "source_cep",
    generatingModel: "test-model",
    configHash: "cfg-1",
    passages: [
      { passageId: "blk-1", text: "A heap allocates memory at runtime.", sourceResourceId: "src-1", sourceBlockId: "blk-1" }
    ]
  };
}

function generatedGrounding(): OptionSelectGrounding {
  return {
    studyItemId: "si-2",
    graphVersionId: "gv-1",
    enrichmentId: "en-1",
    derivedNodeId: "dn-2",
    groundingProvenance: "generated",
    generatingModel: "test-model",
    configHash: "cfg-1",
    passages: [{ passageId: "dn-2:definition:0", text: "Ownership tracks which binding frees a value.", derivedNodeId: "dn-2" }]
  };
}

const correct: StudyItemOptionDraft = {
  text: "Heap",
  isCorrect: true,
  provenance: "source",
  citation: { passageId: "blk-1", evidenceQuote: "A heap allocates memory at runtime." }
};

function distractor(text: string): StudyItemOptionDraft {
  return { text, isCorrect: false, provenance: "generated" };
}

function draftOf(options: StudyItemOptionDraft[]): OptionSelectItemDraft {
  return { itemType: "option_select", question: "Where is memory allocated at runtime?", explanation: "The grounding says a heap allocates memory at runtime.", options };
}

test("happy path: four distinct options, one grounded correct, three generated → ok with assigned ids", () => {
  const result = validateOptionSelectItem(
    draftOf([correct, distractor("Stack"), distractor("Register"), distractor("Cache")]),
    sourceGrounding(),
    sequentialIds()
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.item.explanation, "The grounding says a heap allocates memory at runtime.");
  assert.equal(result.item.options.length, 4);
  assert.deepEqual(
    result.item.options.map((o) => o.optionId),
    ["opt-1", "opt-2", "opt-3", "opt-4"]
  );
  const keyed = result.item.options.filter((o) => o.isCorrect);
  assert.equal(keyed.length, 1);
  assert.equal(keyed[0].provenance, "source");
  assert.ok(keyed[0].citation && keyed[0].citation.provenance === "source");
  // a byte-exact quote records matchKind: "exact" (grounding fidelity, inspectable)
  if (keyed[0].citation.provenance === "source") assert.equal(keyed[0].citation.matchKind, "exact");
  // distractors carry no citation and are labeled generated
  for (const opt of result.item.options.filter((o) => !o.isCorrect)) {
    assert.equal(opt.provenance, "generated");
    assert.equal(opt.citation, undefined);
  }
});

test("a quote matching only after normalization records matchKind: normalized", () => {
  const grounding: OptionSelectGrounding = {
    ...sourceGrounding(),
    passages: [{ passageId: "blk-1", text: "A **heap** allocates memory at runtime.", sourceResourceId: "src-1", sourceBlockId: "blk-1" }]
  };
  const result = validateOptionSelectItem(
    draftOf([correct, distractor("Stack"), distractor("Register"), distractor("Cache")]),
    grounding,
    sequentialIds()
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const keyed = result.item.options.find((o) => o.isCorrect)!;
  assert.ok(keyed.citation && keyed.citation.provenance === "source");
  if (keyed.citation.provenance === "source") assert.equal(keyed.citation.matchKind, "normalized");
});

test("AE4: duplicate normalized option text → reject", () => {
  const result = validateOptionSelectItem(
    draftOf([correct, distractor("Stack"), distractor("  STACK "), distractor("Cache")]),
    sourceGrounding()
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /duplicate/i);
});

test("AE4: zero options flagged correct → reject", () => {
  const result = validateOptionSelectItem(
    draftOf([distractor("Heap"), distractor("Stack"), distractor("Register"), distractor("Cache")]),
    sourceGrounding()
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /exactly one correct/i);
});

test("AE4: two options flagged correct → reject (distinct reason)", () => {
  const second: StudyItemOptionDraft = { text: "Stack", isCorrect: true, provenance: "source", citation: { passageId: "blk-1", evidenceQuote: "A heap allocates memory at runtime." } };
  const result = validateOptionSelectItem(
    draftOf([correct, second, distractor("Register"), distractor("Cache")]),
    sourceGrounding()
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /exactly one correct/i);
  assert.match(result.reason, /got 2/);
});

test("three options → reject on count", () => {
  const result = validateOptionSelectItem(draftOf([correct, distractor("Stack"), distractor("Cache")]), sourceGrounding());
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /exactly 4 options/i);
});

test("five options → reject on count", () => {
  const result = validateOptionSelectItem(
    draftOf([correct, distractor("Stack"), distractor("Register"), distractor("Cache"), distractor("Bus")]),
    sourceGrounding()
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /exactly 4 options/i);
});

test("correct option whose quote does not verify against grounding → reject (ungrounded)", () => {
  const ungrounded: StudyItemOptionDraft = {
    text: "Heap",
    isCorrect: true,
    provenance: "source",
    citation: { passageId: "blk-1", evidenceQuote: "memory is never freed automatically" }
  };
  const result = validateOptionSelectItem(
    draftOf([ungrounded, distractor("Stack"), distractor("Register"), distractor("Cache")]),
    sourceGrounding()
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /does not verify/i);
});

test("missing explanation → reject", () => {
  const result = validateOptionSelectItem(
    { ...draftOf([correct, distractor("Stack"), distractor("Register"), distractor("Cache")]), explanation: " " },
    sourceGrounding()
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /explanation/i);
});

test("R10: non-correct option labeled 'source' → reject (distractor must be generated)", () => {
  const sourceDistractor: StudyItemOptionDraft = { text: "Stack", isCorrect: false, provenance: "source" };
  const result = validateOptionSelectItem(
    draftOf([correct, sourceDistractor, distractor("Register"), distractor("Cache")]),
    sourceGrounding()
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /generated/i);
});

test("generated-grounding node: correct option quoting the generated bundle verbatim verifies", () => {
  const genCorrect: StudyItemOptionDraft = {
    text: "Tracks ownership of a value",
    isCorrect: true,
    provenance: "generated",
    citation: { passageId: "dn-2:definition:0", evidenceQuote: "Ownership tracks which binding frees a value." }
  };
  const result = validateOptionSelectItem(
    draftOf([genCorrect, distractor("Counts references"), distractor("Locks a mutex"), distractor("Pins to a core")]),
    generatedGrounding()
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const keyed = result.item.options.find((o) => o.isCorrect);
  assert.ok(keyed && keyed.citation && keyed.citation.provenance === "generated");
});

test("generated-grounding node: correct option quoting absent text → reject", () => {
  const genCorrect: StudyItemOptionDraft = {
    text: "Tracks ownership of a value",
    isCorrect: true,
    provenance: "generated",
    citation: { passageId: "dn-2:definition:0", evidenceQuote: "ownership is reference counting" }
  };
  const result = validateOptionSelectItem(
    draftOf([genCorrect, distractor("Counts references"), distractor("Locks a mutex"), distractor("Pins to a core")]),
    generatedGrounding()
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /does not verify/i);
});

test("normalization: '  Heap ' and 'heap' are duplicates; 'heap' and 'stack' are distinct", () => {
  const dupe = validateOptionSelectItem(
    draftOf([correct, distractor("  Heap "), distractor("Register"), distractor("Cache")]),
    sourceGrounding()
  );
  assert.equal(dupe.ok, false);

  const distinct = validateOptionSelectItem(
    draftOf([correct, distractor("Stack"), distractor("Register"), distractor("Cache")]),
    sourceGrounding()
  );
  assert.equal(distinct.ok, true);
});
