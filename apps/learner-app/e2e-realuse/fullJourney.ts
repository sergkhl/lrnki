import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  AuthoredActivity,
  AuthoredExpedition,
  AuthoredMatching
} from "@lrnki/learner-runtime";
import {
  loadQualifiedCatalogOrThrow,
  qualifiedExpeditionDocument,
  type LearnerActivityProjection
} from "@lrnki/learner-runtime/content-node";
import type {
  ExpeditionView,
  GuardianView,
  LearnerCommand,
  LearnerReadResult,
  LearnerTransitionResult,
  LeaderboardView
} from "@lrnki/learner-runtime/runtime";

type Transport<T> =
  T extends bigint ? string
    : T extends ReadonlyArray<infer Item> ? ReadonlyArray<Transport<Item>>
      : T extends object ? { readonly [Key in keyof T]: Transport<T[Key]> }
        : T;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export async function runFullJourney(input: Readonly<{
  apiBase: string;
  email: string;
  password: string;
  sessionCookie: string;
}>): Promise<void> {
  const catalog = await loadQualifiedCatalogOrThrow(resolve(repoRoot, "content"));
  const client = new JourneyClient(input.apiBase, input.sessionCookie);
  const critical = requireDocument(catalog, "critical-thinking");

  await adoptWithReplayAndStaleCheck(client, critical.key);
  await exerciseCriticalThinking(client, critical);

  for (const expeditionKey of catalog.orderedKeys.filter((key) => key !== critical.key)) {
    const expedition = requireDocument(catalog, expeditionKey);
    await client.applied({ kind: "adopt_expedition", expeditionKey });
    await client.applied({ kind: "activate_expedition", expeditionKey });
    await exerciseOneCompleteLeg(client, expedition);
  }

  const board = await client.readLeaderboard();
  assert.ok(board.viewerPoints > 0, "full journey should create weekly acquisition points");
  assert.ok(board.entries.some((entry) => entry.isViewer), "leaderboard lost the authenticated viewer");

  const journalBeforeSignOut = await client.read("/journal");
  assert.equal(journalBeforeSignOut.status, "ok");
  if (journalBeforeSignOut.status !== "ok" || journalBeforeSignOut.view.kind !== "journal") {
    throw new Error("full journey could not read its Journal before sign-out");
  }
  assert.equal(journalBeforeSignOut.view.expeditions.length, catalog.orderedKeys.length);

  await client.signOut();
  await client.expectSignedOut("/journal");
  await client.signIn(input.email, input.password);
  const journalAfterSignIn = await client.read("/journal");
  assert.equal(journalAfterSignIn.status, "ok");
  if (journalAfterSignIn.status !== "ok" || journalAfterSignIn.view.kind !== "journal") {
    throw new Error("full journey did not survive sign-out/sign-in");
  }
  assert.equal(journalAfterSignIn.view.expeditions.length, catalog.orderedKeys.length);
  console.log(`[realuse] full authenticated journey passed across ${catalog.orderedKeys.length} authored Expeditions.`);
}

async function adoptWithReplayAndStaleCheck(client: JourneyClient, expeditionKey: string): Promise<void> {
  const requestId = "full-critical-adopt-replay";
  const envelope = {
    requestId,
    expectedStateVersion: client.version,
    command: { kind: "adopt_expedition", expeditionKey } as LearnerCommand
  };
  const first = await client.rawDispatch(envelope);
  assert.equal(first.status, "applied");
  if (first.status !== "applied") throw new Error("Critical Thinking adoption did not apply");
  assert.equal(first.replayed, false);
  const versionAfterFirst = first.stateVersion;

  const replay = await client.rawDispatch(envelope);
  assert.equal(replay.status, "applied");
  if (replay.status !== "applied") throw new Error("Critical Thinking adoption did not replay");
  assert.equal(replay.replayed, true);
  assert.equal(replay.stateVersion, versionAfterFirst);

  const stale = await client.rawDispatch({
    requestId: "full-critical-stale-activation",
    expectedStateVersion: "0",
    command: { kind: "activate_expedition", expeditionKey }
  });
  assert.equal(stale.status, "stale");
  await client.applied({ kind: "activate_expedition", expeditionKey });
}

