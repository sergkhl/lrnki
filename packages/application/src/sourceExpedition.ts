import { createHash, randomUUID } from "node:crypto";
import type {
  ConceptLesson,
  LessonAbsentNode,
  OptionSelectItem
} from "@lrnki/domain-core";
import type {
  EnrichmentInspectionReadPort,
  LearnerExpedition,
  LearnerExpeditionStorePort,
  SourceExpeditionAssetExpectation,
  SourceExpeditionCatalogEntry,
  SourceExpeditionCatalogPort,
  SourceExpeditionSourceCredit,
  SourceExpeditionSourceProvenance,
  SourceExpeditionStorePort,
  StudyItemBankStorePort,
  ConceptLessonStorePort,
  DerivedGraphDetail
} from "@lrnki/ports";
import { applyDifficultyFloor } from "./applyDifficultyFloor";
import {
  deriveFlooredExpedition,
  projectExpeditionSections
} from "./expeditionSections";
import {
  learnerKnowledgeCapabilityIsAvailable,
  type LearnerKnowledgeAvailability
} from "./learnerKnowledgeAvailability";

// U2's explicit legacy boundary. Merely having current rows is not learner qualification: U5 must
// persist both lessons and option-select items under this wrapper after its named evidence gates run.
// Keeping the base operation hash inside the value preserves exact Model Assignment/config identity.
export const SOURCE_EXPEDITION_ASSET_QUALIFICATION_CONTRACT =
  "source-expedition-learner-assets-v2";

// Source asset absence may narrow a learner trail, but it may never erase a trusted
// prerequisite underneath a retained stop. This policy identity belongs to the adopted
// asset-set snapshot rather than the neutral Study Item Bank: the bank remains inspectable
// in full while Source Expedition admission derives its greatest predecessor-closed,
// learner-ready sublayer.
export const SOURCE_EXPEDITION_TRAIL_SCOPE_POLICY =
  "source-expedition-prerequisite-closed-ready-sublayer-v1";

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
  | "accepted_catalog_entry_required"
  | "accepted_catalog_stop_floor_not_met"
  | "expedition_not_owned"
  | "expedition_inactive"
  | "accepted_asset_set_changed";

export type SourceExpeditionUnavailable = {
  status: "unavailable";
  reason: SourceExpeditionUnavailableReason;
  derivedNodeId?: string;
};

export type QualifiedSourceExpeditionCandidate = {
  enrichmentId: string;
  title: string;
  declaredDomain: string;
  totalStopCount: number;
  searchTerms: string[];
};

export type SourceExpeditionCandidate = QualifiedSourceExpeditionCandidate & {
  catalogKey: string;
  teaser: string;
  sortOrder: number;
};

export type SourceExpeditionCatalogSource = {
  catalogKey: string;
  title: string;
  sourceProvenance: SourceExpeditionSourceProvenance;
  sourceCredits: SourceExpeditionSourceCredit[];
};

export type SourceExpeditionCatalog = {
  candidates: SourceExpeditionCandidate[];
  sources: SourceExpeditionCatalogSource[];
};

export type PublishAcceptedSourceExpedition = {
  enrichmentId: string;
  catalogKey: string;
  title: string;
  teaser: string;
  catalogRole: string;
  audience: string;
  sortOrder: number;
  sourceProvenance: SourceExpeditionSourceProvenance;
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
  candidate: QualifiedSourceExpeditionCandidate;
  assets: QualifiedSourceExpeditionAssets;
};

export type SourceExpeditionQualification = QualifiedSourceExpedition | SourceExpeditionUnavailable;

type AcceptedQualifiedSourceExpedition = Omit<QualifiedSourceExpedition, "candidate"> & {
  candidate: SourceExpeditionCandidate;
  catalogEntry: SourceExpeditionCatalogEntry;
};

export type OpenedSourceExpedition = Omit<AcceptedQualifiedSourceExpedition, "catalogEntry"> & {
  expedition: LearnerExpedition & { kind: "source"; status: "ready"; enrichmentId: string };
};

export type SourceExpeditionOpenResult = OpenedSourceExpedition | SourceExpeditionUnavailable;

