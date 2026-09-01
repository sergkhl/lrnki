import type { AuthoredActivity } from "./contentSchema";
import type {
  ExpeditionJourneyState,
  GuardianChallenge,
  GuardianEvent,
  GuardianLineupEntry,
  GuardianScope
} from "./learnerState";
import type { GuardianView } from "./runtimeTypes";
import type { ActivityLocation, RuntimeExpedition } from "./runtimeContent";
import { stableFingerprint } from "./runtimeContent";

export const GUARDIAN_SHIELD_TOTAL = 3;
export const LEG_GUARDIAN_LINEUP_MAX = 5;
export const EXPEDITION_GUARDIAN_LINEUP_MAX = 7;

export type GuardianCombatState = Readonly<{
  phase: "active" | "recovery" | "won";
  remainingShield: number;
  unresolvedActivityKeys: ReadonlyArray<string>;
  resolvedActivityKeys: ReadonlyArray<string>;
  retreated: boolean;
  abandoned: boolean;
  matching: Readonly<{
    activityKey: string;
    matchedLeftKeys: ReadonlyArray<string>;
    roundHasMiss: boolean;
    roundIndex: number;
  }> | null;
}>;

export function guardianScopeKey(scope: GuardianScope): string {
  return scope.kind === "leg" ? `leg:${scope.legKey}` : "expedition";
}

function matchingPairCount(
  expedition: RuntimeExpedition,
  activityKey: string
): number {
  const activity = expedition.activities.get(activityKey)?.activity;
  return activity?.family === "matching" ? activity.pairs.length : 0;
}

export function foldGuardianChallenge(
  expedition: RuntimeExpedition,
  challenge: Pick<GuardianChallenge, "lineup" | "events">
): GuardianCombatState {
  let remainingShield = GUARDIAN_SHIELD_TOTAL;
  const unresolvedActivityKeys = challenge.lineup.map((entry) => entry.activityKey);
  const resolvedActivityKeys: string[] = [];
  let retreated = false;
  let abandoned = false;
  let matching: {
    activityKey: string;
    matchedLeftKeys: string[];
    roundHasMiss: boolean;
    roundIndex: number;
  } | null = null;
  const roundIndexByActivity = new Map<string, number>();

  const miss = (): void => {
    if (remainingShield > 0) remainingShield -= 1;
    if (unresolvedActivityKeys.length > 1) {
      const current = unresolvedActivityKeys.shift();
      if (current) unresolvedActivityKeys.push(current);
    }
    matching = null;
  };
  const resolve = (): void => {
    const wasRecovery = remainingShield === 0;
    const current = unresolvedActivityKeys.shift();
    if (current) resolvedActivityKeys.push(current);
    if (wasRecovery) remainingShield = 1;
    matching = null;
  };

  for (const event of [...challenge.events].sort((left, right) => left.seq - right.seq)) {
    if (!("activityKey" in event)) {
      if (event.kind === "retreat") retreated = true;
      else if (event.kind === "resume") retreated = false;
      else abandoned = true;
      continue;
    }
    const currentActivityKey = unresolvedActivityKeys[0];
    if (!currentActivityKey || event.activityKey !== currentActivityKey) continue;
    if (event.kind === "selection_answer") {
      if (event.correct) resolve();
      else miss();
      continue;
    }

    const currentMatching = matching as {
      activityKey: string;
      matchedLeftKeys: string[];
      roundHasMiss: boolean;
      roundIndex: number;
    } | null;
    if (!currentMatching || currentMatching.activityKey !== currentActivityKey) {
      matching = {
        activityKey: currentActivityKey,
        matchedLeftKeys: [],
        roundHasMiss: false,
        roundIndex: roundIndexByActivity.get(currentActivityKey) ?? 0
      };
    }
    const board = matching as NonNullable<typeof matching>;
    if (!event.correct) {
      board.roundHasMiss = true;
      continue;
    }
    if (!board.matchedLeftKeys.includes(event.leftKey)) {
      board.matchedLeftKeys.push(event.leftKey);
    }
    const pairCount = matchingPairCount(expedition, currentActivityKey);
    if (pairCount > 0 && board.matchedLeftKeys.length >= pairCount) {
      if (board.roundHasMiss) {
        roundIndexByActivity.set(currentActivityKey, board.roundIndex + 1);
        miss();
      } else {
        resolve();
      }
    }
  }

  return {
    phase: unresolvedActivityKeys.length === 0
      ? "won"
      : remainingShield === 0
        ? "recovery"
        : "active",
    remainingShield,
    unresolvedActivityKeys,
    resolvedActivityKeys,
    retreated,
    abandoned,
    matching
  };
}

function exposureRank(
  journey: ExpeditionJourneyState,
  challengeId: string,
  left: ActivityLocation,
  right: ActivityLocation
): number {
  return (journey.guardianExposure[left.activity.key] ?? 0) -
    (journey.guardianExposure[right.activity.key] ?? 0) ||
    stableFingerprint([challengeId, left.activity.key]).localeCompare(
      stableFingerprint([challengeId, right.activity.key])
    ) ||
    left.activity.key.localeCompare(right.activity.key);
}

