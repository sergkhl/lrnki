import { evidenceQuoteMatches } from "@lrnki/domain-core";
import type { RescueDisposition, SourceMentionedEnrichmentNode } from "@lrnki/domain-core";
import type { RescueDurabilityJudgmentPort } from "@lrnki/ports";
import { gateByJudgment } from "./gateByJudgment";

// Measured rescue durability stage (U3, KTD3/KTD4). Runs AFTER mention dedupe/merge
// so the judge sees a candidate's full aggregated evidence, and BEFORE any derived
// `source_mentioned` node enters the graph. Each candidate is judged against the
// same-domain anchors it would scaffold; the judge may only DROP, never create a
// node. It mirrors `applyAdmissionLabelJudge`'s rule-16 discipline, but its goal is
// PRECISION over noise rather than recall, so it fails OPEN: on a transport failure,
// invalid tool args, or a `not_durable` verdict whose grounding span is not in the
// candidate's own mention evidence, the node is KEPT and flagged
// `kept_judge_unavailable` — never silently vetoed.
export async function applyRescueDurabilityJudge(input: {
  rescuedNodes: SourceMentionedEnrichmentNode[];
  // Same-domain anchors (label + verbatim definition quotes) the candidate would
  // scaffold, keyed by Declared Domain. A node whose domain has no anchors is judged
  // against an empty anchor set (still answerable: "is this a durable concept?").
  anchorsByDomain: Map<string, { canonicalLabel: string; definitionQuotes: string[] }[]>;
  judge: RescueDurabilityJudgmentPort;
  concurrency?: number;
}): Promise<{ keptNodes: SourceMentionedEnrichmentNode[]; dispositions: RescueDisposition[]; canonicalLabelProposalByNodeId: Map<string, string> }> {
  // Concept-shaped canonical label proposals from `durable` verdicts (R12, U8), keyed by node
  // id. The minting stage owns adoption (collision check against the domain's taken labels +
  // reservation update); this stage only surfaces the proposal so that authority stays single.
  const canonicalLabelProposalByNodeId = new Map<string, string>();
  // The `RescueDisposition[]` IS the gate's index-aligned outcome array (rule 16,
  // gateByJudgment). `onVerdict` carries the confident-verdict branch — including the
  // grounding-span refinement that downgrades a `not_durable` verdict whose span is not
  // in the candidate's own mentions back to `kept_judge_unavailable` (the judge cannot
  // veto on text absent from the candidate). `onUnavailable` fails OPEN (KTD3): a
  // transport failure or schema-invalid response keeps the node, inspectable, rather
  // than turning the judge into a fragile hard veto.
  const dispositions = await gateByJudgment(input.rescuedNodes, {
    concurrency: input.concurrency,
    judge: (node) =>
      input.judge.judge({
        declaredDomain: node.declaredDomain,
        candidate: { canonicalLabel: node.canonicalLabel, aliases: node.aliases, mentionQuotes: mentionQuotesOf(node) },
        anchors: input.anchorsByDomain.get(node.declaredDomain) ?? []
      }),
    onVerdict: (node, judgment) => {
      if (judgment.verdict !== "not_durable") {
        // A durable node may carry a concept-shaped re-label proposal; surface it for minting.
        const proposal = judgment.canonicalLabelProposal?.trim();
        if (proposal) canonicalLabelProposalByNodeId.set(node.derivedNodeId, proposal);
        return record(node, "accepted", judgment.rationale, "");
      }
      const span = judgment.groundingSpan.trim();
      const grounded = span.length > 0 && mentionQuotesOf(node).some((quote) => evidenceQuoteMatches(quote, span));
      return grounded
        ? record(node, "dropped", judgment.rationale, span)
        : record(node, "kept_judge_unavailable", `${judgment.rationale} [ungrounded not_durable verdict kept]`, "");
    },
    onUnavailable: (node) => record(node, "kept_judge_unavailable", "rescue durability judge unavailable", "")
  });
  const dropped = new Set(
    dispositions.filter((disposition) => disposition.disposition === "dropped").map((disposition) => disposition.derivedNodeId)
  );
  const keptNodes = input.rescuedNodes.filter((node) => !dropped.has(node.derivedNodeId));
  return { keptNodes, dispositions, canonicalLabelProposalByNodeId };
}

// The node's OWN verbatim mention evidence — the only text a confident drop may be
// grounded in (so the judge cannot veto on text absent from the candidate).
function mentionQuotesOf(node: SourceMentionedEnrichmentNode): string[] {
  return node.groundingPassages
    .map((passage) => passage.evidenceQuote)
    .filter((quote) => quote.trim().length > 0);
}

function record(
  node: SourceMentionedEnrichmentNode,
  disposition: RescueDisposition["disposition"],
  rationale: string,
  groundingSpan: string
): RescueDisposition {
  return {
    derivedNodeId: node.derivedNodeId,
    canonicalLabel: node.canonicalLabel,
    normalizedLabel: node.normalizedLabel,
    declaredDomain: node.declaredDomain,
    disposition,
    rationale: rationale.trim(),
    groundingSpan
  };
}
