import { createHash } from "node:crypto";
import { stripNullBytes, type SourceBlock, type SourceBlockType, type StructuredDocument } from "@lrnki/domain-core";
import type { StructuredDocumentParserPort } from "@lrnki/ports";

const PARSER_NAME = "native-text";
const PARSER_VERSION = "1";

// Native plaintext parser. No markup to lean on, so headings are detected
// heuristically (short ALL-CAPS lines, e.g. "CHAPTER I." / "OF THE DIVISION OF
// LABOUR.") and a two-level heading path is tracked. Long prose paragraphs are
// split on blank lines; each block keeps character offsets for evidence locators.
export class TextStructuredDocumentParser implements StructuredDocumentParserPort {
  supports(contentType: string): boolean {
    return ["text/plain"].includes(contentType);
  }

  async parse(input: { sourceResourceId: string; bytes: Uint8Array; contentType: string }): Promise<StructuredDocument> {
    const text = stripNullBytes(new TextDecoder().decode(input.bytes));
    const blocks: SourceBlock[] = [];
    const headingStack: string[] = [];
    let blockIndex = 0;

    // Walk paragraph segments separated by blank lines, tracking absolute offsets.
    const segmentRegex = /\n\s*\n/g;
    let cursor = 0;
    let match: RegExpExecArray | null;
    const pushSegment = (segment: string, start: number) => {
      const trimmed = segment.trim();
      if (!trimmed) return;
      const leading = segment.length - segment.trimStart().length;
      const blockStart = start + leading;
      if (isHeading(trimmed)) {
        // Chapter-level (CHAPTER ...) resets; a section title nests under it.
        if (/^(BOOK|CHAPTER|PART)\b/i.test(trimmed)) headingStack.length = 0;
        else if (headingStack.length > 1) headingStack.length = 1;
        blocks.push(makeBlock(++blockIndex, "heading", normalize(trimmed), [...headingStack], blockStart));
        headingStack.push(normalize(trimmed));
        return;
      }
      blocks.push(makeBlock(++blockIndex, "paragraph", normalize(trimmed), [...headingStack], blockStart));
    };

    while ((match = segmentRegex.exec(text)) !== null) {
      pushSegment(text.slice(cursor, match.index), cursor);
      cursor = match.index + match[0].length;
    }
    pushSegment(text.slice(cursor), cursor);

    return {
      sourceResourceId: input.sourceResourceId,
      parserName: PARSER_NAME,
      parserVersion: PARSER_VERSION,
      parserConfigHash: createHash("sha256").update(`${PARSER_NAME}:${PARSER_VERSION}`).digest("hex"),
      blocks
    };
  }
}

// A heading is a short single-or-double line that is predominantly uppercase.
function isHeading(segment: string): boolean {
  const lines = segment.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length > 2) return false;
  const joined = lines.join(" ");
  if (joined.length > 80) return false;
  const letters = joined.replace(/[^A-Za-z]/g, "");
  if (letters.length < 3) return false;
  const upper = joined.replace(/[^A-Z]/g, "");
  return upper.length / letters.length >= 0.85;
}

function normalize(segment: string): string {
  return segment.split("\n").map((line) => line.trim()).join(" ").replace(/\s+/g, " ").trim();
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
