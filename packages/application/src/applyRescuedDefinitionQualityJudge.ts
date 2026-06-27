import type {
  DefinitionPassageDisposition,
  DefinitionPassageQualityJudgment,
  EnrichmentNode,
  SourceMentionedEnrichmentNode,
  SourceMentionGroundingPassage
} from "@lrnki/domain-core";
import type { DefinitionPassageQualityJudgmentPort } from "@lrnki/ports";

// Rescue-seam Definition-Passage quality stage (plan 2026-06-26-001 U3, ADR-0007). Runs
// at the rescue seam in `runGraphEnrichment` AFTER the verbatim floor (so it only judges
// the verified passages that actually reach learners) and BEFORE rescued nodes become
// study-item grounding. It closes the gap that the extraction-time judge
// (`applyDefinitionPassageQualityJudge`) left open: that judge gates `core` profiles only,
// but the rescue seam now carries `optional` definition-bearing candidates to learners as
// `source_mentioned` study-item passages typed `definition` — previously never
// definitional-adequacy-judged. The rescue durability judge judges concept durability and
// fails open; it is NOT a definitional gate.
//
// Same independent meaning judge (`kg-independent-judge`), same drop-only / index-aligned
// discipline, and the SAME fail-CLOSED-as-preserve semantics as the extraction-time judge
// (rule 16): a transport blip KEEPS every passage flagged `kept_judge_unavailable`, never
// shrinking the rescued surface on a model outage. It only DROPS a `definition`-typed
// passage vetoed as hollow; `mention` passages are NEVER touched, and `llm_grounded`
// nodes (generated grounding, no source quote) pass through untouched. A node whose
// definitions all veto is retained MENTION-ONLY — dropping the node is the rescue
// durability judge's decision, not this one's. The cited block's `blockType` is not
// carried on a rescued passage, so it is passed as the neutral `paragraph` default; the
// judge treats blockType as non-deciding context (rule 16) and judges the text's meaning.
export async function applyRescuedDefinitionQualityJudge(input: {
  nodes: EnrichmentNode[];
  judge: DefinitionPassageQualityJudgmentPort;
  concurrency?: number;
}): Promise<{ nodes: EnrichmentNode[]; dispositions: DefinitionPassageDisposition[] }> {
  const dispositions: DefinitionPassageDisposition[] = [];

  const judged = await mapWithConcurrency(input.nodes, input.concurrency ?? 4, async (node) => {
    if (node.groundingOrigin !== "source_mentioned") return { node, dispositions: [] as DefinitionPassageDisposition[] };
    const definitionPassages = node.groundingPassages.filter((passage) => passage.passageType === "definition");
    if (definitionPassages.length === 0) return { node, dispositions: [] as DefinitionPassageDisposition[] };

    let verdicts: DefinitionPassageQualityJudgment[] | undefined;
    try {
      verdicts = await input.judge.judgeDefinitions({
        declaredDomain: node.declaredDomain,
        subject: { canonicalLabel: node.canonicalLabel, aliases: node.aliases },
        passages: definitionPassages.map((passage) => ({
          sourceBlockId: passage.sourceBlockId,
          evidenceQuote: passage.evidenceQuote,
          blockType: "paragraph",
          headingPath: passage.headingPath
        }))
      });
    } catch {
      // Fail closed = preserve recall: keep every passage, flag it (rule 16).
      return {
        node,
        dispositions: definitionPassages.map((passage) =>
          dispositionFor(node.derivedNodeId, passage, "kept_judge_unavailable", "establishes_meaning", "judge transport failure: passage kept")
        )
      };
    }

    const vetoedBlockIds = new Set<string>();
    const nodeDispositions: DefinitionPassageDisposition[] = [];
    definitionPassages.forEach((passage, index) => {
      const verdict = verdicts?.[index];
      if (!verdict || verdict.establishesMeaning) {
        nodeDispositions.push(dispositionFor(node.derivedNodeId, passage, "kept", "establishes_meaning", verdict?.rationale ?? "no verdict: passage kept"));
      } else {
        vetoedBlockIds.add(passage.sourceBlockId);
        nodeDispositions.push(dispositionFor(node.derivedNodeId, passage, "vetoed", verdict.category, verdict.rationale));
      }
    });

    if (vetoedBlockIds.size === 0) return { node, dispositions: nodeDispositions };
    // Drop only the vetoed definition passages, preserving order and every mention.
    const survivors = node.groundingPassages.filter(
      (passage) => passage.passageType !== "definition" || !vetoedBlockIds.has(passage.sourceBlockId)
    );
    const next: SourceMentionedEnrichmentNode = { ...node, groundingPassages: survivors };
    return { node: next, dispositions: nodeDispositions };
  });

  const nodes = judged.map((result) => {
    dispositions.push(...result.dispositions);
    return result.node;
  });

  return { nodes, dispositions };
}

function dispositionFor(
  derivedNodeId: string,
  passage: SourceMentionGroundingPassage,
  disposition: DefinitionPassageDisposition["disposition"],
  category: DefinitionPassageDisposition["category"],
  rationale: string
): DefinitionPassageDisposition {
  // `candidateKey` carries the derived node id at the rescue seam (the rescued node is the
  // subject here, not an admission candidate); the rest mirrors the extraction-time judge.
  return { candidateKey: derivedNodeId, sourceBlockId: passage.sourceBlockId, evidenceQuote: passage.evidenceQuote, disposition, category, rationale };
}

async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) || 1 }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
