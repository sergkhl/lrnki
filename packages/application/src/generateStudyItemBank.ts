import { randomUUID } from "node:crypto";
import {
  evidenceQuoteMatches,
  STAGE_TAGS,
  type DerivedGraphNode,
  type GraphSnapshot,
  type OptionSelectItem,
  type PublishedConceptEvidenceProfile,
  type RejectedStudyItem,
  type SelfAssessmentItem,
  type StudyItem,
  type StudyItemCitation,
  type StudyItemGroundingProvenance
} from "@lrnki/domain-core";
import type { EnrichmentRunStorePort, GraphVersionStorePort, RunProgressReporterPort, StudyItemBankStorePort, StudyItemGenerationPort } from "@lrnki/ports";
import { mapWithConcurrency } from "./mapWithConcurrency";
import { NON_LLM_STAGES, noopRunProgressReporter } from "./runProgressReporter";
import { validateOptionSelectItem, type OptionSelectGrounding } from "./optionSelectGuard";
import { selectSiblingContext } from "./selectSiblingContext";

// Bounded concurrency for per-node study-item generation (plan U6/R11). Defaults to 1 so
// behavior is byte-identical to the prior sequential loop; raising it later parallelizes
// the seam without an architectural change. The per-node units are independent and the
// shared helper preserves input order, so the persisted item order is unchanged.
export const DEFAULT_STUDY_ITEM_CONCURRENCY = 1;

export type { RejectedStudyItem };

export type StudyItemBankGenerationResult = {
  graphVersionId: string;
  enrichmentId: string;
  studyItems: StudyItem[];
  rejected: RejectedStudyItem[];
};

