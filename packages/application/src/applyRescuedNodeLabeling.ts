import type { SourceMentionedEnrichmentNode } from "@lrnki/domain-core";
import type { RescuedNodeLabelingPort } from "@lrnki/ports";
import { mapWithConcurrency } from "./mapWithConcurrency";

// Dedicated measured Rescued-Node Canonical Labeling step (TODO #1). A rescued
// `source_mentioned` node is labeled with the source sentence it was mentioned in, which
// reads as a proposition, not a concept name. This step re-names it to a concept-shaped
// label. It replaces the rescue durability judge's under-attended optional
// `canonicalLabelProposal` field with a SINGLE-objective call, run UNCONDITIONALLY over the
// domain's durable rescued nodes (no self-gate for the model to skip), BATCHED one call per
// Declared Domain (mirroring whole-set prerequisite ordering).
//
// It only PROPOSES: it never creates or drops a node. Adoption — the collision guard against
// the domain's taken labels, the alias demotion, the reservation update, and the disposition
// record — stays in `enrichmentNodeMinting`, so label authority stays single. This step FAILS
// OPEN (matching rescue durability): a transport/schema failure or an out-of-range index for a
// domain surfaces no proposals for that domain, keeping the original labels, never a throw.
export async function applyRescuedNodeLabeling(input: {
  // The KEPT durable rescued nodes (post durability judging), across all Declared Domains.
  rescuedNodes: SourceMentionedEnrichmentNode[];
  // The domain's already-claimed CANONICAL labels the model must not re-use (anchors, and any
  // other real concept names already in the domain). The rescued nodes being re-labeled are
  // intentionally NOT listed — a node may keep its own label, and same-call peers are shown
  // together so the model can pick distinct names; the deterministic guard in minting is the
  // final authority on collisions.
  takenLabelsByDomain: Map<string, string[]>;
  judge: RescuedNodeLabelingPort;
  // Bounded parallelism over Declared Domains (usually one domain per enrichment).
  concurrency?: number;
}): Promise<Map<string, string>> {
  const canonicalLabelProposalByNodeId = new Map<string, string>();

  // Group the kept nodes by Declared Domain, preserving encounter order so number → node
  // mapping by position is stable across a replayed run.
  const nodesByDomain = new Map<string, SourceMentionedEnrichmentNode[]>();
  for (const node of input.rescuedNodes) {
    const bucket = nodesByDomain.get(node.declaredDomain) ?? [];
    bucket.push(node);
    nodesByDomain.set(node.declaredDomain, bucket);
  }
  const domains = [...nodesByDomain.entries()];

  await mapWithConcurrency(domains, input.concurrency ?? domains.length, async ([declaredDomain, nodes]) => {
    let labeling;
    try {
      labeling = await input.judge.label({
        declaredDomain,
        nodes: nodes.map((node) => ({
          canonicalLabel: node.canonicalLabel,
          aliases: node.aliases,
          mentionQuotes: node.groundingPassages.map((passage) => passage.evidenceQuote).filter((quote) => quote.trim().length > 0)
        })),
        takenLabels: input.takenLabelsByDomain.get(declaredDomain) ?? []
      });
    } catch {
      // Fail OPEN: keep every original label in this domain (KTD3, rule 16 spirit).
      return;
    }
    // Map each number-cited label back to its node by position. The validator bounds
    // `nodeNumber` to [1, nodes.length]; a first-writer-wins guard keeps a duplicate number
    // from overwriting, and a missing number simply leaves that node's original label.
    for (const entry of labeling.labels) {
      const node = nodes[entry.nodeNumber - 1];
      if (!node || canonicalLabelProposalByNodeId.has(node.derivedNodeId)) continue;
      const proposal = entry.conceptLabel.trim();
      if (proposal.length > 0) canonicalLabelProposalByNodeId.set(node.derivedNodeId, proposal);
    }
  });

  return canonicalLabelProposalByNodeId;
}
