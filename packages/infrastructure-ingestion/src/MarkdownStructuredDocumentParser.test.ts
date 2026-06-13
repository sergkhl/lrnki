import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { extractableBlocks, type SourceBlock, type SourceBlockType } from "@lrnki/domain-core";
import { MarkdownStructuredDocumentParser } from "./MarkdownStructuredDocumentParser";

const parser = new MarkdownStructuredDocumentParser();

async function parse(markdown: string): Promise<SourceBlock[]> {
  const document = await parser.parse({
    sourceResourceId: "test",
    bytes: new TextEncoder().encode(markdown),
    contentType: "text/markdown"
  });
  return document.blocks;
}

const find = (blocks: SourceBlock[], needle: string) => blocks.find((block) => block.text.includes(needle));
const typeOf = (blocks: SourceBlock[], needle: string): SourceBlockType | undefined => find(blocks, needle)?.blockType;

// ---------------------------------------------------------------------------
// Real datalab/marker academic fixture: the structure pass must keep discovery
// out of bibliography, appendices, figures, and tables.
// ---------------------------------------------------------------------------

const FIXTURE = path.resolve(import.meta.dirname, "../../../fixtures/markdown/datalab-output-2602.17111v1.pdf.md");

test("InstructKG fixture: title and abstract are typed as body matter", async () => {
  const blocks = await parse(readFileSync(FIXTURE, "utf8"));
  assert.equal(blocks[0].blockType, "title");
  assert.match(blocks[0].text, /Instructor-Aligned Knowledge Graphs/);
  assert.equal(typeOf(blocks, "Mastering educational concepts"), "abstract");
});

test("InstructKG fixture: bibliography entries are references, not paragraphs", async () => {
  const blocks = await parse(readFileSync(FIXTURE, "utf8"));
  // The `## References` heading itself and its `- [n] …` entries are tail matter.
  assert.equal(typeOf(blocks, "Automatic construction of educational knowledge graphs"), "reference");
  const refHeading = blocks.find((block) => block.text === "References");
  assert.equal(refHeading?.blockType, "reference");
});

test("InstructKG fixture: appendix sections (incl. prompt templates) are appendix", async () => {
  const blocks = await parse(readFileSync(FIXTURE, "utf8"));
  assert.equal(typeOf(blocks, "Prompt Templates"), "appendix");
  // A prompt-template sub-heading inside the appendix tail stays appendix.
  assert.equal(typeOf(blocks, "Node Significance"), "appendix");
  // Front-matter meta (CCS Concepts / Keywords) is also non-body.
  assert.equal(typeOf(blocks, "Computer-assisted instruction"), "appendix");
});

test("InstructKG fixture: figures and tables become non-extractable placeholders", async () => {
  const blocks = await parse(readFileSync(FIXTURE, "utf8"));
  assert.equal(typeOf(blocks, "INSTRUCTKG extracts concepts from lecture chunks"), "caption");
  assert.ok(blocks.some((block) => block.blockType === "figure_placeholder"), "expected a figure_placeholder block");
  const table = blocks.find((block) => block.blockType === "table_placeholder" && block.text.includes("Database Systems"));
  assert.ok(table, "expected the dataset-statistics table as a table_placeholder");
});

test("InstructKG fixture: extractableBlocks keeps body prose and drops tail matter", async () => {
  const blocks = await parse(readFileSync(FIXTURE, "utf8"));
  const body = extractableBlocks(blocks);
  const dropped: SourceBlockType[] = ["reference", "appendix", "caption", "figure_placeholder", "table_placeholder"];
  for (const block of body) assert.ok(!dropped.includes(block.blockType), `body leaked a ${block.blockType} block`);
  // Real Introduction prose survives the filter.
  assert.ok(body.some((block) => block.text.includes("temporal signals")), "expected Introduction body prose to be extractable");
  // The structure pass must actually remove a meaningful share of the document.
  assert.ok(body.length < blocks.length * 0.85, `expected tail matter to be excluded (kept ${body.length}/${blocks.length})`);
});

// ---------------------------------------------------------------------------
// Region stickiness: stray `#` headings inside an appendix (the 2507 prompt-
// template failure mode) must not reset the body structure or surface to an LLM.
// ---------------------------------------------------------------------------

test("region stickiness: stray # headings inside the appendix stay appendix", async () => {
  const blocks = await parse([
    "# Paper Title",
    "",
    "## Introduction",
    "",
    "This is teachable body prose about a concept.",
    "",
    "## Appendix",
    "",
    "# TASK DESCRIPTION",
    "",
    "You are an agent. Implement the following idea.",
    ""
  ].join("\n"));

  assert.equal(blocks[0].blockType, "title");
  assert.equal(typeOf(blocks, "teachable body prose"), "paragraph");
  // The stray depth-1 heading is NOT a new title/heading — it is appendix tail.
  const stray = blocks.find((block) => block.text === "TASK DESCRIPTION");
  assert.equal(stray?.blockType, "appendix");
  assert.equal(typeOf(blocks, "You are an agent"), "appendix");

  const body = extractableBlocks(blocks);
  assert.ok(!body.some((block) => block.text.includes("TASK DESCRIPTION")), "stray appendix heading leaked into body");
  assert.ok(body.some((block) => block.text.includes("teachable body prose")), "real body prose was dropped");
});

// ---------------------------------------------------------------------------
// Fenced code inside a tail region (datalab appendices quote prompt templates
// as ``` blocks) must be typed by region, not as extractable `code`.
// ---------------------------------------------------------------------------

test("appendix fenced code is typed appendix and excluded from the body", async () => {
  const blocks = await parse([
    "# Paper Title",
    "",
    "## Method",
    "",
    "```python",
    "def core_example():  # a teachable body code sample",
    "    return 1",
    "```",
    "",
    "## B Prompt Templates",
    "",
    "```",
    "You are a grader. Score the answer from 1 to 5.",
    "```",
    ""
  ].join("\n"));

  // Body code stays `code` (extractable).
  assert.equal(typeOf(blocks, "core_example"), "code");
  // Appendix code becomes `appendix` (non-extractable) — the prompt template
  // never reaches discovery/admission.
  assert.equal(typeOf(blocks, "You are a grader"), "appendix");

  const body = extractableBlocks(blocks);
  assert.ok(body.some((block) => block.text.includes("core_example")), "body code sample was dropped");
  assert.ok(!body.some((block) => block.text.includes("You are a grader")), "appendix prompt template leaked into body");
});
