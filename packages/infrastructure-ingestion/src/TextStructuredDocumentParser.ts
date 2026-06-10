import { createHash } from "node:crypto";
import type { StructuredDocumentParserPort } from "@lrnki/ports";

export class TextStructuredDocumentParser implements StructuredDocumentParserPort {
  supports(contentType: string): boolean { return ["text/plain", "text/markdown", "text/x-markdown"].includes(contentType); }
  async parse(input: { sourceResourceId: string; bytes: Uint8Array; contentType: string }) {
    const text = new TextDecoder().decode(input.bytes);
    const paragraphs = text.split(/\n\s*\n/g).map((part) => part.trim()).filter(Boolean);
    return {
      sourceResourceId: input.sourceResourceId,
      parserName: "native-text",
      parserVersion: "1",
      parserConfigHash: createHash("sha256").update(input.contentType).digest("hex"),
      blocks: paragraphs.map((paragraph, index) => ({ blockId: `block-${index + 1}`, blockType: "paragraph" as const, text: paragraph, headingPath: [], locator: {} }))
    };
  }
}