export type SourceExpeditionModuleDeps = {
  learnerKnowledgeAvailability: LearnerKnowledgeAvailability;
  enrichmentRead: Pick<EnrichmentInspectionReadPort, "getDerivedGraphDetail">;
  conceptLessonStore: Pick<
    ConceptLessonStorePort,
    "listLessonsForEnrichment" | "listAbsentForEnrichment"
  >;
  studyItemStore: Pick<StudyItemBankStorePort, "listStudyItemsForEnrichment">;
  expeditionStore: Pick<
    LearnerExpeditionStorePort,
    "listForLearner" | "getForLearner" | "getByEnrichment"
  > & SourceExpeditionStorePort;
  catalog: SourceExpeditionCatalogPort;
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

    const broadTrail = deriveFlooredExpedition(detail);
    if (!broadTrail.summit || broadTrail.trailNodeIds.size < 2) {
      return unavailable("trail_incomplete");
    }
    const broadTrailNodes = detail.nodes.filter((node) =>
      broadTrail.trailNodeIds.has(node.derivedNodeId)
    );
    const lessonByNode = groupBy(lessons, (lesson) => lesson.derivedNodeId);
    const optionsByNode = groupBy(
      studyItems.filter((item): item is OptionSelectItem => item.itemType === "option_select"),
      (item) => item.derivedNodeId
    );
    const directlyReadyNodeIds = new Set<string>();
    const directFailureByNode = new Map<string, SourceExpeditionUnavailable>();
    for (const node of broadTrailNodes) {
      if (node.groundingOrigin === "llm_grounded") {
        directFailureByNode.set(
          node.derivedNodeId,
          unavailable("llm_grounded_prerequisite", node.derivedNodeId)
        );
        continue;
      }
      if (
        node.groundingOrigin === "source_mentioned" &&
        (
          !learnerKnowledgeCapabilityIsAvailable(
            deps.learnerKnowledgeAvailability,
            "sourceMentionedPrerequisites"
          ) ||
          node.grounding?.verbatimDisposition !== "verified" ||
          node.grounding.passages.length === 0
        )
      ) {
        directFailureByNode.set(
          node.derivedNodeId,
          unavailable("source_mentioned_prerequisite_unverified", node.derivedNodeId)
        );
        continue;
      }
      const nodeLessons = lessonByNode.get(node.derivedNodeId) ?? [];
      if (nodeLessons.length !== 1) {
        directFailureByNode.set(
          node.derivedNodeId,
          unavailable("lesson_missing", node.derivedNodeId)
        );
        continue;
      }
      const lesson = nodeLessons[0];
      if (!lessonQualifies(
        lesson,
        graphVersionId,
        enrichmentId,
        deps.qualifiedAssetConfigHash
      )) {
        directFailureByNode.set(
          node.derivedNodeId,
          unavailable("lesson_unqualified", node.derivedNodeId)
        );
        continue;
      }

      const nodeOptions = optionsByNode.get(node.derivedNodeId) ?? [];
      if (nodeOptions.length === 0) {
        directFailureByNode.set(
          node.derivedNodeId,
          unavailable("option_select_missing", node.derivedNodeId)
        );
        continue;
      }
      const qualified = nodeOptions.filter((item) => optionSelectQualifies(
        item,
        graphVersionId,
        enrichmentId,
        deps.qualifiedAssetConfigHash
      ));
      if (qualified.length === 0) {
        directFailureByNode.set(
          node.derivedNodeId,
          unavailable("option_select_unqualified", node.derivedNodeId)
        );
        continue;
      }
      directlyReadyNodeIds.add(node.derivedNodeId);
    }

    const qualifiedTrail = deriveQualifiedSourceTrail(detail, directlyReadyNodeIds);
    if (!qualifiedTrail.summit || qualifiedTrail.trailNodeIds.size < 2) {
      return broadTrailNodes
        .map((node) => directFailureByNode.get(node.derivedNodeId))
        .find((failure): failure is SourceExpeditionUnavailable => failure !== undefined)
        ?? unavailable("trail_incomplete");
    }
    const trailNodes = qualifiedTrail.detail.nodes;
    const qualifiedLessons = trailNodes.map((node) =>
      (lessonByNode.get(node.derivedNodeId) ?? [])[0]!
    );
    const qualifiedOptions = trailNodes.flatMap((node) =>
      (optionsByNode.get(node.derivedNodeId) ?? []).filter((item) => optionSelectQualifies(
        item,
        graphVersionId,
        enrichmentId,
        deps.qualifiedAssetConfigHash
      ))
    );

    // Replace the inspection summary's broad "any item" bit with the exact family admitted by
    // this contract. Section winnability and every downstream projection now see the same fact.
    const qualifiedOptionNodes = new Set(qualifiedOptions.map((item) => item.derivedNodeId));
    const qualifiedDetail: DerivedGraphDetail = {
      ...qualifiedTrail.detail,
      summary: {
        ...qualifiedTrail.detail.summary,
        studyItemCount: qualifiedOptions.length
      },
      nodes: qualifiedTrail.detail.nodes.map((node) => ({
        ...node,
        hasStudyItem: qualifiedOptionNodes.has(node.derivedNodeId)
      }))
    };
    const summitNode = qualifiedDetail.nodes.find((node) =>
      node.derivedNodeId === qualifiedTrail.summit?.derivedNodeId
    );
    if (!summitNode) return unavailable("trail_incomplete");
    const expectedAssets = assetExpectation({
      detail: qualifiedDetail,
      lessons: qualifiedLessons,
      studyItems: qualifiedOptions,
      qualifiedAssetConfigHash: deps.qualifiedAssetConfigHash,
      trailNodeIds: qualifiedTrail.trailNodeIds
    });
    return {
      status: "available",
      candidate: {
        enrichmentId,
        title: summitNode.label,
        declaredDomain: summitNode.declaredDomain,
        totalStopCount: qualifiedTrail.trailNodeIds.size,
        searchTerms: [...new Set(trailNodes.flatMap((node) => [node.label, ...node.aliases]))]
      },
      assets: {
        detail: qualifiedDetail,
        lessons: qualifiedLessons,
        lessonAbsent: lessonAbsent.filter((absent) =>
          qualifiedTrail.trailNodeIds.has(absent.derivedNodeId)
        ),
        studyItems: qualifiedOptions,
        trailNodeIds: qualifiedTrail.trailNodeIds,
        expectedAssets
      }
    };
  };

  const acceptedQualification = async (
    enrichmentId: string,
    knownEntry?: SourceExpeditionCatalogEntry
  ): Promise<AcceptedQualifiedSourceExpedition | SourceExpeditionUnavailable> => {
    const entry = knownEntry ?? await deps.catalog.getAcceptedByEnrichment(enrichmentId);
    if (!entry) return unavailable("accepted_catalog_entry_required");
    const qualification = await qualify(enrichmentId);
    if (qualification.status !== "available") return qualification;
    if (
      entry.acceptedAssetSetIdentity !== qualification.assets.expectedAssets.assetSetIdentity ||
      entry.acceptedAssetConfigHash !== deps.qualifiedAssetConfigHash
    ) {
      return unavailable("accepted_asset_set_changed");
    }
    return {
      ...qualification,
      candidate: {
        ...qualification.candidate,
        catalogKey: entry.catalogKey,
        title: entry.title,
        teaser: entry.teaser,
        sortOrder: entry.sortOrder
      },
      catalogEntry: entry
    };
  };

  const listAcceptedQualifications = async (): Promise<AcceptedQualifiedSourceExpedition[]> => {
    const entries = await deps.catalog.listAccepted();
    const qualifications = await Promise.all(
      entries.map((entry) => acceptedQualification(entry.enrichmentId, entry))
    );
    return qualifications.filter(
      (entry): entry is AcceptedQualifiedSourceExpedition => entry.status === "available"
    );
  };

  const candidatesForLearner = (
    qualifications: AcceptedQualifiedSourceExpedition[],
    owned: LearnerExpedition[]
  ): SourceExpeditionCandidate[] => {
    const ownedIdentity = new Map(
      owned
        .filter((expedition) => expedition.kind === "source" && expedition.enrichmentId)
        .map((expedition) => [
          expedition.enrichmentId as string,
          expedition.assetSetIdentity
        ] as const)
    );
    return qualifications
      .filter((qualification) =>
        ownedIdentity.get(qualification.candidate.enrichmentId) !==
          qualification.assets.expectedAssets.assetSetIdentity
      )
      .map((qualification) => qualification.candidate);
  };

  const listCandidates = async (input: {
    learnerStateRef: string;
  }): Promise<SourceExpeditionCandidate[]> => {
    const [qualifications, owned] = await Promise.all([
      listAcceptedQualifications(),
      deps.expeditionStore.listForLearner(input.learnerStateRef)
    ]);
    return candidatesForLearner(qualifications, owned);
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
    const qualification = await acceptedQualification(input.enrichmentId);
    if (qualification.status !== "available") return qualification;
    if (expedition.assetSetIdentity !== qualification.assets.expectedAssets.assetSetIdentity) {
      return unavailable("accepted_asset_set_changed");
    }
    return {
      status: qualification.status,
      candidate: qualification.candidate,
      assets: qualification.assets,
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

    listCandidates,

    async listCatalog(input: { learnerStateRef: string }): Promise<SourceExpeditionCatalog> {
      const [qualifications, owned] = await Promise.all([
        listAcceptedQualifications(),
        deps.expeditionStore.listForLearner(input.learnerStateRef)
      ]);
      return {
        candidates: candidatesForLearner(qualifications, owned),
        sources: qualifications.map(({ catalogEntry }) => ({
          catalogKey: catalogEntry.catalogKey,
          title: catalogEntry.title,
          sourceProvenance: catalogEntry.sourceProvenance,
          sourceCredits: catalogEntry.sourceCredits
        }))
      };
    },

    async publishAccepted(input: PublishAcceptedSourceExpedition): Promise<
      | { published: true }
      | { published: false; refused: SourceExpeditionUnavailableReason }
    > {
      const qualification = await qualify(input.enrichmentId);
      if (qualification.status !== "available") {
        return { published: false, refused: qualification.reason };
      }
      if (qualification.candidate.totalStopCount < 3) {
        return { published: false, refused: "accepted_catalog_stop_floor_not_met" };
      }
      return deps.catalog.publishAccepted({
        ...input,
        acceptedAssetSetIdentity: qualification.assets.expectedAssets.assetSetIdentity,
        acceptedAssetConfigHash: deps.qualifiedAssetConfigHash,
        expectedAssets: qualification.assets.expectedAssets
      });
    },

    async adopt(input: {
      learnerStateRef: string;
      enrichmentId: string;
    }): Promise<
      | { adopted: true; learnerExpeditionId: string }
      | { adopted: false; refused: SourceExpeditionUnavailableReason }
    > {
      const qualification = await acceptedQualification(input.enrichmentId);
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
        : { adopted: false, refused: "accepted_asset_set_changed" };
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
      const qualification = await acceptedQualification(expedition.enrichmentId);
      if (qualification.status !== "available") {
        return { activated: false, refused: qualification.reason };
      }
      if (expedition.assetSetIdentity !== qualification.assets.expectedAssets.assetSetIdentity) {
        return { activated: false, refused: "accepted_asset_set_changed" };
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
            refused: stored.refused === "not_found"
              ? "expedition_not_owned"
              : "accepted_asset_set_changed"
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

// Resource-constrained prerequisite sequencing: from the already-floored graph, retain the
// greatest directly-ready node set that is closed under every trusted prerequisite. Starting
// with all directly-ready nodes and monotonically removing dependents whose prerequisite is
// absent computes the unique greatest predecessor-closed subset; no heuristic ranking or model
// call participates. Uncertain edges remain inspectable but do not become prerequisite gates,
// matching the expedition projection's existing trust boundary.
function deriveQualifiedSourceTrail(
  detail: DerivedGraphDetail,
  directlyReadyNodeIds: ReadonlySet<string>
): {
  detail: DerivedGraphDetail;
  summit: { derivedNodeId: string; label: string } | null;
  trailNodeIds: Set<string>;
} {
  const floor = applyDifficultyFloor({
    nodes: detail.nodes.map((node) => ({
      derivedNodeId: node.derivedNodeId,
      difficultyBand: node.difficultyBand ?? null,
      difficultyContested: node.difficultyContested ?? null
    })),
    edges: detail.edges
  });
  const trailNodeIds = new Set(
    [...floor.includedNodeIds].filter((derivedNodeId) =>
      directlyReadyNodeIds.has(derivedNodeId)
    )
  );
  const trustedEdges = floor.contractedEdges.filter((edge) => !edge.uncertain);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of trustedEdges) {
      if (
        trailNodeIds.has(edge.dependentDerivedNodeId) &&
        !trailNodeIds.has(edge.prerequisiteDerivedNodeId)
      ) {
        trailNodeIds.delete(edge.dependentDerivedNodeId);
        changed = true;
      }
    }
  }

  const nodes = detail.nodes.filter((node) => trailNodeIds.has(node.derivedNodeId));
  const edges = floor.contractedEdges.filter((edge) =>
    trailNodeIds.has(edge.prerequisiteDerivedNodeId) &&
    trailNodeIds.has(edge.dependentDerivedNodeId)
  );
  const { summit } = projectExpeditionSections({
    detail: { nodes, edges },
    stateByNode: {}
  });
  const qualifiedDetail: DerivedGraphDetail = {
    ...detail,
    summary: {
      ...detail.summary,
      edgeCount: edges.length,
      certainEdgeCount: edges.filter((edge) => !edge.uncertain).length,
      uncertainEdgeCount: edges.filter((edge) => edge.uncertain).length,
      conceptCount: nodes.length
    },
    nodes,
    edges
  };
  return { detail: qualifiedDetail, summit, trailNodeIds };
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
  studyItems: OptionSelectItem[];
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
    trailScopePolicy: SOURCE_EXPEDITION_TRAIL_SCOPE_POLICY,
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