async function exerciseCriticalThinking(
  client: JourneyClient,
  expedition: AuthoredExpedition
): Promise<void> {
  const expeditionKey = expedition.key;
  await client.applied({
    kind: "set_calibration_known",
    expeditionKey,
    stopKey: "evidence-quality"
  });
  let view = await client.readExpedition(expeditionKey);
  assert.equal(progress(view, "argument-structure").state, "known");
  assert.equal(progress(view, "evidence-quality").state, "known");
  assert.equal(progress(view, "causal-claims").state, "available");

  await client.applied({ kind: "record_lesson_read", expeditionKey, stopKey: "causal-claims" });
  const causalActivity = authoredActivity(expedition, "diagnose-fire-correlation");
  view = await client.readExpedition(expeditionKey);
  await answerAcquisition(client, view, "causal-claims", causalActivity, false, { kind: "trail" });
  view = await client.readExpedition(expeditionKey);
  assert.deepEqual(progress(view, "causal-claims").restorationStopKeys, ["evidence-quality"]);

  await client.applied({
    kind: "clear_calibration_known",
    expeditionKey,
    stopKey: "evidence-quality"
  });
  view = await client.readExpedition(expeditionKey);
  assert.equal(progress(view, "causal-claims").state, "locked");

  await exerciseSupport(client, expedition, "review-support-relationship");
  await completeEveryStop(client, expedition, true);
  view = await client.readExpedition(expeditionKey);
  assert.ok(view.progress.every((item) => item.state === "mastered"));

  const privateProjection = JSON.stringify(await client.read(`/expedition/${expeditionKey}`));
  assert.doesNotMatch(privateProjection, /answerKey|sourceAnchor|"kind":"truth"|"kind":"impostor"/);

  const legKey = expedition.legs[0]?.key;
  assert.ok(legKey);
  const lockedFinal = await client.dispatch({
    kind: "create_guardian",
    expeditionKey,
    scope: { kind: "expedition" }
  });
  assert.equal(lockedFinal.status, "refused");
  if (lockedFinal.status === "refused") assert.equal(lockedFinal.reason, "guardian_locked");

  const disposable = await createGuardian(client, expeditionKey, { kind: "leg", legKey });
  const disposableView = await client.readGuardian(expeditionKey, disposable);
  await client.applied({ kind: "retreat_guardian", expeditionKey, challengeId: disposable });
  const blocked = await client.dispatch(blockedGuardianAnswer(
    expeditionKey,
    disposable,
    activeGuardian(disposableView)
  ));
  assert.equal(blocked.status, "refused");
  if (blocked.status === "refused") assert.equal(blocked.reason, "guardian_retreated");
  await client.applied({ kind: "resume_guardian", expeditionKey, challengeId: disposable });
  await client.applied({ kind: "abandon_guardian", expeditionKey, challengeId: disposable });
  const abandoned = await client.readRaw(`/guardian/${expeditionKey}/${disposable}`);
  assert.equal(abandoned.status, 404);

  const legChallenge = await createGuardian(client, expeditionKey, { kind: "leg", legKey });
  for (let miss = 0; miss < 3; miss += 1) {
    const guardian = activeGuardian(await client.readGuardian(expeditionKey, legChallenge));
    await answerGuardianWrong(client, expedition, guardian);
    if (guardian.currentActivity.family === "matching") {
      const refreshed = activeGuardian(await client.readGuardian(expeditionKey, legChallenge));
      await answerGuardianCorrect(client, expedition, refreshed);
    }
  }
  let recovery = await client.readGuardian(expeditionKey, legChallenge);
  assert.equal(recovery.state, "recovery");
  assert.equal(recovery.remainingShield, 0);
  await answerGuardianCorrect(client, expedition, recovery);
  recovery = await client.readGuardian(expeditionKey, legChallenge);
  assert.notEqual(recovery.state, "won");
  if (recovery.state !== "won") assert.equal(recovery.remainingShield, 1);
  const firstWin = await winGuardian(client, expedition, legChallenge);
  assert.equal(firstWin.firstWin, true);

  const rematch = await createGuardian(client, expeditionKey, { kind: "leg", legKey });
  const rematchWin = await winGuardian(client, expedition, rematch);
  assert.equal(rematchWin.firstWin, false);

  const summit = await createGuardian(client, expeditionKey, { kind: "expedition" });
  const summitWin = await winGuardian(client, expedition, summit);
  assert.equal(summitWin.firstWin, true);

  const board = await client.readLeaderboard();
  assert.equal(board.viewerPoints, 6, "Critical Thinking should award only first Stop completions");
  assert.ok(board.masteredCrystalCount >= 3);
}

