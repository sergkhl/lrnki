import { evidenceQuoteMatches } from "@lrnki/domain-core";
import type { RescueDisposition, SourceMentionedEnrichmentNode } from "@lrnki/domain-core";
import type { RescueDurabilityJudgmentPort } from "@lrnki/ports";

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
}): Promise<{ keptNodes: SourceMentionedEnrichmentNode[]; dispositions: RescueDisposition[] }> {
  const dispositions = new Array<RescueDisposition>(input.rescuedNodes.length);
  await mapWithConcurrency(input.rescuedNodes, input.concurrency ?? 4, async (node, index) => {
    // The node's OWN verbatim mention evidence — the only text a confident drop may
    // be grounded in (so the judge cannot veto on text absent from the candidate).
    const mentionQuotes = node.groundingPassages
      .map((passage) => passage.evidenceQuote)
      .filter((quote) => quote.trim().length > 0);
    const anchors = input.anchorsByDomain.get(node.declaredDomain) ?? [];
    try {
      const judgment = await input.judge.judge({
        declaredDomain: node.declaredDomain,
        candidate: { canonicalLabel: node.canonicalLabel, aliases: node.aliases, mentionQuotes },
        anchors
      });
      if (judgment.verdict === "not_durable") {
        const span = judgment.groundingSpan.trim();
        const grounded = span.length > 0 && mentionQuotes.some((quote) => evidenceQuoteMatches(quote, span));
        dispositions[index] = grounded
          ? record(node, "dropped", judgment.rationale, span)
          : record(node, "kept_judge_unavailable", `${judgment.rationale} [ungrounded not_durable verdict kept]`, "");
      } else {
        dispositions[index] = record(node, "accepted", judgment.rationale, "");
      }
    } catch {
      // Fail OPEN (KTD3): a judge transport failure or schema-invalid response keeps
      // the node and stays inspectable rather than turning the judge into a fragile
      // hard veto.
      dispositions[index] = record(node, "kept_judge_unavailable", "rescue durability judge unavailable", "");
    }
  });
  const dropped = new Set(
    dispositions.filter((disposition) => disposition.disposition === "dropped").map((disposition) => disposition.derivedNodeId)
  );
  const keptNodes = input.rescuedNodes.filter((node) => !dropped.has(node.derivedNodeId));
  return { keptNodes, dispositions };
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

async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}
