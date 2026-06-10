import type { EvidenceReference, StructuredDocument } from "@lrnki/domain-core";

export function verifyEvidenceQuote(document: StructuredDocument, evidence: EvidenceReference): boolean {
  if (document.sourceResourceId !== evidence.sourceResourceId) return false;
  const block = document.blocks.find((candidate) => candidate.blockId === evidence.sourceBlockId);
  return block?.text.includes(evidence.evidenceQuote) ?? false;
}
