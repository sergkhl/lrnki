import { evidenceQuoteMatches } from "@lrnki/domain-core";
import type { EnrichmentNode, GroundingVerbatimDisposition, SourceMentionGroundingPassage } from "@lrnki/domain-core";

// Per-passage verbatim floor by provenance (U6, KTD4, R9, AE3). The deterministic
// floor (`evidenceQuoteMatches`) is a legitimate hard gate ONLY for a passage that
// claims a source quote — so it still hard-vetoes every `source_mentioned` rescue
// passage whose quote does not verify against its cited block (AGENTS rule 16 intact).
// A `llm_grounded` generated passage has no source quote to verify, so it is exempt —
// but the exemption is RECORDED as an explicit `not_applicable_by_grounding`
// disposition keyed to the node, never a silent skip.
//
// `blockTextById` maps a source block id to its verbatim text (carried from the
// rescue read). A source_mentioned node whose passages all fail verification is
// dropped (failed), so it never enters the derived layer on bad evidence; one with
// at least one verified passage is kept with only its verified passages.
export function applyVerbatimFloorByGrounding(input: {
  nodes: EnrichmentNode[];
  blockTextById: Map<string, string>;
}): { nodes: EnrichmentNode[]; dispositions: GroundingVerbatimDisposition[] } {
  const kept: EnrichmentNode[] = [];
  const dispositions: GroundingVerbatimDisposition[] = [];

  for (const node of input.nodes) {
    if (node.groundingOrigin === "llm_grounded") {
      // Generated grounding: exempt, exemption recorded (never silent).
      kept.push(node);
      dispositions.push({
        derivedNodeId: node.derivedNodeId,
        groundingOrigin: "llm_grounded",
        outcome: "not_applicable_by_grounding",
        rationale: "generated grounding has no cited source block to verify"
      });
      continue;
    }

    // source_mentioned: each passage asserts a verifiable source claim — hard gate it.
    const verified: SourceMentionGroundingPassage[] = [];
    for (const passage of node.groundingPassages) {
      const blockText = input.blockTextById.get(passage.sourceBlockId);
      const matches = blockText !== undefined && evidenceQuoteMatches(blockText, passage.evidenceQuote);
      if (matches) {
        verified.push({ ...passage, verbatimCheck: { disposition: "verified", sourceResourceId: passage.sourceResourceId, sourceBlockId: passage.sourceBlockId } });
      }
    }
    if (verified.length === 0) {
      // No passage verifies — the rescue node has no admissible evidence; drop it.
      dispositions.push({
        derivedNodeId: node.derivedNodeId,
        groundingOrigin: "source_mentioned",
        outcome: "failed",
        rationale: "no source_mentioned passage verified verbatim against its cited block"
      });
      continue;
    }
    kept.push({ ...node, groundingPassages: verified });
    dispositions.push({
      derivedNodeId: node.derivedNodeId,
      groundingOrigin: "source_mentioned",
      outcome: "verified",
      rationale: `${verified.length} source_mentioned passage(s) verified verbatim`
    });
  }

  return { nodes: kept, dispositions };
}
