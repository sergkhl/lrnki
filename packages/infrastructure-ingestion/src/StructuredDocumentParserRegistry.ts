import type { StructuredDocumentParserPort } from "@lrnki/ports";

export class StructuredDocumentParserRegistry {
  constructor(private readonly parsers: StructuredDocumentParserPort[]) {}
  parserFor(contentType: string): StructuredDocumentParserPort {
    const parser = this.parsers.find((candidate) => candidate.supports(contentType));
    if (!parser) throw new Error(`No structured-document parser registered for ${contentType}.`);
    return parser;
  }
}
