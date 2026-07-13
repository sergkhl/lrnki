import { randomUUID } from "node:crypto";
import {
  STAGE_TAGS,
  type ConceptLesson,
  type ConceptLessonRedundancyJudgment,
  type ConceptLessonSectionKind,
  type DerivedGraphNode,
  type LessonAbsentNode,
  type RejectedStudyItem,
  type StudyItem,
  type StudyItemBlueprint,
  type StudyItemType
} from "@lrnki/domain-core";
import type {
  ConceptLessonGenerationPort,
  ConceptLessonRedundancyJudgmentPort,
  ConceptLessonStorePort,
  EnrichmentLayerPurposeStorePort,
  EnrichmentRunStorePort,
  GraphVersionStorePort,
  ImpostorLieValidityJudgmentPort,
  LayerPurposeGenerationPort,
  RunProgressReporterPort,
  StudyItemBlueprintPort,
  StudyItemBankStorePort,
  StudyItemGenerationPort
} from "@lrnki/ports";
import { mapWithConcurrency } from "./mapWithConcurrency";
import { NON_LLM_STAGES, noopRunProgressReporter, runInstrumentedOperation } from "./runProgressReporter";
import { validateOptionSelectItem, type OptionSelectGrounding } from "./optionSelectGuard";
import { validateImpostorItem, type ImpostorGrounding } from "./impostorGuard";
import { validateMatchingItem, type MatchingGrounding } from "./matchingGuard";
import { selectSiblingContext } from "./selectSiblingContext";
import { selectNodeGrounding, type GroundingPassage } from "./selectNodeGrounding";
import { selectLessonNeighborhood } from "./selectLessonNeighborhood";
import { assembleConceptLesson, SUBSTANTIVE_KINDS } from "./assembleConceptLesson";

// Bounded concurrency for independent per-node study-item generation. Degree 4 matches
// the synthetic generation concept fan-out while mapWithConcurrency keeps persisted
// outputs in input order.
export const DEFAULT_STUDY_ITEM_CONCURRENCY = 4;
export const OPTION_SELECT_GENERATION_ATTEMPTS = 2;
export const MATCHING_GENERATION_ATTEMPTS = 2;
export const IMPOSTOR_GENERATION_ATTEMPTS = 2;
const SUPPORTED_STUDY_ITEM_TYPES: StudyItemType[] = ["option_select", "matching", "impostor"];

export type { RejectedStudyItem };

export type StudyItemBankGenerationResult = {
  graphVersionId: string | null;
  enrichmentId: string;
  studyItems: StudyItem[];
  rejected: RejectedStudyItem[];
  // The Concept Lesson substrate produced in the same pass (ADR-0031). Option-select derives
  // FROM these lessons (U7); lesson-absent nodes carry the reason the operator surface shows.
  lessons: ConceptLesson[];
  lessonAbsent: LessonAbsentNode[];
};

