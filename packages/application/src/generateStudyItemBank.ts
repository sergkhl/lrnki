import { randomUUID } from "node:crypto";
import {
  type ConceptLesson,
  type ConceptLessonRedundancyJudgment,
  type ConceptLessonSectionKind,
  type DerivedGraphNode,
  type ImpostorItem,
  type LessonAbsentNode,
  type MatchingItem,
  type OptionSelectItem,
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
  LayerPurposeGenerationPort,
  MatchingAssignmentVerificationPort,
  RunProgressReporterPort,
  AnswerKeyVerificationPort,
  StudyItemBlueprintPort,
  StudyItemBankStorePort,
  StudyItemGenerationPort
} from "@lrnki/ports";
import { mapWithConcurrency } from "./mapWithConcurrency";
import {
  NON_LLM_STAGES,
  noopRunProgressReporter,
  runInstrumentedOperation,
  type StageBracket
} from "./runProgressReporter";
import { validateOptionSelectItem, type StudyItemGuardGrounding } from "./optionSelectGuard";
import { validateImpostorItem } from "./impostorGuard";
import { validateMatchingItem } from "./matchingGuard";
import {
  answerKeyCandidates,
  impostorKeyVetoReason,
  optionSelectKeyVetoReason,
  verifyAnswerKeys,
  type AnswerKeyVerificationSubject
} from "./verifyStudyItemKeys";
import {
  matchingAssignmentPresentation,
  verifyMatchingAssignments,
  type MatchingAssignmentSubject
} from "./verifyMatchingAssignments";
import {
  DEFAULT_ITEM_VERIFICATION_CONCURRENCY,
  type VerificationOutcome,
  type VerificationRegeneration
} from "./verifyGuardedItems";
import { selectSiblingContext } from "./selectSiblingContext";
import { selectNodeGrounding } from "./selectNodeGrounding";
import { selectLessonNeighborhood } from "./selectLessonNeighborhood";
import { lessonGroundingShape, type LessonGroundingShape } from "./lessonGroundingShape";
import { assembleConceptLesson, SUBSTANTIVE_KINDS } from "./assembleConceptLesson";
import { STUDY_ITEM_BANK_STAGE_GROUP } from "./topicExpeditionStageProfile";

