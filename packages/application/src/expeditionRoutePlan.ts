import type {
  ConceptLesson,
  SourceLocator,
  StudyItemType
} from "@lrnki/domain-core";
import type {
  SourceEvidenceReadPort,
  SourceEvidenceRecord
} from "@lrnki/ports";
import { SECTION_LINEUP_MAX } from "./recallLineupBudget";

export type ExpeditionRoutePolicy = "source_expedition" | "layer_projection";

export type ExpeditionRouteConcept = {
  derivedNodeId: string;
  canonicalLabel: string;
  difficulty: number | null;
};

export type ExpeditionRouteEdge = {
  prerequisiteDerivedNodeId: string;
  dependentDerivedNodeId: string;
};

export type ExpeditionInstructionalSourceCue = {
  derivedNodeId: string;
  sourceResourceId: string;
  sourceDocumentId: string;
  sourceBlockId: string;
  blockId: string;
  headingPath: string[];
  locator: SourceLocator;
};

export type ExpeditionRouteStudyItemCandidate = {
  studyItemId: string;
  derivedNodeId: string;
  itemType: StudyItemType;
};

export type ExpeditionRouteLeg = {
  legIndex: number;
  anchorDerivedNodeId: string;
  derivedNodeIds: string[];
  selectedBonusStudyItemIds: string[];
};

export type ExpeditionRoutePlan = {
  policyIdentity: string;
  orderedDerivedNodeIds: string[];
  legs: ExpeditionRouteLeg[];
  summitDerivedNodeId: string | null;
};

export type ExpeditionRouteUnavailableReason =
  | "duplicate_concept_id"
  | "trusted_edge_outside_admitted_concepts"
  | "trusted_prerequisite_cycle"
  | "study_item_candidate_outside_admitted_concepts"
  | "duplicate_study_item_candidate_id"
  | "source_cue_outside_admitted_concepts"
  | "duplicate_source_cue"
  | "concept_count_below_route_minimum"
  | "leg_partition_unavailable"
  | "study_item_mix_unavailable";

export type ExpeditionRouteDiagnostics = {
  conceptCount: number;
  trustedEdgeCount: number;
  orderedDerivedNodeIds: string[];
  matchingCandidateCount: number;
  impostorCandidateCount: number;
  uncoveredBonusWindows: Array<{
    startPosition: number;
    endPosition: number;
    derivedNodeIds: string[];
  }>;
  implicatedIds: string[];
};

export type ExpeditionRoutePlanningResult =
  | { status: "planned"; plan: ExpeditionRoutePlan }
  | {
      status: "unavailable";
      reason: ExpeditionRouteUnavailableReason;
      diagnostics: ExpeditionRouteDiagnostics;
    };

export type ExpeditionSourceCueResolution =
  | { resolved: true; cues: ExpeditionInstructionalSourceCue[] }
  | {
      resolved: false;
      reason: "source_cue_unavailable";
      missingDerivedNodeIds: string[];
      unresolvedReferences: Array<{
        sourceResourceId: string;
        sourceBlockId: string;
      }>;
    };

type RoutePolicyDefinition = {
  identity: string;
  minimumLegConcepts: number;
  maximumLegConcepts: number;
  targetLegConcepts: number;
  requireBonusPerLeg: boolean;
  requireBothBonusFamilies: boolean;
  allowEmpty: boolean;
  allowUndersizedSingleLeg: boolean;
};

const ROUTE_POLICIES: Record<ExpeditionRoutePolicy, RoutePolicyDefinition> = {
  source_expedition: {
    identity: `source-expedition-route-v1:min3-max${SECTION_LINEUP_MAX}-target4:mixed`,
    minimumLegConcepts: 3,
    maximumLegConcepts: SECTION_LINEUP_MAX,
    targetLegConcepts: 4,
    requireBonusPerLeg: true,
    requireBothBonusFamilies: true,
    allowEmpty: false,
    allowUndersizedSingleLeg: false
  },
  // The existing layer-wide projection still needs an honest empty/short inspection shape while
  // Source Expedition qualification is moved onto the finished plan in U3. It uses this same
  // algorithm with publication-only source/mix constraints disabled; it is not a route fallback.
  layer_projection: {
    identity: `layer-projection-route-v1:min3-max${SECTION_LINEUP_MAX}-target4:short-inspection`,
    minimumLegConcepts: 3,
    maximumLegConcepts: SECTION_LINEUP_MAX,
    targetLegConcepts: 4,
    requireBonusPerLeg: false,
    requireBothBonusFamilies: false,
    allowEmpty: true,
    allowUndersizedSingleLeg: true
  }
};

