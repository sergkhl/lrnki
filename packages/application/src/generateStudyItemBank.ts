import { randomUUID } from "node:crypto";
import {
  STAGE_TAGS,
  type ConceptLesson,
  type DerivedGraphNode,
  type LessonAbsentNode,
  type RejectedStudyItem,
  type StudyItem
} from "@lrnki/domain-core";
import { runWithOperationTag } from "@lrnki/domain-core/operation-tag-context";
import type { ConceptLessonGenerationPort, ConceptLessonStorePort, EnrichmentRunStorePort, GraphVersionStorePort, RunProgressReporterPort, StudyItemBankStorePort, StudyItemGenerationPort } from "@lrnki/ports";
import { mapWithConcurrency } from "./mapWithConcurrency";
import { bracketStage, NON_LLM_STAGES, noopRunProgressReporter } from "./runProgressReporter";
import { validateOptionSelectItem, type OptionSelectGrounding } from "./optionSelectGuard";
import { selectSiblingContext } from "./selectSiblingContext";
import { selectNodeGrounding, type GroundingPassage } from "./selectNodeGrounding";
import { selectLessonNeighborhood } from "./selectLessonNeighborhood";
import { assembleConceptLesson } from "./assembleConceptLesson";

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
  // The Concept Lesson substrate produced in the same pass (ADR-0031). Option-select derives
  // FROM these lessons (U7); lesson-absent nodes carry the reason the operator surface shows.
  lessons: ConceptLesson[];
  lessonAbsent: LessonAbsentNode[];
};

