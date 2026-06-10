import { createHash } from "node:crypto";
import type { StructuredDocumentParserPort } from "@lrnki/ports";

export class HtmlStructuredDocumentParser implements StructuredDocumentParserPort {
  supports(contentType: string): boolean { return ["text/html", "application/xhtml+xml"].includes(contentType); }
  async parse(input: { sourceResourceId: string; bytes: Uint8Array; contentType: string }) {
    const html = new TextDecoder().decode(input.bytes);
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return {
      sourceResourceId: input.sourceResourceId,
      parserName: "native-html-scaffold",
      parserVersion: "1",
      parserConfigHash: createHash("sha256").update(input.contentType).digest("hex"),
      blocks: text ? [{ blockId: "block-1", blockType: "paragraph" as const, text, headingPath: [], locator: {} }] : []
    };
  }
}