type BonusCandidate = ExpeditionRouteStudyItemCandidate & {
  itemType: "matching" | "impostor";
};

type DraftLeg = {
  derivedNodeIds: string[];
  selected: BonusCandidate[];
};

type RouteState = {
  position: number;
  matchingCount: number;
  impostorCount: number;
  sourceTransitionCount: number;
  targetSizeDistance: number;
  legs: DraftLeg[];
};

const SUBSTANTIVE_LESSON_KINDS = new Set(["definition", "examples", "formulas"]);

export function expeditionRoutePolicyIdentity(policy: ExpeditionRoutePolicy): string {
  return ROUTE_POLICIES[policy].identity;
}

// Resolve one immutable, direct source position per admitted Concept Lesson. The route planner is
// deliberately model-free: missing evidence is returned explicitly and no generated section can
// manufacture an instructional cue.
export async function resolveExpeditionSourceCues(input: {
  lessons: readonly ConceptLesson[];
  sourceEvidenceRead: SourceEvidenceReadPort;
}): Promise<ExpeditionSourceCueResolution> {
  const referencesByNode = new Map<string, Array<{
    sourceResourceId: string;
    sourceBlockId: string;
    sectionIndex: number;
  }>>();
  for (const lesson of input.lessons) {
    const references = lesson.sections.flatMap((section, sectionIndex) =>
      SUBSTANTIVE_LESSON_KINDS.has(section.kind) && section.citation?.provenance === "source"
        ? [{
            sourceResourceId: section.citation.sourceResourceId,
            sourceBlockId: section.citation.sourceBlockId,
            sectionIndex
          }]
        : []
    );
    referencesByNode.set(lesson.derivedNodeId, references);
  }
  const requestedReferences = [...new Map(
    [...referencesByNode.values()].flat().map((reference) => [
      evidenceKey(reference),
      {
        sourceResourceId: reference.sourceResourceId,
        sourceBlockId: reference.sourceBlockId
      }
    ] as const)
  ).values()];
  const evidence = await input.sourceEvidenceRead.readSourceEvidence(requestedReferences);
  const evidenceByReference = new Map(
    evidence.map((record) => [evidenceKey(record), record] as const)
  );
  const unresolvedReferences = requestedReferences.filter((reference) =>
    !evidenceByReference.has(evidenceKey(reference))
  );
  const missingDerivedNodeIds: string[] = [];
  const cues: ExpeditionInstructionalSourceCue[] = [];

  for (const lesson of [...input.lessons].sort((left, right) =>
    left.derivedNodeId.localeCompare(right.derivedNodeId)
  )) {
    const references = referencesByNode.get(lesson.derivedNodeId) ?? [];
    const candidates = references.flatMap((reference) => {
      const record = evidenceByReference.get(evidenceKey(reference));
      return record ? [{ record, sectionIndex: reference.sectionIndex }] : [];
    });
    if (candidates.length === 0) {
      missingDerivedNodeIds.push(lesson.derivedNodeId);
      continue;
    }
    candidates.sort((left, right) => compareEvidenceCandidate(left, right));
    cues.push(cueFromEvidence(lesson.derivedNodeId, candidates[0].record));
  }

  if (missingDerivedNodeIds.length > 0 || unresolvedReferences.length > 0) {
    return {
      resolved: false,
      reason: "source_cue_unavailable",
      missingDerivedNodeIds,
      unresolvedReferences
    };
  }
  return { resolved: true, cues };
}