// Study Item Bank generation (U5, R7/R12/R13, ADR-0026). For each Derived Graph Layer
// node, fan out over the enabled item types: (a) self-assessment — generate a recall card
// and verify its citations verbatim (exactly the prior card path), and (b) option-select —
// build sibling context, generate a grounded correct answer + sibling-flavored distractors,
// and run the deterministic guard. A node persists EVERY type that survives; supported
// types are therefore the implicit byproduct (KTD2). A node that yields NO item at all (no
// usable grounding) is recorded as a RejectedStudyItem; a node that grounds one type but
// not the other is NOT rejected — it simply lacks that type (R13). Generation failure on
// one type never aborts the other type or the run. Learner-neutral and regenerable; never
// touches the asserted graph or imports a graph/enrichment write port (R15).
export async function generateStudyItemBank(input: {
  enrichmentId: string;
  configHash: string;
  graphStore: GraphVersionStorePort;
  enrichmentStore: EnrichmentRunStorePort;
  studyItemGeneration: StudyItemGenerationPort;
  studyItemBankStore: StudyItemBankStorePort;
  newStudyItemId?: () => string;
  newOptionId?: () => string;
  // Parallel-ready seam (R11): bounded degree over the independent per-node units.
  // Defaults to 1 (sequential, unchanged behavior).
  concurrency?: number;
  // Run-progress reporter seam (R7). Study-item generation is its own operation_type
  // keyed by enrichmentId (ADR-0017 split). Absent → no-op (unchanged behavior).
  reporter?: RunProgressReporterPort;
}): Promise<StudyItemBankGenerationResult> {
  const newStudyItemId = input.newStudyItemId ?? randomUUID;
  const newOptionId = input.newOptionId ?? randomUUID;
  const reporter = input.reporter ?? noopRunProgressReporter;
  const operationId = input.enrichmentId;
  const layer = await input.enrichmentStore.getLayer(input.enrichmentId);
  if (!layer) throw new Error(`generateStudyItemBank: enrichment ${input.enrichmentId} was not found.`);
  const snapshot = await input.graphStore.getPublishedSnapshot(layer.graphVersionId);
  if (!snapshot) throw new Error(`generateStudyItemBank: graph version ${layer.graphVersionId} is not published.`);
  await reporter.beginOperation({ operationType: "study_items", operationId });

  const profileByConcept = new Map(snapshot.evidenceProfiles.map((profile) => [profile.conceptId, profile] as const));
  const studyItems: StudyItem[] = [];
  const rejected: RejectedStudyItem[] = [];

  // Each derived node is an independent generation unit (R11). Driving them through the
  // shared bounded mapper at degree 1 is identical to the prior sequential loop; the seam
  // admits future parallelism (raise `concurrency`) without an architectural change.
  // Study-item generation stage with a per-node heartbeat (R3): one progress write as
  // each derived node's items resolve, so a large bank shows N-of-M liveness.
  await reporter.enterStage({ operationId, stage: STAGE_TAGS.studyItemGeneration, total: layer.derivedNodes.length });
  let studyDone = 0;
  const generateForNode = async (node: DerivedGraphNode): Promise<{ items: StudyItem[]; rejected: RejectedStudyItem[] }> => {
    const items: StudyItem[] = [];
    const grounding = selectNodeGrounding(node, snapshot, profileByConcept);
    if (!grounding || grounding.passages.length === 0) {
      return { items, rejected: [{ derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, reason: "no usable grounding passages" }] };
    }

    let nodeHasItem = false;
    let selfAssessmentFailure: string | null = null;

    // (a) self-assessment — the calibration baseline; mirrors the prior card path exactly.
    try {
      const draft = await input.studyItemGeneration.generate({
        declaredDomain: node.declaredDomain,
        node: { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, aliases: node.aliases },
        groundingProvenance: grounding.provenance,
        groundingPassages: grounding.passages,
        definesLiteral: grounding.definesLiteral
      });
      const verified = verifyCitations(draft.citations, grounding, node.derivedNodeId);
      if (verified.length > 0) {
        const item: SelfAssessmentItem = {
          itemType: "self_assessment",
          studyItemId: newStudyItemId(),
          graphVersionId: layer.graphVersionId,
          enrichmentId: layer.enrichmentId,
          derivedNodeId: node.derivedNodeId,
          groundingProvenance: grounding.provenance,
          generatingModel: input.studyItemGeneration.model,
          configHash: input.configHash,
          question: draft.question,
          answerKey: draft.answerKey,
          selfReportPrompt: draft.selfReportPrompt,
          citations: verified
        };
        items.push(item);
        nodeHasItem = true;
      } else {
        selfAssessmentFailure = "unverifiable answer-key citation";
      }
    } catch (error) {
      selfAssessmentFailure = `self-assessment generation failed: ${error instanceof Error ? error.message : String(error)}`;
    }

    // (b) option-select — auto-graded studying. Generation/guard failure drops only this
    // type (cardless-for-studying, R13); it never rejects the node or aborts the run.
    try {
      const siblings = selectSiblingContext(node, layer).map((sibling) => ({ label: sibling.label, snippet: sibling.snippet }));
      const draft = await input.studyItemGeneration.generateOptionSelect({
        declaredDomain: node.declaredDomain,
        node: { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, aliases: node.aliases },
        groundingProvenance: grounding.provenance,
        groundingPassages: grounding.passages,
        siblings
      });
      const guardContext: OptionSelectGrounding = {
        studyItemId: newStudyItemId(),
        graphVersionId: layer.graphVersionId,
        enrichmentId: layer.enrichmentId,
        derivedNodeId: node.derivedNodeId,
        groundingProvenance: grounding.provenance,
        generatingModel: input.studyItemGeneration.model,
        configHash: input.configHash,
        passages: grounding.passages
      };
      const guarded = validateOptionSelectItem(draft, guardContext, newOptionId);
      if (guarded.ok) {
        const item: OptionSelectItem = guarded.item;
        items.push(item);
        nodeHasItem = true;
      }
    } catch {
      // option-select dropped; the node falls back to self-assessment-only / cardless.
    }

    if (!nodeHasItem) {
      return {
        items,
        rejected: [{
          derivedNodeId: node.derivedNodeId,
          canonicalLabel: node.canonicalLabel,
          reason: selfAssessmentFailure ?? "no study item could be grounded"
        }]
      };
    }
    return { items, rejected: [] };
  };
  const perNode = await mapWithConcurrency(layer.derivedNodes, input.concurrency ?? DEFAULT_STUDY_ITEM_CONCURRENCY, async (node) => {
    const result = await generateForNode(node);
    studyDone += 1;
    await reporter.recordProgress({ operationId, stage: STAGE_TAGS.studyItemGeneration, done: studyDone });
    return result;
  });
  await reporter.completeStage({ operationId, stage: STAGE_TAGS.studyItemGeneration, ok: true });

  // Flatten per-node results in input order so the persisted item/rejected order is
  // deterministic and unchanged from the prior sequential path.
  for (const result of perNode) {
    studyItems.push(...result.items);
    rejected.push(...result.rejected);
  }

  await reporter.enterStage({ operationId, stage: NON_LLM_STAGES.persist });
  await input.studyItemBankStore.persist({
    graphVersionId: layer.graphVersionId,
    enrichmentId: layer.enrichmentId,
    configHash: input.configHash,
    studyItems,
    rejected
  });
  await reporter.completeStage({ operationId, stage: NON_LLM_STAGES.persist, ok: true });
  await reporter.completeOperation({ operationId, status: "succeeded" });
  return { graphVersionId: layer.graphVersionId, enrichmentId: layer.enrichmentId, studyItems, rejected };
}