async function exerciseOneCompleteLeg(
  client: JourneyClient,
  expedition: AuthoredExpedition
): Promise<void> {
  const secondStop = expedition.legs[0]?.stops[1];
  assert.ok(secondStop);
  await client.applied({
    kind: "set_calibration_known",
    expeditionKey: expedition.key,
    stopKey: secondStop.key
  });
  await client.applied({
    kind: "clear_calibration_known",
    expeditionKey: expedition.key,
    stopKey: secondStop.key
  });

  const support = expedition.legs
    .flatMap((leg) => leg.stops)
    .flatMap((stop) => stop.supportPaths)
    .at(0);
  assert.ok(support, `${expedition.key} needs a representative Support Path`);
  await exerciseSupport(client, expedition, support.key);
  await completeEveryStop(client, expedition, true);

  const legKey = expedition.legs[0]?.key;
  assert.ok(legKey);
  const guardian = await createGuardian(client, expedition.key, { kind: "leg", legKey });
  const won = await winGuardian(client, expedition, guardian);
  assert.equal(won.firstWin, true);
}

async function exerciseSupport(
  client: JourneyClient,
  expedition: AuthoredExpedition,
  supportPathKey: string
): Promise<void> {
  const parent = expedition.legs
    .flatMap((leg) => leg.stops)
    .find((stop) => stop.supportPaths.some((path) => path.key === supportPathKey));
  const support = parent?.supportPaths.find((path) => path.key === supportPathKey);
  assert.ok(parent && support);

  await client.applied({
    kind: "open_support_path",
    expeditionKey: expedition.key,
    stopKey: parent.key,
    supportPathKey
  });
  let view = await client.readExpedition(expedition.key);
  assert.equal(view.supportPaths.find((path) => path.supportPathKey === supportPathKey)?.status, "open");
  await client.applied({ kind: "hide_support_path", expeditionKey: expedition.key, supportPathKey });
  view = await client.readExpedition(expedition.key);
  assert.equal(view.supportPaths.find((path) => path.supportPathKey === supportPathKey)?.status, "hidden");
  await client.applied({
    kind: "open_support_path",
    expeditionKey: expedition.key,
    stopKey: parent.key,
    supportPathKey
  });

  const step = support.steps[0];
  assert.ok(step);
  const activity = authoredActivity(expedition, step.activityKey);
  assert.equal(activity.family, "option_select");
  view = await client.readExpedition(expedition.key);
  const result = await answerAcquisition(
    client,
    view,
    step.stopKey,
    activity,
    true,
    { kind: "support", supportPathKey }
  );
  assert.equal(result.status, "applied");
  if (result.status === "applied") assert.equal(result.effect.newlyCompletedStop, false);
  const parentProgress = progress(await client.readExpedition(expedition.key), parent.key);
  assert.equal(parentProgress.firstGradedCompletion, null);
}

async function completeEveryStop(
  client: JourneyClient,
  expedition: AuthoredExpedition,
  includeWrongFirst: boolean
): Promise<void> {
  for (const leg of expedition.legs) {
    for (const stop of leg.stops) {
      await client.applied({
        kind: "record_lesson_read",
        expeditionKey: expedition.key,
        stopKey: stop.key
      });
      for (const activity of stop.activities) {
        let view = await client.readExpedition(expedition.key);
        if (includeWrongFirst) {
          await answerAcquisition(client, view, stop.key, activity, false, { kind: "trail" });
          view = await client.readExpedition(expedition.key);
        }
        await answerAcquisition(client, view, stop.key, activity, true, { kind: "trail" });
      }
      const item = progress(await client.readExpedition(expedition.key), stop.key);
      assert.equal(item.state, "mastered", `${expedition.key}/${stop.key} did not master`);
      assert.ok(item.firstGradedCompletion);
    }
  }
}