// One pure deep module owns topological choice, contiguous Leg partitioning, bonus assignment,
// anchors, and summit. Callers either receive the whole coherent route or one typed failure with
// enough diagnostics to explain why no publication-safe route exists.
export function planExpeditionRoute(input: {
  concepts: readonly ExpeditionRouteConcept[];
  trustedPrerequisiteEdges: readonly ExpeditionRouteEdge[];
  instructionalSourceCues?: readonly ExpeditionInstructionalSourceCue[];
  qualifiedStudyItemCandidates?: readonly ExpeditionRouteStudyItemCandidate[];
  policy: ExpeditionRoutePolicy;
}): ExpeditionRoutePlanningResult {
  const policy = ROUTE_POLICIES[input.policy];
  const conceptsById = new Map<string, ExpeditionRouteConcept>();
  const duplicateConceptIds: string[] = [];
  for (const concept of input.concepts) {
    if (conceptsById.has(concept.derivedNodeId)) duplicateConceptIds.push(concept.derivedNodeId);
    else conceptsById.set(concept.derivedNodeId, concept);
  }
  if (duplicateConceptIds.length > 0) {
    return unavailable("duplicate_concept_id", input, [], duplicateConceptIds);
  }

  const conceptIds = new Set(conceptsById.keys());
  const trustedEdges = uniqueEdges(input.trustedPrerequisiteEdges);
  const outsideEdgeIds = trustedEdges.flatMap((edge) => [
    edge.prerequisiteDerivedNodeId,
    edge.dependentDerivedNodeId
  ]).filter((derivedNodeId) => !conceptIds.has(derivedNodeId));
  if (outsideEdgeIds.length > 0) {
    return unavailable(
      "trusted_edge_outside_admitted_concepts",
      input,
      [],
      uniqueSorted(outsideEdgeIds)
    );
  }

  const cuesByNode = new Map<string, ExpeditionInstructionalSourceCue>();
  const duplicateCueIds: string[] = [];
  const outsideCueIds: string[] = [];
  for (const cue of input.instructionalSourceCues ?? []) {
    if (!conceptIds.has(cue.derivedNodeId)) outsideCueIds.push(cue.derivedNodeId);
    else if (cuesByNode.has(cue.derivedNodeId)) duplicateCueIds.push(cue.derivedNodeId);
    else cuesByNode.set(cue.derivedNodeId, cue);
  }
  if (outsideCueIds.length > 0) {
    return unavailable(
      "source_cue_outside_admitted_concepts",
      input,
      [],
      uniqueSorted(outsideCueIds)
    );
  }
  if (duplicateCueIds.length > 0) {
    return unavailable("duplicate_source_cue", input, [], uniqueSorted(duplicateCueIds));
  }

  const candidateIds = new Set<string>();
  const duplicateCandidateIds: string[] = [];
  const outsideCandidateIds: string[] = [];
  const bonusCandidates: BonusCandidate[] = [];
  for (const candidate of input.qualifiedStudyItemCandidates ?? []) {
    if (candidateIds.has(candidate.studyItemId)) {
      duplicateCandidateIds.push(candidate.studyItemId);
      continue;
    }
    candidateIds.add(candidate.studyItemId);
    if (!conceptIds.has(candidate.derivedNodeId)) {
      outsideCandidateIds.push(candidate.studyItemId);
      continue;
    }
    if (candidate.itemType === "matching" || candidate.itemType === "impostor") {
      bonusCandidates.push(candidate as BonusCandidate);
    }
  }
  if (outsideCandidateIds.length > 0) {
    return unavailable(
      "study_item_candidate_outside_admitted_concepts",
      input,
      [],
      uniqueSorted(outsideCandidateIds)
    );
  }
  if (duplicateCandidateIds.length > 0) {
    return unavailable(
      "duplicate_study_item_candidate_id",
      input,
      [],
      uniqueSorted(duplicateCandidateIds)
    );
  }

  if (conceptsById.size === 0 && policy.allowEmpty) {
    return {
      status: "planned",
      plan: {
        policyIdentity: policy.identity,
        orderedDerivedNodeIds: [],
        legs: [],
        summitDerivedNodeId: null
      }
    };
  }
  const orderedDerivedNodeIds = stableTopologicalOrder({
    conceptsById,
    trustedEdges,
    cuesByNode
  });
  if (orderedDerivedNodeIds.length !== conceptsById.size) {
    return unavailable(
      "trusted_prerequisite_cycle",
      input,
      orderedDerivedNodeIds,
      [...conceptIds].filter((derivedNodeId) => !orderedDerivedNodeIds.includes(derivedNodeId)).sort()
    );
  }
  if (conceptsById.size < policy.minimumLegConcepts) {
    if (!policy.allowUndersizedSingleLeg) {
      return unavailable(
        "concept_count_below_route_minimum",
        input,
        orderedDerivedNodeIds,
        []
      );
    }
    return {
      status: "planned",
      plan: {
        policyIdentity: policy.identity,
        orderedDerivedNodeIds,
        legs: [{
          legIndex: 0,
          anchorDerivedNodeId: orderedDerivedNodeIds[orderedDerivedNodeIds.length - 1],
          derivedNodeIds: orderedDerivedNodeIds,
          selectedBonusStudyItemIds: []
        }],
        summitDerivedNodeId: orderedDerivedNodeIds[orderedDerivedNodeIds.length - 1] ?? null
      }
    };
  }

  const routePosition = new Map(
    orderedDerivedNodeIds.map((derivedNodeId, position) => [derivedNodeId, position] as const)
  );
  bonusCandidates.sort((left, right) => compareBonusCandidates(left, right, routePosition));
  const result = solveRoute({
    orderedDerivedNodeIds,
    cuesByNode,
    bonusCandidates,
    routePosition,
    policy
  });
  if (!result) {
    const hasAnyLegPartition = hasLegSizePartition(orderedDerivedNodeIds.length, policy);
    return unavailable(
      policy.requireBonusPerLeg && hasAnyLegPartition
        ? "study_item_mix_unavailable"
        : "leg_partition_unavailable",
      input,
      orderedDerivedNodeIds,
      []
    );
  }

  return {
    status: "planned",
    plan: {
      policyIdentity: policy.identity,
      orderedDerivedNodeIds,
      legs: result.legs.map((leg, legIndex) => ({
        legIndex,
        anchorDerivedNodeId: leg.derivedNodeIds[leg.derivedNodeIds.length - 1],
        derivedNodeIds: leg.derivedNodeIds,
        selectedBonusStudyItemIds: leg.selected.map((candidate) => candidate.studyItemId)
      })),
      summitDerivedNodeId: orderedDerivedNodeIds[orderedDerivedNodeIds.length - 1] ?? null
    }
  };
}