export function eligibleGuardianActivities(
  expedition: RuntimeExpedition,
  journey: ExpeditionJourneyState,
  scope: GuardianScope
): ActivityLocation[] {
  const pool = scope.kind === "leg"
    ? expedition.legs.get(scope.legKey)?.guardianActivityKeys ?? []
    : expedition.document.expeditionGuardianActivityKeys;
  return pool
    .map((activityKey) => expedition.activities.get(activityKey))
    .filter((candidate): candidate is ActivityLocation => Boolean(candidate))
    .filter(
      (candidate) => journey.latestActivityOutcomes[candidate.activity.key]?.correct === true
    );
}

export function selectGuardianLineup(input: {
  expedition: RuntimeExpedition;
  journey: ExpeditionJourneyState;
  scope: GuardianScope;
  challengeId: string;
}): GuardianLineupEntry[] {
  const max = input.scope.kind === "leg"
    ? LEG_GUARDIAN_LINEUP_MAX
    : EXPEDITION_GUARDIAN_LINEUP_MAX;
  const remaining = eligibleGuardianActivities(
    input.expedition,
    input.journey,
    input.scope
  );
  const picked: ActivityLocation[] = [];
  const take = (candidate: ActivityLocation | undefined): void => {
    if (!candidate || picked.length >= max) return;
    const index = remaining.findIndex(
      (entry) => entry.activity.key === candidate.activity.key
    );
    if (index < 0) return;
    picked.push(candidate);
    remaining.splice(index, 1);
  };
  const best = (candidates: readonly ActivityLocation[]): ActivityLocation | undefined =>
    [...candidates].sort((left, right) =>
      exposureRank(input.journey, input.challengeId, left, right)
    )[0];

  if (input.scope.kind === "leg") {
    take(best(remaining.filter((entry) => entry.activity.family !== "option_select")));
    while (picked.length < max && remaining.length > 0) take(best(remaining));
  } else {
    for (const family of ["option_select", "matching", "impostor"] as const) {
      take(best(remaining.filter((entry) => entry.activity.family === family)));
    }
    const coveredLegs = new Set(picked.map((entry) => entry.leg.key));
    while (picked.length < max && remaining.length > 0) {
      const uncovered = remaining.filter((entry) => !coveredLegs.has(entry.leg.key));
      const next = best(uncovered.length > 0 ? uncovered : remaining);
      take(next);
      if (next) coveredLegs.add(next.leg.key);
    }
  }

  return picked.map(({ stop, activity }) => ({
    stopKey: stop.key,
    activityKey: activity.key,
    family: activity.family
  }));
}

export function selectionCorrectKey(activity: AuthoredActivity): string | null {
  if (activity.family === "option_select") return activity.answerKey;
  if (activity.family === "impostor") {
    return activity.statements.find((statement) => statement.kind === "impostor")?.key ?? null;
  }
  return null;
}

export function projectGuardianView(input: {
  expedition: RuntimeExpedition;
  journey: ExpeditionJourneyState;
  challenge: GuardianChallenge;
}): GuardianView {
  const combat = foldGuardianChallenge(input.expedition, input.challenge);
  const firstWin =
    input.journey.firstGuardianWins[guardianScopeKey(input.challenge.scope)] ===
    input.challenge.challengeId;
  if (combat.phase === "won") {
    return {
      kind: "guardian",
      state: "won",
      expeditionKey: input.expedition.document.key,
      challengeId: input.challenge.challengeId,
      scope: input.challenge.scope,
      wardTotal: input.challenge.lineup.length,
      firstWin
    };
  }
  const currentActivityKey = combat.unresolvedActivityKeys[0];
  const currentActivity = currentActivityKey
    ? input.expedition.activities.get(currentActivityKey)?.publicActivity
    : undefined;
  if (!currentActivity) {
    throw new Error(
      `Guardian ${input.challenge.challengeId} cannot hydrate current Activity ${currentActivityKey ?? "<none>"}`
    );
  }
  return {
    kind: "guardian",
    state: combat.phase,
    expeditionKey: input.expedition.document.key,
    challengeId: input.challenge.challengeId,
    scope: input.challenge.scope,
    wardTotal: input.challenge.lineup.length,
    unresolvedWardCount: combat.unresolvedActivityKeys.length,
    resolvedWardCount: combat.resolvedActivityKeys.length,
    remainingShield: combat.remainingShield,
    shieldTotal: GUARDIAN_SHIELD_TOTAL,
    retreated: combat.retreated,
    sourceCredits: input.expedition.projection.sourceCredits,
    currentActivity,
    matchingProgress:
      combat.matching?.activityKey === currentActivityKey
        ? {
            matchedLeftKeys: combat.matching.matchedLeftKeys,
            roundIndex: combat.matching.roundIndex
          }
        : null
  };
}

export function nextGuardianEventSeq(challenge: GuardianChallenge): number {
  return challenge.events.reduce((max, event) => Math.max(max, event.seq), 0) + 1;
}

export function withGuardianEvent(
  challenge: GuardianChallenge,
  event: GuardianEvent
): GuardianChallenge {
  return { ...challenge, events: [...challenge.events, event] };
}
