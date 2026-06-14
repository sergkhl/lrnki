import { createHash } from "node:crypto";
import type { StructuredDocument } from "@lrnki/domain-core";
import type { StructuredDocumentParserPort } from "@lrnki/ports";
import { extractMarkdownBlocks } from "./markdownBlocks";

const PARSER_NAME = "native-markdown";
// Deterministic document-structure pass. The block-walking + region
// classification lives in the shared `extractMarkdownBlocks` so the Docling
// parser (PDF/DOCX/PPTX → Markdown) reuses the exact same contract. datalab/
// marker PDF→Markdown output is this parser's driver: bibliographies as list
// items, appendices that quote prompt templates with their own `#` headings (and
// fenced code), and triplicated figure alt-text — none of which is teachable.
const PARSER_VERSION = "1";

// Native Markdown parser front-end: decode bytes, delegate to the shared block
// extractor, and stamp provenance.
export class MarkdownStructuredDocumentParser implements StructuredDocumentParserPort {
  supports(contentType: string): boolean {
    return ["text/markdown", "text/x-markdown"].includes(contentType);
  }

  async parse(input: { sourceResourceId: string; bytes: Uint8Array; contentType: string }): Promise<StructuredDocument> {
    const text = new TextDecoder().decode(input.bytes);
    return {
      sourceResourceId: input.sourceResourceId,
      parserName: PARSER_NAME,
      parserVersion: PARSER_VERSION,
      parserConfigHash: createHash("sha256").update(`${PARSER_NAME}:${PARSER_VERSION}`).digest("hex"),
      blocks: extractMarkdownBlocks(text)
    };
  }
}
