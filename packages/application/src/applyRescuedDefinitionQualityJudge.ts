import type {
  DefinitionPassageDisposition,
  EnrichmentNode,
  SourceMentionedEnrichmentNode,
  SourceMentionGroundingPassage
} from "@lrnki/domain-core";
import type { DefinitionPassageQualityJudgmentPort } from "@lrnki/ports";
import { gateByJudgment } from "./gateByJudgment";

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

  // The Measured Judge Gate (rule 16, gateByJudgment) owns the control flow. `skip`
  // is the pre-filter (R6): a non-`source_mentioned` node (`llm_grounded`: generated
  // grounding, no source quote) or one carrying no `definition`-typed passage passes
  // through untouched with no neural call. `onVerdict` drops only vetoed definition
  // passages (preserving order and every mention, and object identity when nothing
  // drops); `onUnavailable` keeps every passage flagged `kept_judge_unavailable` so a
  // transport blip never shrinks the rescued surface (fail closed = preserve recall).
  const judged = await gateByJudgment(input.nodes, {
    concurrency: input.concurrency,
    skip: (node) =>
      definitionPassagesOf(node).length === 0 ? { node, dispositions: [] as DefinitionPassageDisposition[] } : undefined,
    judge: (node) =>
      input.judge.judgeDefinitions({
        declaredDomain: node.declaredDomain,
        subject: { canonicalLabel: node.canonicalLabel, aliases: node.aliases },
        passages: definitionPassagesOf(node).map((passage) => ({
          sourceBlockId: passage.sourceBlockId,
          evidenceQuote: passage.evidenceQuote,
          blockType: "paragraph",
          headingPath: passage.headingPath
        }))
      }),
    onVerdict: (node, verdicts) => {
      // `skip` guarantees only source_mentioned nodes reach here; this guard re-narrows
      // the union for TypeScript (it is never the deciding branch — that is `skip`).
      if (node.groundingOrigin !== "source_mentioned") return { node, dispositions: [] as DefinitionPassageDisposition[] };
      const definitionPassages = node.groundingPassages.filter((passage) => passage.passageType === "definition");
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
    },
    onUnavailable: (node) => ({
      node,
      dispositions: definitionPassagesOf(node).map((passage) =>
        dispositionFor(node.derivedNodeId, passage, "kept_judge_unavailable", "establishes_meaning", "judge transport failure: passage kept")
      )
    })
  });

  const nodes = judged.map((result) => {
    dispositions.push(...result.dispositions);
    return result.node;
  });

  return { nodes, dispositions };
}

// The node's `definition`-typed grounding passages — the only passages this judge may
// veto. A non-`source_mentioned` node (no source quote to judge) yields none, so an
// empty result is the gate's whole pre-filter signal (R6).
function definitionPassagesOf(node: EnrichmentNode): SourceMentionGroundingPassage[] {
  if (node.groundingOrigin !== "source_mentioned") return [];
  return node.groundingPassages.filter((passage) => passage.passageType === "definition");
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
