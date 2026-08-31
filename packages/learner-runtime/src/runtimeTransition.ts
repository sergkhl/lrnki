import type {
  AuthoredActivity,
  AuthoredMatching,
  AuthoredStop
} from "./contentSchema";
import {
  foldGuardianChallenge,
  guardianScopeKey,
  matchingPairKeyFromPublic,
  nextGuardianEventSeq,
  selectGuardianLineup,
  selectionCorrectKey,
  withGuardianEvent
} from "./guardian";
import {
  parseLearnerStateV1,
  type CommandEffect,
  type ExpeditionJourneyState,
  type GuardianChallenge,
  type GuardianScope,
  type LearnerAward,
  type LearnerStateV1
} from "./learnerState";
import type {
  AcquisitionSource,
  CommandRefusal,
  LearnerCommand
} from "./runtimeTypes";
import {
  evidenceMasteredStopKeys,
  masteredStopKeys,
  type RuntimeExpedition
} from "./runtimeContent";

export type AppliedCommand = Readonly<{
  applied: true;
  next: LearnerStateV1;
  effect: CommandEffect;
}>;

export type RefusedCommand = Readonly<{
  applied: false;
  reason: CommandRefusal;
}>;

export type ApplyCommandResult = AppliedCommand | RefusedCommand;

export type ApplyCommandInput = Readonly<{
  state: Readonly<LearnerStateV1>;
  expedition: RuntimeExpedition;
  command: LearnerCommand;
  requestId: string;
  occurredAt: string;
  challengeId: string;
}>;

function baseEffect(
  kind: CommandEffect["kind"],
  expeditionKey: string
): CommandEffect {
  return {
    kind,
    expeditionKey,
    legKey: null,
    stopKey: null,
    activityKey: null,
    supportPathKey: null,
    challengeId: null,
    correct: null,
    revealKey: null,
    newlyCompletedStop: false,
    pointsAwarded: 0,
    firstGuardianWin: false
  };
}

function emptyJourney(
  contentRevision: string,
  adoptedAt: string
): ExpeditionJourneyState {
  return {
    contentRevision,
    adoptedAt,
    firstLessonReadAt: {},
    acquisitionAttempts: [],
    latestActivityOutcomes: {},
    firstGradedStopCompletions: {},
    calibrationKnownStopKeys: [],
    supportPaths: {},
    guardianChallenges: {},
    guardianExposure: {},
    firstGuardianWins: {}
  };
}

function stopUnlocked(
  expedition: RuntimeExpedition,
  journey: ExpeditionJourneyState,
  stop: AuthoredStop
): boolean {
  const mastered = masteredStopKeys(expedition, journey);
  return stop.requires.every((required) => mastered.has(required));
}

function completeStopIfEarned(input: {
  expedition: RuntimeExpedition;
  journey: ExpeditionJourneyState;
  stop: AuthoredStop;
  occurredAt: string;
}): { newlyCompleted: boolean; points: number } {
  if (input.journey.firstGradedStopCompletions[input.stop.key]) {
    return { newlyCompleted: false, points: 0 };
  }
  if (!evidenceMasteredStopKeys(input.expedition, input.journey).has(input.stop.key)) {
    return { newlyCompleted: false, points: 0 };
  }
  input.journey.firstGradedStopCompletions[input.stop.key] = {
    completedAt: input.occurredAt,
    difficultyBand: input.stop.difficultyBand,
    points: input.stop.difficultyBand
  };
  return { newlyCompleted: true, points: input.stop.difficultyBand };
}

function supportSourceValid(input: {
  expedition: RuntimeExpedition;
  journey: ExpeditionJourneyState;
  stopKey: string;
  activityKey: string;
  source: AcquisitionSource;
}): boolean {
  if (input.source.kind === "trail") return true;
  const support = input.expedition.supportPaths.get(input.source.supportPathKey);
  if (!support || input.journey.supportPaths[input.source.supportPathKey]?.status !== "open") {
    return false;
  }
  return support.supportPath.steps.some(
    (step) => step.stopKey === input.stopKey && step.activityKey === input.activityKey
  );
}