function stableTopologicalOrder(input: {
  conceptsById: ReadonlyMap<string, ExpeditionRouteConcept>;
  trustedEdges: readonly ExpeditionRouteEdge[];
  cuesByNode: ReadonlyMap<string, ExpeditionInstructionalSourceCue>;
}): string[] {
  const indegree = new Map<string, number>(
    [...input.conceptsById.keys()].map((derivedNodeId) => [derivedNodeId, 0])
  );
  const dependents = new Map<string, string[]>();
  for (const edge of input.trustedEdges) {
    indegree.set(
      edge.dependentDerivedNodeId,
      (indegree.get(edge.dependentDerivedNodeId) ?? 0) + 1
    );
    const current = dependents.get(edge.prerequisiteDerivedNodeId) ?? [];
    current.push(edge.dependentDerivedNodeId);
    dependents.set(edge.prerequisiteDerivedNodeId, current);
  }
  for (const values of dependents.values()) values.sort((left, right) => left.localeCompare(right));
  const ready = new Set(
    [...indegree].filter(([, count]) => count === 0).map(([derivedNodeId]) => derivedNodeId)
  );
  const order: string[] = [];
  while (ready.size > 0) {
    const next = selectReadyConcept(ready, input.conceptsById, input.cuesByNode);
    ready.delete(next);
    order.push(next);
    for (const dependent of dependents.get(next) ?? []) {
      const remaining = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, remaining);
      if (remaining === 0) ready.add(dependent);
    }
  }
  return order;
}