// Verify each draft citation verbatim against its cited grounding passage and resolve
// provenance from the matched passage (fail-closed, AGENTS rule 6). Returns the verified
// citations; an empty result means none verified and the draft must be rejected.
function verifyCitations(
  citations: { passageId: string; evidenceQuote: string }[],
  grounding: NodeGrounding,
  derivedNodeId: string
): StudyItemCitation[] {
  const verified: StudyItemCitation[] = [];
  for (const citation of citations) {
    const match = grounding.passages.find(
      (passage) => passage.passageId === citation.passageId && evidenceQuoteMatches(passage.text, citation.evidenceQuote)
    );
    if (!match) return [];
    if ("sourceResourceId" in match) {
      verified.push({ provenance: "source", sourceResourceId: match.sourceResourceId, sourceBlockId: match.sourceBlockId, evidenceQuote: citation.evidenceQuote });
    } else {
      verified.push({ provenance: "generated", derivedNodeId, passageText: citation.evidenceQuote });
    }
  }
  return verified;
}

type GroundingPassage =
  | { passageId: string; kind: "definition" | "mention"; text: string; sourceResourceId: string; sourceBlockId: string }
  | { passageId: string; kind: "definition" | "mention"; text: string; derivedNodeId: string };

type NodeGrounding = {
  provenance: StudyItemGroundingProvenance;
  passages: GroundingPassage[];
  definesLiteral: string | null;
};

function selectNodeGrounding(
  node: DerivedGraphNode,
  snapshot: GraphSnapshot,
  profileByConcept: Map<string, PublishedConceptEvidenceProfile>
): NodeGrounding | undefined {
  if (node.nodeKind === "anchor") {
    const profile = profileByConcept.get(node.conceptId);
    const passages: GroundingPassage[] = [
      ...(profile?.definitions ?? []).map((passage) => ({
        passageId: passage.sourceBlockId,
        kind: "definition" as const,
        text: passage.evidenceQuote,
        sourceResourceId: passage.sourceResourceId,
        sourceBlockId: passage.sourceBlockId
      })),
      ...(profile?.mentions ?? []).map((passage) => ({
        passageId: passage.sourceBlockId,
        kind: "mention" as const,
        text: passage.evidenceQuote,
        sourceResourceId: passage.sourceResourceId,
        sourceBlockId: passage.sourceBlockId
      }))
    ];
    return {
      provenance: "source_cep",
      passages,
      definesLiteral: profile?.assertions.find((assertion) => assertion.type === "defines")?.literalValue ?? null
    };
  }

  if (node.groundingOrigin === "source_mentioned") {
    return {
      provenance: "source_mentioned",
      passages: node.groundingPassages
        .filter((passage) => passage.verbatimCheck.disposition === "verified")
        .map((passage) => ({
          passageId: passage.sourceBlockId,
          kind: passage.passageType,
          text: passage.evidenceQuote,
          sourceResourceId: passage.sourceResourceId,
          sourceBlockId: passage.sourceBlockId
        })),
      definesLiteral: null
    };
  }

  const generated = [
    ...node.groundingBundle.definitions.map((passage, index) => ({ passage, kind: "definition" as const, index })),
    ...node.groundingBundle.mentions.map((passage, index) => ({ passage, kind: "mention" as const, index }))
  ];
  return {
    provenance: "generated",
    passages: generated.map(({ passage, kind, index }) => ({
      passageId: `${node.derivedNodeId}:${kind}:${index}`,
      kind,
      text: passage.text,
      derivedNodeId: node.derivedNodeId
    })),
    definesLiteral: node.groundingBundle.definitions[0]?.text ?? null
  };
}