function acquisitionLocation(input: {
  expedition: RuntimeExpedition;
  journey: ExpeditionJourneyState;
  stopKey: string;
  activityKey: string;
  source: AcquisitionSource;
}):
  | { ok: true; stop: AuthoredStop; activity: AuthoredActivity }
  | { ok: false; reason: CommandRefusal } {
  const stop = input.expedition.stops.get(input.stopKey);
  const location = input.expedition.activities.get(input.activityKey);
  if (!stop || !location || location.stop.key !== input.stopKey) {
    return { ok: false, reason: "activity_not_found" };
  }
  if (!supportSourceValid(input)) {
    return { ok: false, reason: "support_activity_mismatch" };
  }
  if (input.source.kind === "trail" && !stopUnlocked(input.expedition, input.journey, stop)) {
    return { ok: false, reason: "stop_locked" };
  }
  return { ok: true, stop, activity: location.activity };
}

function recordAcquisition(input: {
  journey: ExpeditionJourneyState;
  requestId: string;
  expeditionKey: string;
  stop: AuthoredStop;
  activity: AuthoredActivity;
  source: AcquisitionSource;
  correct: boolean;
  occurredAt: string;
}): void {
  input.journey.acquisitionAttempts.push({
    requestId: input.requestId,
    expeditionKey: input.expeditionKey,
    stopKey: input.stop.key,
    activityKey: input.activity.key,
    source: input.source,
    correct: input.correct,
    answeredAt: input.occurredAt
  });
  input.journey.latestActivityOutcomes[input.activity.key] = {
    requestId: input.requestId,
    stopKey: input.stop.key,
    correct: input.correct,
    answeredAt: input.occurredAt
  };
}

function rightPublicKeyForPair(
  activity: AuthoredMatching,
  projected: Extract<
    RuntimeExpedition["projection"]["legs"][number]["stops"][number]["activities"][number],
    { family: "matching" }
  >,
  pairKey: string
): string | null {
  for (const entry of projected.right) {
    if (matchingPairKeyFromPublic(activity, projected, "right", entry.key) === pairKey) {
      return entry.key;
    }
  }
  return null;
}

function gradeAcquisition(
  expedition: RuntimeExpedition,
  command: Extract<
    LearnerCommand,
    { kind: "answer_option_select" | "answer_matching" | "answer_impostor" }
  >,
  activity: AuthoredActivity
):
  | { ok: true; correct: boolean; revealKey: string }
  | { ok: false; reason: CommandRefusal } {
  if (command.kind === "answer_option_select") {
    if (activity.family !== "option_select") {
      return { ok: false, reason: "activity_family_mismatch" };
    }
    if (!activity.options.some((option) => option.key === command.chosenOptionKey)) {
      return { ok: false, reason: "invalid_answer" };
    }
    return {
      ok: true,
      correct: command.chosenOptionKey === activity.answerKey,
      revealKey: activity.answerKey
    };
  }
  if (command.kind === "answer_impostor") {
    if (activity.family !== "impostor") {
      return { ok: false, reason: "activity_family_mismatch" };
    }
    if (!activity.statements.some((statement) => statement.key === command.chosenStatementKey)) {
      return { ok: false, reason: "invalid_answer" };
    }
    const keyed = selectionCorrectKey(activity);
    if (!keyed) return { ok: false, reason: "invalid_answer" };
    return {
      ok: true,
      correct: command.chosenStatementKey === keyed,
      revealKey: keyed
    };
  }
  if (activity.family !== "matching") {
    return { ok: false, reason: "activity_family_mismatch" };
  }
  const location = expedition.activities.get(activity.key);
  const projected = location?.publicActivity;
  if (!projected || projected.family !== "matching") {
    return { ok: false, reason: "invalid_answer" };
  }
  if (command.matches.length !== activity.pairs.length) {
    return { ok: false, reason: "invalid_answer" };
  }
  const leftKeys = new Set(command.matches.map((pair) => pair.leftKey));
  const rightKeys = new Set(command.matches.map((pair) => pair.rightKey));
  if (
    leftKeys.size !== activity.pairs.length ||
    rightKeys.size !== activity.pairs.length
  ) {
    return { ok: false, reason: "invalid_answer" };
  }
  let firstReveal: string | null = null;
  let correct = true;
  for (const match of command.matches) {
    const leftPairKey = matchingPairKeyFromPublic(
      activity,
      projected,
      "left",
      match.leftKey
    );
    const rightPairKey = matchingPairKeyFromPublic(
      activity,
      projected,
      "right",
      match.rightKey
    );
    if (!leftPairKey || !rightPairKey) {
      return { ok: false, reason: "invalid_answer" };
    }
    if (leftPairKey !== rightPairKey) {
      correct = false;
      firstReveal ??= rightPublicKeyForPair(activity, projected, leftPairKey);
    }
  }
  return {
    ok: true,
    correct,
    revealKey: correct ? "all-pairs-correct" : (firstReveal ?? "retry-matching")
  };
}

