import { createHash, randomUUID } from "node:crypto";
import type {
  ConceptLesson,
  LessonAbsentNode,
  OptionSelectItem,
  StudyItem
} from "@lrnki/domain-core";
import type {
  EnrichmentInspectionReadPort,
  LearnerExpedition,
  LearnerExpeditionStorePort,
  SourceExpeditionAssetExpectation,
  SourceExpeditionStorePort,
  StudyItemBankStorePort,
  ConceptLessonStorePort,
  DerivedGraphDetail
} from "@lrnki/ports";
import { deriveFlooredExpedition } from "./expeditionSections";
import {
  derivedGraphLearnerKnowledgeAvailability,
  learnerKnowledgeCapabilityIsAvailable,
  type LearnerKnowledgeAvailability
} from "./learnerKnowledgeAvailability";

// U2's explicit legacy boundary. Merely having current rows is not learner qualification: U5 must
// persist both lessons and option-select items under this wrapper after its named evidence gates run.
// Keeping the base operation hash inside the value preserves exact Model Assignment/config identity.
export const SOURCE_EXPEDITION_ASSET_QUALIFICATION_CONTRACT =
  "source-expedition-learner-assets-v1";

export function qualifiedSourceExpeditionAssetConfigHash(baseConfigHash: string): string {
  if (!baseConfigHash.trim()) throw new Error("Source Expedition asset qualification needs a base config hash.");
  return `${SOURCE_EXPEDITION_ASSET_QUALIFICATION_CONTRACT}:${baseConfigHash}`;
}

export type SourceExpeditionUnavailableReason =
  | "source_expedition_adoption_paused"
  | "enrichment_not_found"
  | "enrichment_not_succeeded"
  | "registered_source_required"
  | "llm_grounded_prerequisite"
  | "source_mentioned_prerequisite_unverified"
  | "trail_incomplete"
  | "lesson_missing"
  | "lesson_unqualified"
  | "option_select_missing"
  | "option_select_unqualified"
  | "expedition_not_owned"
  | "expedition_inactive"
  | "asset_set_changed";

export type SourceExpeditionUnavailable = {
  status: "unavailable";
  reason: SourceExpeditionUnavailableReason;
  derivedNodeId?: string;
};

export type SourceExpeditionCandidate = {
  enrichmentId: string;
  title: string;
  declaredDomain: string;
  totalStopCount: number;
  searchTerms: string[];
};

export type QualifiedSourceExpeditionAssets = {
  detail: DerivedGraphDetail;
  lessons: ConceptLesson[];
  lessonAbsent: LessonAbsentNode[];
  studyItems: OptionSelectItem[];
  trailNodeIds: Set<string>;
  expectedAssets: SourceExpeditionAssetExpectation;
};

export type QualifiedSourceExpedition = {
  status: "available";
  candidate: SourceExpeditionCandidate;
  assets: QualifiedSourceExpeditionAssets;
};

export type SourceExpeditionQualification = QualifiedSourceExpedition | SourceExpeditionUnavailable;

export type OpenedSourceExpedition = QualifiedSourceExpedition & {
  expedition: LearnerExpedition & { kind: "source"; status: "ready"; enrichmentId: string };
};

export type SourceExpeditionOpenResult = OpenedSourceExpedition | SourceExpeditionUnavailable;

export type SourceExpeditionModuleDeps = {
  learnerKnowledgeAvailability: LearnerKnowledgeAvailability;
  enrichmentRead: Pick<EnrichmentInspectionReadPort, "listEnrichmentSummaries" | "getDerivedGraphDetail">;
  conceptLessonStore: Pick<
    ConceptLessonStorePort,
    "listLessonsForEnrichment" | "listAbsentForEnrichment"
  >;
  studyItemStore: Pick<StudyItemBankStorePort, "listStudyItemsForEnrichment">;
  expeditionStore: Pick<
    LearnerExpeditionStorePort,
    "listForLearner" | "getForLearner" | "getByEnrichment"
  > & SourceExpeditionStorePort;
  qualifiedAssetConfigHash: string;
  newId?: () => string;
};

export type SourceExpeditionModule = ReturnType<typeof createSourceExpeditionModule>;