async function answerAcquisition(
  client: JourneyClient,
  view: ExpeditionView,
  stopKey: string,
  activity: AuthoredActivity,
  correct: boolean,
  source: Readonly<{ kind: "trail" } | { kind: "support"; supportPathKey: string }>
): Promise<Transport<LearnerTransitionResult>> {
  const projected = projectedActivity(view, stopKey, activity.key);
  let command: LearnerCommand;
  if (activity.family === "option_select") {
    const chosenOptionKey = correct
      ? activity.answerKey
      : activity.options.find((option) => option.key !== activity.answerKey)?.key;
    assert.ok(chosenOptionKey);
    command = {
      kind: "answer_option_select",
      expeditionKey: view.expedition.key,
      stopKey,
      activityKey: activity.key,
      chosenOptionKey,
      source
    };
  } else if (activity.family === "impostor") {
    const chosenStatementKey = activity.statements.find((statement) =>
      correct ? statement.kind === "impostor" : statement.kind === "truth"
    )?.key;
    assert.ok(chosenStatementKey);
    command = {
      kind: "answer_impostor",
      expeditionKey: view.expedition.key,
      stopKey,
      activityKey: activity.key,
      chosenStatementKey,
      source
    };
  } else {
    const matches = publicMatchingAnswers(activity, projected);
    if (!correct) {
      assert.ok(matches.length >= 2);
      const first = matches[0]!;
      const second = matches[1]!;
      matches[0] = { leftKey: first.leftKey, rightKey: second.rightKey };
      matches[1] = { leftKey: second.leftKey, rightKey: first.rightKey };
    }
    command = {
      kind: "answer_matching",
      expeditionKey: view.expedition.key,
      stopKey,
      activityKey: activity.key,
      matches,
      source
    };
  }
  const result = await client.applied(command);
  assert.equal(result.effect.correct, correct);
  return result;
}

async function createGuardian(
  client: JourneyClient,
  expeditionKey: string,
  scope: Readonly<{ kind: "leg"; legKey: string } | { kind: "expedition" }>
): Promise<string> {
  const result = await client.applied({ kind: "create_guardian", expeditionKey, scope });
  assert.ok(result.effect.challengeId);
  return result.effect.challengeId;
}

async function answerGuardianWrong(
  client: JourneyClient,
  expedition: AuthoredExpedition,
  guardian: Exclude<GuardianView, { state: "won" }>
): Promise<void> {
  const activity = authoredActivity(expedition, guardian.currentActivity.key);
  if (activity.family === "matching") {
    assert.equal(guardian.currentActivity.family, "matching");
    if (guardian.currentActivity.family !== "matching") {
      throw new Error(`${activity.key} Guardian projection changed family`);
    }
    const projected = guardian.currentActivity;
    const matches = publicMatchingAnswers(activity, projected);
    const first = matches[0];
    assert.ok(first);
    const wrong = projected.right.find((right) => right.key !== first.rightKey);
    assert.ok(wrong);
    const result = await client.applied({
      kind: "answer_guardian_matching_pair",
      expeditionKey: expedition.key,
      challengeId: guardian.challengeId,
      activityKey: activity.key,
      leftKey: first.leftKey,
      rightKey: wrong.key
    });
    assert.equal(result.effect.correct, false);
    return;
  }
  const correctKey = activity.family === "option_select"
    ? activity.answerKey
    : activity.statements.find((statement) => statement.kind === "impostor")?.key;
  assert.notEqual(guardian.currentActivity.family, "matching");
  if (guardian.currentActivity.family === "matching") {
    throw new Error(`${activity.key} Guardian projection changed family`);
  }
  const choices = guardian.currentActivity.family === "option_select"
    ? guardian.currentActivity.options
    : guardian.currentActivity.statements;
  const wrong = choices.find((choice) => choice.key !== correctKey);
  assert.ok(wrong);
  const result = await client.applied({
    kind: "answer_guardian_selection",
    expeditionKey: expedition.key,
    challengeId: guardian.challengeId,
    activityKey: activity.key,
    chosenKey: wrong.key
  });
  assert.equal(result.effect.correct, false);
}

