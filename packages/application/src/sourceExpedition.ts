import { randomUUID } from "node:crypto";
import type {
  ConceptLesson,
  LessonAbsentNode,
  StudyItem
} from "@lrnki/domain-core";
import {
  SOURCE_EXPEDITION_TRAIL_SCOPE_POLICY,
  sourceExpeditionAssetSetIdentity
} from "@lrnki/domain-core/source-expedition-asset-identity-node";
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
  SourceEvidenceReadPort,
  StudyItemBankStorePort,
  ConceptLessonStorePort,
  DerivedGraphDetail
} from "@lrnki/ports";
import { applyDifficultyFloor } from "./applyDifficultyFloor";
import { deriveFlooredExpedition } from "./expeditionSections";
import {
  planExpeditionRoute,
  resolveExpeditionSourceCues,
  type ExpeditionRouteDiagnostics,
  type ExpeditionRoutePlan,
  type ExpeditionRouteUnavailableReason
} from "./expeditionRoutePlan";
import {
  learnerKnowledgeCapabilityIsAvailable,
  type LearnerKnowledgeAvailability
} from "./learnerKnowledgeAvailability";
import { persistedSourceStudyItemQualificationReasons } from "./sourceStudyItemAdmission";

// A persisted row is learner-current only after family admission and route/mix qualification under
// this wrapper. Keeping the base operation hash inside the value preserves exact Model Assignment/
// config identity; the route plan itself is independently bound into the asset-set hash below.
export const SOURCE_EXPEDITION_ASSET_QUALIFICATION_CONTRACT =
  "source-expedition-learner-assets-v3";

export { SOURCE_EXPEDITION_TRAIL_SCOPE_POLICY };

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
  | "source_cue_unavailable"
  | ExpeditionRouteUnavailableReason
  | "accepted_catalog_entry_required"
  | "expedition_not_owned"
  | "expedition_inactive"
  | "accepted_asset_set_changed";

export type SourceExpeditionUnavailable = {
  status: "unavailable";
  reason: SourceExpeditionUnavailableReason;
  derivedNodeId?: string;
  routeDiagnostics?: ExpeditionRouteDiagnostics;
  sourceCueDiagnostics?: {
    missingDerivedNodeIds: string[];
    unresolvedReferences: Array<{
      sourceResourceId: string;
      sourceBlockId: string;
    }>;
  };
};

