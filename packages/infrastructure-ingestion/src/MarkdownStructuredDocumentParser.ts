import { createHash } from "node:crypto";
import type { SourceBlock, SourceBlockType, StructuredDocument } from "@lrnki/domain-core";
import type { StructuredDocumentParserPort } from "@lrnki/ports";

const PARSER_NAME = "native-markdown";
const PARSER_VERSION = "1";

// Native Markdown block extractor. Tracks the heading path so every block knows
// its section context (concept-first plan §3); maintains character offsets so
// evidence quotes resolve to a specific block, not the whole document.
export class MarkdownStructuredDocumentParser implements StructuredDocumentParserPort {
  supports(contentType: string): boolean {
    return ["text/markdown", "text/x-markdown"].includes(contentType);
  }

  async parse(input: { sourceResourceId: string; bytes: Uint8Array; contentType: string }): Promise<StructuredDocument> {
    const text = new TextDecoder().decode(input.bytes);
    const lines = text.split("\n");
    const blocks: SourceBlock[] = [];
    const headingStack: { depth: number; title: string }[] = [];
    let blockIndex = 0;
    let offset = 0;
    let inCodeFence = false;
    let buffer: string[] = [];
    let bufferStart = 0;

    const headingPath = () => headingStack.map((entry) => entry.title);

    const flushParagraph = () => {
      const joined = buffer.join("\n").trim();
      if (joined) {
        blocks.push(makeBlock(++blockIndex, "paragraph", joined, headingPath(), bufferStart));
      }
      buffer = [];
    };

    for (const rawLine of lines) {
      const lineStart = offset;
      offset += rawLine.length + 1; // +1 for the consumed newline
      const line = rawLine;

      const fence = line.trim().startsWith("```");
      if (fence) {
        if (!inCodeFence) {
          flushParagraph();
          inCodeFence = true;
          buffer = [line];
          bufferStart = lineStart;
        } else {
          buffer.push(line);
          const code = buffer.join("\n").trim();
          if (code) blocks.push(makeBlock(++blockIndex, "code", code, headingPath(), bufferStart));
          buffer = [];
          inCodeFence = false;
        }
        continue;
      }
      if (inCodeFence) {
        buffer.push(line);
        continue;
      }

      const heading = /^(#{1,6})\s+(.*)$/.exec(line.trim());
      if (heading) {
        flushParagraph();
        const depth = heading[1].length;
        const title = heading[2].replace(/[*_`]/g, "").trim();
        while (headingStack.length && headingStack[headingStack.length - 1].depth >= depth) headingStack.pop();
        blocks.push(makeBlock(++blockIndex, "heading", title, headingPath(), lineStart));
        headingStack.push({ depth, title });
        continue;
      }

      const listItem = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(line);
      if (listItem) {
        flushParagraph();
        blocks.push(makeBlock(++blockIndex, "list_item", listItem[2].trim(), headingPath(), lineStart));
        continue;
      }

      if (line.trim() === "") {
        flushParagraph();
        continue;
      }

      if (buffer.length === 0) bufferStart = lineStart;
      buffer.push(line);
    }
    flushParagraph();

    return {
      sourceResourceId: input.sourceResourceId,
      parserName: PARSER_NAME,
      parserVersion: PARSER_VERSION,
      parserConfigHash: createHash("sha256").update(`${PARSER_NAME}:${PARSER_VERSION}`).digest("hex"),
      blocks
    };
  }
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
