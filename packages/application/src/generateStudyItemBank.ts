import { randomUUID } from "node:crypto";
import {
  STAGE_TAGS,
  type DerivedGraphNode,
  type GraphSnapshot,
  type PublishedConceptEvidenceProfile,
  type RejectedStudyItem,
  type StudyItem,
  type StudyItemGroundingProvenance
} from "@lrnki/domain-core";
import { runWithOperationTag } from "@lrnki/domain-core/operation-tag-context";
import type { EnrichmentRunStorePort, GraphVersionStorePort, RunProgressReporterPort, StudyItemBankStorePort, StudyItemGenerationPort } from "@lrnki/ports";
import { mapWithConcurrency } from "./mapWithConcurrency";
import { bracketStage, NON_LLM_STAGES, noopRunProgressReporter } from "./runProgressReporter";
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
// node, generate one option-select item: build sibling context, generate a grounded
// correct answer + sibling-flavored distractors, and run the deterministic guard.
// A node that yields no item is recorded as a RejectedStudyItem with the exact reason.
// Learner-neutral and regenerable; never touches the asserted graph or imports a
// graph/enrichment write port (R15).
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
  // Run-progress reporter seam (ADR-0029). Study-item generation is its own operation_type
  // keyed by enrichmentId (ADR-0017 split). Absent → no-op (unchanged behavior).
  reporter?: RunProgressReporterPort;
}): Promise<StudyItemBankGenerationResult> {
  const newStudyItemId = input.newStudyItemId ?? randomUUID;
  const newOptionId = input.newOptionId ?? randomUUID;
  const reporter = input.reporter ?? noopRunProgressReporter;
  const operationId = input.enrichmentId;
  return runWithOperationTag(operationId, async () => {
  const layer = await input.enrichmentStore.getLayer(input.enrichmentId);
  if (!layer) throw new Error(`generateStudyItemBank: enrichment ${input.enrichmentId} was not found.`);
  const snapshot = await input.graphStore.getPublishedSnapshot(layer.graphVersionId);
  if (!snapshot) throw new Error(`generateStudyItemBank: graph version ${layer.graphVersionId} is not published.`);
  await reporter.beginOperation({ operationType: "study_items", operationId });
  // A thrown stage (e.g. a failed persist) closes the stage ok:false, marks the
  // operation `failed`, and propagates — the same single-source failure semantics
  // extraction/enrichment use, rather than stranding a permanent `running` row.
  const studyStage = bracketStage(reporter, "study_items", operationId);

  const profileByConcept = new Map(snapshot.evidenceProfiles.map((profile) => [profile.conceptId, profile] as const));
  const studyItems: StudyItem[] = [];
  const rejected: RejectedStudyItem[] = [];

  // Each derived node is an independent generation unit (R11). Driving them through the
  // shared bounded mapper at degree 1 is identical to the prior sequential loop; the seam
  // admits future parallelism (raise `concurrency`) without an architectural change.
  // Study-item generation stage with a per-node heartbeat: one progress write as
  // each derived node's items resolve, so a large bank shows N-of-M liveness.
  let studyDone = 0;
  const generateForNode = async (node: DerivedGraphNode): Promise<{ items: StudyItem[]; rejected: RejectedStudyItem[] }> => {
    const grounding = selectNodeGrounding(node, snapshot, profileByConcept);
    if (!grounding || grounding.passages.length === 0) {
      return { items: [], rejected: [{ derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, reason: "no usable grounding passages" }] };
    }

    let failureReason: string | null = null;

    // Option-select — auto-graded studying. Generation/guard failure rejects this node
    // for the bank but never aborts the run.
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
        return { items: [guarded.item], rejected: [] };
      } else {
        failureReason = guarded.reason;
      }
    } catch (error) {
      failureReason = `option-select generation failed: ${error instanceof Error ? error.message : String(error)}`;
    }

    return {
      items: [],
      rejected: [{
        derivedNodeId: node.derivedNodeId,
        canonicalLabel: node.canonicalLabel,
        reason: failureReason ?? "no study item could be grounded"
      }]
    };
  };
  const perNode = await studyStage(
    STAGE_TAGS.studyItemGeneration,
    () =>
      mapWithConcurrency(layer.derivedNodes, input.concurrency ?? DEFAULT_STUDY_ITEM_CONCURRENCY, async (node) => {
        const result = await generateForNode(node);
        studyDone += 1;
        await reporter.recordProgress({ operationType: "study_items", operationId, stage: STAGE_TAGS.studyItemGeneration, done: studyDone });
        return result;
      }),
    layer.derivedNodes.length
  );

  // Flatten per-node results in input order so the persisted item/rejected order is
  // deterministic and unchanged from the prior sequential path.
  for (const result of perNode) {
    studyItems.push(...result.items);
    rejected.push(...result.rejected);
  }

  await studyStage(NON_LLM_STAGES.persist, () =>
    input.studyItemBankStore.persist({
      graphVersionId: layer.graphVersionId,
      enrichmentId: layer.enrichmentId,
      configHash: input.configHash,
      studyItems,
      rejected
    })
  );
  await reporter.completeOperation({ operationType: "study_items", operationId, status: "succeeded" });
  return { graphVersionId: layer.graphVersionId, enrichmentId: layer.enrichmentId, studyItems, rejected };
  });
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
