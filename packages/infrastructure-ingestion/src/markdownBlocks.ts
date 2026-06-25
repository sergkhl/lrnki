import { stripNullBytes, type SourceBlock, type SourceBlockType } from "@lrnki/domain-core";

// Shared deterministic Markdown structure pass. Both the native-markdown parser
// (datalab/marker PDF→Markdown output) and the Docling parser (PDF/DOCX/PPTX →
// Markdown via the Docling HTTP API) feed their Markdown through this one
// extractor, so the region-classification contract — scoping discovery/admission
// to the teachable body and typing non-teachable tail matter out of the LLM path
// — is identical regardless of the front-end. Front-end-specific differences
// (e.g. Docling's `<!-- image -->` placeholders vs. marker's `![alt](file)`) are
// normalized here, additively, so neither corpus regresses.

// A document region derived from the heading structure. `abstract` and `meta`
// (CCS Concepts, Keywords, Acknowledgments) are section-scoped — they revert to
// `body` at the next heading. `references` and `appendix` are sticky to the end
// of the document: everything after the bibliography/appendix heading is tail
// matter. Stickiness is what neutralizes stray `#` headings inside appendix
// prompt templates (e.g. `# TASK DESCRIPTION`) — they fall in the non-body tail
// and never reach an LLM stage, so a corrupted heading path there is harmless.
type Region = "body" | "abstract" | "references" | "appendix" | "meta";

// Maps a heading title to the region it opens, or null when the heading is
// ordinary body structure. Matched case-insensitively after stripping emphasis.
function regionForHeading(title: string): Region | null {
  const t = title.trim().toLowerCase();
  if (/^abstract$/.test(t)) return "abstract";
  if (/^(references|bibliography)$/.test(t)) return "references";
  if (/^(acknowledgments?|ccs concepts|keywords)$/.test(t)) return "meta";
  // Explicit appendix, or a lone single-capital-letter section label such as
  // "A Baselines Details" / "B Prompt Templates" (one capital, then a space).
  // "AI Research Agents" (no space after the first capital) and numbered
  // sections like "2 Related Works" deliberately do not match.
  if (/^(appendix|appendices)\b/i.test(title.trim()) || /^[A-Z]\s+\S/.test(title.trim())) return "appendix";
  return null;
}

// Block type for body prose given the active region. Tail regions reuse the
// existing non-extractable types: bibliography entries are `reference`; meta and
// appendix prose is `appendix` (the umbrella for non-body auxiliary sections).
function proseType(region: Region): SourceBlockType {
  switch (region) {
    case "references": return "reference";
    case "appendix":
    case "meta": return "appendix";
    case "abstract": return "abstract";
    case "body": return "paragraph";
  }
}

// A standalone HTML comment placeholder. Docling emits image and undecoded
// content as `<!-- image -->` / `<!-- formula-not-decoded -->` lines instead of
// marker's `![alt](file.jpg)`; both mean "non-teachable artifact stripped from
// the layout", so both become `figure_placeholder` and never reach an LLM stage.
const HTML_COMMENT_PLACEHOLDER = /^<!--.*-->$/;

