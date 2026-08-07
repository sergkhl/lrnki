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
    canonicalLabel: "Heap",
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
    canonicalLabel: "Ownership",
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

function draftOf(options: StudyItemOptionDraft[], explorableTerms: string[] = []): OptionSelectItemDraft {
  return { itemType: "option_select", question: "Where is memory allocated at runtime?", explanation: "The grounding says a heap allocates memory at runtime.", options, explorableTerms };
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

test("generated-grounding node: an unknown passageId still rejects, quote or no quote", () => {
  const genCorrect: StudyItemOptionDraft = {
    text: "Tracks ownership of a value",
    isCorrect: true,
    provenance: "generated",
    citation: { passageId: "dn-2:nobody-cited-this", evidenceQuote: "ownership is reference counting" }
  };
  const result = validateOptionSelectItem(
    draftOf([genCorrect, distractor("Counts references"), distractor("Locks a mutex"), distractor("Pins to a core")]),
    generatedGrounding()
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /does not verify/i);
});

// --- Citation resolution ladder (plan 2026-08-05-001 D9, rungs 1-2) -----------------------
// The ladder is shared by all three guards; option-select is where it is exercised in detail.

// A lesson-shaped grounding: two generated passages under positional ids, which is what
// `lessonGroundingShape` now hands every generator.
function twoGeneratedPassages(): OptionSelectGrounding {
  return {
    ...generatedGrounding(),
    passages: [
      { passageId: "dn-2:s0", text: "Ownership tracks which binding frees a value.", derivedNodeId: "dn-2" },
      { passageId: "dn-2:s1", text: "Ownership transfers when a value is moved.", derivedNodeId: "dn-2" }
    ]
  };
}

function keyedCitation(passageId: string, evidenceQuote: string): StudyItemOptionDraft {
  return { text: "Tracks ownership of a value", isCorrect: true, provenance: "generated", citation: { passageId, evidenceQuote } };
}

function guardWith(keyed: StudyItemOptionDraft, grounding: OptionSelectGrounding) {
  return validateOptionSelectItem(
    draftOf([keyed, distractor("Counts references"), distractor("Locks a mutex"), distractor("Pins to a core")]),
    grounding
  );
}

// Rung 2: the model quoted a real passage verbatim and addressed it with the wrong id. That is
// a deterministic repair — the quote still has to verify verbatim somewhere — not a threshold.
test("ladder rung 2: a verbatim quote citing the wrong generated passage id is repaired, not rejected", () => {
  const result = guardWith(keyedCitation("dn-2:s0", "Ownership transfers when a value is moved."), twoGeneratedPassages());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const keyed = result.item.options.find((o) => o.isCorrect);
  assert.equal(keyed?.citation?.provenance, "generated");
});

test("ladder rung 0: an unknown passageId rejects even when the quote appears in the grounding", () => {
  const result = guardWith(keyedCitation("dn-2:s9", "Ownership transfers when a value is moved."), twoGeneratedPassages());
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /does not verify/i);
});

// The repair rung only ever lands on a GENERATED passage, so it can never mint a `source`
// citation from an id nobody cited. A source passage keeps the hard verbatim requirement.
test("a source passage cited with a failing quote still rejects", () => {
  const result = guardWith(
    keyedCitation("blk-1", "a heap is a LIFO region"),
    { ...sourceGrounding(), passages: [
      { passageId: "blk-1", text: "A heap allocates memory at runtime.", sourceResourceId: "src-1", sourceBlockId: "blk-1" },
      { passageId: "blk-2", text: "A stack stores frames in last-in, first-out order.", sourceResourceId: "src-1", sourceBlockId: "blk-2" }
    ] }
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /does not verify/i);
});

test("a repair never upgrades provenance: a quote matching only a SOURCE passage never mints a source citation", () => {
  const result = guardWith(
    keyedCitation("dn-2:s0", "A stack stores frames in last-in, first-out order."),
    { ...twoGeneratedPassages(), passages: [
      ...twoGeneratedPassages().passages,
      { passageId: "blk-2", text: "A stack stores frames in last-in, first-out order.", sourceResourceId: "src-1", sourceBlockId: "blk-2" }
    ] }
  );
  // The repair rung searches GENERATED passages only, so the source passage is invisible to it
  // and the fallback takes over instead — landing on the CITED generated passage's own text,
  // never on the source text the quote happens to match. A `source` citation stays
  // unreachable from an id nobody cited, which is the provenance masquerade ADR-0026 forbids.
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.citationRung, "generated_passage_fallback");
  const keyed = result.item.options.find((option) => option.isCorrect);
  assert.equal(keyed?.citation?.provenance, "generated");
  assert.equal(keyed?.citation?.provenance === "generated" && keyed.citation.passageText, "Ownership tracks which binding frees a value.");
});

// --- Rung 3: the generated-passage fallback (U3) ------------------------------------------
// Admissible only because option-select and impostor are judge-verified (D6). It forgives a
// PARAPHRASE — the model wrote the lesson and then failed to copy its own sentence back —
// by attributing the claim to the passage the model cited rather than to a span it reproduced.
test("rung 3: a paraphrased quote is admitted against the CITED passage's whole text", () => {
  const result = guardWith(keyedCitation("dn-2:s0", "ownership decides who frees the value"), twoGeneratedPassages());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.citationRung, "generated_passage_fallback");
  const keyed = result.item.options.find((option) => option.isCorrect);
  // The stored text is the PASSAGE, not the model's quote: the quote is the thing that failed
  // to verify, so persisting it would record a span that appears nowhere.
  assert.equal(keyed?.citation?.provenance === "generated" && keyed.citation.passageText, "Ownership tracks which binding frees a value.");
});

// The source-passage half of "rung 3 never fires" is already proven by "a source passage cited
// with a failing quote still rejects" above — that test is now ALSO the fallback's negative
// control, since option-select opts in and it still rejects. This one covers the other side:
// an item that never needed the fallback must not be reported as if it had.
test("a verbatim-anchored item reports the verbatim rung", () => {
  const verbatim = guardWith(keyedCitation("dn-2:s0", "Ownership tracks which binding frees a value."), twoGeneratedPassages());
  assert.equal(verbatim.ok, true);
  if (!verbatim.ok) return;
  assert.equal(verbatim.citationRung, "verbatim");
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
