import assert from "node:assert/strict";
import test from "node:test";
import { extractableBlocks } from "@lrnki/domain-core";
import { extractMarkdownBlocks } from "./markdownBlocks";

// Docling emits image / undecoded artifacts as standalone HTML comments rather
// than marker's `![alt](file)`. They must become non-extractable placeholders so
// they never reach discovery/admission.
test("docling HTML-comment placeholders become figure_placeholder and drop from body", () => {
  const blocks = extractMarkdownBlocks([
    "## Paper Title",
    "",
    "<!-- image -->",
    "",
    "Real teachable body prose about a mechanism.",
    "",
    "<!-- formula-not-decoded -->",
    ""
  ].join("\n"));

  const placeholders = blocks.filter((block) => block.blockType === "figure_placeholder");
  assert.equal(placeholders.length, 2, "both <!-- image --> and <!-- formula --> become placeholders");

  const body = extractableBlocks(blocks);
  assert.ok(body.some((block) => block.text.includes("teachable body prose")), "body prose survives");
  assert.ok(!body.some((block) => block.text.includes("<!--")), "no HTML comment leaked into the extractable body");
});

// The first heading is the document title regardless of depth — Docling academic
// PDFs lead with a `##` title, not a `#` one.
test("first heading is typed title even at depth 2 (docling academic layout)", () => {
  const blocks = extractMarkdownBlocks(["## Instructor-Aligned Knowledge Graphs", "", "Body."].join("\n"));
  assert.equal(blocks[0].blockType, "title");
});

// A NUL byte (U+0000) in the source — Docling/marker can emit one from a
// corrupted PDF glyph — must be stripped at the parse boundary. PostgreSQL
// `text` columns reject U+0000, so it would otherwise reach a block, be echoed
// verbatim into an evidence quote, and detonate at persistence. Surrounding
// characters stay verbatim so evidence still verifies (AGENTS rule 11/16).
test("NUL bytes are stripped from block text at the parse boundary", () => {
  const nul = String.fromCharCode(0);
  const blocks = extractMarkdownBlocks(["## Title", "", `Teachable${nul} body${nul} prose.`].join("\n"));

  assert.ok(!blocks.some((block) => block.text.includes(nul)), "no block text retains a NUL byte");
  const body = blocks.find((block) => block.text.includes("Teachable"));
  assert.ok(body, "the prose block survives");
  assert.equal(body?.text, "Teachable body prose.", "non-NUL characters are preserved verbatim");
});
