import { normalizeConceptLabel, type RescueDisposition, type SourceMentionedEnrichmentNode } from "@lrnki/domain-core";
import type { AdmissionLabelJudgmentPort } from "@lrnki/ports";
import { gateByJudgment } from "./gateByJudgment";

export const RESCUE_CARRIER_ADMISSION_POLICY =
  "registered_title_collision_drop_then_grounded_carrier_judge_before_relabel_fail_operation_on_unavailable_v2";

// Source-carrier admission for aggregated `source_mentioned` rescue candidates.
//
// This is the rescue-boundary counterpart to extraction's concept-label judgment:
// the same grounded semantic classifier sees the candidate's original label, its
// verbatim passages, registered Curated Source titles, and heading paths BEFORE any
// canonical re-labeling can transfer a carrier's contents to a newly invented subject
// label. It decides the established carrier-versus-referent problem class; equality
// with a source title or heading is context for the neural verdict, never a lexical
// hard veto (AGENTS rule 16).
//
// An exact normalized collision with a registered source title is a typed identity
// conflict, not a semantic guess: Source Registration declares that string as the
// carrier's title, while rescue would reuse the same identity as a learner concept.
// The precision-first namespace refuses that ambiguous identity without a neural call;
// a genuinely taught concept remains free to enter under a separately admitted label.
// This is not a fixture-word heuristic and does not claim that identical wording can
// never denote a concept outside this rescue candidate.
//
// Otherwise, only a grounded `source_artifact` verdict drops here. A proposition verdict stays
// available to the existing Rescued-Node Canonical Labeling step, whose sole purpose is
// to turn sentence-shaped mentions into concept-shaped labels. Transport/schema
// unavailability FAILS the enclosing enrichment: precision-first rescue must not
// publish a potential carrier merely because its semantic gate could not run.
export async function applyRescueCarrierAdmissionJudge(input: {
  rescuedNodes: SourceMentionedEnrichmentNode[];
  sourceCarrierLabelsByNodeId: ReadonlyMap<string, ReadonlySet<string>>;
  judge: AdmissionLabelJudgmentPort;
  concurrency?: number;
}): Promise<{ keptNodes: SourceMentionedEnrichmentNode[]; dispositions: RescueDisposition[] }> {
  const dispositions = await gateByJudgment(input.rescuedNodes, {
    concurrency: input.concurrency,
    skip: (node) => {
      const collision = [...(input.sourceCarrierLabelsByNodeId.get(node.derivedNodeId) ?? [])]
        .find((label) => normalizeConceptLabel(label) === node.normalizedLabel);
      return collision
        ? record(
            node,
            "dropped",
            `registered_source_title_identity_collision: ${JSON.stringify(collision)} is the Curated Source carrier title and cannot be reused as a source-mentioned learner-concept identity`,
            collision
          )
        : undefined;
    },
    judge: (node) =>
      input.judge.judge({
        declaredDomain: node.declaredDomain,
        label: node.canonicalLabel,
        aliases: node.aliases,
        evidenceQuotes: unique(node.groundingPassages.map((passage) => passage.evidenceQuote)),
        sourceCarrierLabels: unique(input.sourceCarrierLabelsByNodeId.get(node.derivedNodeId) ?? []),
        evidenceContexts: node.groundingPassages.map((passage) => ({
          evidenceQuote: passage.evidenceQuote,
          headingPath: passage.headingPath,
          passageType: passage.passageType
        }))
      }),
    onVerdict: (node, judgment) =>
      judgment.labelKind === "source_artifact"
        ? record(node, "dropped", `source_artifact: ${judgment.rationale}`, judgment.groundingSpan)
        : record(node, "accepted", `not_source_artifact (${judgment.labelKind}): ${judgment.rationale}`, ""),
    onUnavailable: (_node, error) => {
      throw error;
    }
  });
  const droppedIds = new Set(
    dispositions
      .filter((disposition) => disposition.disposition === "dropped")
      .map((disposition) => disposition.derivedNodeId)
  );
  return {
    keptNodes: input.rescuedNodes.filter((node) => !droppedIds.has(node.derivedNodeId)),
    dispositions
  };
}

function unique(values: Iterable<string>): string[] {
  return [...new Set([...values].map((value) => value.trim()).filter((value) => value.length > 0))];
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
    groundingSpan: groundingSpan.trim()
  };
}