function guardianScopeReady(input: {
  expedition: RuntimeExpedition;
  journey: ExpeditionJourneyState;
  scope: GuardianScope;
}): "ready" | "locked" {
  const mastered = masteredStopKeys(input.expedition, input.journey);
  if (input.scope.kind === "leg") {
    const leg = input.expedition.legs.get(input.scope.legKey);
    if (!leg || !leg.stops.every((stop) => mastered.has(stop.key))) return "locked";
    return "ready";
  }
  if (![...input.expedition.stops.keys()].every((stopKey) => mastered.has(stopKey))) {
    return "locked";
  }
  for (const leg of input.expedition.document.legs) {
    const legScope = { kind: "leg" as const, legKey: leg.key };
    const winnable = selectGuardianLineup({
      expedition: input.expedition,
      journey: input.journey,
      scope: legScope,
      challengeId: "winnability"
    }).length > 0;
    if (
      winnable &&
      !input.journey.firstGuardianWins[guardianScopeKey(legScope)]
    ) {
      return "locked";
    }
  }
  return "ready";
}

function activeGuardianForScope(
  journey: ExpeditionJourneyState,
  scope: GuardianScope
): GuardianChallenge | undefined {
  const key = guardianScopeKey(scope);
  return Object.values(journey.guardianChallenges).find(
    (challenge) => challenge.status === "active" && guardianScopeKey(challenge.scope) === key
  );
}

function guardianAward(input: {
  expeditionKey: string;
  scope: GuardianScope;
  challengeId: string;
  awardedAt: string;
}): LearnerAward {
  const scopeKey = guardianScopeKey(input.scope);
  if (input.scope.kind === "leg") {
    return {
      type: "leg_guardian_first_win",
      dedupeKey: `guardian:${input.expeditionKey}:${scopeKey}`,
      expeditionKey: input.expeditionKey,
      legKey: input.scope.legKey,
      challengeId: input.challengeId,
      awardedAt: input.awardedAt
    };
  }
  return {
    type: "expedition_guardian_first_win",
    dedupeKey: `guardian:${input.expeditionKey}:${scopeKey}`,
    expeditionKey: input.expeditionKey,
    challengeId: input.challengeId,
    awardedAt: input.awardedAt
  };
}

function settleGuardianWin(input: {
  state: LearnerStateV1;
  journey: ExpeditionJourneyState;
  expedition: RuntimeExpedition;
  challenge: GuardianChallenge;
  occurredAt: string;
}): boolean {
  const combat = foldGuardianChallenge(input.expedition, input.challenge);
  if (combat.phase !== "won") return false;
  input.challenge.status = "won";
  input.challenge.wonAt = input.occurredAt;
  const scopeKey = guardianScopeKey(input.challenge.scope);
  if (input.journey.firstGuardianWins[scopeKey]) return false;
  input.journey.firstGuardianWins[scopeKey] = input.challenge.challengeId;
  const award = guardianAward({
    expeditionKey: input.expedition.document.key,
    scope: input.challenge.scope,
    challengeId: input.challenge.challengeId,
    awardedAt: input.occurredAt
  });
  if (!input.state.awards.some((existing) => existing.dedupeKey === award.dedupeKey)) {
    input.state.awards.push(award);
  }
  return true;
}

