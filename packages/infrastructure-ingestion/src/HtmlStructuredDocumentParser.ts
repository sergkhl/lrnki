import { createHash } from "node:crypto";
import type { SourceBlock, SourceBlockType, StructuredDocument } from "@lrnki/domain-core";
import type { StructuredDocumentParserPort } from "@lrnki/ports";

const PARSER_NAME = "native-html";
const PARSER_VERSION = "1";

// Native HTML block extractor for curated article content (Gate 1). Splits
// block-level elements (headings, paragraphs, list items, figure captions) into
// separate source blocks with a tracked heading path, so evidence quotes resolve
// to one block rather than the whole page. Docling-based parsing is deferred to
// Gate 2; this expects pre-curated <main>-style content, not a raw SPA shell.
const BLOCK_TAGS: Record<string, SourceBlockType> = {
  h1: "heading", h2: "heading", h3: "heading", h4: "heading", h5: "heading", h6: "heading",
  p: "paragraph",
  li: "list_item",
  figcaption: "caption",
  caption: "caption"
};

export class HtmlStructuredDocumentParser implements StructuredDocumentParserPort {
  supports(contentType: string): boolean {
    return ["text/html", "application/xhtml+xml"].includes(contentType);
  }

  async parse(input: { sourceResourceId: string; bytes: Uint8Array; contentType: string }): Promise<StructuredDocument> {
    let html = new TextDecoder().decode(input.bytes);
    html = html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ");
    const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? html;

    const blocks: SourceBlock[] = [];
    const headingStack: { depth: number; title: string }[] = [];
    let blockIndex = 0;

    const tagRegex = /<(h[1-6]|p|li|figcaption|caption)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(body)) !== null) {
      const tag = match[1].toLowerCase();
      const blockType = BLOCK_TAGS[tag];
      const text = stripTags(match[2]);
      if (!text) continue;
      const characterStart = match.index;

      if (blockType === "heading") {
        const depth = Number(tag[1]);
        while (headingStack.length && headingStack[headingStack.length - 1].depth >= depth) headingStack.pop();
        blocks.push(makeBlock(++blockIndex, "heading", text, headingStack.map((entry) => entry.title), characterStart));
        headingStack.push({ depth, title: text });
        continue;
      }
      blocks.push(makeBlock(++blockIndex, blockType, text, headingStack.map((entry) => entry.title), characterStart));
    }

    return {
      sourceResourceId: input.sourceResourceId,
      parserName: PARSER_NAME,
      parserVersion: PARSER_VERSION,
      parserConfigHash: createHash("sha256").update(`${PARSER_NAME}:${PARSER_VERSION}`).digest("hex"),
      blocks
    };
  }
}

function stripTags(fragment: string): string {
  return decodeEntities(fragment.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function makeBlock(index: number, blockType: SourceBlockType, text: string, headingPath: string[], characterStart: number): SourceBlock {
  return {
    blockId: `block-${index}`,
    blockType,
    text,
    headingPath,
    locator: { characterStart, characterEnd: characterStart + text.length, xpath: undefined }
  };
}