// Block-level Markdown extractor. Tracks the heading path so every block knows
// its section context; maintains character offsets so
// evidence quotes resolve to a specific block, not the whole document.
export function extractMarkdownBlocks(text: string): SourceBlock[] {
  const lines = stripNullBytes(text).split("\n");
  const blocks: SourceBlock[] = [];
  const headingStack: { depth: number; title: string }[] = [];
  let blockIndex = 0;
  let offset = 0;
  let inCodeFence = false;
  let titleAssigned = false;
  let region: Region = "body";
  let buffer: string[] = [];
  let bufferStart = 0;
  let tableBuffer: string[] = [];
  let tableStart = 0;

  const headingPath = () => headingStack.map((entry) => entry.title);

  const flushParagraph = () => {
    const joined = buffer.join("\n").trim();
    if (joined) blocks.push(makeBlock(++blockIndex, proseType(region), joined, headingPath(), bufferStart));
    buffer = [];
  };

  const flushTable = () => {
    const joined = tableBuffer.join("\n").trim();
    if (joined) blocks.push(makeBlock(++blockIndex, "table_placeholder", joined, headingPath(), tableStart));
    tableBuffer = [];
  };

  for (const rawLine of lines) {
    const lineStart = offset;
    offset += rawLine.length + 1; // +1 for the consumed newline
    const line = rawLine;
    const trimmed = line.trim();

    // A table run ends as soon as a non-table line appears.
    if (tableBuffer.length && !/^\s*\|/.test(line)) flushTable();

    const fence = trimmed.startsWith("```");
    if (fence) {
      if (!inCodeFence) {
        flushParagraph();
        inCodeFence = true;
        buffer = [line];
        bufferStart = lineStart;
      } else {
        buffer.push(line);
        const code = buffer.join("\n").trim();
        // Body code is teachable (extractable); a fence inside a tail region
        // (references/appendix/meta) is typed like that region's prose so it
        // never reaches an LLM stage — datalab appendices quote prompt
        // templates as fenced code, which is not domain knowledge.
        const fenceType: SourceBlockType = region === "body" ? "code" : proseType(region);
        if (code) blocks.push(makeBlock(++blockIndex, fenceType, code, headingPath(), bufferStart));
        buffer = [];
        inCodeFence = false;
      }
      continue;
    }
    if (inCodeFence) {
      buffer.push(line);
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      const depth = heading[1].length;
      const title = heading[2].replace(/[*_`]/g, "").trim();
      while (headingStack.length && headingStack[headingStack.length - 1].depth >= depth) headingStack.pop();

      // Resolve the region this heading opens. Sticky tail regions are never
      // re-opened to body by an ordinary sub-heading (covers appendix prompt
      // templates); they only ever progress references -> appendix.
      const opened = regionForHeading(title);
      if (opened) region = opened;
      else if (region !== "references" && region !== "appendix") region = "body";

      let headingType: SourceBlockType = "heading";
      if (region === "references") headingType = "reference";
      else if (region === "appendix" || region === "meta") headingType = "appendix";
      if (!titleAssigned) { headingType = "title"; titleAssigned = true; }

      blocks.push(makeBlock(++blockIndex, headingType, title, headingPath(), lineStart));
      headingStack.push({ depth, title });
      continue;
    }

    // Standalone image line: datalab emits figures as `![alt](file.jpg)`;
    // Docling emits `<!-- image -->` / `<!-- formula-not-decoded -->`.
    if (/^!\[.*\]\(.*\)$/.test(trimmed) || HTML_COMMENT_PLACEHOLDER.test(trimmed)) {
      flushParagraph();
      blocks.push(makeBlock(++blockIndex, "figure_placeholder", trimmed, headingPath(), lineStart));
      continue;
    }

    // Figure/table caption prose (optionally bold), e.g. `**Figure 1: …**`.
    if (/^\*{0,2}(figure|table)\s+\d/i.test(trimmed)) {
      flushParagraph();
      blocks.push(makeBlock(++blockIndex, "caption", trimmed.replace(/^\*+|\*+$/g, "").trim(), headingPath(), lineStart));
      continue;
    }

    // Markdown table rows (including the `|---|` separator) collapse into one
    // placeholder block; the raw rows are retained for provenance only.
    if (/^\s*\|/.test(line)) {
      flushParagraph();
      if (tableBuffer.length === 0) tableStart = lineStart;
      tableBuffer.push(line);
      continue;
    }

    const listItem = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (listItem) {
      flushParagraph();
      // Body lists stay `list_item`; in tail/abstract regions a list line is
      // typed like prose (bibliography entries arrive as `- [1] …`).
      const type: SourceBlockType = region === "body" ? "list_item" : proseType(region);
      blocks.push(makeBlock(++blockIndex, type, listItem[2].trim(), headingPath(), lineStart));
      continue;
    }

    if (trimmed === "") {
      flushParagraph();
      continue;
    }

    if (buffer.length === 0) bufferStart = lineStart;
    buffer.push(line);
  }
  flushParagraph();
  flushTable();

  return blocks;
}

function makeBlock(index: number, blockType: SourceBlockType, text: string, headingPath: string[], characterStart: number): SourceBlock {
  return {
    blockId: `block-${index}`,
    blockType,
    text,
    headingPath,
    locator: { characterStart, characterEnd: characterStart + text.length }
  };
}