export type QualifiedSourceExpeditionCandidate = {
  enrichmentId: string;
  title: string;
  declaredDomain: string;
  totalConceptCount: number;
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
  studyItems: StudyItem[];
  trailNodeIds: Set<string>;
  routePlan: ExpeditionRoutePlan;
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
  sourceEvidenceRead: SourceEvidenceReadPort;
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
    const itemsByNode = groupBy(studyItems, (item) => item.derivedNodeId);
    const qualifiedItemsByNode = new Map<string, StudyItem[]>();
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

      const nodeItems = itemsByNode.get(node.derivedNodeId) ?? [];
      const nodeOptions = nodeItems.filter((item) => item.itemType === "option_select");
      if (nodeOptions.length === 0) {
        directFailureByNode.set(
          node.derivedNodeId,
          unavailable("option_select_missing", node.derivedNodeId)
        );
        continue;
      }
      const qualifiedItems = nodeItems.filter((item) =>
        persistedSourceStudyItemQualificationReasons({
          candidate: item,
          lesson,
          canonicalLabel: node.label,
          graphVersionId,
          enrichmentId,
          qualifiedAssetConfigHash: deps.qualifiedAssetConfigHash
        }).length === 0
      );
      if (!qualifiedItems.some((item) => item.itemType === "option_select")) {
        directFailureByNode.set(
          node.derivedNodeId,
          unavailable("option_select_unqualified", node.derivedNodeId)
        );
        continue;
      }
      qualifiedItemsByNode.set(node.derivedNodeId, qualifiedItems);
      directlyReadyNodeIds.add(node.derivedNodeId);
    }

    const qualifiedTrail = deriveQualifiedSourceTrail(detail, directlyReadyNodeIds);
    if (qualifiedTrail.trailNodeIds.size < 2) {
      return broadTrailNodes
        .map((node) => directFailureByNode.get(node.derivedNodeId))
        .find((failure): failure is SourceExpeditionUnavailable => failure !== undefined)
        ?? unavailable("trail_incomplete");
    }
    const trailNodes = qualifiedTrail.detail.nodes;
    const qualifiedLessons = trailNodes.map((node) =>
      (lessonByNode.get(node.derivedNodeId) ?? [])[0]!
    );
    const primaryOptions = trailNodes.map((node) =>
      (qualifiedItemsByNode.get(node.derivedNodeId) ?? [])
        .filter((item) => item.itemType === "option_select")
        .sort((left, right) => left.studyItemId.localeCompare(right.studyItemId))[0]!
    );
    const bonusCandidates = trailNodes.flatMap((node) =>
      (qualifiedItemsByNode.get(node.derivedNodeId) ?? [])
        .filter((item) => item.itemType === "matching" || item.itemType === "impostor")
    );
    const sourceCues = await resolveExpeditionSourceCues({
      lessons: qualifiedLessons,
      sourceEvidenceRead: deps.sourceEvidenceRead
    });
    if (!sourceCues.resolved) {
      return {
        status: "unavailable",
        reason: sourceCues.reason,
        sourceCueDiagnostics: {
          missingDerivedNodeIds: sourceCues.missingDerivedNodeIds,
          unresolvedReferences: sourceCues.unresolvedReferences
        }
      };
    }
    const planning = planExpeditionRoute({
      concepts: trailNodes.map((node) => ({
        derivedNodeId: node.derivedNodeId,
        canonicalLabel: node.label,
        difficulty: node.difficulty
      })),
      trustedPrerequisiteEdges: qualifiedTrail.detail.edges
        .filter((edge) => !edge.uncertain)
        .map((edge) => ({
          prerequisiteDerivedNodeId: edge.prerequisiteDerivedNodeId,
          dependentDerivedNodeId: edge.dependentDerivedNodeId
        })),
      instructionalSourceCues: sourceCues.cues,
      qualifiedStudyItemCandidates: [...primaryOptions, ...bonusCandidates].map((item) => ({
        studyItemId: item.studyItemId,
        derivedNodeId: item.derivedNodeId,
        itemType: item.itemType
      })),
      policy: "source_expedition"
    });
    if (planning.status === "unavailable") {
      return {
        status: "unavailable",
        reason: planning.reason,
        routeDiagnostics: planning.diagnostics
      };
    }
    const selectedBonusIds = new Set(planning.plan.legs.flatMap((leg) =>
      leg.selectedBonusStudyItemIds
    ));
    const selectedItemById = new Map(
      [...primaryOptions, ...bonusCandidates]
        .filter((item) => item.itemType === "option_select" || selectedBonusIds.has(item.studyItemId))
        .map((item) => [item.studyItemId, item] as const)
    );
    const primaryOptionByNode = new Map(primaryOptions.map((item) => [
      item.derivedNodeId,
      item
    ] as const));
    const currentStudyItems = planning.plan.orderedDerivedNodeIds.flatMap((derivedNodeId) => {
      const primary = primaryOptionByNode.get(derivedNodeId);
      const selectedBonuses = planning.plan.legs.flatMap((leg) =>
        leg.selectedBonusStudyItemIds
      ).flatMap((studyItemId) => {
        const item = selectedItemById.get(studyItemId);
        return item?.derivedNodeId === derivedNodeId ? [item] : [];
      }).sort(compareStudyItemFamilyThenId);
      return [...(primary ? [primary] : []), ...selectedBonuses];
    });

    // Replace the inspection summary's broad "any item" bit with the exact route-selected current
    // set. Unselected qualified candidates remain in the neutral bank but cross no learner seam.
    const currentItemNodes = new Set(currentStudyItems.map((item) => item.derivedNodeId));
    const qualifiedDetail: DerivedGraphDetail = {
      ...qualifiedTrail.detail,
      summary: {
        ...qualifiedTrail.detail.summary,
        studyItemCount: currentStudyItems.length
      },
      nodes: qualifiedTrail.detail.nodes.map((node) => ({
        ...node,
        hasStudyItem: currentItemNodes.has(node.derivedNodeId)
      }))
    };
    const summitNode = qualifiedDetail.nodes.find((node) =>
      node.derivedNodeId === planning.plan.summitDerivedNodeId
    );
    if (!summitNode) return unavailable("trail_incomplete");
    const expectedAssets = assetExpectation({
      detail: qualifiedDetail,
      lessons: qualifiedLessons,
      studyItems: currentStudyItems,
      qualifiedAssetConfigHash: deps.qualifiedAssetConfigHash,
      trailNodeIds: qualifiedTrail.trailNodeIds,
      routePlan: planning.plan
    });
    return {
      status: "available",
      candidate: {
        enrichmentId,
        title: summitNode.label,
        declaredDomain: summitNode.declaredDomain,
        totalConceptCount: qualifiedTrail.trailNodeIds.size,
        searchTerms: [...new Set(trailNodes.flatMap((node) => [node.label, ...node.aliases]))]
      },
      assets: {
        detail: qualifiedDetail,
        lessons: qualifiedLessons,
        lessonAbsent: lessonAbsent.filter((absent) =>
          qualifiedTrail.trailNodeIds.has(absent.derivedNodeId)
        ),
        studyItems: currentStudyItems,
        trailNodeIds: qualifiedTrail.trailNodeIds,
        routePlan: planning.plan,
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
      | {
          adopted: true;
          learnerExpeditionId: string;
          routePlan: ExpeditionRoutePlan;
        }
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
        ? { ...stored, routePlan: qualification.assets.routePlan }
        : { adopted: false, refused: "accepted_asset_set_changed" };
    },

    async activate(input: {
      learnerStateRef: string;
      learnerExpeditionId: string;
    }): Promise<
      | {
          activated: true;
          enrichmentId: string;
          routePlan: ExpeditionRoutePlan;
        }
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
        ? {
            activated: true,
            enrichmentId: expedition.enrichmentId,
            routePlan: qualification.assets.routePlan
          }
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
        routePlan: opened.assets.routePlan,
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
  return { detail: qualifiedDetail, trailNodeIds };
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

function assetExpectation(input: {
  detail: DerivedGraphDetail;
  lessons: ConceptLesson[];
  studyItems: StudyItem[];
  qualifiedAssetConfigHash: string;
  trailNodeIds: Set<string>;
  routePlan: ExpeditionRoutePlan;
}): SourceExpeditionAssetExpectation {
  const currentConceptLessonIds = input.lessons
    .map((lesson) => lesson.conceptLessonId)
    .sort((left, right) => left.localeCompare(right));
  const currentStudyItemIds = input.studyItems
    .map((item) => item.studyItemId)
    .sort((left, right) => left.localeCompare(right));
  const assetSetIdentity = sourceExpeditionAssetSetIdentity({
    qualifiedAssetConfigHash: input.qualifiedAssetConfigHash,
    enrichmentId: input.detail.summary.enrichmentId,
    graphVersionId: input.detail.summary.graphVersionId,
    enrichmentConfigHash: input.detail.summary.enrichmentConfigHash,
    trailNodeIds: [...input.trailNodeIds],
    routePlan: input.routePlan,
    lessons: input.lessons.map((lesson) => ({
      conceptLessonId: lesson.conceptLessonId,
      derivedNodeId: lesson.derivedNodeId,
      configHash: lesson.configHash
    })),
    studyItems: input.studyItems.map((item) => ({
      studyItemId: item.studyItemId,
      derivedNodeId: item.derivedNodeId,
      itemType: item.itemType,
      configHash: item.configHash
    }))
  });
  return {
    assetSetIdentity,
    currentConceptLessonIds,
    currentStudyItemIds
  };
}

function compareStudyItemFamilyThenId(left: StudyItem, right: StudyItem): number {
  return studyItemFamilyRank(left.itemType) - studyItemFamilyRank(right.itemType) ||
    left.studyItemId.localeCompare(right.studyItemId);
}

function studyItemFamilyRank(itemType: StudyItem["itemType"]): number {
  return itemType === "option_select" ? 0 : itemType === "matching" ? 1 : 2;
}