export function createSourceExpeditionModule(deps: SourceExpeditionModuleDeps) {
  const newId = deps.newId ?? randomUUID;

  const qualify = async (enrichmentId: string): Promise<SourceExpeditionQualification> => {
    if (!learnerKnowledgeCapabilityIsAvailable(
      deps.learnerKnowledgeAvailability,
      "sourceExpeditionAdoption"
    )) {
      return unavailable("source_expedition_adoption_paused");
    }
    const [detail, lessons, lessonAbsent, studyItems] = await Promise.all([
      deps.enrichmentRead.getDerivedGraphDetail(enrichmentId),
      deps.conceptLessonStore.listLessonsForEnrichment(enrichmentId),
      deps.conceptLessonStore.listAbsentForEnrichment(enrichmentId),
      deps.studyItemStore.listStudyItemsForEnrichment(enrichmentId)
    ]);
    if (!detail) return unavailable("enrichment_not_found");
    if (detail.summary.status !== "succeeded") return unavailable("enrichment_not_succeeded");
    if (!detail.summary.graphVersionId) return unavailable("registered_source_required");
    const graphVersionId = detail.summary.graphVersionId;

    const llmGrounded = detail.nodes.find((node) => node.groundingOrigin === "llm_grounded");
    if (llmGrounded) return unavailable("llm_grounded_prerequisite", llmGrounded.derivedNodeId);
    const unverifiedSourceMention = detail.nodes.find((node) =>
      node.groundingOrigin === "source_mentioned" &&
      (node.grounding?.verbatimDisposition !== "verified" || node.grounding.passages.length === 0)
    );
    if (unverifiedSourceMention) {
      return unavailable(
        "source_mentioned_prerequisite_unverified",
        unverifiedSourceMention.derivedNodeId
      );
    }
    const graphAvailability = derivedGraphLearnerKnowledgeAvailability(
      deps.learnerKnowledgeAvailability,
      detail
    );
    if (graphAvailability.status !== "available") {
      return unavailable(
        graphAvailability.capability === "llmGroundedPrerequisites"
          ? "llm_grounded_prerequisite"
          : "source_mentioned_prerequisite_unverified"
      );
    }

    const floored = deriveFlooredExpedition(detail);
    if (!floored.summit || floored.trailNodeIds.size < 2) return unavailable("trail_incomplete");
    const trailNodes = detail.nodes.filter((node) => floored.trailNodeIds.has(node.derivedNodeId));
    const lessonByNode = groupBy(lessons, (lesson) => lesson.derivedNodeId);
    const optionsByNode = groupBy(
      studyItems.filter((item): item is OptionSelectItem => item.itemType === "option_select"),
      (item) => item.derivedNodeId
    );
    const qualifiedLessons: ConceptLesson[] = [];
    const qualifiedOptions: OptionSelectItem[] = [];
    for (const node of trailNodes) {
      const nodeLessons = lessonByNode.get(node.derivedNodeId) ?? [];
      if (nodeLessons.length !== 1) return unavailable("lesson_missing", node.derivedNodeId);
      const lesson = nodeLessons[0];
      if (!lessonQualifies(
        lesson,
        graphVersionId,
        enrichmentId,
        deps.qualifiedAssetConfigHash
      )) {
        return unavailable("lesson_unqualified", node.derivedNodeId);
      }
      qualifiedLessons.push(lesson);

      const nodeOptions = optionsByNode.get(node.derivedNodeId) ?? [];
      if (nodeOptions.length === 0) return unavailable("option_select_missing", node.derivedNodeId);
      const qualified = nodeOptions.filter((item) => optionSelectQualifies(
        item,
        graphVersionId,
        enrichmentId,
        deps.qualifiedAssetConfigHash
      ));
      if (qualified.length === 0) return unavailable("option_select_unqualified", node.derivedNodeId);
      qualifiedOptions.push(...qualified);
    }

    // Replace the inspection summary's broad "any item" bit with the exact family admitted by
    // this contract. Section winnability and every downstream projection now see the same fact.
    const qualifiedOptionNodes = new Set(qualifiedOptions.map((item) => item.derivedNodeId));
    const qualifiedDetail: DerivedGraphDetail = {
      ...detail,
      nodes: detail.nodes.map((node) => ({
        ...node,
        hasStudyItem: qualifiedOptionNodes.has(node.derivedNodeId)
      }))
    };
    const summitNode = qualifiedDetail.nodes.find((node) =>
      node.derivedNodeId === floored.summit?.derivedNodeId
    );
    if (!summitNode) return unavailable("trail_incomplete");
    const expectedAssets = assetExpectation({
      detail: qualifiedDetail,
      lessons,
      studyItems,
      qualifiedAssetConfigHash: deps.qualifiedAssetConfigHash,
      trailNodeIds: floored.trailNodeIds
    });
    return {
      status: "available",
      candidate: {
        enrichmentId,
        title: summitNode.label,
        declaredDomain: summitNode.declaredDomain,
        totalStopCount: floored.trailNodeIds.size,
        searchTerms: [...new Set(trailNodes.flatMap((node) => [node.label, ...node.aliases]))]
      },
      assets: {
        detail: qualifiedDetail,
        lessons: qualifiedLessons,
        lessonAbsent: lessonAbsent.filter((absent) => floored.trailNodeIds.has(absent.derivedNodeId)),
        studyItems: qualifiedOptions,
        trailNodeIds: floored.trailNodeIds,
        expectedAssets
      }
    };
  };

  const open = async (input: {
    learnerStateRef: string;
    enrichmentId: string;
    active: boolean;
  }): Promise<SourceExpeditionOpenResult> => {
    const expedition = await deps.expeditionStore.getByEnrichment(input);
    if (!expedition || expedition.kind !== "source" || expedition.status !== "ready" ||
        expedition.enrichmentId !== input.enrichmentId) {
      return unavailable("expedition_not_owned");
    }
    if (input.active && !expedition.active) return unavailable("expedition_inactive");
    const qualification = await qualify(input.enrichmentId);
    if (qualification.status !== "available") return qualification;
    if (expedition.assetSetIdentity !== qualification.assets.expectedAssets.assetSetIdentity) {
      return unavailable("asset_set_changed");
    }
    return {
      ...qualification,
      expedition: {
        ...expedition,
        kind: "source",
        status: "ready",
        enrichmentId: input.enrichmentId
      }
    };
  };

  return {
    qualify,

    async listCandidates(input: { learnerStateRef: string }): Promise<SourceExpeditionCandidate[]> {
      const [summaries, owned] = await Promise.all([
        deps.enrichmentRead.listEnrichmentSummaries(),
        deps.expeditionStore.listForLearner(input.learnerStateRef)
      ]);
      const ownedIdentity = new Map(
        owned
          .filter((expedition) => expedition.kind === "source" && expedition.enrichmentId)
          .map((expedition) => [expedition.enrichmentId as string, expedition.assetSetIdentity] as const)
      );
      const qualifications = await Promise.all(
        summaries
          .filter((summary) => summary.status === "succeeded" && summary.graphVersionId !== null)
          .map(async (summary) => ({ summary, qualification: await qualify(summary.enrichmentId) }))
      );
      return qualifications
        .filter((entry): entry is typeof entry & { qualification: QualifiedSourceExpedition } =>
          entry.qualification.status === "available" &&
          ownedIdentity.get(entry.summary.enrichmentId) !==
            entry.qualification.assets.expectedAssets.assetSetIdentity
        )
        .sort((left, right) =>
          Date.parse(right.summary.startedAt) - Date.parse(left.summary.startedAt) ||
          right.qualification.candidate.totalStopCount - left.qualification.candidate.totalStopCount ||
          left.qualification.candidate.title.localeCompare(right.qualification.candidate.title)
        )
        .map((entry) => entry.qualification.candidate);
    },

    async adopt(input: {
      learnerStateRef: string;
      enrichmentId: string;
    }): Promise<
      | { adopted: true; learnerExpeditionId: string }
      | { adopted: false; refused: SourceExpeditionUnavailableReason }
    > {
      const qualification = await qualify(input.enrichmentId);
      if (qualification.status !== "available") {
        return { adopted: false, refused: qualification.reason };
      }
      const stored = await deps.expeditionStore.adoptSourceExpedition({
        learnerExpeditionId: newId(),
        learnerStateRef: input.learnerStateRef,
        enrichmentId: input.enrichmentId,
        title: qualification.candidate.title,
        declaredDomain: qualification.candidate.declaredDomain,
        expectedAssets: qualification.assets.expectedAssets
      });
      return stored.adopted
        ? stored
        : { adopted: false, refused: "asset_set_changed" };
    },

    async activate(input: {
      learnerStateRef: string;
      learnerExpeditionId: string;
    }): Promise<
      | { activated: true; enrichmentId: string }
      | { activated: false; refused: SourceExpeditionUnavailableReason }
    > {
      const expedition = await deps.expeditionStore.getForLearner(input);
      if (!expedition || expedition.kind !== "source" || expedition.status !== "ready" ||
          !expedition.enrichmentId) {
        return { activated: false, refused: "expedition_not_owned" };
      }
      const qualification = await qualify(expedition.enrichmentId);
      if (qualification.status !== "available") {
        return { activated: false, refused: qualification.reason };
      }
      if (expedition.assetSetIdentity !== qualification.assets.expectedAssets.assetSetIdentity) {
        return { activated: false, refused: "asset_set_changed" };
      }
      const stored = await deps.expeditionStore.activateSourceExpedition({
        learnerStateRef: input.learnerStateRef,
        learnerExpeditionId: input.learnerExpeditionId,
        enrichmentId: expedition.enrichmentId,
        expectedAssets: qualification.assets.expectedAssets
      });
      return stored.activated
        ? { activated: true, enrichmentId: expedition.enrichmentId }
        : {
            activated: false,
            refused: stored.refused === "not_found" ? "expedition_not_owned" : "asset_set_changed"
          };
    },

    openOwned(input: { learnerStateRef: string; enrichmentId: string }): Promise<SourceExpeditionOpenResult> {
      return open({ ...input, active: false });
    },

    openActive(input: { learnerStateRef: string; enrichmentId: string }): Promise<SourceExpeditionOpenResult> {
      return open({ ...input, active: true });
    },

    async authorizeActive(input: { learnerStateRef: string; enrichmentId: string }) {
      const opened = await open({ ...input, active: true });
      if (opened.status !== "available") return opened;
      return {
        status: "available" as const,
        enrichmentId: input.enrichmentId,
        assetSetIdentity: opened.assets.expectedAssets.assetSetIdentity,
        trailNodeIds: opened.assets.trailNodeIds,
        qualifiedConceptLessonIds: new Set(
          opened.assets.lessons.map((lesson) => lesson.conceptLessonId)
        ),
        qualifiedStudyItemIds: new Set(
          opened.assets.studyItems.map((item) => item.studyItemId)
        )
      };
    }
  };
}

