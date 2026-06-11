import { evidenceQuoteMatches, type EvidenceReference, type StructuredDocument } from "@lrnki/domain-core";

export function verifyEvidenceQuote(document: StructuredDocument, evidence: EvidenceReference): boolean {
  if (document.sourceResourceId !== evidence.sourceResourceId) return false;
  const block = document.blocks.find((candidate) => candidate.blockId === evidence.sourceBlockId);
  return block ? evidenceQuoteMatches(block.text, evidence.evidenceQuote) : false;
}