function selectReadyConcept(
  ready: ReadonlySet<string>,
  conceptsById: ReadonlyMap<string, ExpeditionRouteConcept>,
  cuesByNode: ReadonlyMap<string, ExpeditionInstructionalSourceCue>
): string {
  const fallbackOrder = [...ready].sort((left, right) =>
    compareConceptFallback(requiredConcept(conceptsById, left), requiredConcept(conceptsById, right))
  );
  const fallback = fallbackOrder[0];
  const fallbackCue = cuesByNode.get(fallback);
  if (!fallbackCue) return fallback;
  const sameDocument = fallbackOrder.filter((derivedNodeId) =>
    cuesByNode.get(derivedNodeId)?.sourceDocumentId === fallbackCue.sourceDocumentId
  );
  sameDocument.sort((left, right) => {
    const leftCue = cuesByNode.get(left);
    const rightCue = cuesByNode.get(right);
    if (!leftCue || !rightCue) return 0;
    return compareCuePosition(leftCue, rightCue) ||
      compareConceptFallback(requiredConcept(conceptsById, left), requiredConcept(conceptsById, right));
  });
  return sameDocument[0] ?? fallback;
}

function solveRoute(input: {
  orderedDerivedNodeIds: readonly string[];
  cuesByNode: ReadonlyMap<string, ExpeditionInstructionalSourceCue>;
  bonusCandidates: readonly BonusCandidate[];
  routePosition: ReadonlyMap<string, number>;
  policy: RoutePolicyDefinition;
}): RouteState | null {
  const statesByPosition = Array.from(
    { length: input.orderedDerivedNodeIds.length + 1 },
    () => new Map<string, RouteState>()
  );
  statesByPosition[0].set("0:0", {
    position: 0,
    matchingCount: 0,
    impostorCount: 0,
    sourceTransitionCount: 0,
    targetSizeDistance: 0,
    legs: []
  });

  for (let position = 0; position < input.orderedDerivedNodeIds.length; position += 1) {
    for (const state of statesByPosition[position].values()) {
      for (
        let legSize = input.policy.minimumLegConcepts;
        legSize <= input.policy.maximumLegConcepts;
        legSize += 1
      ) {
        const end = position + legSize;
        if (end > input.orderedDerivedNodeIds.length) break;
        const remaining = input.orderedDerivedNodeIds.length - end;
        if (remaining > 0 && !hasLegSizePartition(remaining, input.policy)) continue;
        const derivedNodeIds = input.orderedDerivedNodeIds.slice(position, end);
        const selections = bonusSelectionsForLeg(
          derivedNodeIds,
          input.bonusCandidates,
          input.routePosition,
          input.policy.requireBonusPerLeg
        );
        for (const selected of selections) {
          const matchingCount = state.matchingCount + selected.filter((candidate) =>
            candidate.itemType === "matching"
          ).length;
          const impostorCount = state.impostorCount + selected.filter((candidate) =>
            candidate.itemType === "impostor"
          ).length;
          const candidate: RouteState = {
            position: end,
            matchingCount,
            impostorCount,
            sourceTransitionCount: state.sourceTransitionCount + sourceTransitions(
              derivedNodeIds,
              input.cuesByNode
            ),
            targetSizeDistance: state.targetSizeDistance + Math.abs(
              legSize - input.policy.targetLegConcepts
            ),
            legs: [...state.legs, { derivedNodeIds, selected }]
          };
          const key = `${matchingCount}:${impostorCount}`;
          const current = statesByPosition[end].get(key);
          if (!current || compareEquivalentCountStates(candidate, current, input.routePosition) < 0) {
            statesByPosition[end].set(key, candidate);
          }
        }
      }
    }
  }

  const finals = [...statesByPosition[input.orderedDerivedNodeIds.length].values()]
    .filter((state) => !input.policy.requireBothBonusFamilies ||
      (state.matchingCount > 0 && state.impostorCount > 0));
  finals.sort((left, right) => compareFinalStates(left, right, input.routePosition));
  return finals[0] ?? null;
}