function unavailable(
  reason: SourceExpeditionUnavailableReason,
  derivedNodeId?: string
): SourceExpeditionUnavailable {
  return { status: "unavailable", reason, ...(derivedNodeId ? { derivedNodeId } : {}) };
}

function groupBy<T>(values: readonly T[], keyOf: (value: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const key = keyOf(value);
    grouped.set(key, [...(grouped.get(key) ?? []), value]);
  }
  return grouped;
}

const substantiveLessonKinds = new Set(["definition", "examples", "formulas"]);

function lessonQualifies(
  lesson: ConceptLesson,
  graphVersionId: string,
  enrichmentId: string,
  qualifiedAssetConfigHash: string
): boolean {
  return lesson.graphVersionId === graphVersionId &&
    lesson.enrichmentId === enrichmentId &&
    lesson.configHash === qualifiedAssetConfigHash &&
    lesson.sections.some((section) =>
      substantiveLessonKinds.has(section.kind) &&
      section.text.trim().length > 0
    );
}

function optionSelectQualifies(
  item: OptionSelectItem,
  graphVersionId: string,
  enrichmentId: string,
  qualifiedAssetConfigHash: string
): boolean {
  const keyed = item.options.filter((option) => option.isCorrect);
  return item.graphVersionId === graphVersionId &&
    item.enrichmentId === enrichmentId &&
    item.configHash === qualifiedAssetConfigHash &&
    item.groundingProvenance !== "generated" &&
    item.question.trim().length > 0 &&
    item.explanation.trim().length > 0 &&
    keyed.length === 1 &&
    keyed[0].provenance === "source" &&
    keyed[0].citation?.provenance === "source";
}

