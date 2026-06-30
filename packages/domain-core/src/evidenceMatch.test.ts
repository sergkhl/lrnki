import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyEvidenceMatch, evidenceQuoteMatches } from "./index";

// Evidence-match classification (ADR-0007, made inspectable). `exact` is a byte-exact
// substring; `normalized` matches only after formatting normalization; `none` is no match.
// `evidenceQuoteMatches` must stay the boolean projection (one source of truth, rule 18).

test("a byte-exact substring classifies as exact", () => {
  const block = "Ownership is Rust's most unique feature.";
  assert.equal(classifyEvidenceMatch(block, "Rust's most unique feature"), "exact");
});

test("formatting drift the normalizer absorbs classifies as normalized, not exact", () => {
  // Markdown emphasis + curly apostrophe in the block; the quote is the plain form.
  const block = "Ownership is **Rust’s** most unique feature.";
  assert.equal(classifyEvidenceMatch(block, "Rust's most unique feature"), "normalized");
});

test("a digit-letter spacing difference matches only after normalization", () => {
  // The normalizer joins "8 bytes" → "8bytes"; the raw quote is not a substring of the block.
  const block = "An integer uses 8 bytes of memory.";
  assert.equal(block.includes("8bytes"), false);
  assert.equal(classifyEvidenceMatch(block, "8bytes of memory"), "normalized");
});

test("a quote absent from the block classifies as none", () => {
  assert.equal(classifyEvidenceMatch("The stack stores fixed-size data.", "garbage collection"), "none");
});

test("an empty quote classifies as none", () => {
  assert.equal(classifyEvidenceMatch("anything", ""), "none");
});

test("evidenceQuoteMatches is exactly the non-none projection", () => {
  const cases: [string, string][] = [
    ["Ownership is Rust's most unique feature.", "most unique feature"],
    ["> A heap allocates memory at runtime.", "A heap allocates memory at runtime."],
    ["The stack stores fixed-size data.", "garbage collection"],
    ["anything", ""]
  ];
  for (const [block, quote] of cases) {
    assert.equal(evidenceQuoteMatches(block, quote), classifyEvidenceMatch(block, quote) !== "none");
  }
});