function bonusSelectionsForLeg(
  derivedNodeIds: readonly string[],
  candidates: readonly BonusCandidate[],
  routePosition: ReadonlyMap<string, number>,
  required: boolean
): BonusCandidate[][] {
  if (!required) return [[]];
  const within = new Set(derivedNodeIds);
  const matching = candidates.find((candidate) =>
    candidate.itemType === "matching" && within.has(candidate.derivedNodeId)
  );
  const impostor = candidates.find((candidate) =>
    candidate.itemType === "impostor" && within.has(candidate.derivedNodeId)
  );
  const selections: BonusCandidate[][] = [];
  if (matching) selections.push([matching]);
  if (impostor) selections.push([impostor]);
  if (matching && impostor) {
    selections.push([matching, impostor].sort((left, right) =>
      compareBonusCandidates(left, right, routePosition)
    ));
  }
  return selections;
}

function compareEquivalentCountStates(
  left: RouteState,
  right: RouteState,
  routePosition: ReadonlyMap<string, number>
): number {
  return left.sourceTransitionCount - right.sourceTransitionCount ||
    left.targetSizeDistance - right.targetSizeDistance ||
    compareNumberArrays(boundaryVector(left), boundaryVector(right)) ||
    compareSelections(left, right, routePosition);
}

function compareFinalStates(
  left: RouteState,
  right: RouteState,
  routePosition: ReadonlyMap<string, number>
): number {
  return left.sourceTransitionCount - right.sourceTransitionCount ||
    left.targetSizeDistance - right.targetSizeDistance ||
    selectedCount(left) - selectedCount(right) ||
    Math.abs(left.matchingCount - left.impostorCount) -
      Math.abs(right.matchingCount - right.impostorCount) ||
    compareNumberArrays(boundaryVector(left), boundaryVector(right)) ||
    compareSelections(left, right, routePosition);
}

function compareSelections(
  left: RouteState,
  right: RouteState,
  routePosition: ReadonlyMap<string, number>
): number {
  const leftCandidates = left.legs.flatMap((leg) => leg.selected);
  const rightCandidates = right.legs.flatMap((leg) => leg.selected);
  const count = Math.min(leftCandidates.length, rightCandidates.length);
  for (let index = 0; index < count; index += 1) {
    const compared = compareBonusCandidates(
      leftCandidates[index],
      rightCandidates[index],
      routePosition
    );
    if (compared !== 0) return compared;
  }
  return leftCandidates.length - rightCandidates.length;
}

function compareBonusCandidates(
  left: BonusCandidate,
  right: BonusCandidate,
  routePosition: ReadonlyMap<string, number>
): number {
  return requiredPosition(routePosition, left.derivedNodeId) -
    requiredPosition(routePosition, right.derivedNodeId) ||
    bonusFamilyRank(left.itemType) - bonusFamilyRank(right.itemType) ||
    left.studyItemId.localeCompare(right.studyItemId);
}

function sourceTransitions(
  derivedNodeIds: readonly string[],
  cuesByNode: ReadonlyMap<string, ExpeditionInstructionalSourceCue>
): number {
  let transitions = 0;
  for (let index = 1; index < derivedNodeIds.length; index += 1) {
    const previous = cuesByNode.get(derivedNodeIds[index - 1]);
    const current = cuesByNode.get(derivedNodeIds[index]);
    if (!previous || !current) continue;
    if (previous.sourceDocumentId !== current.sourceDocumentId ||
        majorHeading(previous) !== majorHeading(current)) {
      transitions += 1;
    }
  }
  return transitions;
}

function hasLegSizePartition(total: number, policy: RoutePolicyDefinition): boolean {
  if (total === 0) return policy.allowEmpty;
  if (total < policy.minimumLegConcepts) return policy.allowUndersizedSingleLeg;
  for (let legCount = 1; legCount <= total; legCount += 1) {
    if (legCount * policy.minimumLegConcepts <= total &&
        legCount * policy.maximumLegConcepts >= total) {
      return true;
    }
  }
  return false;
}