function assetExpectation(input: {
  detail: DerivedGraphDetail;
  lessons: ConceptLesson[];
  studyItems: StudyItem[];
  qualifiedAssetConfigHash: string;
  trailNodeIds: Set<string>;
}): SourceExpeditionAssetExpectation {
  const currentConceptLessonIds = input.lessons
    .map((lesson) => lesson.conceptLessonId)
    .sort((left, right) => left.localeCompare(right));
  const currentStudyItemIds = input.studyItems
    .map((item) => item.studyItemId)
    .sort((left, right) => left.localeCompare(right));
  const identityPayload = {
    contract: input.qualifiedAssetConfigHash,
    enrichmentId: input.detail.summary.enrichmentId,
    graphVersionId: input.detail.summary.graphVersionId,
    enrichmentConfigHash: input.detail.summary.enrichmentConfigHash,
    trailNodeIds: [...input.trailNodeIds].sort((left, right) => left.localeCompare(right)),
    lessons: [...input.lessons]
      .sort((left, right) => left.conceptLessonId.localeCompare(right.conceptLessonId))
      .map((lesson) => [lesson.conceptLessonId, lesson.derivedNodeId, lesson.configHash]),
    studyItems: [...input.studyItems]
      .sort((left, right) => left.studyItemId.localeCompare(right.studyItemId))
      .map((item) => [item.studyItemId, item.derivedNodeId, item.itemType, item.configHash])
  };
  return {
    assetSetIdentity: `source-expedition-assets-${createHash("sha256")
      .update(JSON.stringify(identityPayload))
      .digest("hex")}`,
    currentConceptLessonIds,
    currentStudyItemIds
  };
}
