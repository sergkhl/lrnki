import assert from "node:assert/strict";
import test from "node:test";
import { validateItemExplorableTerms, validateLessonExplorableTerms } from "./explorableTerms";

// U1 test scenario 3/4 (R2/R3, KTD1): the deterministic Explorable Term validator keeps only
// distinct 1-80-code-point exact substrings of the authoritative body that are not the parent
// label, caps at three, and drops the rest WITHOUT vetoing otherwise-valid neural output.

test("item terms: keeps only exact substrings of the question stem, in order", () => {
  const question = "How does the borrow checker enforce the ownership invariant at compile time?";
  const kept = validateItemExplorableTerms(["borrow checker", "ownership invariant"], question, "Ownership");
  assert.deepEqual(kept, ["borrow checker", "ownership invariant"]);
});

test("item terms: drops a candidate that is not a substring of the stem", () => {
  const kept = validateItemExplorableTerms(["borrow checker", "garbage collector"], "The borrow checker runs at compile time.", "Ownership");
  assert.deepEqual(kept, ["borrow checker"]);
});

test("item terms: drops the parent label and blanks, and de-duplicates after normalization", () => {
  const question = "Ownership and the borrow checker; the Borrow Checker again, and ownership.";
  // "Ownership" == parent label (dropped); "Borrow Checker" duplicates "borrow checker"
  // after normalization (first spelling wins); a blank candidate is dropped.
  const kept = validateItemExplorableTerms(["Ownership", "borrow checker", "Borrow Checker", "   "], question, "ownership");
  assert.deepEqual(kept, ["borrow checker"]);
});

test("item terms: enforces the 1-80 code-point envelope on the trimmed term", () => {
  const long = "x".repeat(81);
  const ok = "y".repeat(80);
  const question = `${long} and ${ok}`;
  const kept = validateItemExplorableTerms([long, ok], question, "Parent");
  assert.deepEqual(kept, [ok]);
});

test("item terms: caps at three, dropping anything past the first three valid terms", () => {
  const question = "alpha beta gamma delta epsilon";
  const kept = validateItemExplorableTerms(["alpha", "beta", "gamma", "delta", "epsilon"], question, "Parent");
  assert.deepEqual(kept, ["alpha", "beta", "gamma"]);
});

test("item terms: trims surrounding whitespace but stores an exact substring", () => {
  const question = "The affine type system underlies moves.";
  const kept = validateItemExplorableTerms(["  affine type system  "], question, "Parent");
  assert.deepEqual(kept, ["affine type system"]);
});

test("item terms: empty input yields an empty list (no fabricated affordance)", () => {
  assert.deepEqual(validateItemExplorableTerms([], "A question with no terms.", "Parent"), []);
});

const sections = [
  { kind: "definition" as const, text: "A monad wraps a value with a bind operation." },
  { kind: "examples" as const, text: "Lists and options are common monads in practice." }
];

test("lesson terms: a candidate must name a real section kind and match ONLY that section body", () => {
  // "bind operation" is in the definition body; anchoring it to "examples" (where it does not
  // appear) drops it. "options" is in the examples body and survives.
  const kept = validateLessonExplorableTerms(
    [
      { term: "bind operation", sectionKind: "definition" },
      { term: "bind operation", sectionKind: "examples" },
      { term: "options", sectionKind: "examples" }
    ],
    sections,
    "Monad"
  );
  assert.deepEqual(kept, [
    { term: "bind operation", sectionKind: "definition" },
    { term: "options", sectionKind: "examples" }
  ]);
});

test("lesson terms: a candidate anchored to a section kind absent from the lesson is dropped", () => {
  const kept = validateLessonExplorableTerms(
    [{ term: "bind operation", sectionKind: "formulas" }],
    sections,
    "Monad"
  );
  assert.deepEqual(kept, []);
});

test("lesson terms: does not match against a section's list items, only its prose body (scenario 4)", () => {
  // The validator receives only {kind, text}; list items live elsewhere and are never a body.
  const kept = validateLessonExplorableTerms(
    [{ term: "practice", sectionKind: "definition" }],
    sections,
    "Monad"
  );
  // "practice" appears in the EXAMPLES body, not the definition body it was anchored to.
  assert.deepEqual(kept, []);
});

test("lesson terms: distinctness holds across sections and the cap is three", () => {
  const many = [
    { kind: "definition" as const, text: "a b c d" },
    { kind: "examples" as const, text: "a e f g" }
  ];
  const kept = validateLessonExplorableTerms(
    [
      { term: "a", sectionKind: "definition" },
      { term: "a", sectionKind: "examples" },
      { term: "b", sectionKind: "definition" },
      { term: "c", sectionKind: "definition" },
      { term: "d", sectionKind: "definition" }
    ],
    many,
    "Parent"
  );
  assert.deepEqual(kept.map((t) => t.term), ["a", "b", "c"]);
});