function unavailable(
  reason: ExpeditionRouteUnavailableReason,
  input: {
    concepts: readonly ExpeditionRouteConcept[];
    trustedPrerequisiteEdges: readonly ExpeditionRouteEdge[];
    qualifiedStudyItemCandidates?: readonly ExpeditionRouteStudyItemCandidate[];
  },
  orderedDerivedNodeIds: string[],
  implicatedIds: string[]
): ExpeditionRoutePlanningResult {
  const bonusCandidates = (input.qualifiedStudyItemCandidates ?? []).filter((candidate) =>
    candidate.itemType === "matching" || candidate.itemType === "impostor"
  );
  const bonusNodeIds = new Set(bonusCandidates.map((candidate) => candidate.derivedNodeId));
  return {
    status: "unavailable",
    reason,
    diagnostics: {
      conceptCount: input.concepts.length,
      trustedEdgeCount: input.trustedPrerequisiteEdges.length,
      orderedDerivedNodeIds,
      matchingCandidateCount: bonusCandidates.filter((candidate) =>
        candidate.itemType === "matching"
      ).length,
      impostorCandidateCount: bonusCandidates.filter((candidate) =>
        candidate.itemType === "impostor"
      ).length,
      uncoveredBonusWindows: uncoveredWindows(orderedDerivedNodeIds, bonusNodeIds),
      implicatedIds: uniqueSorted(implicatedIds)
    }
  };
}

function uncoveredWindows(
  orderedDerivedNodeIds: readonly string[],
  bonusNodeIds: ReadonlySet<string>
): ExpeditionRouteDiagnostics["uncoveredBonusWindows"] {
  const windows: ExpeditionRouteDiagnostics["uncoveredBonusWindows"] = [];
  let start: number | null = null;
  for (let position = 0; position <= orderedDerivedNodeIds.length; position += 1) {
    const covered = position < orderedDerivedNodeIds.length &&
      bonusNodeIds.has(orderedDerivedNodeIds[position]);
    if (!covered && position < orderedDerivedNodeIds.length && start === null) start = position;
    if ((covered || position === orderedDerivedNodeIds.length) && start !== null) {
      windows.push({
        startPosition: start,
        endPosition: position - 1,
        derivedNodeIds: orderedDerivedNodeIds.slice(start, position)
      });
      start = null;
    }
  }
  return windows;
}

function uniqueEdges(edges: readonly ExpeditionRouteEdge[]): ExpeditionRouteEdge[] {
  return [...new Map(edges.map((edge) => [
    `${edge.prerequisiteDerivedNodeId}\u0000${edge.dependentDerivedNodeId}`,
    edge
  ] as const)).values()].sort((left, right) =>
    left.prerequisiteDerivedNodeId.localeCompare(right.prerequisiteDerivedNodeId) ||
    left.dependentDerivedNodeId.localeCompare(right.dependentDerivedNodeId)
  );
}

function compareConceptFallback(
  left: ExpeditionRouteConcept,
  right: ExpeditionRouteConcept
): number {
  return (left.difficulty ?? 0) - (right.difficulty ?? 0) ||
    left.canonicalLabel.localeCompare(right.canonicalLabel) ||
    left.derivedNodeId.localeCompare(right.derivedNodeId);
}

function compareEvidenceCandidate(
  left: { record: SourceEvidenceRecord; sectionIndex: number },
  right: { record: SourceEvidenceRecord; sectionIndex: number }
): number {
  if (left.record.sourceDocumentId === right.record.sourceDocumentId) {
    return compareSourcePosition(left.record, right.record) ||
      left.sectionIndex - right.sectionIndex;
  }
  return left.sectionIndex - right.sectionIndex ||
    left.record.sourceResourceId.localeCompare(right.record.sourceResourceId) ||
    left.record.sourceDocumentId.localeCompare(right.record.sourceDocumentId) ||
    compareSourcePosition(left.record, right.record);
}

function compareCuePosition(
  left: ExpeditionInstructionalSourceCue,
  right: ExpeditionInstructionalSourceCue
): number {
  return compareSourcePosition(left, right);
}

function compareSourcePosition(
  left: Pick<SourceEvidenceRecord, "locator" | "blockId" | "sourceBlockId">,
  right: Pick<SourceEvidenceRecord, "locator" | "blockId" | "sourceBlockId">
): number {
  const leftPosition = locatorPosition(left.locator);
  const rightPosition = locatorPosition(right.locator);
  return leftPosition.kind - rightPosition.kind ||
    leftPosition.primary - rightPosition.primary ||
    leftPosition.secondary - rightPosition.secondary ||
    naturalCompare(leftPosition.text, rightPosition.text) ||
    naturalCompare(left.blockId, right.blockId) ||
    left.sourceBlockId.localeCompare(right.sourceBlockId);
}

