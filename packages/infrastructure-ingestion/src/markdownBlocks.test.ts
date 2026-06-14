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