function acquisitionCommand(
  input: ApplyCommandInput,
  next: LearnerStateV1,
  journey: ExpeditionJourneyState,
  command: Extract<
    LearnerCommand,
    { kind: "answer_option_select" | "answer_matching" | "answer_impostor" }
  >
): ApplyCommandResult {
  const location = acquisitionLocation({
    expedition: input.expedition,
    journey,
    stopKey: command.stopKey,
    activityKey: command.activityKey,
    source: command.source
  });
  if (!location.ok) return { applied: false, reason: location.reason };
  const graded = gradeAcquisition(input.expedition, command, location.activity);
  if (!graded.ok) return { applied: false, reason: graded.reason };
  recordAcquisition({
    journey,
    requestId: input.requestId,
    expeditionKey: input.expedition.document.key,
    stop: location.stop,
    activity: location.activity,
    source: command.source,
    correct: graded.correct,
    occurredAt: input.occurredAt
  });
  const completion = completeStopIfEarned({
    expedition: input.expedition,
    journey,
    stop: location.stop,
    occurredAt: input.occurredAt
  });
  return {
    applied: true,
    next,
    effect: {
      ...baseEffect("activity_answered", input.expedition.document.key),
      legKey: input.expedition.stopLegs.get(location.stop.key)?.key ?? null,
      stopKey: location.stop.key,
      activityKey: location.activity.key,
      supportPathKey: command.source.kind === "support"
        ? command.source.supportPathKey
        : null,
      correct: graded.correct,
      revealKey: graded.revealKey,
      newlyCompletedStop: completion.newlyCompleted,
      pointsAwarded: completion.points
    }
  };
}