function locatorPosition(locator: SourceLocator): {
  kind: number;
  primary: number;
  secondary: number;
  text: string;
} {
  const characterStart = finiteOrMaximum(locator.characterStart);
  if (Number.isFinite(locator.page)) {
    return { kind: 0, primary: locator.page as number, secondary: characterStart, text: "" };
  }
  if (Number.isFinite(locator.slide)) {
    return { kind: 1, primary: locator.slide as number, secondary: characterStart, text: "" };
  }
  if (Number.isFinite(locator.characterStart)) {
    return { kind: 2, primary: locator.characterStart as number, secondary: 0, text: "" };
  }
  if (locator.xpath) return { kind: 3, primary: 0, secondary: 0, text: locator.xpath };
  return { kind: 4, primary: 0, secondary: 0, text: "" };
}

function cueFromEvidence(
  derivedNodeId: string,
  record: SourceEvidenceRecord
): ExpeditionInstructionalSourceCue {
  return {
    derivedNodeId,
    sourceResourceId: record.sourceResourceId,
    sourceDocumentId: record.sourceDocumentId,
    sourceBlockId: record.sourceBlockId,
    blockId: record.blockId,
    headingPath: record.headingPath,
    locator: record.locator
  };
}

function evidenceKey(reference: {
  sourceResourceId: string;
  sourceBlockId: string;
}): string {
  return `${reference.sourceResourceId}\u0000${reference.sourceBlockId}`;
}

function requiredConcept(
  conceptsById: ReadonlyMap<string, ExpeditionRouteConcept>,
  derivedNodeId: string
): ExpeditionRouteConcept {
  const concept = conceptsById.get(derivedNodeId);
  if (!concept) throw new Error(`Route Concept ${JSON.stringify(derivedNodeId)} is missing.`);
  return concept;
}

function requiredPosition(positions: ReadonlyMap<string, number>, derivedNodeId: string): number {
  const position = positions.get(derivedNodeId);
  if (position === undefined) {
    throw new Error(`Route position for ${JSON.stringify(derivedNodeId)} is missing.`);
  }
  return position;
}

function boundaryVector(state: RouteState): number[] {
  let position = 0;
  return state.legs.map((leg) => {
    position += leg.derivedNodeIds.length;
    return position;
  });
}

function selectedCount(state: RouteState): number {
  return state.matchingCount + state.impostorCount;
}

function bonusFamilyRank(itemType: BonusCandidate["itemType"]): number {
  return itemType === "matching" ? 0 : 1;
}

function majorHeading(cue: ExpeditionInstructionalSourceCue): string {
  // Structured Markdown retains the document H1 at index zero and the authored major section at
  // index one. A shallower parser path has no document-title wrapper, so its first heading remains
  // the coherence boundary.
  return cue.headingPath[1] ?? cue.headingPath[0] ?? "";
}

function compareNumberArrays(left: readonly number[], right: readonly number[]): number {
  const count = Math.min(left.length, right.length);
  for (let index = 0; index < count; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

function naturalCompare(left: string, right: string): number {
  const leftParts = left.match(/\d+|\D+/g) ?? [];
  const rightParts = right.match(/\d+|\D+/g) ?? [];
  const count = Math.min(leftParts.length, rightParts.length);
  for (let index = 0; index < count; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) {
      const leftNormalized = leftPart.replace(/^0+(?=\d)/, "");
      const rightNormalized = rightPart.replace(/^0+(?=\d)/, "");
      if (leftNormalized.length !== rightNormalized.length) {
        return leftNormalized.length - rightNormalized.length;
      }
      if (leftNormalized !== rightNormalized) {
        return leftNormalized < rightNormalized ? -1 : 1;
      }
      if (leftPart.length !== rightPart.length) return leftPart.length - rightPart.length;
      continue;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    if (leftPart !== rightPart) return leftPart < rightPart ? -1 : 1;
  }
  return leftParts.length - rightParts.length || left.localeCompare(right);
}

function finiteOrMaximum(value: number | undefined): number {
  return Number.isFinite(value) ? value as number : Number.MAX_SAFE_INTEGER;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