async function answerGuardianCorrect(
  client: JourneyClient,
  expedition: AuthoredExpedition,
  guardian: Exclude<GuardianView, { state: "won" }>
): Promise<void> {
  const activity = authoredActivity(expedition, guardian.currentActivity.key);
  if (activity.family === "matching") {
    for (const pair of publicMatchingAnswers(activity, guardian.currentActivity)) {
      const result = await client.applied({
        kind: "answer_guardian_matching_pair",
        expeditionKey: expedition.key,
        challengeId: guardian.challengeId,
        activityKey: activity.key,
        ...pair
      });
      assert.equal(result.effect.correct, true);
    }
    return;
  }
  const chosenKey = activity.family === "option_select"
    ? activity.answerKey
    : activity.statements.find((statement) => statement.kind === "impostor")?.key;
  assert.ok(chosenKey);
  const result = await client.applied({
    kind: "answer_guardian_selection",
    expeditionKey: expedition.key,
    challengeId: guardian.challengeId,
    activityKey: activity.key,
    chosenKey
  });
  assert.equal(result.effect.correct, true);
}

async function winGuardian(
  client: JourneyClient,
  expedition: AuthoredExpedition,
  challengeId: string
): Promise<Extract<GuardianView, { state: "won" }>> {
  for (let turn = 0; turn < 100; turn += 1) {
    const view = await client.readGuardian(expedition.key, challengeId);
    if (view.state === "won") return view;
    await answerGuardianCorrect(client, expedition, view);
  }
  throw new Error(`${expedition.key} Guardian ${challengeId} did not finish within 100 turns`);
}

function blockedGuardianAnswer(
  expeditionKey: string,
  challengeId: string,
  guardian: Exclude<GuardianView, { state: "won" }>
): LearnerCommand {
  if (guardian.currentActivity.family === "matching") {
    const left = guardian.currentActivity.left[0];
    const right = guardian.currentActivity.right[0];
    assert.ok(left && right);
    return {
      kind: "answer_guardian_matching_pair",
      expeditionKey,
      challengeId,
      activityKey: guardian.currentActivity.key,
      leftKey: left.key,
      rightKey: right.key
    };
  }
  const choice = guardian.currentActivity.family === "option_select"
    ? guardian.currentActivity.options[0]
    : guardian.currentActivity.statements[0];
  assert.ok(choice);
  return {
    kind: "answer_guardian_selection",
    expeditionKey,
    challengeId,
    activityKey: guardian.currentActivity.key,
    chosenKey: choice.key
  };
}

function activeGuardian(view: GuardianView): Exclude<GuardianView, { state: "won" }> {
  assert.notEqual(view.state, "won", "Guardian unexpectedly finished before the requested transition");
  if (view.state === "won") throw new Error(`Guardian ${view.challengeId} is already won`);
  return view;
}

function publicMatchingAnswers(
  activity: AuthoredMatching,
  projected: LearnerActivityProjection
): Array<{ leftKey: string; rightKey: string }> {
  assert.equal(projected.family, "matching");
  if (projected.family !== "matching") throw new Error(`${activity.key} projection changed family`);
  return activity.pairs.map((pair) => {
    const left = projected.left.find((entry) => entry.text === pair.left);
    const right = projected.right.find((entry) => entry.text === pair.right);
    assert.ok(left && right, `${activity.key} projection lost pair ${pair.key}`);
    return { leftKey: left.key, rightKey: right.key };
  });
}

function projectedActivity(
  view: ExpeditionView,
  stopKey: string,
  activityKey: string
): LearnerActivityProjection {
  const activity = view.expedition.legs
    .flatMap((leg) => leg.stops)
    .find((stop) => stop.key === stopKey)
    ?.activities.find((candidate) => candidate.key === activityKey);
  assert.ok(activity, `${view.expedition.key}/${stopKey}/${activityKey} missing from projection`);
  return activity;
}

function authoredActivity(expedition: AuthoredExpedition, activityKey: string): AuthoredActivity {
  const activity = expedition.legs
    .flatMap((leg) => leg.stops)
    .flatMap((stop) => stop.activities)
    .find((candidate) => candidate.key === activityKey);
  assert.ok(activity, `${expedition.key}/${activityKey} missing from authored document`);
  return activity;
}

function progress(view: ExpeditionView, stopKey: string): ExpeditionView["progress"][number] {
  const item = view.progress.find((candidate) => candidate.stopKey === stopKey);
  assert.ok(item, `${view.expedition.key}/${stopKey} missing from progress`);
  return item;
}