// Lessons and blueprints are the sequential front half and can use wider per-node
// fan-out. The three item-type stages run beside one another, so each keeps the more
// modest degree 4; mapWithConcurrency preserves input order within every stage.
export const DEFAULT_LESSON_CONCURRENCY = 8;
export const DEFAULT_STUDY_ITEM_CONCURRENCY = 4;
// A vetoed item gets exactly ONE judge-informed regeneration inside its verification phase,
// on top of whatever the generation attempts above spent on guard failures. One constant for
// all three verified types: the budget is a property of the shared phase, not of a type.
export const VERIFICATION_REGENERATION_ATTEMPTS = 1;
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
// (ADR-0031). The sequential front half generates and persists the grounded Concept Lesson
// substrate, then plans each node's item-type coverage. Option-select, matching, and impostor
// generation run as three concurrent stage brackets over that same lesson substrate; their
// input-ordered results merge after the join in canonical type order. A node that yields no
// lesson is recorded lesson-absent; a node that yields no item of a type is a
// RejectedStudyItem keyed by item type with the exact reason. Learner-neutral and regenerable;
// never touches the asserted graph or imports a graph/enrichment write port (R9).
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
  // Answer-Key Verification (ADR-0026, plan 2026-08-19-001 KTD6). Required, not optional:
  // the option-select and impostor guards admit citations through the D9 fallback rung, which
  // is only sound because this judge checks the claims those citations no longer anchor (D6).
  answerKeyVerification: AnswerKeyVerificationPort;
  // Matching Assignment Verification (ADR-0026, plan 2026-08-07-001 D5). Required for the same
  // structural reason: matching is the only type whose defect class is cross-pair ambiguity, and
  // an optional judge would make "the board is assignable" a property some banks silently lack.
  matchingAssignmentVerification: MatchingAssignmentVerificationPort;
  conceptLessonStore: ConceptLessonStorePort;
  studyItemGeneration: StudyItemGenerationPort;
  studyItemBankStore: StudyItemBankStorePort;
  newConceptLessonId?: () => string;
  newStudyItemId?: () => string;
  newOptionId?: () => string;
  newPairId?: () => string;
  newStatementId?: () => string;
  // Optional operator override over every per-node stage. Defaults split lesson /
  // blueprint fan-out from the three concurrently running item-stage fan-outs.
  concurrency?: number;
  // Run-progress reporter seam (ADR-0029). Study-item generation is its own operation_type
  // keyed by enrichmentId (ADR-0017 split). Absent → no-op (unchanged behavior).
  reporter?: RunProgressReporterPort;
}): Promise<StudyItemBankGenerationResult> {
  const newConceptLessonId = input.newConceptLessonId ?? randomUUID;
  const newStudyItemId = input.newStudyItemId ?? randomUUID;
  const newOptionId = input.newOptionId ?? randomUUID;
  const newPairId = input.newPairId ?? randomUUID;
  const newStatementId = input.newStatementId ?? randomUUID;
  const reporter = input.reporter ?? noopRunProgressReporter;
  const operationId = input.enrichmentId;
  const lessonConcurrency = input.concurrency ?? DEFAULT_LESSON_CONCURRENCY;
  const studyItemConcurrency = input.concurrency ?? DEFAULT_STUDY_ITEM_CONCURRENCY;
  const verificationConcurrency = input.concurrency ?? DEFAULT_ITEM_VERIFICATION_CONCURRENCY;
  return runInstrumentedOperation(reporter, "study_items", operationId, async (studyStage) => {
    const redundancyStage = createConditionalAggregateStage(
      studyStage,
      STUDY_ITEM_BANK_STAGE_GROUP.lessonRedundancyJudgment.stage
    );
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
      await studyStage(STUDY_ITEM_BANK_STAGE_GROUP.layerPurposeGeneration.stage, async () => {
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
      const conceptLessonId = newConceptLessonId();
      const neighbors = selectLessonNeighborhood(node, layer);
      const initialDraft = await input.conceptLessonGeneration.generate({
        declaredDomain: node.declaredDomain,
        node: { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, aliases: node.aliases },
        groundingProvenance: grounding.provenance,
        groundingPassages: grounding.passages,
        neighbors
      });
      let assembled = assembleConceptLesson({
        conceptLessonId,
        node: { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, graphVersionId: graphVersionId, enrichmentId: layer.enrichmentId },
        generatingModel: input.conceptLessonGeneration.model,
        configHash: input.configHash,
        grounding,
        draft: initialDraft
      });
      let activeRedundancy: ConceptLessonRedundancyJudgment[] = [];
      if (assembled.kind === "lesson") {
        activeRedundancy = await judgeLessonRedundancy(
          input.conceptLessonRedundancyJudge,
          node,
          assembled.lesson,
          redundancyStage
        );
      }
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
          conceptLessonId,
          node: { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, graphVersionId: graphVersionId, enrichmentId: layer.enrichmentId },
          generatingModel: input.conceptLessonGeneration.model,
          configHash: input.configHash,
          grounding,
          draft: retryDraft
        });
        let retryRedundancy: ConceptLessonRedundancyJudgment[] = [];
        if (retryAssembled.kind === "lesson") {
          retryRedundancy = await judgeLessonRedundancy(
            input.conceptLessonRedundancyJudge,
            node,
            retryAssembled.lesson,
            redundancyStage
          );
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
    STUDY_ITEM_BANK_STAGE_GROUP.conceptLessonGeneration.stage,
    async () => {
      try {
        return await mapWithConcurrency(layer.derivedNodes, lessonConcurrency, async (node) => {
          const result = await generateLessonForNode(node);
          lessonDone += 1;
          await reporter.recordProgress({ operationType: "study_items", operationId, stage: STUDY_ITEM_BANK_STAGE_GROUP.conceptLessonGeneration.stage, done: lessonDone });
          return result;
        });
      } finally {
        await redundancyStage.finish();
      }
    },
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
    STUDY_ITEM_BANK_STAGE_GROUP.studyItemBlueprint.stage,
    () =>
      mapWithConcurrency(layer.derivedNodes, lessonConcurrency, async (node) => {
        const lesson = lessonByNode.get(node.derivedNodeId);
        if (!lesson) {
          blueprintDone += 1;
          await reporter.recordProgress({ operationType: "study_items", operationId, stage: STUDY_ITEM_BANK_STAGE_GROUP.studyItemBlueprint.stage, done: blueprintDone });
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
          await reporter.recordProgress({ operationType: "study_items", operationId, stage: STUDY_ITEM_BANK_STAGE_GROUP.studyItemBlueprint.stage, done: blueprintDone });
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

  // --- Per-node item context (rule 18) ------------------------------------------
  // The three item types answer "may I generate for this node, and from what?" identically:
  // the blueprint's type plan decides, the Concept Lesson is the only substrate (R10 — never
  // raw passages), and `lessonGroundingShape` is the only answer to what grounding it yields.
  // The decline reasons are the operator-visible strings a coverage measurement greps, so the
  // item-type word is a parameter rather than three near-copies drifting apart.
  type NodeItemContext =
    | { kind: "skip" }
    | { kind: "reject"; reason: string }
    | { kind: "ready"; grounding: LessonGroundingShape; facet: string | undefined; siblings: { label: string; snippet: string }[] };
  const nodeItemContext = (node: DerivedGraphNode, itemType: StudyItemType, label: string): NodeItemContext => {
    const typePlan = typePlanFor(blueprintByNode, node, itemType);
    if (!typePlan.generate) return { kind: "skip" };
    const lesson = lessonByNode.get(node.derivedNodeId);
    if (!lesson) return { kind: "reject", reason: `no ${label} item: concept lesson is absent for this node` };
    const grounding = lessonGroundingShape(lesson);
    if (!grounding) return { kind: "reject", reason: `no ${label} item: the lesson yields no grounding passages to anchor an item` };
    return {
      kind: "ready",
      grounding,
      facet: typePlan.facet || undefined,
      siblings: siblingsByNode.get(node.derivedNodeId) ?? []
    };
  };
  const guardGroundingFor = (node: DerivedGraphNode, context: { grounding: LessonGroundingShape; facet: string | undefined }): StudyItemGuardGrounding => ({
    studyItemId: newStudyItemId(),
    graphVersionId: graphVersionId,
    enrichmentId: layer.enrichmentId,
    derivedNodeId: node.derivedNodeId,
    canonicalLabel: node.canonicalLabel,
    groundingProvenance: context.grounding.provenance,
    generatingModel: input.studyItemGeneration.model,
    configHash: input.configHash,
    facet: context.facet,
    passages: context.grounding.passages
  });
  const generationInputFor = (node: DerivedGraphNode, context: { grounding: LessonGroundingShape; facet: string | undefined; siblings: { label: string; snippet: string }[] }, retryFeedback: string | undefined) => ({
    declaredDomain: node.declaredDomain,
    node: { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, aliases: node.aliases },
    groundingProvenance: context.grounding.provenance,
    groundingPassages: context.grounding.passages,
    siblings: context.siblings,
    facet: context.facet,
    retryFeedback
  });
  const failureText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

  // A node's outcome for ONE item type, before verification. All three types now hand a
  // `pending` subject to a verification phase — option-select and impostor to Study Item Key
  // Verification, matching to Matching Assignment Verification — so there is no longer a
  // straight-to-persistence variant.
  type NodeAttempt<TSubject> =
    | { kind: "skipped" }
    | { kind: "rejected"; reason: string }
    | { kind: "pending"; subject: TSubject };

  const pendingSubjects = <TSubject>(attempts: readonly NodeAttempt<TSubject>[]): TSubject[] =>
    attempts.flatMap((attempt) => (attempt.kind === "pending" ? [attempt.subject] : []));

  // Re-joins one type's per-node attempts with its verification outcomes. Two order facts do
  // the work and neither may be weakened: `mapWithConcurrency` is input-ordered, so
  // `attempts[i]` is always `layer.derivedNodes[i]` regardless of response timing; and
  // `verifyGuardedItems` is index-aligned to the PENDING SUBSET, walked here by a cursor in
  // that same order. Persisted order therefore stays a function of node order alone (R4).
  const mergeVerified = <TSubject, TItem extends StudyItem>(
    attempts: readonly NodeAttempt<TSubject>[],
    outcomes: readonly VerificationOutcome<TItem>[],
    itemType: StudyItemType
  ): { items: StudyItem[]; rejected: RejectedStudyItem[] } => {
    const items: StudyItem[] = [];
    const rejected: RejectedStudyItem[] = [];
    let cursor = 0;
    attempts.forEach((attempt, index) => {
      const node = layer.derivedNodes[index];
      const record = (reason: string): void => {
        rejected.push({ derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, itemType, reason });
      };
      if (attempt.kind === "skipped") return;
      if (attempt.kind === "rejected") { record(attempt.reason); return; }
      const outcome = outcomes[cursor];
      cursor += 1;
      if (outcome.admitted) items.push(outcome.item);
      else record(outcome.reason);
    });
    return { items, rejected };
  };

  // --- Stage 3: option-select items ---------------------------------------------
  // Each derived node is an independent generation unit. Driving them through the
  // shared bounded mapper parallelizes wall-clock without changing persisted order.
  // Study-item generation stage with a per-node heartbeat: one progress write as
  // each derived node's items resolve, so a large bank shows N-of-M liveness.
  let studyDone = 0;
  const optionSelectSubject = (
    node: DerivedGraphNode,
    context: Extract<NodeItemContext, { kind: "ready" }>,
    item: OptionSelectItem,
    citationRung: AnswerKeyVerificationSubject<OptionSelectItem>["citationRung"]
  ): AnswerKeyVerificationSubject<OptionSelectItem> => ({
    request: {
      itemType: "option_select",
      declaredDomain: node.declaredDomain,
      subject: { canonicalLabel: node.canonicalLabel, aliases: node.aliases },
      // Option-select passes its question so each option reads as a proposed answer (D8).
      question: item.question,
      candidates: answerKeyCandidates(item.options),
      groundingPassages: context.grounding.passages,
      relatedConcepts: context.siblings
    },
    item,
    citationRung,
    regenerate: (feedback) => draftOptionSelect(node, context, VERIFICATION_REGENERATION_ATTEMPTS, feedback)
  });
  // Generation/guard failure rejects this node for the bank but never aborts the run.
  // Citation guard failures are model-output quality misses, so give the generator one
  // INFORMED retry: without the previous attempt's reason the second call is a blind
  // re-roll of the same failing call.
  const draftOptionSelect = async (
    node: DerivedGraphNode,
    context: Extract<NodeItemContext, { kind: "ready" }>,
    attempts: number,
    initialFeedback?: string
  ): Promise<VerificationRegeneration<AnswerKeyVerificationSubject<OptionSelectItem>>> => {
    let failureReason: string | null = null;
    let retryFeedback = initialFeedback;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const draft = await input.studyItemGeneration.generateOptionSelect(generationInputFor(node, context, retryFeedback));
        const guarded = validateOptionSelectItem(draft, guardGroundingFor(node, context), newOptionId);
        if (guarded.ok) return { ok: true, subject: optionSelectSubject(node, context, guarded.item, guarded.citationRung) };
        failureReason = guarded.reason;
        retryFeedback = guarded.reason;
      } catch (error) {
        failureReason = `option-select generation failed: ${failureText(error)}`;
        retryFeedback = failureReason;
      }
    }
    return { ok: false, reason: failureReason ?? "no study item could be grounded" };
  };
  const optionSelectForNode = async (node: DerivedGraphNode): Promise<NodeAttempt<AnswerKeyVerificationSubject<OptionSelectItem>>> => {
    const context = nodeItemContext(node, "option_select", "option-select");
    if (context.kind !== "ready") return context.kind === "skip" ? { kind: "skipped" } : { kind: "rejected", reason: context.reason };
    const drafted = await draftOptionSelect(node, context, OPTION_SELECT_GENERATION_ATTEMPTS);
    return drafted.ok ? { kind: "pending", subject: drafted.subject } : { kind: "rejected", reason: drafted.reason };
  };
  const optionSelectStage = (async () => {
    const requested = layer.derivedNodes.some((node) =>
      typePlanFor(blueprintByNode, node, "option_select").generate
    );
    const attempts: NodeAttempt<AnswerKeyVerificationSubject<OptionSelectItem>>[] = requested
      ? await studyStage(
          STUDY_ITEM_BANK_STAGE_GROUP.optionSelectGeneration.stage,
          () =>
            mapWithConcurrency(layer.derivedNodes, studyItemConcurrency, async (node) => {
              const result = await optionSelectForNode(node);
              studyDone += 1;
              await reporter.recordProgress({ operationType: "study_items", operationId, stage: STUDY_ITEM_BANK_STAGE_GROUP.optionSelectGeneration.stage, done: studyDone });
              return result;
            }),
          layer.derivedNodes.length
        )
      : layer.derivedNodes.map(() => ({ kind: "skipped" as const }));
    const subjects = pendingSubjects(attempts);
    const outcomes = subjects.length === 0
      ? []
      : await studyStage(
          STUDY_ITEM_BANK_STAGE_GROUP.optionSelectKeyVerification.stage,
          () =>
            verifyAnswerKeys(subjects, {
              verifier: input.answerKeyVerification,
              concurrency: verificationConcurrency,
              vetoReason: (subject, verdicts) => optionSelectKeyVetoReason(subject.item, verdicts),
              // Pass-through on unavailability is option-select's status quo and the node's only
              // primary activity (ADR-0026) — but ONLY for an item whose citation still holds a
              // verbatim anchor. A fallback-admitted item exists solely because a judge was
              // expected to check it, so with no verdict it drops like an impostor (D5).
              onUnavailable: (subject, error) =>
                subject.citationRung === "verbatim"
                  ? { admitted: true, item: subject.item }
                  : { admitted: false, reason: `option-select key verification unavailable and the item has no verbatim grounding anchor: ${failureText(error)}` }
            }),
          subjects.length
        );
    return mergeVerified(attempts, outcomes, "option_select");
  })();

  // --- Stage 4: matching items ---------------------------------------------------
  // Matching's defect class is cross-pair AMBIGUITY, not per-candidate claim truth, which is why
  // it stays outside Answer-Key Verification and runs its own N×N assignment check instead
  // (plan 2026-08-07-001 D5). The generation half is unchanged.
  let matchingDone = 0;
  const matchingSubject = (
    node: DerivedGraphNode,
    context: Extract<NodeItemContext, { kind: "ready" }>,
    item: MatchingItem
  ): MatchingAssignmentSubject => {
    const presentation = matchingAssignmentPresentation(item);
    return {
      request: {
        declaredDomain: node.declaredDomain,
        node: { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, aliases: node.aliases },
        // Matching's question IS the pairing instruction, so the judge needs it to know what the
        // board claims to test — unlike impostor, whose meta-question would invert judging.
        question: item.question,
        prompts: presentation.prompts,
        matches: presentation.matches,
        groundingPassages: context.grounding.passages,
        siblings: context.siblings
      },
      item,
      matchPairOrdinals: presentation.matchPairOrdinals,
      regenerate: (feedback) => draftMatching(node, context, VERIFICATION_REGENERATION_ATTEMPTS, feedback)
    };
  };
  const draftMatching = async (
    node: DerivedGraphNode,
    context: Extract<NodeItemContext, { kind: "ready" }>,
    attempts: number,
    initialFeedback?: string
  ): Promise<VerificationRegeneration<MatchingAssignmentSubject>> => {
    let failureReason: string | null = null;
    let retryFeedback = initialFeedback;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const draft = await input.studyItemGeneration.generateMatching(generationInputFor(node, context, retryFeedback));
        const guarded = validateMatchingItem(draft, guardGroundingFor(node, context), newPairId, newPairId);
        if (guarded.ok) return { ok: true, subject: matchingSubject(node, context, guarded.item) };
        failureReason = guarded.reason;
        retryFeedback = guarded.reason;
      } catch (error) {
        failureReason = `matching generation failed: ${failureText(error)}`;
        retryFeedback = failureReason;
      }
    }
    return { ok: false, reason: failureReason ?? "no matching item could be grounded" };
  };
  const generateMatchingForNode = async (node: DerivedGraphNode): Promise<NodeAttempt<MatchingAssignmentSubject>> => {
    const context = nodeItemContext(node, "matching", "matching");
    if (context.kind !== "ready") return context.kind === "skip" ? { kind: "skipped" } : { kind: "rejected", reason: context.reason };
    const drafted = await draftMatching(node, context, MATCHING_GENERATION_ATTEMPTS);
    return drafted.ok ? { kind: "pending", subject: drafted.subject } : { kind: "rejected", reason: drafted.reason };
  };
  const matchingStage = (async () => {
    const requested = layer.derivedNodes.some((node) =>
      typePlanFor(blueprintByNode, node, "matching").generate
    );
    const attempts: NodeAttempt<MatchingAssignmentSubject>[] = requested
      ? await studyStage(
          STUDY_ITEM_BANK_STAGE_GROUP.matchingGeneration.stage,
          () =>
            mapWithConcurrency(layer.derivedNodes, studyItemConcurrency, async (node) => {
              const result = await generateMatchingForNode(node);
              matchingDone += 1;
              await reporter.recordProgress({ operationType: "study_items", operationId, stage: STUDY_ITEM_BANK_STAGE_GROUP.matchingGeneration.stage, done: matchingDone });
              return result;
            }),
          layer.derivedNodes.length
        )
      : layer.derivedNodes.map(() => ({ kind: "skipped" as const }));
    const subjects = pendingSubjects(attempts);
    const outcomes = subjects.length === 0
      ? []
      : await studyStage(
          STUDY_ITEM_BANK_STAGE_GROUP.matchingAssignmentVerification.stage,
          () => verifyMatchingAssignments(subjects, {
            verifier: input.matchingAssignmentVerification,
            concurrency: verificationConcurrency
          }),
          subjects.length
        );
    return mergeVerified(attempts, outcomes, "matching");
  })();

  // --- Stage 5: impostor items (R3/R4/R7/R8/R9) ---------------------------------
  // A node's impostor derives its three truths from the SAME lesson grounding the
  // option-select stage used (lessonGroundingShape, rule 18) and reads the
  // node's confusable siblings read-only as lie context. The model makes the hybrid
  // sibling-vs-generated lie choice in one call (KTD2); the guard re-derives provenance
  // and one fresh retry covers a citation-quality miss. A node that yields no groundable
  // impostor is recorded impostor-absent — keyed per item type, independent of its
  // option-select outcome (R9, KTD8). Never aborts the run (R13).
  let impostorDone = 0;
  const impostorSubject = (
    node: DerivedGraphNode,
    context: Extract<NodeItemContext, { kind: "ready" }>,
    item: ImpostorItem,
    citationRung: AnswerKeyVerificationSubject<ImpostorItem>["citationRung"]
  ): AnswerKeyVerificationSubject<ImpostorItem> => ({
    request: {
      itemType: "impostor",
      declaredDomain: node.declaredDomain,
      subject: { canonicalLabel: node.canonicalLabel, aliases: node.aliases },
      // No question: an impostor's question is the meta-form "which statement is FALSE?",
      // which would invert per-statement judging (D8). The statements go as standalone claims.
      candidates: item.statements.map((statement) => ({ ordinal: statement.ordinal, text: statement.text })),
      groundingPassages: context.grounding.passages,
      relatedConcepts: context.siblings
    },
    item,
    citationRung,
    regenerate: (feedback) => draftImpostor(node, context, VERIFICATION_REGENERATION_ATTEMPTS, feedback)
  });
  const draftImpostor = async (
    node: DerivedGraphNode,
    context: Extract<NodeItemContext, { kind: "ready" }>,
    attempts: number,
    initialFeedback?: string
  ): Promise<VerificationRegeneration<AnswerKeyVerificationSubject<ImpostorItem>>> => {
    let failureReason: string | null = null;
    let retryFeedback = initialFeedback;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const draft = await input.studyItemGeneration.generateImpostor(generationInputFor(node, context, retryFeedback));
        const guarded = validateImpostorItem(draft, guardGroundingFor(node, context), newStatementId);
        if (guarded.ok) return { ok: true, subject: impostorSubject(node, context, guarded.item, guarded.citationRung) };
        failureReason = guarded.reason;
        retryFeedback = guarded.reason;
      } catch (error) {
        failureReason = `impostor generation failed: ${failureText(error)}`;
        retryFeedback = failureReason;
      }
    }
    return { ok: false, reason: failureReason ?? "no impostor item could be grounded" };
  };
  const generateImpostorForNode = async (node: DerivedGraphNode): Promise<NodeAttempt<AnswerKeyVerificationSubject<ImpostorItem>>> => {
    const context = nodeItemContext(node, "impostor", "impostor");
    if (context.kind !== "ready") return context.kind === "skip" ? { kind: "skipped" } : { kind: "rejected", reason: context.reason };
    const drafted = await draftImpostor(node, context, IMPOSTOR_GENERATION_ATTEMPTS);
    return drafted.ok ? { kind: "pending", subject: drafted.subject } : { kind: "rejected", reason: drafted.reason };
  };
  const impostorStage = (async () => {
    const requested = layer.derivedNodes.some((node) =>
      typePlanFor(blueprintByNode, node, "impostor").generate
    );
    const attempts: NodeAttempt<AnswerKeyVerificationSubject<ImpostorItem>>[] = requested
      ? await studyStage(
          STUDY_ITEM_BANK_STAGE_GROUP.impostorGeneration.stage,
          () =>
            mapWithConcurrency(layer.derivedNodes, studyItemConcurrency, async (node) => {
              const result = await generateImpostorForNode(node);
              impostorDone += 1;
              await reporter.recordProgress({ operationType: "study_items", operationId, stage: STUDY_ITEM_BANK_STAGE_GROUP.impostorGeneration.stage, done: impostorDone });
              return result;
            }),
          layer.derivedNodes.length
        )
      : layer.derivedNodes.map(() => ({ kind: "skipped" as const }));
    const subjects = pendingSubjects(attempts);
    const outcomes = subjects.length === 0
      ? []
      : await studyStage(
          STUDY_ITEM_BANK_STAGE_GROUP.impostorKeyVerification.stage,
          () =>
            verifyAnswerKeys(subjects, {
              verifier: input.answerKeyVerification,
              concurrency: verificationConcurrency,
              vetoReason: (subject, verdicts) => impostorKeyVetoReason(subject.item, verdicts),
              // Fail closed, unchanged from the judge this replaces and for the same reason
              // ADR-0026 gives: a true "lie" teaches a falsehood, and impostor-absent is the
              // designed safe state.
              onUnavailable: (_subject, error) => ({ admitted: false, reason: `impostor key verification unavailable: ${failureText(error)}` })
            }),
          subjects.length
        );
    return mergeVerified(attempts, outcomes, "impostor");
  })();

  // Requested family chains launch together after blueprint, but their results merge only after
  // the join in canonical type order. A declined family opens no empty generation bracket, and a
  // family with no pending subject opens no empty verification bracket; phase success fills those
  // conditional conceptual stages in the Journal. Each mapper is input-ordered, so response or
  // stage completion timing cannot perturb persistence (R4). Up to three real verification stages
  // can overlap in wall-clock — see the concurrency knob's note.
  const stageResults = await Promise.all([
    optionSelectStage,
    matchingStage,
    impostorStage
  ]);
  for (const result of stageResults) {
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
  // Counts the passages the generator will actually be shown (lessonGroundingShape, rule 18),
  // so a pre-gate pass can no longer promise grounding that does not exist and a pre-gate
  // decline can no longer hide grounding that does.
  const passageCount = lessonGroundingShape(lesson)?.passages.length ?? 0;
  return {
    derivedNodeId: node.derivedNodeId,
    typePlans: SUPPORTED_STUDY_ITEM_TYPES.map((itemType) => {
      if (itemType === "matching" && passageCount < 3) return { itemType, generate: false as const, reason: `matching requires at least 3 grounding passages; found ${passageCount}` };
      if (itemType === "impostor" && passageCount < 2) return { itemType, generate: false as const, reason: `impostor requires at least 2 grounding passages; found ${passageCount}` };
      if (passageCount < 1) return { itemType, generate: false as const, reason: "no lesson grounding passages are available" };
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

function typePlanFor(blueprintByNode: ReadonlyMap<string, StudyItemBlueprint>, node: DerivedGraphNode, itemType: StudyItemType) {
  const plan = blueprintByNode.get(node.derivedNodeId)?.typePlans.find((candidate) => candidate.itemType === itemType);
  if (!plan) return { itemType, generate: false as const, reason: "blueprint did not request this item type" };
  return plan;
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
  lesson: ConceptLesson,
  stage: ConditionalAggregateStage
): Promise<ConceptLessonRedundancyJudgment[]> {
  if (!judge) return [];
  try {
    return await stage.run(() =>
      judge.judge({
        declaredDomain: node.declaredDomain,
        node: { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, aliases: node.aliases },
        sections: lesson.sections.map((section) => ({ kind: section.kind, text: section.text, ...(section.items?.length ? { items: section.items } : {}) }))
      })
    );
  } catch {
    return [];
  }
}

type ConditionalAggregateStage = Readonly<{
  run<T>(task: () => Promise<T>): Promise<T>;
  finish(): Promise<void>;
}>;

// Lesson drafts and their optional redundancy checks form a per-node pipeline. Open one aggregate
// redundancy bracket lazily at the first real judge call, keep it open across concurrent nodes and
// retries, and close it only after the lesson producer has stopped. This records the conditional
// conceptual stage without creating overlapping rows for one stage name.
function createConditionalAggregateStage(stage: StageBracket, stageTag: string): ConditionalAggregateStage {
  let bracket: Promise<void> | undefined;
  let active = 0;
  let finishing = false;
  let release!: () => void;
  let markEntered!: () => void;
  let rejectEntered!: (error: unknown) => void;
  const entered = new Promise<void>((resolve, reject) => {
    markEntered = resolve;
    rejectEntered = reject;
  });
  const heldOpen = new Promise<void>((resolve) => {
    release = resolve;
  });

  const settle = () => {
    if (finishing && active === 0) release();
  };
  const ensureStarted = () => {
    if (bracket) return;
    bracket = Promise.resolve().then(() =>
      stage(stageTag, async () => {
        markEntered();
        await heldOpen;
      })
    );
    void bracket.catch((error) => rejectEntered(error));
  };

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      if (finishing) throw new Error(`Conditional aggregate stage ${stageTag} received work after finish.`);
      ensureStarted();
      await entered;
      active += 1;
      try {
        return await task();
      } finally {
        active -= 1;
        settle();
      }
    },
    async finish(): Promise<void> {
      finishing = true;
      settle();
      await bracket;
    }
  };
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