export function applyLearnerCommand(input: ApplyCommandInput): ApplyCommandResult {
  const expeditionKey = input.expedition.document.key;
  const next = structuredClone(input.state) as LearnerStateV1;
  const journey = next.expeditions[expeditionKey];

  if (input.command.kind === "adopt_expedition") {
    if (journey) return { applied: false, reason: "expedition_already_adopted" };
    next.expeditions[expeditionKey] = emptyJourney(
      input.expedition.revision,
      input.occurredAt
    );
    return {
      applied: true,
      next: parseLearnerStateV1(next),
      effect: baseEffect("expedition_adopted", expeditionKey)
    };
  }

  if (!journey) return { applied: false, reason: "expedition_not_adopted" };

  if (input.command.kind === "activate_expedition") {
    next.activeExpeditionKey = expeditionKey;
    return {
      applied: true,
      next: parseLearnerStateV1(next),
      effect: baseEffect("expedition_activated", expeditionKey)
    };
  }

  if (input.command.kind === "record_lesson_read") {
    const stop = input.expedition.stops.get(input.command.stopKey);
    if (!stop) return { applied: false, reason: "invalid_command" };
    if (!stopUnlocked(input.expedition, journey, stop)) {
      return { applied: false, reason: "stop_locked" };
    }
    journey.firstLessonReadAt[stop.key] ??= input.occurredAt;
    const completion = completeStopIfEarned({
      expedition: input.expedition,
      journey,
      stop,
      occurredAt: input.occurredAt
    });
    return {
      applied: true,
      next: parseLearnerStateV1(next),
      effect: {
        ...baseEffect("lesson_recorded", expeditionKey),
        legKey: input.expedition.stopLegs.get(stop.key)?.key ?? null,
        stopKey: stop.key,
        newlyCompletedStop: completion.newlyCompleted,
        pointsAwarded: completion.points
      }
    };
  }

  if (
    input.command.kind === "set_calibration_known" ||
    input.command.kind === "clear_calibration_known"
  ) {
    const stop = input.expedition.stops.get(input.command.stopKey);
    if (!stop) return { applied: false, reason: "invalid_command" };
    if (input.command.kind === "set_calibration_known") {
      if (!journey.calibrationKnownStopKeys.includes(stop.key)) {
        journey.calibrationKnownStopKeys.push(stop.key);
        journey.calibrationKnownStopKeys.sort();
      }
    } else {
      journey.calibrationKnownStopKeys = journey.calibrationKnownStopKeys.filter(
        (stopKey) => stopKey !== stop.key
      );
    }
    return {
      applied: true,
      next: parseLearnerStateV1(next),
      effect: {
        ...baseEffect(
          input.command.kind === "set_calibration_known"
            ? "calibration_known_set"
            : "calibration_known_cleared",
          expeditionKey
        ),
        legKey: input.expedition.stopLegs.get(stop.key)?.key ?? null,
        stopKey: stop.key
      }
    };
  }

  if (
    input.command.kind === "answer_option_select" ||
    input.command.kind === "answer_matching" ||
    input.command.kind === "answer_impostor"
  ) {
    const result = acquisitionCommand(input, next, journey, input.command);
    return result.applied
      ? { ...result, next: parseLearnerStateV1(result.next) }
      : result;
  }

  if (input.command.kind === "open_support_path") {
    const support = input.expedition.supportPaths.get(input.command.supportPathKey);
    if (!support || support.stop.key !== input.command.stopKey) {
      return { applied: false, reason: "support_path_not_found" };
    }
    const existing = journey.supportPaths[support.supportPath.key];
    journey.supportPaths[support.supportPath.key] = {
      status: "open",
      firstOpenedAt: existing?.firstOpenedAt ?? input.occurredAt,
      updatedAt: input.occurredAt
    };
    return {
      applied: true,
      next: parseLearnerStateV1(next),
      effect: {
        ...baseEffect("support_opened", expeditionKey),
        legKey: support.leg.key,
        stopKey: support.stop.key,
        supportPathKey: support.supportPath.key
      }
    };
  }

  if (input.command.kind === "hide_support_path") {
    const support = input.expedition.supportPaths.get(input.command.supportPathKey);
    const existing = journey.supportPaths[input.command.supportPathKey];
    if (!support || !existing) {
      return { applied: false, reason: "support_path_not_found" };
    }
    journey.supportPaths[input.command.supportPathKey] = {
      ...existing,
      status: "hidden",
      updatedAt: input.occurredAt
    };
    return {
      applied: true,
      next: parseLearnerStateV1(next),
      effect: {
        ...baseEffect("support_hidden", expeditionKey),
        legKey: support.leg.key,
        stopKey: support.stop.key,
        supportPathKey: support.supportPath.key
      }
    };
  }

  if (input.command.kind === "create_guardian") {
    if (
      input.command.scope.kind === "leg" &&
      !input.expedition.legs.has(input.command.scope.legKey)
    ) {
      return { applied: false, reason: "invalid_command" };
    }
    if (activeGuardianForScope(journey, input.command.scope)) {
      return { applied: false, reason: "active_guardian_exists" };
    }
    if (
      guardianScopeReady({
        expedition: input.expedition,
        journey,
        scope: input.command.scope
      }) === "locked"
    ) {
      return { applied: false, reason: "guardian_locked" };
    }
    const lineup = selectGuardianLineup({
      expedition: input.expedition,
      journey,
      scope: input.command.scope,
      challengeId: input.challengeId
    });
    if (lineup.length === 0) {
      return { applied: false, reason: "guardian_unavailable" };
    }
    const challenge: GuardianChallenge = {
      challengeId: input.challengeId,
      scope: input.command.scope,
      lineup,
      events: [],
      status: "active",
      createdAt: input.occurredAt,
      wonAt: null
    };
    journey.guardianChallenges[challenge.challengeId] = challenge;
    for (const entry of lineup) {
      journey.guardianExposure[entry.activityKey] =
        (journey.guardianExposure[entry.activityKey] ?? 0) + 1;
    }
    return {
      applied: true,
      next: parseLearnerStateV1(next),
      effect: {
        ...baseEffect("guardian_created", expeditionKey),
        legKey: input.command.scope.kind === "leg"
          ? input.command.scope.legKey
          : null,
        challengeId: challenge.challengeId
      }
    };
  }

  if (
    input.command.kind === "answer_guardian_selection" ||
    input.command.kind === "answer_guardian_matching_pair"
  ) {
    const challenge = journey.guardianChallenges[input.command.challengeId];
    if (!challenge || challenge.status === "abandoned") {
      return { applied: false, reason: "guardian_not_found" };
    }
    if (challenge.status !== "active") {
      return { applied: false, reason: "guardian_not_active" };
    }
    const combat = foldGuardianChallenge(input.expedition, challenge);
    if (combat.retreated) return { applied: false, reason: "guardian_retreated" };
    const currentActivityKey = combat.unresolvedActivityKeys[0];
    if (!currentActivityKey || currentActivityKey !== input.command.activityKey) {
      return { applied: false, reason: "guardian_out_of_turn" };
    }
    const location = input.expedition.activities.get(currentActivityKey);
    if (!location) return { applied: false, reason: "activity_not_found" };

    let correct: boolean;
    let revealKey: string;
    if (input.command.kind === "answer_guardian_selection") {
      const selectionCommand = input.command;
      if (location.activity.family === "matching") {
        return { applied: false, reason: "activity_family_mismatch" };
      }
      const candidates = location.activity.family === "option_select"
        ? location.activity.options
        : location.activity.statements;
      if (!candidates.some((candidate) => candidate.key === selectionCommand.chosenKey)) {
        return { applied: false, reason: "invalid_answer" };
      }
      const keyed = selectionCorrectKey(location.activity);
      if (!keyed) return { applied: false, reason: "invalid_answer" };
      correct = selectionCommand.chosenKey === keyed;
      revealKey = keyed;
      journey.guardianChallenges[challenge.challengeId] = withGuardianEvent(
        challenge,
        {
          seq: nextGuardianEventSeq(challenge),
          kind: "selection_answer",
          requestId: input.requestId,
          activityKey: currentActivityKey,
          chosenKey: selectionCommand.chosenKey,
          correct,
          answeredAt: input.occurredAt
        }
      );
    } else {
      if (
        location.activity.family !== "matching" ||
        location.publicActivity.family !== "matching"
      ) {
        return { applied: false, reason: "activity_family_mismatch" };
      }
      const leftPair = matchingPairKeyFromPublic(
        location.activity,
        location.publicActivity,
        "left",
        input.command.leftKey
      );
      const rightPair = matchingPairKeyFromPublic(
        location.activity,
        location.publicActivity,
        "right",
        input.command.rightKey
      );
      if (!leftPair || !rightPair) {
        return { applied: false, reason: "invalid_answer" };
      }
      correct = leftPair === rightPair;
      revealKey = rightPublicKeyForPair(
        location.activity,
        location.publicActivity,
        leftPair
      ) ?? input.command.rightKey;
      journey.guardianChallenges[challenge.challengeId] = withGuardianEvent(
        challenge,
        {
          seq: nextGuardianEventSeq(challenge),
          kind: "matching_pair",
          requestId: input.requestId,
          activityKey: currentActivityKey,
          leftKey: input.command.leftKey,
          rightKey: input.command.rightKey,
          correct,
          answeredAt: input.occurredAt
        }
      );
    }
    const updated = journey.guardianChallenges[challenge.challengeId];
    const firstWin = settleGuardianWin({
      state: next,
      journey,
      expedition: input.expedition,
      challenge: updated,
      occurredAt: input.occurredAt
    });
    return {
      applied: true,
      next: parseLearnerStateV1(next),
      effect: {
        ...baseEffect("guardian_answered", expeditionKey),
        legKey: challenge.scope.kind === "leg" ? challenge.scope.legKey : null,
        activityKey: currentActivityKey,
        challengeId: challenge.challengeId,
        correct,
        revealKey,
        firstGuardianWin: firstWin
      }
    };
  }

  const challenge = journey.guardianChallenges[input.command.challengeId];
  if (!challenge || challenge.status === "abandoned") {
    return { applied: false, reason: "guardian_not_found" };
  }
  if (challenge.status !== "active") {
    return { applied: false, reason: "guardian_not_active" };
  }
  const combat = foldGuardianChallenge(input.expedition, challenge);
  const lifecycle = input.command.kind === "retreat_guardian"
    ? "retreat"
    : input.command.kind === "resume_guardian"
      ? "resume"
      : "abandon";
  const shouldAppend = lifecycle === "retreat"
    ? !combat.retreated
    : lifecycle === "resume"
      ? combat.retreated
      : !combat.abandoned;
  if (shouldAppend) {
    journey.guardianChallenges[challenge.challengeId] = withGuardianEvent(challenge, {
      seq: nextGuardianEventSeq(challenge),
      kind: lifecycle,
      requestId: input.requestId,
      occurredAt: input.occurredAt
    });
  }
  if (lifecycle === "abandon") {
    journey.guardianChallenges[challenge.challengeId].status = "abandoned";
  }
  return {
    applied: true,
    next: parseLearnerStateV1(next),
    effect: {
      ...baseEffect(
        lifecycle === "retreat"
          ? "guardian_retreated"
          : lifecycle === "resume"
            ? "guardian_resumed"
            : "guardian_abandoned",
        expeditionKey
      ),
      legKey: challenge.scope.kind === "leg" ? challenge.scope.legKey : null,
      challengeId: challenge.challengeId
    }
  };
}
