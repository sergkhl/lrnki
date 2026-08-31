import type { LearnerStateV1 } from "./learnerState";
import {
  eligibleGuardianActivities,
  guardianScopeKey,
  projectGuardianView
} from "./guardian";
import type {
  CatalogView,
  ExpeditionView,
  GuardianScopeStatusView,
  GuardianView,
  JournalView,
  StopProgressView,
  SupportPathView
} from "./runtimeTypes";
import {
  evidenceMasteredStopKeys,
  knownClosureStopKeys,
  masteredStopKeys,
  restorationStopKeys,
  type RuntimeCatalog,
  type RuntimeExpedition
} from "./runtimeContent";

export function projectJournal(
  catalog: RuntimeCatalog,
  state: Readonly<LearnerStateV1>
): JournalView {
  const expeditions: JournalView["expeditions"][number][] = [];
  const ordered = [
    ...catalog.qualified.orderedKeys,
    ...Object.keys(state.expeditions)
      .filter((key) => !catalog.expeditions.has(key))
      .sort()
  ];
  for (const expeditionKey of ordered) {
    const journey = state.expeditions[expeditionKey];
    if (!journey) continue;
    const expedition = catalog.expeditions.get(expeditionKey);
    const contentChanged = !expedition || expedition.revision !== journey.contentRevision;
    if (!expedition) {
      expeditions.push({
        expeditionKey,
        title: expeditionKey,
        contentRevision: journey.contentRevision,
        contentChanged: true,
        adoptedAt: journey.adoptedAt,
        masteredStopCount: 0,
        knownStopCount: 0,
        totalStopCount: 0
      });
      continue;
    }
    const evidence = contentChanged
      ? new Set<string>()
      : evidenceMasteredStopKeys(expedition, journey);
    const known = contentChanged
      ? new Set<string>()
      : knownClosureStopKeys(expedition, journey);
    expeditions.push({
      expeditionKey,
      title: expedition.document.title,
      contentRevision: journey.contentRevision,
      contentChanged,
      adoptedAt: journey.adoptedAt,
      masteredStopCount: evidence.size,
      knownStopCount: [...known].filter((stopKey) => !evidence.has(stopKey)).length,
      totalStopCount: expedition.stops.size
    });
  }
  return {
    kind: "journal",
    activeExpeditionKey: state.activeExpeditionKey,
    expeditions
  };
}

export function projectCatalogView(
  catalog: RuntimeCatalog,
  state: Readonly<LearnerStateV1>
): CatalogView {
  return {
    kind: "catalog",
    catalogRevision: catalog.qualified.catalogRevision,
    expeditions: catalog.projections.map((projection) => ({
      expeditionKey: projection.key,
      title: projection.title,
      teaser: projection.teaser,
      declaredDomain: projection.declaredDomain,
      audience: projection.audience,
      sourceCredits: projection.sourceCredits,
      contentRevision: projection.contentRevision,
      adopted: Boolean(state.expeditions[projection.key]),
      active: state.activeExpeditionKey === projection.key
    }))
  };
}

function projectStopProgress(
  expedition: RuntimeExpedition,
  state: Readonly<LearnerStateV1>
): StopProgressView[] {
  const journey = state.expeditions[expedition.document.key];
  if (!journey) return [];
  const evidence = evidenceMasteredStopKeys(expedition, journey);
  const known = knownClosureStopKeys(expedition, journey);
  const mastered = new Set([...evidence, ...known]);
  const result: StopProgressView[] = [];
  for (const leg of expedition.document.legs) {
    for (const stop of leg.stops) {
      const stateName = evidence.has(stop.key)
        ? "mastered"
        : known.has(stop.key)
          ? "known"
          : stop.requires.every((required) => mastered.has(required))
            ? "available"
            : "locked";
      result.push({
        stopKey: stop.key,
        state: stateName,
        lessonReadAt: journey.firstLessonReadAt[stop.key] ?? null,
        latestActivityOutcomes: stop.activities.flatMap((activity) => {
          const outcome = journey.latestActivityOutcomes[activity.key];
          return outcome
            ? [
                {
                  activityKey: activity.key,
                  correct: outcome.correct,
                  answeredAt: outcome.answeredAt
                }
              ]
            : [];
        }),
        firstGradedCompletion:
          journey.firstGradedStopCompletions[stop.key] ?? null,
        restorationStopKeys: restorationStopKeys(
          expedition,
          journey,
          stop.key
        )
      });
    }
  }
  return result;
}