// Study Item Bank generation (U5, R7/R12/R13, ADR-0026) + Concept Lesson generation
// (ADR-0031). For each Derived Graph Layer node this runs three stages in one operation:
// first a Concept Lesson stage (generate a grounded teaching lesson, verify citations
// verbatim, enforce the minimum, persist as the learner-neutral substrate), then an
// option-select stage (a grounded correct answer + sibling-flavored distractors through the
// deterministic guard), then an impostor stage (three lesson-grounded truths + one
// sibling-or-generated lie through the impostor guard). Both item stages derive from the one
// lesson substrate (rule 18). A node that yields no lesson is recorded lesson-absent; a node
// that yields no item of a type is a RejectedStudyItem keyed by item type with the exact
// reason. Learner-neutral and regenerable; never touches the asserted graph or imports a
// graph/enrichment write port (R9).
export async function generateStudyItemBank(input: {
  enrichmentId: string;
  configHash: string;
  graphStore: GraphVersionStorePort;
  enrichmentStore: EnrichmentRunStorePort;
  conceptLessonGeneration: ConceptLessonGenerationPort;
  conceptLessonRedundancyJudge?: ConceptLessonRedundancyJudgmentPort;
  // Layer-purpose generation (plan 2026-07-10-001 U1): one call per bank producing the
  // enrichment's plain-register capability statement. Both optional so existing callers
  // compose an unchanged bank; absent either, the stage is skipped and surfaces fall back
  // to the mechanical template.
  layerPurposeGeneration?: LayerPurposeGenerationPort;
  layerPurposeStore?: EnrichmentLayerPurposeStorePort;
  studyItemBlueprint?: StudyItemBlueprintPort;
  impostorLieValidityJudge: ImpostorLieValidityJudgmentPort;
  conceptLessonStore: ConceptLessonStorePort;
  studyItemGeneration: StudyItemGenerationPort;
  studyItemBankStore: StudyItemBankStorePort;
  newStudyItemId?: () => string;
  newOptionId?: () => string;
  newPairId?: () => string;
  newStatementId?: () => string;
  // Bounded degree over the independent per-node units. The default is intentionally
  // parallel; tests and mapWithConcurrency preserve deterministic output order.
  concurrency?: number;
  // Run-progress reporter seam (ADR-0029). Study-item generation is its own operation_type
  // keyed by enrichmentId (ADR-0017 split). Absent → no-op (unchanged behavior).
  reporter?: RunProgressReporterPort;
}): Promise<StudyItemBankGenerationResult> {
  const newStudyItemId = input.newStudyItemId ?? randomUUID;
  const newOptionId = input.newOptionId ?? randomUUID;
  const newPairId = input.newPairId ?? randomUUID;
  const newStatementId = input.newStatementId ?? randomUUID;
  const reporter = input.reporter ?? noopRunProgressReporter;
  const operationId = input.enrichmentId;
  return runInstrumentedOperation(reporter, "study_items", operationId, async (studyStage) => {
    const { layer, graphVersionId, snapshot } = await studyStage(NON_LLM_STAGES.load, async () => {
      const layer = await input.enrichmentStore.getLayer(input.enrichmentId);
      if (!layer) throw new Error(`generateStudyItemBank: enrichment ${input.enrichmentId} was not found.`);
      // A synthetic (versionless) layer reads no published snapshot: every synthetic node is
      // `llm_grounded` and self-grounds from its Grounding Bundle (selectNodeGrounding never
      // touches the snapshot for a non-anchor node), so an EMPTY snapshot is sufficient and the
      // null version threads through persistence unchanged (U7, KTD6). A source-derived layer
      // still requires its published snapshot for anchor grounding.
      const graphVersionId = layer.graphVersionId;
      const snapshot = graphVersionId === null
        ? { graphVersionId: "", baseGraphVersionId: null, concepts: [], evidenceProfiles: [] }
        : await input.graphStore.getPublishedSnapshot(graphVersionId);
      if (!snapshot) throw new Error(`generateStudyItemBank: graph version ${graphVersionId} is not published.`);
      return { layer, graphVersionId, snapshot };
  });

  // --- Layer-purpose stage (plan 2026-07-10-001 U1) ------------------------------
  // One call per bank; a failure closes the stage ok:false (operator-visible outcome via
  // the bracket's error detail) and writes no row, but NEVER fails the bank — every
  // surface renders the mechanical template for an enrichment without a purpose row.
  if (input.layerPurposeGeneration && input.layerPurposeStore) {
    const purposeGeneration = input.layerPurposeGeneration;
    const purposeStore = input.layerPurposeStore;
    try {
      await studyStage(STAGE_TAGS.layerPurposeGeneration, async () => {
        const purpose = await purposeGeneration.generate({
          declaredDomain: layer.derivedNodes[0]?.declaredDomain ?? "",
          conceptLabels: layer.derivedNodes.map((node) => node.canonicalLabel)
        });
        await purposeStore.persist({ enrichmentId: layer.enrichmentId, purpose });
      });
    } catch {
      // Stage outcome already recorded by the bracket; the bank continues purpose-less.
    }
  }

  const profileByConcept = new Map(snapshot.evidenceProfiles.map((profile) => [profile.conceptId, profile] as const));
  const studyItems: StudyItem[] = [];
  const rejectedByNodeType = new Map<string, RejectedStudyItem>();
  const reject = (node: Pick<DerivedGraphNode, "derivedNodeId" | "canonicalLabel">, itemType: StudyItemType, reason: string) => {
    rejectedByNodeType.set(`${node.derivedNodeId}:${itemType}`, { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, itemType, reason });
  };

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
      const initialDraft = await input.conceptLessonGeneration.generate({
        declaredDomain: node.declaredDomain,
        node: { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, aliases: node.aliases },
        groundingProvenance: grounding.provenance,
        groundingPassages: grounding.passages,
        neighbors
      });
      let assembled = assembleConceptLesson({
        node: { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, graphVersionId: graphVersionId, enrichmentId: layer.enrichmentId },
        generatingModel: input.conceptLessonGeneration.model,
        configHash: input.configHash,
        grounding,
        draft: initialDraft
      });
      let activeRedundancy: ConceptLessonRedundancyJudgment[] = [];
      if (assembled.kind === "lesson") activeRedundancy = await judgeLessonRedundancy(input.conceptLessonRedundancyJudge, node, assembled.lesson);
      if (shouldRetryLesson(node, assembled.kind === "lesson" ? assembled.lesson : undefined) || redundantNonSubstantiveKinds(activeRedundancy).length > 0) {
        const retryDraft = await input.conceptLessonGeneration.generate({
          declaredDomain: node.declaredDomain,
          node: { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, aliases: node.aliases },
          groundingProvenance: grounding.provenance,
          groundingPassages: grounding.passages,
          neighbors,
          retryFeedback: [
            lessonRetryFeedback(assembled.kind === "lesson" ? assembled.lesson : undefined),
            redundancyRetryFeedback(activeRedundancy)
          ].filter(Boolean).join(" ")
        });
        const retryAssembled = assembleConceptLesson({
          node: { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, graphVersionId: graphVersionId, enrichmentId: layer.enrichmentId },
          generatingModel: input.conceptLessonGeneration.model,
          configHash: input.configHash,
          grounding,
          draft: retryDraft
        });
        let retryRedundancy: ConceptLessonRedundancyJudgment[] = [];
        if (retryAssembled.kind === "lesson") {
          retryRedundancy = await judgeLessonRedundancy(input.conceptLessonRedundancyJudge, node, retryAssembled.lesson);
          retryAssembled.lesson = dropRedundantNonSubstantiveSections(retryAssembled.lesson, retryRedundancy);
        }
        if (retryAssembled.kind === "lesson" && (node.groundingOrigin === "llm_grounded" || hasVerifiedSubstantiveSourceCitation(retryAssembled.lesson) || assembled.kind !== "lesson")) {
          assembled = retryAssembled;
          activeRedundancy = retryRedundancy;
        }
      }
      if (assembled.kind === "lesson") assembled.lesson = dropRedundantNonSubstantiveSections(assembled.lesson, activeRedundancy);
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
  // One sibling-context computation per node, shared by every downstream stage (blueprint,
  // option-select, matching, impostor) instead of each stage re-scanning the full layer.
  const siblingsByNode = new Map<string, { label: string; snippet: string }[]>(
    layer.derivedNodes.map((node) => [
      node.derivedNodeId,
      selectSiblingContext(node, layer).map((sibling) => ({ label: sibling.label, snippet: sibling.snippet }))
    ])
  );

  await studyStage(NON_LLM_STAGES.persist, () =>
    input.conceptLessonStore.persist({
      graphVersionId: graphVersionId,
      enrichmentId: layer.enrichmentId,
      configHash: input.configHash,
      lessons,
      absent: lessonAbsent
    })
  );

  // --- Stage 2: item blueprint --------------------------------------------------
  const fallbackBlueprint = (node: DerivedGraphNode, lesson: ConceptLesson | undefined): StudyItemBlueprint =>
    structuralPreGateBlueprint(node, lesson);
  let blueprintDone = 0;
  const blueprintByNode = new Map<string, StudyItemBlueprint>();
  const blueprintResults = await studyStage(
    STAGE_TAGS.studyItemBlueprint,
    () =>
      mapWithConcurrency(layer.derivedNodes, input.concurrency ?? DEFAULT_STUDY_ITEM_CONCURRENCY, async (node) => {
        const lesson = lessonByNode.get(node.derivedNodeId);
        if (!lesson) {
          blueprintDone += 1;
          await reporter.recordProgress({ operationType: "study_items", operationId, stage: STAGE_TAGS.studyItemBlueprint, done: blueprintDone });
          return fallbackBlueprint(node, lesson);
        }
        const preGate = structuralPreGateBlueprint(node, lesson);
        try {
          const siblings = siblingsByNode.get(node.derivedNodeId) ?? [];
          if (!input.studyItemBlueprint) return preGate;
          const planned = await input.studyItemBlueprint.plan({
            declaredDomain: node.declaredDomain,
            node: { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, aliases: node.aliases },
            lesson,
            siblings,
            supportedItemTypes: SUPPORTED_STUDY_ITEM_TYPES
          });
          return applyStructuralPreGate(normalizeBlueprint(planned, node), preGate);
        } catch {
          return preGate;
        } finally {
          blueprintDone += 1;
          await reporter.recordProgress({ operationType: "study_items", operationId, stage: STAGE_TAGS.studyItemBlueprint, done: blueprintDone });
        }
      }),
    layer.derivedNodes.length
  );
  for (const blueprint of blueprintResults) {
    blueprintByNode.set(blueprint.derivedNodeId, blueprint);
    const node = layer.derivedNodes.find((candidate) => candidate.derivedNodeId === blueprint.derivedNodeId);
    if (!node) continue;
    for (const plan of blueprint.typePlans) {
      if (!plan.generate) reject(node, plan.itemType, `blueprint: ${plan.reason}`);
    }
  }

  // --- Stage 3: option-select items ---------------------------------------------
  // Each derived node is an independent generation unit. Driving them through the
  // shared bounded mapper parallelizes wall-clock without changing persisted order.
  // Study-item generation stage with a per-node heartbeat: one progress write as
  // each derived node's items resolve, so a large bank shows N-of-M liveness.
  let studyDone = 0;
  const generateForNode = async (node: DerivedGraphNode): Promise<{ items: StudyItem[]; rejected: RejectedStudyItem[] }> => {
    const typePlan = typePlanFor(blueprintByNode, node, "option_select");
    if (!typePlan.generate) return { items: [], rejected: [] };
    // Option-select derives FROM the Concept Lesson, never from raw passages (R10, rule 18).
    // A lesson-absent node yields no item; the verbatim chain holds because the lesson's
    // source citations already verified against source blocks (U6), so the guard re-anchors
    // to the same source text.
    const lesson = lessonByNode.get(node.derivedNodeId);
    if (!lesson) {
      return { items: [], rejected: [{ derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, itemType: "option_select", reason: "no option-select item: concept lesson is absent for this node" }] };
    }
    const grounding = studyItemGroundingFromLesson(lesson);
    if (!grounding) {
      return { items: [], rejected: [{ derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, itemType: "option_select", reason: "no option-select item: the lesson has no grounded sections to anchor an item" }] };
    }

    let failureReason: string | null = null;

    // Option-select — auto-graded studying. Generation/guard failure rejects this node
    // for the bank but never aborts the run. Citation guard failures are model-output
    // quality misses, so give the generator one fresh attempt before recording absence.
    const siblings = siblingsByNode.get(node.derivedNodeId) ?? [];
    for (let attempt = 0; attempt < OPTION_SELECT_GENERATION_ATTEMPTS; attempt += 1) {
      try {
        const draft = await input.studyItemGeneration.generateOptionSelect({
          declaredDomain: node.declaredDomain,
          node: { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, aliases: node.aliases },
          groundingProvenance: grounding.provenance,
          groundingPassages: grounding.passages,
          siblings,
          facet: typePlan.facet || undefined
        });
        const guardContext: OptionSelectGrounding = {
          studyItemId: newStudyItemId(),
          graphVersionId: graphVersionId,
          enrichmentId: layer.enrichmentId,
          derivedNodeId: node.derivedNodeId,
          canonicalLabel: node.canonicalLabel,
          groundingProvenance: grounding.provenance,
          generatingModel: input.studyItemGeneration.model,
          configHash: input.configHash,
          facet: typePlan.facet || undefined,
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
    }

    return {
      items: [],
      rejected: [{
        derivedNodeId: node.derivedNodeId,
        canonicalLabel: node.canonicalLabel,
        itemType: "option_select",
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
    for (const rejection of result.rejected) reject({ derivedNodeId: rejection.derivedNodeId, canonicalLabel: rejection.canonicalLabel }, rejection.itemType, rejection.reason);
  }

  // --- Stage 4: matching items ---------------------------------------------------
  let matchingDone = 0;
  const generateMatchingForNode = async (node: DerivedGraphNode): Promise<{ items: StudyItem[]; rejected: RejectedStudyItem[] }> => {
    const typePlan = typePlanFor(blueprintByNode, node, "matching");
    if (!typePlan.generate) return { items: [], rejected: [] };
    const lesson = lessonByNode.get(node.derivedNodeId);
    if (!lesson) {
      return { items: [], rejected: [{ derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, itemType: "matching", reason: "no matching item: concept lesson is absent for this node" }] };
    }
    const grounding = studyItemGroundingFromLesson(lesson);
    if (!grounding) {
      return { items: [], rejected: [{ derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, itemType: "matching", reason: "no matching item: the lesson has no grounded sections to anchor an item" }] };
    }
    let failureReason: string | null = null;
    let retryFeedback: string | undefined;
    const siblings = siblingsByNode.get(node.derivedNodeId) ?? [];
    for (let attempt = 0; attempt < MATCHING_GENERATION_ATTEMPTS; attempt += 1) {
      try {
        const draft = await input.studyItemGeneration.generateMatching({
          declaredDomain: node.declaredDomain,
          node: { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, aliases: node.aliases },
          groundingProvenance: grounding.provenance,
          groundingPassages: grounding.passages,
          siblings,
          facet: typePlan.facet || undefined,
          retryFeedback
        });
        const guardContext: MatchingGrounding = {
          studyItemId: newStudyItemId(),
          graphVersionId: graphVersionId,
          enrichmentId: layer.enrichmentId,
          derivedNodeId: node.derivedNodeId,
          canonicalLabel: node.canonicalLabel,
          groundingProvenance: grounding.provenance,
          generatingModel: input.studyItemGeneration.model,
          configHash: input.configHash,
          facet: typePlan.facet || undefined,
          passages: grounding.passages
        };
        const guarded = validateMatchingItem(draft, guardContext, newPairId, newPairId);
        if (guarded.ok) return { items: [guarded.item], rejected: [] };
        failureReason = guarded.reason;
        retryFeedback = guarded.reason;
      } catch (error) {
        failureReason = `matching generation failed: ${error instanceof Error ? error.message : String(error)}`;
        retryFeedback = failureReason;
      }
    }
    return { items: [], rejected: [{ derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, itemType: "matching", reason: failureReason ?? "no matching item could be grounded" }] };
  };
  const perNodeMatching = await studyStage(
    STAGE_TAGS.matchingGeneration,
    () =>
      mapWithConcurrency(layer.derivedNodes, input.concurrency ?? DEFAULT_STUDY_ITEM_CONCURRENCY, async (node) => {
        const result = await generateMatchingForNode(node);
        matchingDone += 1;
        await reporter.recordProgress({ operationType: "study_items", operationId, stage: STAGE_TAGS.matchingGeneration, done: matchingDone });
        return result;
      }),
    layer.derivedNodes.length
  );
  for (const result of perNodeMatching) {
    studyItems.push(...result.items);
    for (const rejection of result.rejected) reject({ derivedNodeId: rejection.derivedNodeId, canonicalLabel: rejection.canonicalLabel }, rejection.itemType, rejection.reason);
  }

  // --- Stage 5: impostor items (R3/R4/R7/R8/R9) ---------------------------------
  // A node's impostor derives its three truths from the SAME lesson grounding the
  // option-select stage used (studyItemGroundingFromLesson, rule 18) and reads the
  // node's confusable siblings read-only as lie context. The model makes the hybrid
  // sibling-vs-generated lie choice in one call (KTD2); the guard re-derives provenance
  // and one fresh retry covers a citation-quality miss. A node that yields no groundable
  // impostor is recorded impostor-absent — keyed per item type, independent of its
  // option-select outcome (R9, KTD8). Never aborts the run (R13).
  let impostorDone = 0;
  const generateImpostorForNode = async (node: DerivedGraphNode): Promise<{ items: StudyItem[]; rejected: RejectedStudyItem[] }> => {
    const typePlan = typePlanFor(blueprintByNode, node, "impostor");
    if (!typePlan.generate) return { items: [], rejected: [] };
    const lesson = lessonByNode.get(node.derivedNodeId);
    if (!lesson) {
      return { items: [], rejected: [{ derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, itemType: "impostor", reason: "no impostor item: concept lesson is absent for this node" }] };
    }
    const grounding = studyItemGroundingFromLesson(lesson);
    if (!grounding) {
      return { items: [], rejected: [{ derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, itemType: "impostor", reason: "no impostor item: the lesson has no grounded sections to anchor an item" }] };
    }

    let failureReason: string | null = null;
    let retryFeedback: string | undefined;
    const siblings = siblingsByNode.get(node.derivedNodeId) ?? [];
    for (let attempt = 0; attempt < IMPOSTOR_GENERATION_ATTEMPTS; attempt += 1) {
      try {
        const draft = await input.studyItemGeneration.generateImpostor({
          declaredDomain: node.declaredDomain,
          node: { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, aliases: node.aliases },
          groundingProvenance: grounding.provenance,
          groundingPassages: grounding.passages,
          siblings,
          facet: typePlan.facet || undefined,
          retryFeedback
        });
        const guardContext: ImpostorGrounding = {
          studyItemId: newStudyItemId(),
          graphVersionId: graphVersionId,
          enrichmentId: layer.enrichmentId,
          derivedNodeId: node.derivedNodeId,
          canonicalLabel: node.canonicalLabel,
          groundingProvenance: grounding.provenance,
          generatingModel: input.studyItemGeneration.model,
          configHash: input.configHash,
          facet: typePlan.facet || undefined,
          passages: grounding.passages
        };
        const guarded = validateImpostorItem(draft, guardContext, newStatementId);
        if (guarded.ok) {
          // validateImpostorItem always splices exactly one isImpostor:true statement into
          // a successful item, so the keyed lie is always found here.
          const lie = guarded.item.statements.find((statement) => statement.isImpostor)!;
          try {
            const judgment = await input.impostorLieValidityJudge.judge({
              declaredDomain: node.declaredDomain,
              node: { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, aliases: node.aliases },
              lie: { text: lie.text, reveal: lie.reveal },
              groundingPassages: grounding.passages,
              siblings
            });
            if (judgment.verdict === "lie_is_false") {
              return { items: [guarded.item], rejected: [] };
            }
            failureReason = `impostor lie rejected by judge: ${judgment.reason}`;
            retryFeedback = judgment.reason;
          } catch (error) {
            return {
              items: [],
              rejected: [{
                derivedNodeId: node.derivedNodeId,
                canonicalLabel: node.canonicalLabel,
                itemType: "impostor",
                reason: `impostor lie-validity judge unavailable: ${error instanceof Error ? error.message : String(error)}`
              }]
            };
          }
        } else {
          failureReason = guarded.reason;
        }
      } catch (error) {
        failureReason = `impostor generation failed: ${error instanceof Error ? error.message : String(error)}`;
      }
      // A wrong impostor actively teaches a falsehood; no-impostor is the safe state. The
      // loop bound (IMPOSTOR_GENERATION_ATTEMPTS) caps every failure kind — including a
      // judge rejection — at one retry, after which the rejected-row reason is the operator
      // signal instead of passing a suspect lie through.
    }

    return {
      items: [],
      rejected: [{
        derivedNodeId: node.derivedNodeId,
        canonicalLabel: node.canonicalLabel,
        itemType: "impostor",
        reason: failureReason ?? "no impostor item could be grounded"
      }]
    };
  };
  const perNodeImpostor = await studyStage(
    STAGE_TAGS.impostorGeneration,
    () =>
      mapWithConcurrency(layer.derivedNodes, input.concurrency ?? DEFAULT_STUDY_ITEM_CONCURRENCY, async (node) => {
        const result = await generateImpostorForNode(node);
        impostorDone += 1;
        await reporter.recordProgress({ operationType: "study_items", operationId, stage: STAGE_TAGS.impostorGeneration, done: impostorDone });
        return result;
      }),
    layer.derivedNodes.length
  );
  for (const result of perNodeImpostor) {
    studyItems.push(...result.items);
    for (const rejection of result.rejected) reject({ derivedNodeId: rejection.derivedNodeId, canonicalLabel: rejection.canonicalLabel }, rejection.itemType, rejection.reason);
  }

  const rejected = [...rejectedByNodeType.values()];
  await studyStage(NON_LLM_STAGES.persist, () =>
    input.studyItemBankStore.persist({
      graphVersionId: graphVersionId,
      enrichmentId: layer.enrichmentId,
      configHash: input.configHash,
      studyItems,
      rejected
    })
  );
  return { graphVersionId: graphVersionId, enrichmentId: layer.enrichmentId, studyItems, rejected, lessons, lessonAbsent };
  });
}

function normalizeBlueprint(blueprint: StudyItemBlueprint, node: DerivedGraphNode): StudyItemBlueprint {
  const planByType = new Map(blueprint.typePlans.map((plan) => [plan.itemType, plan] as const));
  return {
    derivedNodeId: node.derivedNodeId,
    typePlans: SUPPORTED_STUDY_ITEM_TYPES.map((itemType) => {
      const plan = planByType.get(itemType);
      if (!plan) return { itemType, generate: true as const, facet: "" };
      if (plan.generate) return { itemType, generate: true as const, facet: plan.facet.trim() };
      return { itemType, generate: false as const, reason: plan.reason.trim() || "blueprint declined this item type" };
    })
  };
}

function structuralPreGateBlueprint(node: DerivedGraphNode, lesson: ConceptLesson | undefined): StudyItemBlueprint {
  if (!lesson) {
    return {
      derivedNodeId: node.derivedNodeId,
      typePlans: SUPPORTED_STUDY_ITEM_TYPES.map((itemType) => ({ itemType, generate: false as const, reason: "concept lesson is absent for this node" }))
    };
  }
  const fragmentCount = groundedLessonFragments(lesson).size;
  return {
    derivedNodeId: node.derivedNodeId,
    typePlans: SUPPORTED_STUDY_ITEM_TYPES.map((itemType) => {
      if (itemType === "matching" && fragmentCount < 3) return { itemType, generate: false as const, reason: `matching requires at least 3 grounded fragments; found ${fragmentCount}` };
      if (itemType === "impostor" && fragmentCount < 2) return { itemType, generate: false as const, reason: `impostor requires at least 2 grounded truth fragments; found ${fragmentCount}` };
      if (fragmentCount < 1) return { itemType, generate: false as const, reason: "no grounded lesson fragments are available" };
      return { itemType, generate: true as const, facet: "" };
    })
  };
}

function applyStructuralPreGate(planned: StudyItemBlueprint, preGate: StudyItemBlueprint): StudyItemBlueprint {
  const gateByType = new Map(preGate.typePlans.map((plan) => [plan.itemType, plan] as const));
  return {
    derivedNodeId: planned.derivedNodeId,
    typePlans: planned.typePlans.map((plan) => {
      const gate = gateByType.get(plan.itemType);
      if (gate && !gate.generate) return gate;
      return plan;
    })
  };
}

function groundedLessonFragments(lesson: ConceptLesson): Set<string> {
  const fragments = new Set<string>();
  for (const section of lesson.sections) {
    for (const item of section.items ?? []) fragments.add(item.trim().toLowerCase());
    if (section.citation?.provenance === "source") fragments.add(section.citation.evidenceQuote.trim().toLowerCase());
    if (section.citation?.provenance === "generated") fragments.add(section.citation.passageText.trim().toLowerCase());
  }
  return fragments;
}

function typePlanFor(blueprintByNode: ReadonlyMap<string, StudyItemBlueprint>, node: DerivedGraphNode, itemType: StudyItemType) {
  const plan = blueprintByNode.get(node.derivedNodeId)?.typePlans.find((candidate) => candidate.itemType === itemType);
  if (!plan) return { itemType, generate: false as const, reason: "blueprint did not request this item type" };
  return plan;
}

// Derive study-item grounding from a Concept Lesson's grounded sections (U5, R10, rule 18).
// Shared by the option-select and impostor stages: both derive their grounded content from
// the one lesson substrate, never from raw passages (KTD3). Source-origin nodes require
// citations, because only cited sections carry a source-verifiable trace. Generated-origin
// nodes may fall back to their generated substantive lesson sections when no citation
// survived, because the item remains honestly generated and still derives from the lesson
// substrate rather than raw graph grounding. Synthesized gist/intuition/applications never
// become fallback grounding.
// Returns null when the lesson has no grounded section to anchor an item.
function studyItemGroundingFromLesson(
  lesson: ConceptLesson
): { provenance: "source_cep" | "source_mentioned" | "generated"; passages: GroundingPassage[] } | null {
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
      const generatedPassageKind: "definition" | "mention" = section.kind === "definition" ? "definition" : "mention";
      passages.push({
        passageId: `${lesson.derivedNodeId}:${generatedPassageKind}:0`,
        kind: passageKind,
        text: section.citation.passageText,
        derivedNodeId: section.citation.derivedNodeId
      });
    }
  }
  if (passages.length === 0) {
    for (const section of lesson.sections) {
      if (!SUBSTANTIVE_KINDS.includes(section.kind)) continue;
      const passageKind: "definition" | "mention" = section.kind === "definition" ? "definition" : "mention";
      passages.push({
        passageId: `${lesson.derivedNodeId}:${passageKind}:lesson`,
        kind: passageKind,
        text: section.text,
        derivedNodeId: lesson.derivedNodeId
      });
    }
  }
  if (passages.length === 0) return null;
  return { provenance: sourceProvenance ?? "generated", passages };
}

function hasVerifiedSubstantiveSourceCitation(lesson: ConceptLesson): boolean {
  return lesson.sections.some((section) =>
    SUBSTANTIVE_KINDS.includes(section.kind) && section.citation?.provenance === "source"
  );
}

function shouldRetryLesson(node: DerivedGraphNode, lesson: ConceptLesson | undefined): boolean {
  return node.groundingOrigin !== "llm_grounded" && (!lesson || !hasVerifiedSubstantiveSourceCitation(lesson));
}

const REDUNDANCY_DROPPABLE_KINDS: ReadonlySet<ConceptLessonSectionKind> = new Set(["gist", "intuition", "applications"]);

async function judgeLessonRedundancy(
  judge: ConceptLessonRedundancyJudgmentPort | undefined,
  node: DerivedGraphNode,
  lesson: ConceptLesson
): Promise<ConceptLessonRedundancyJudgment[]> {
  if (!judge) return [];
  try {
    return await judge.judge({
      declaredDomain: node.declaredDomain,
      node: { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, aliases: node.aliases },
      sections: lesson.sections.map((section) => ({ kind: section.kind, text: section.text, ...(section.items?.length ? { items: section.items } : {}) }))
    });
  } catch {
    return [];
  }
}

function redundantNonSubstantiveKinds(judgments: ConceptLessonRedundancyJudgment[]): ConceptLessonSectionKind[] {
  return judgments
    .filter((judgment) => judgment.verdict === "redundant" && REDUNDANCY_DROPPABLE_KINDS.has(judgment.sectionKind))
    .map((judgment) => judgment.sectionKind);
}

function dropRedundantNonSubstantiveSections(lesson: ConceptLesson, judgments: ConceptLessonRedundancyJudgment[]): ConceptLesson {
  const redundant = new Set(redundantNonSubstantiveKinds(judgments));
  if (redundant.size === 0) return lesson;
  return { ...lesson, sections: lesson.sections.filter((section) => !redundant.has(section.kind)) };
}

function redundancyRetryFeedback(judgments: ConceptLessonRedundancyJudgment[]): string {
  const redundant = judgments.filter((judgment) => judgment.verdict === "redundant");
  if (!redundant.length) return "";
  return `Previous lesson had redundant sections: ${redundant.map((judgment) => `${judgment.sectionKind}${judgment.redundantWith ? ` repeated ${judgment.redundantWith}` : ""} (${judgment.reason})`).join("; ")}. Rewrite those sections so each adds distinct information.`;
}

function lessonRetryFeedback(lesson: ConceptLesson | undefined): string {
  if (!lesson) return "The previous lesson did not produce a valid substantive source-cited section. Regenerate with a definition, examples, or formulas section whose evidence quote is copied verbatim from one provided grounding passage.";
  const failed = lesson.sections
    .filter((section) => SUBSTANTIVE_KINDS.includes(section.kind))
    .filter((section) => section.citation?.provenance !== "source")
    .map((section) => section.kind);
  const named = failed.length ? [...new Set(failed)].join(", ") : "definition/examples/formulas";
  return `The previous lesson had no verified source citation in a substantive section. Regenerate with a source-cited ${named} section whose evidence quote is copied verbatim from one provided grounding passage.`;
}