// Study Item Bank generation (U5, R7/R12/R13, ADR-0026) + Concept Lesson generation
// (ADR-0031). For each Derived Graph Layer node this runs two stages in one operation: first
// a Concept Lesson stage (generate a grounded teaching lesson, verify citations verbatim,
// enforce the minimum, persist as the learner-neutral substrate), then an option-select stage
// (a grounded correct answer + sibling-flavored distractors through the deterministic guard).
// A node that yields no lesson is recorded lesson-absent; a node that yields no item is a
// RejectedStudyItem with the exact reason. Learner-neutral and regenerable; never touches the
// asserted graph or imports a graph/enrichment write port (R9).
export async function generateStudyItemBank(input: {
  enrichmentId: string;
  configHash: string;
  graphStore: GraphVersionStorePort;
  enrichmentStore: EnrichmentRunStorePort;
  conceptLessonGeneration: ConceptLessonGenerationPort;
  conceptLessonStore: ConceptLessonStorePort;
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

  // --- Stage 1: Concept Lesson substrate (ADR-0031) -----------------------------
  // Generate one teaching lesson per node BEFORE the option-select stage. The lesson is the
  // single source of grounding; option-select derives from it (U7). A node whose grounding is
  // entirely unusable, or whose draft cannot meet the R3 minimum, is recorded lesson-absent.
  let lessonDone = 0;
  const generateLessonForNode = async (node: DerivedGraphNode): Promise<{ lesson?: ConceptLesson; absent?: LessonAbsentNode }> => {
    const grounding = selectNodeGrounding(node, snapshot, profileByConcept);
    if (!grounding || grounding.passages.length === 0) {
      return { absent: { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, reason: "no usable grounding passages" } };
    }
    try {
      const neighbors = selectLessonNeighborhood(node, layer);
      const draft = await input.conceptLessonGeneration.generate({
        declaredDomain: node.declaredDomain,
        node: { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, aliases: node.aliases },
        groundingProvenance: grounding.provenance,
        groundingPassages: grounding.passages,
        neighbors
      });
      const assembled = assembleConceptLesson({
        node: { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, graphVersionId: layer.graphVersionId, enrichmentId: layer.enrichmentId },
        generatingModel: input.conceptLessonGeneration.model,
        configHash: input.configHash,
        grounding,
        draft
      });
      return assembled.kind === "lesson" ? { lesson: assembled.lesson } : { absent: assembled.absent };
    } catch (error) {
      return { absent: { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, reason: `concept-lesson generation failed: ${error instanceof Error ? error.message : String(error)}` } };
    }
  };
  const perNodeLessons = await studyStage(
    STAGE_TAGS.conceptLessonGeneration,
    () =>
      mapWithConcurrency(layer.derivedNodes, input.concurrency ?? DEFAULT_STUDY_ITEM_CONCURRENCY, async (node) => {
        const result = await generateLessonForNode(node);
        lessonDone += 1;
        await reporter.recordProgress({ operationType: "study_items", operationId, stage: STAGE_TAGS.conceptLessonGeneration, done: lessonDone });
        return result;
      }),
    layer.derivedNodes.length
  );

  const lessons: ConceptLesson[] = [];
  const lessonAbsent: LessonAbsentNode[] = [];
  // Lessons keyed by node so the option-select stage derives its grounding from the in-memory
  // lesson rather than re-reading raw passages (U7, rule 18).
  const lessonByNode = new Map<string, ConceptLesson>();
  for (const result of perNodeLessons) {
    if (result.lesson) { lessons.push(result.lesson); lessonByNode.set(result.lesson.derivedNodeId, result.lesson); }
    if (result.absent) lessonAbsent.push(result.absent);
  }

  await studyStage(NON_LLM_STAGES.persist, () =>
    input.conceptLessonStore.persist({
      graphVersionId: layer.graphVersionId,
      enrichmentId: layer.enrichmentId,
      configHash: input.configHash,
      lessons,
      absent: lessonAbsent
    })
  );

  // --- Stage 2: option-select items ---------------------------------------------
  // Each derived node is an independent generation unit (R11). Driving them through the
  // shared bounded mapper at degree 1 is identical to the prior sequential loop; the seam
  // admits future parallelism (raise `concurrency`) without an architectural change.
  // Study-item generation stage with a per-node heartbeat: one progress write as
  // each derived node's items resolve, so a large bank shows N-of-M liveness.
  let studyDone = 0;
  const generateForNode = async (node: DerivedGraphNode): Promise<{ items: StudyItem[]; rejected: RejectedStudyItem[] }> => {
    // Option-select derives FROM the Concept Lesson, never from raw passages (R10, rule 18).
    // A lesson-absent node yields no item; the verbatim chain holds because the lesson's
    // source citations already verified against source blocks (U6), so the guard re-anchors
    // to the same source text.
    const lesson = lessonByNode.get(node.derivedNodeId);
    if (!lesson) {
      return { items: [], rejected: [{ derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, reason: "no option-select item: concept lesson is absent for this node" }] };
    }
    const grounding = optionSelectGroundingFromLesson(lesson);
    if (!grounding) {
      return { items: [], rejected: [{ derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, reason: "no option-select item: the lesson has no grounded sections to anchor an item" }] };
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
  return { graphVersionId: layer.graphVersionId, enrichmentId: layer.enrichmentId, studyItems, rejected, lessons, lessonAbsent };
  });
}

// Derive option-select grounding from a Concept Lesson's CITED sections (U7, R10, rule 18).
// Only sections that carry a citation can anchor an option's verbatim trace; synthesized
// sections (gist/intuition/applications) are teaching prose, not grounding. The lesson's
// source citations already verified against source blocks (U6), so the guard re-anchors to
// the same source text. Provenance reflects the lesson's source sections (source_cep /
// source_mentioned) or `generated` for a minted node whose lesson is wholly generated.
// Returns null when the lesson has no grounded section to anchor an item.
function optionSelectGroundingFromLesson(lesson: ConceptLesson): { provenance: "source_cep" | "source_mentioned" | "generated"; passages: GroundingPassage[] } | null {
  const passages: GroundingPassage[] = [];
  let sourceProvenance: "source_cep" | "source_mentioned" | null = null;
  for (const section of lesson.sections) {
    if (!section.citation) continue;
    const passageKind: "definition" | "mention" = section.kind === "definition" ? "definition" : "mention";
    if (section.citation.provenance === "source") {
      passages.push({
        passageId: section.citation.sourceBlockId,
        kind: passageKind,
        text: section.citation.evidenceQuote,
        sourceResourceId: section.citation.sourceResourceId,
        sourceBlockId: section.citation.sourceBlockId
      });
      if (!sourceProvenance && (section.groundingProvenance === "source_cep" || section.groundingProvenance === "source_mentioned")) {
        sourceProvenance = section.groundingProvenance;
      }
    } else {
      passages.push({
        passageId: `${lesson.derivedNodeId}:${section.kind}`,
        kind: passageKind,
        text: section.citation.passageText,
        derivedNodeId: section.citation.derivedNodeId
      });
    }
  }
  if (passages.length === 0) return null;
  return { provenance: sourceProvenance ?? "generated", passages };
}