function projectSupportPaths(
  expedition: RuntimeExpedition,
  state: Readonly<LearnerStateV1>
): SupportPathView[] {
  const journey = state.expeditions[expedition.document.key];
  if (!journey) return [];
  const result: SupportPathView[] = [];
  for (const { stop, supportPath } of expedition.supportPaths.values()) {
    const persisted = journey.supportPaths[supportPath.key];
    result.push({
      supportPathKey: supportPath.key,
      parentStopKey: stop.key,
      term: supportPath.term,
      status: persisted?.status ?? "closed",
      steps: supportPath.steps.map((step) => {
        const targetStop = expedition.stops.get(step.stopKey);
        const targetActivity = expedition.activities.get(step.activityKey);
        if (!targetStop || !targetActivity) {
          throw new Error(
            `qualified Support Path ${supportPath.key} lost target ${step.stopKey}/${step.activityKey}`
          );
        }
        return {
          stopKey: step.stopKey,
          activityKey: step.activityKey,
          stopLabel: targetStop.label,
          lesson: expedition.projection.legs
            .flatMap((leg) => leg.stops)
            .find((candidate) => candidate.key === step.stopKey)?.lesson ?? {
            sections: []
          },
          activity: targetActivity.publicActivity
        };
      })
    });
  }
  return result;
}

function activeChallengeForScope(
  state: Readonly<LearnerStateV1>,
  expeditionKey: string,
  scopeKey: string
): string | null {
  const journey = state.expeditions[expeditionKey];
  if (!journey) return null;
  return Object.values(journey.guardianChallenges).find(
    (challenge) =>
      challenge.status === "active" && guardianScopeKey(challenge.scope) === scopeKey
  )?.challengeId ?? null;
}

export function projectGuardianStatuses(
  expedition: RuntimeExpedition,
  state: Readonly<LearnerStateV1>
): GuardianScopeStatusView[] {
  const journey = state.expeditions[expedition.document.key];
  if (!journey) return [];
  const mastered = masteredStopKeys(expedition, journey);
  const statuses: GuardianScopeStatusView[] = [];
  const winnableLegKeys = new Set<string>();

  for (const leg of expedition.document.legs) {
    const scope = { kind: "leg" as const, legKey: leg.key };
    const scopeKey = guardianScopeKey(scope);
    const eligible = eligibleGuardianActivities(expedition, journey, scope);
    if (eligible.length > 0) winnableLegKeys.add(leg.key);
    const complete = leg.stops.every((stop) => mastered.has(stop.key));
    const firstWinChallengeId = journey.firstGuardianWins[scopeKey] ?? null;
    const activeChallengeId = activeChallengeForScope(
      state,
      expedition.document.key,
      scopeKey
    );
    const stateName = firstWinChallengeId
      ? "won"
      : activeChallengeId
        ? "active"
        : !complete
          ? "locked"
          : eligible.length === 0
            ? "unavailable"
            : "available";
    statuses.push({
      scope,
      state: stateName,
      eligibleActivityCount: eligible.length,
      activeChallengeId,
      firstWinChallengeId
    });
  }

  const expeditionScope = { kind: "expedition" as const };
  const expeditionScopeKey = guardianScopeKey(expeditionScope);
  const eligible = eligibleGuardianActivities(expedition, journey, expeditionScope);
  const allStopsComplete = [...expedition.stops.keys()].every((stopKey) =>
    mastered.has(stopKey)
  );
  const allWinnableLegsWon = [...winnableLegKeys].every((legKey) =>
    Boolean(journey.firstGuardianWins[guardianScopeKey({ kind: "leg", legKey })])
  );
  const firstWinChallengeId =
    journey.firstGuardianWins[expeditionScopeKey] ?? null;
  const activeChallengeId = activeChallengeForScope(
    state,
    expedition.document.key,
    expeditionScopeKey
  );
  const stateName = firstWinChallengeId
    ? "won"
    : activeChallengeId
      ? "active"
      : !allStopsComplete || !allWinnableLegsWon
        ? "locked"
        : eligible.length === 0
          ? "unavailable"
          : "available";
  statuses.push({
    scope: expeditionScope,
    state: stateName,
    eligibleActivityCount: eligible.length,
    activeChallengeId,
    firstWinChallengeId
  });
  return statuses;
}

export function projectExpeditionView(
  expedition: RuntimeExpedition,
  state: Readonly<LearnerStateV1>
): ExpeditionView {
  return {
    kind: "expedition",
    expedition: expedition.projection,
    active: state.activeExpeditionKey === expedition.document.key,
    progress: projectStopProgress(expedition, state),
    supportPaths: projectSupportPaths(expedition, state),
    guardians: projectGuardianStatuses(expedition, state)
  };
}

export function projectGuardianChallenge(
  expedition: RuntimeExpedition,
  state: Readonly<LearnerStateV1>,
  challengeId: string
): GuardianView | undefined {
  const journey = state.expeditions[expedition.document.key];
  const challenge = journey?.guardianChallenges[challengeId];
  if (!journey || !challenge || challenge.status === "abandoned") return undefined;
  return projectGuardianView({ expedition, journey, challenge });
}