function requireDocument(
  catalog: Awaited<ReturnType<typeof loadQualifiedCatalogOrThrow>>,
  expeditionKey: string
): AuthoredExpedition {
  const document = qualifiedExpeditionDocument(catalog, expeditionKey);
  assert.ok(document, `qualified catalog lost ${expeditionKey}`);
  return document;
}

function transportCookie(response: Response): string {
  return response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
}

class JourneyClient {
  version = "0";
  private sequence = 0;

  constructor(
    private readonly apiBase: string,
    private cookie: string
  ) {}

  async read(path: string): Promise<Transport<LearnerReadResult>> {
    const response = await fetch(`${this.apiBase}${path}`, { headers: { cookie: this.cookie } });
    const body = await response.json() as Transport<LearnerReadResult>;
    if ("stateVersion" in body) this.version = body.stateVersion;
    return body;
  }

  async readRaw(path: string): Promise<Response> {
    return fetch(`${this.apiBase}${path}`, { headers: { cookie: this.cookie } });
  }

  async readExpedition(expeditionKey: string): Promise<ExpeditionView> {
    const body = await this.read(`/expedition/${expeditionKey}`);
    assert.equal(body.status, "ok");
    if (body.status !== "ok" || body.view.kind !== "expedition") {
      throw new Error(`could not read Expedition ${expeditionKey}`);
    }
    return body.view as ExpeditionView;
  }

  async readGuardian(expeditionKey: string, challengeId: string): Promise<GuardianView> {
    const body = await this.read(`/guardian/${expeditionKey}/${challengeId}`);
    assert.equal(body.status, "ok");
    if (body.status !== "ok" || body.view.kind !== "guardian") {
      throw new Error(`could not read Guardian ${challengeId}`);
    }
    return body.view as GuardianView;
  }

  async readLeaderboard(): Promise<LeaderboardView> {
    const body = await this.read("/leaderboard");
    assert.equal(body.status, "ok");
    if (body.status !== "ok" || body.view.kind !== "leaderboard") {
      throw new Error("could not read leaderboard");
    }
    return body.view as LeaderboardView;
  }

  async dispatch(command: LearnerCommand): Promise<Transport<LearnerTransitionResult>> {
    return this.rawDispatch({
      requestId: `full-journey-${++this.sequence}`,
      expectedStateVersion: this.version,
      command
    });
  }

  async applied(command: LearnerCommand): Promise<Extract<Transport<LearnerTransitionResult>, { status: "applied" }>> {
    const result = await this.dispatch(command);
    assert.equal(result.status, "applied", result.status === "refused" ? result.reason : result.status);
    if (result.status !== "applied") throw new Error(`${command.kind} did not apply`);
    return result;
  }

  async rawDispatch(envelope: Readonly<{
    requestId: string;
    expectedStateVersion: string;
    command: LearnerCommand;
  }>): Promise<Transport<LearnerTransitionResult>> {
    const response = await fetch(`${this.apiBase}/game/commands`, {
      method: "POST",
      headers: { cookie: this.cookie, "content-type": "application/json" },
      body: JSON.stringify(envelope)
    });
    const rawBody = await response.text();
    assert.equal(response.status, 200, rawBody);
    const body = JSON.parse(rawBody) as Transport<LearnerTransitionResult>;
    if ("stateVersion" in body) this.version = body.stateVersion;
    return body;
  }

  async signOut(): Promise<void> {
    const response = await fetch(`${this.apiBase}/auth/sign-out`, {
      method: "POST",
      headers: { cookie: this.cookie, "content-type": "application/json", origin: this.apiBase },
      body: "{}"
    });
    assert.ok(response.ok, `sign-out returned ${response.status}`);
  }

  async expectSignedOut(path: string): Promise<void> {
    const response = await fetch(`${this.apiBase}${path}`, { headers: { cookie: this.cookie } });
    assert.equal(response.status, 401);
  }

  async signIn(email: string, password: string): Promise<void> {
    const response = await fetch(`${this.apiBase}/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: this.apiBase },
      body: JSON.stringify({ email, password })
    });
    assert.ok(response.ok, `sign-in returned ${response.status}`);
    const cookie = transportCookie(response);
    assert.ok(cookie, "sign-in returned no session cookie");
    this.cookie = cookie;
  }
}
