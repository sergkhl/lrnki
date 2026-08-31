import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  loadQualifiedCatalogOrThrow,
  qualifiedExpeditionDocument
} from "./contentNode";
import {
  createLearnerRuntime,
  MemoryLearnerStateStore,
  type AcquisitionSource,
  type ExpeditionView,
  type GuardianView,
  type LearnerCommand,
  type LearnerRuntime,
  type LearnerTransitionResult
} from "./runtimeNode";

const contentRoot = fileURLToPath(new URL("../../../content/", import.meta.url));
const catalog = await loadQualifiedCatalogOrThrow(contentRoot);
const authored = (() => {
  const document = qualifiedExpeditionDocument(catalog, "critical-thinking");
  if (!document) throw new Error("Critical Thinking test content is missing");
  return document;
})();

type MutableClock = { current: Date };

function setup(
  learnerRefs: readonly string[] = ["learner-a"],
  clock: MutableClock = { current: new Date("2026-08-31T12:00:00.000Z") }
): {
  runtime: LearnerRuntime;
  store: MemoryLearnerStateStore;
  clock: MutableClock;
} {
  const store = new MemoryLearnerStateStore(
    learnerRefs.map((learnerRef) => ({
      learnerRef,
      displayName: learnerRef.replace("learner-", "Explorer ")
    }))
  );
  return {
    runtime: createLearnerRuntime({
      catalog,
      stateStore: store,
      now: () => new Date(clock.current)
    }),
    store,
    clock
  };
}

class Harness {
  version = 0n;
  request = 0;

  constructor(
    readonly runtime: LearnerRuntime,
    readonly learnerRef = "learner-a"
  ) {}

  async dispatch(
    command: LearnerCommand,
    requestId = `request-${++this.request}`,
    expectedStateVersion = this.version
  ): Promise<LearnerTransitionResult> {
    const result = await this.runtime.dispatch(this.learnerRef, {
      requestId,
      expectedStateVersion,
      command
    });
    if ("stateVersion" in result) this.version = result.stateVersion;
    return result;
  }

  async adopt(): Promise<void> {
    const adopted = await this.dispatch({
      kind: "adopt_expedition",
      expeditionKey: "critical-thinking"
    });
    assert.equal(adopted.status, "applied");
  }

  async expedition(): Promise<ExpeditionView> {
    const result = await this.runtime.read(this.learnerRef, {
      kind: "expedition",
      expeditionKey: "critical-thinking"
    });
    assert.equal(result.status, "ok");
    assert.equal(result.view.kind, "expedition");
    this.version = result.stateVersion;
    return result.view;
  }
}

function authoredActivity(activityKey: string) {
  return authored.legs
    .flatMap((leg) => leg.stops)
    .flatMap((stop) => stop.activities)
    .find((activity) => activity.key === activityKey);
}

function publicActivity(view: ExpeditionView, activityKey: string) {
  return view.expedition.legs
    .flatMap((leg) => leg.stops)
    .flatMap((stop) => stop.activities)
    .find((activity) => activity.key === activityKey);
}

function correctAcquisitionCommand(input: {
  view: ExpeditionView;
  stopKey: string;
  activityKey: string;
  source?: AcquisitionSource;
}): LearnerCommand {
  const server = authoredActivity(input.activityKey);
  const projected = publicActivity(input.view, input.activityKey);
  if (!server || !projected || server.family !== projected.family) {
    throw new Error(`Activity ${input.activityKey} did not hydrate`);
  }
  const source = input.source ?? { kind: "trail" as const };
  if (server.family === "option_select") {
    return {
      kind: "answer_option_select",
      expeditionKey: "critical-thinking",
      stopKey: input.stopKey,
      activityKey: input.activityKey,
      chosenOptionKey: server.answerKey,
      source
    };
  }
  if (server.family === "impostor") {
    const keyed = server.statements.find((statement) => statement.kind === "impostor")?.key;
    if (!keyed) throw new Error("Impostor Activity has no impostor");
    return {
      kind: "answer_impostor",
      expeditionKey: "critical-thinking",
      stopKey: input.stopKey,
      activityKey: input.activityKey,
      chosenStatementKey: keyed,
      source
    };
  }
  if (projected.family !== "matching") throw new Error("Matching projection changed family");
  return {
    kind: "answer_matching",
    expeditionKey: "critical-thinking",
    stopKey: input.stopKey,
    activityKey: input.activityKey,
    matches: projected.left.map((left) => {
      const pair = server.pairs.find((candidate) => candidate.left === left.text);
      const right = projected.right.find((candidate) => candidate.text === pair?.right);
      if (!pair || !right) throw new Error("Matching projection lost a pair");
      return { leftKey: left.key, rightKey: right.key };
    }),
    source
  };
}

async function completeStop(harness: Harness, stopKey: string): Promise<void> {
  const lesson = await harness.dispatch({
    kind: "record_lesson_read",
    expeditionKey: "critical-thinking",
    stopKey
  });
  assert.equal(lesson.status, "applied");
  const stop = authored.legs.flatMap((leg) => leg.stops).find((candidate) => candidate.key === stopKey);
  if (!stop) throw new Error(`Unknown Stop ${stopKey}`);
  for (const activity of stop.activities) {
    const result = await harness.dispatch(
      correctAcquisitionCommand({
        view: await harness.expedition(),
        stopKey,
        activityKey: activity.key
      })
    );
    assert.equal(result.status, "applied");
    assert.equal(result.effect.correct, true);
  }
}

async function completeExpedition(harness: Harness): Promise<void> {
  for (const stop of authored.legs.flatMap((leg) => leg.stops)) {
    await completeStop(harness, stop.key);
  }
}

function correctGuardianSelection(view: Extract<GuardianView, { state: "active" | "recovery" }>) {
  const server = authoredActivity(view.currentActivity.key);
  if (!server || server.family === "matching") throw new Error("Expected selection Guardian Activity");
  return server.family === "option_select"
    ? server.answerKey
    : server.statements.find((statement) => statement.kind === "impostor")?.key ?? "";
}

function matchingPublicPair(
  view: Extract<GuardianView, { state: "active" | "recovery" }>,
  leftKey: string
): { leftKey: string; rightKey: string } {
  if (view.currentActivity.family !== "matching") throw new Error("Expected Matching Guardian Activity");
  const server = authoredActivity(view.currentActivity.key);
  if (!server || server.family !== "matching") throw new Error("Matching Activity did not hydrate");
  const left = view.currentActivity.left.find((entry) => entry.key === leftKey);
  const pair = server.pairs.find((entry) => entry.left === left?.text);
  const right = view.currentActivity.right.find((entry) => entry.text === pair?.right);
  if (!left || !pair || !right) throw new Error("Matching pair did not hydrate");
  return { leftKey: left.key, rightKey: right.key };
}

async function answerGuardianCurrentCorrectly(
  harness: Harness,
  view: Extract<GuardianView, { state: "active" | "recovery" }>
): Promise<void> {
  if (view.currentActivity.family !== "matching") {
    const result = await harness.dispatch({
      kind: "answer_guardian_selection",
      expeditionKey: "critical-thinking",
      challengeId: view.challengeId,
      activityKey: view.currentActivity.key,
      chosenKey: correctGuardianSelection(view)
    });
    assert.equal(result.status, "applied");
    return;
  }
  const matched = new Set(view.matchingProgress?.matchedLeftKeys ?? []);
  for (const left of view.currentActivity.left) {
    if (matched.has(left.key)) continue;
    const pair = matchingPublicPair(view, left.key);
    const result = await harness.dispatch({
      kind: "answer_guardian_matching_pair",
      expeditionKey: "critical-thinking",
      challengeId: view.challengeId,
      activityKey: view.currentActivity.key,
      ...pair
    });
    assert.equal(result.status, "applied");
  }
}

async function winGuardian(harness: Harness, challengeId: string): Promise<GuardianView> {
  for (let turn = 0; turn < 60; turn += 1) {
    const read = await harness.runtime.read(harness.learnerRef, {
      kind: "guardian",
      expeditionKey: "critical-thinking",
      challengeId
    });
    assert.equal(read.status, "ok");
    assert.equal(read.view.kind, "guardian");
    harness.version = read.stateVersion;
    if (read.view.state === "won") return read.view;
    await answerGuardianCurrentCorrectly(harness, read.view);
  }
  throw new Error("Guardian did not finish within 60 turns");
}

test("adoption, activation, reads, and public projections use authored keys without answer leakage", async () => {
  const { runtime } = setup();
  const harness = new Harness(runtime);
  const catalogRead = await runtime.read("learner-a", { kind: "catalog" });
  assert.equal(catalogRead.status, "ok");
  assert.equal(catalogRead.view.kind, "catalog");
  assert.deepEqual(catalogRead.view.expeditions.map((entry) => entry.expeditionKey), [
    "critical-thinking",
    "probability-and-statistics",
    "personal-finance",
    "machine-learning",
    "neuroscience-of-memory-and-attention"
  ]);
  assert.equal(catalogRead.view.expeditions[0].adopted, false);

  await harness.adopt();
  const activated = await harness.dispatch({
    kind: "activate_expedition",
    expeditionKey: "critical-thinking"
  });
  assert.equal(activated.status, "applied");
  const view = await harness.expedition();
  assert.equal(view.active, true);
  assert.equal(view.progress[0].state, "available");
  assert.equal(view.progress[1].state, "locked");
  const serialized = JSON.stringify(view);
  assert.doesNotMatch(serialized, /answerKey|"kind":"impostor"|sourceAnchor/);
  assert.doesNotMatch(serialized, /take-southern-road.*correct|size-cures-bias.*impostor/);
});

test("stale commands change nothing, duplicates replay the committed effect, and request ids cannot be reused", async () => {
  const { runtime, store } = setup();
  const harness = new Harness(runtime);
  const adopted = await harness.dispatch(
    { kind: "adopt_expedition", expeditionKey: "critical-thinking" },
    "adopt-once"
  );
  assert.equal(adopted.status, "applied");
  assert.equal(adopted.stateVersion, 1n);

  const stale = await harness.dispatch(
    { kind: "activate_expedition", expeditionKey: "critical-thinking" },
    "stale",
    0n
  );
  assert.equal(stale.status, "stale");
  assert.equal(stale.stateVersion, 1n);

  const duplicate = await harness.dispatch(
    { kind: "adopt_expedition", expeditionKey: "critical-thinking" },
    "adopt-once",
    0n
  );
  assert.equal(duplicate.status, "applied");
  assert.equal(duplicate.replayed, true);
  assert.equal(duplicate.committedStateVersion, 1n);
  assert.equal(duplicate.stateVersion, 1n);

  const reused = await harness.dispatch(
    { kind: "activate_expedition", expeditionKey: "critical-thinking" },
    "adopt-once",
    0n
  );
  assert.equal(reused.status, "refused");
  assert.equal(reused.reason, "request_id_reused");
  const stored = await store.read("learner-a");
  assert.equal(stored.found, true);
  assert.equal(stored.stateVersion, 1n);
  assert.equal(stored.state.commandReceipts.length, 1);
});

test("concurrent commands with one expected version serialize without losing state", async () => {
  const { runtime, store } = setup();
  const harness = new Harness(runtime);
  await harness.adopt();
  const [first, second] = await Promise.all([
    runtime.dispatch("learner-a", {
      requestId: "concurrent-a",
      expectedStateVersion: 1n,
      command: {
        kind: "record_lesson_read",
        expeditionKey: "critical-thinking",
        stopKey: "argument-structure"
      }
    }),
    runtime.dispatch("learner-a", {
      requestId: "concurrent-b",
      expectedStateVersion: 1n,
      command: {
        kind: "set_calibration_known",
        expeditionKey: "critical-thinking",
        stopKey: "argument-structure"
      }
    })
  ]);
  assert.deepEqual([first.status, second.status].sort(), ["applied", "stale"]);
  const stored = await store.read("learner-a");
  assert.equal(stored.found, true);
  assert.equal(stored.stateVersion, 2n);
  assert.equal(stored.state.commandReceipts.length, 2);
});

test("concurrent delivery of the same request commits once and replays once", async () => {
  const { runtime, store } = setup();
  const envelope = {
    requestId: "same-concurrent-request",
    expectedStateVersion: 0n,
    command: {
      kind: "adopt_expedition" as const,
      expeditionKey: "critical-thinking"
    }
  };
  const [first, second] = await Promise.all([
    runtime.dispatch("learner-a", envelope),
    runtime.dispatch("learner-a", envelope)
  ]);
  assert.equal(first.status, "applied");
  assert.equal(second.status, "applied");
  assert.deepEqual(
    [first.replayed, second.replayed].sort(),
    [false, true]
  );
  assert.equal(first.committedStateVersion, 1n);
  assert.equal(second.committedStateVersion, 1n);
  const stored = await store.read("learner-a");
  assert.equal(stored.found, true);
  assert.equal(stored.stateVersion, 1n);
  assert.equal(stored.state.commandReceipts.length, 1);
});

test("lesson plus all current Activity families earns one immutable scored completion", async () => {
  const { runtime, store } = setup();
  const harness = new Harness(runtime);
  await harness.adopt();
  await completeStop(harness, "argument-structure");
  let view = await harness.expedition();
  assert.equal(view.progress[0].state, "mastered");
  assert.deepEqual(view.progress[0].firstGradedCompletion, {
    completedAt: "2026-08-31T12:00:00.000Z",
    difficultyBand: 1,
    points: 1
  });

  const wrong = await harness.dispatch({
    kind: "answer_option_select",
    expeditionKey: "critical-thinking",
    stopKey: "argument-structure",
    activityKey: "identify-conclusion",
    chosenOptionKey: "northern-road-closed",
    source: { kind: "trail" }
  });
  assert.equal(wrong.status, "applied");
  assert.equal(wrong.effect.correct, false);
  view = await harness.expedition();
  assert.equal(view.progress[0].state, "available");
  assert.equal(view.progress[0].firstGradedCompletion?.points, 1);

  const corrected = await harness.dispatch(
    correctAcquisitionCommand({
      view,
      stopKey: "argument-structure",
      activityKey: "identify-conclusion"
    })
  );
  assert.equal(corrected.status, "applied");
  assert.equal(corrected.effect.newlyCompletedStop, false);
  assert.equal(corrected.effect.pointsAwarded, 0);
  const stored = await store.read("learner-a");
  assert.equal(stored.found, true);
  assert.equal(Object.keys(stored.state.expeditions["critical-thinking"].firstGradedStopCompletions).length, 1);
});

test("known calibration closes authored prerequisites, scores nothing, clears, and exposes restoration", async () => {
  const { runtime, store } = setup();
  const harness = new Harness(runtime);
  await harness.adopt();
  const known = await harness.dispatch({
    kind: "set_calibration_known",
    expeditionKey: "critical-thinking",
    stopKey: "evidence-quality"
  });
  assert.equal(known.status, "applied");
  let view = await harness.expedition();
  assert.equal(view.progress.find((entry) => entry.stopKey === "argument-structure")?.state, "known");
  assert.equal(view.progress.find((entry) => entry.stopKey === "evidence-quality")?.state, "known");
  assert.equal(view.progress.find((entry) => entry.stopKey === "causal-claims")?.state, "available");

  await harness.dispatch({
    kind: "record_lesson_read",
    expeditionKey: "critical-thinking",
    stopKey: "causal-claims"
  });
  await harness.dispatch({
    kind: "answer_option_select",
    expeditionKey: "critical-thinking",
    stopKey: "causal-claims",
    activityKey: "diagnose-fire-correlation",
    chosenOptionKey: "vehicles-always-protect",
    source: { kind: "trail" }
  });
  view = await harness.expedition();
  assert.deepEqual(
    view.progress.find((entry) => entry.stopKey === "causal-claims")?.restorationStopKeys,
    ["evidence-quality"]
  );

  await harness.dispatch({
    kind: "clear_calibration_known",
    expeditionKey: "critical-thinking",
    stopKey: "evidence-quality"
  });
  view = await harness.expedition();
  assert.equal(view.progress.find((entry) => entry.stopKey === "causal-claims")?.state, "locked");
  const stored = await store.read("learner-a");
  assert.equal(stored.found, true);
  assert.equal(Object.keys(stored.state.expeditions["critical-thinking"].firstGradedStopCompletions).length, 0);
  assert.equal(stored.state.expeditions["critical-thinking"].acquisitionAttempts.length, 1);
});

test("authored Support opens, hides, restores, and reuses ordinary target evidence without parent progress", async () => {
  const { runtime, store } = setup();
  const harness = new Harness(runtime);
  await harness.adopt();
  const opened = await harness.dispatch({
    kind: "open_support_path",
    expeditionKey: "critical-thinking",
    stopKey: "evidence-quality",
    supportPathKey: "review-support-relationship"
  });
  assert.equal(opened.status, "applied");
  let view = await harness.expedition();
  assert.equal(view.supportPaths.find((path) => path.supportPathKey === "review-support-relationship")?.status, "open");

  const answered = await harness.dispatch(
    correctAcquisitionCommand({
      view,
      stopKey: "argument-structure",
      activityKey: "identify-conclusion",
      source: { kind: "support", supportPathKey: "review-support-relationship" }
    })
  );
  assert.equal(answered.status, "applied");
  assert.equal(answered.effect.stopKey, "argument-structure");
  assert.equal(answered.effect.newlyCompletedStop, false);
  await harness.dispatch({
    kind: "hide_support_path",
    expeditionKey: "critical-thinking",
    supportPathKey: "review-support-relationship"
  });
  await harness.dispatch({
    kind: "open_support_path",
    expeditionKey: "critical-thinking",
    stopKey: "evidence-quality",
    supportPathKey: "review-support-relationship"
  });
  view = await harness.expedition();
  assert.equal(view.supportPaths.find((path) => path.supportPathKey === "review-support-relationship")?.status, "open");
  const stored = await store.read("learner-a");
  assert.equal(stored.found, true);
  assert.equal(stored.state.expeditions["critical-thinking"].firstGradedStopCompletions["evidence-quality"], undefined);
  assert.equal(stored.state.expeditions["critical-thinking"].acquisitionAttempts[0].source.kind, "support");
});

test("Guardian preserves lineup exposure, shield/recovery, queueing, first win, rematch, and reward dedupe", async () => {
  const { runtime, store } = setup();
  const harness = new Harness(runtime);
  await harness.adopt();
  const locked = await harness.dispatch({
    kind: "create_guardian",
    expeditionKey: "critical-thinking",
    scope: { kind: "leg", legKey: "reasoning-foundations" }
  });
  assert.equal(locked.status, "refused");
  assert.equal(locked.reason, "guardian_locked");

  await completeExpedition(harness);
  const created = await harness.dispatch({
    kind: "create_guardian",
    expeditionKey: "critical-thinking",
    scope: { kind: "leg", legKey: "reasoning-foundations" }
  });
  assert.equal(created.status, "applied");
  assert.equal(created.view.kind, "guardian");
  const challengeId = created.effect.challengeId;
  assert.ok(challengeId);
  const conflict = await harness.dispatch({
    kind: "create_guardian",
    expeditionKey: "critical-thinking",
    scope: { kind: "leg", legKey: "reasoning-foundations" }
  });
  assert.equal(conflict.status, "refused");
  assert.equal(conflict.reason, "active_guardian_exists");

  for (let miss = 0; miss < 3; miss += 1) {
    const read = await runtime.read("learner-a", {
      kind: "guardian",
      expeditionKey: "critical-thinking",
      challengeId
    });
    assert.equal(read.status, "ok");
    assert.equal(read.view.kind, "guardian");
    assert.notEqual(read.view.state, "won");
    harness.version = read.stateVersion;
    const guardian = read.view as Extract<GuardianView, { state: "active" | "recovery" }>;
    if (guardian.currentActivity.family === "matching") {
      const left = guardian.currentActivity.left[0];
      const correctPair = matchingPublicPair(guardian, left.key);
      const wrongRight = guardian.currentActivity.right.find((entry) => entry.key !== correctPair.rightKey);
      assert.ok(wrongRight);
      await harness.dispatch({
        kind: "answer_guardian_matching_pair",
        expeditionKey: "critical-thinking",
        challengeId,
        activityKey: guardian.currentActivity.key,
        leftKey: left.key,
        rightKey: wrongRight.key
      });
      const refreshed = await runtime.read("learner-a", {
        kind: "guardian",
        expeditionKey: "critical-thinking",
        challengeId
      });
      assert.equal(refreshed.status, "ok");
      assert.equal(refreshed.view.kind, "guardian");
      assert.notEqual(refreshed.view.state, "won");
      harness.version = refreshed.stateVersion;
      await answerGuardianCurrentCorrectly(
        harness,
        refreshed.view as Extract<GuardianView, { state: "active" | "recovery" }>
      );
    } else {
      const candidates = guardian.currentActivity.family === "option_select"
        ? guardian.currentActivity.options
        : guardian.currentActivity.statements;
      const correctKey = correctGuardianSelection(guardian);
      const wrong = candidates.find((candidate) => candidate.key !== correctKey);
      assert.ok(wrong);
      await harness.dispatch({
        kind: "answer_guardian_selection",
        expeditionKey: "critical-thinking",
        challengeId,
        activityKey: guardian.currentActivity.key,
        chosenKey: wrong.key
      });
    }
  }

  let recovery = await runtime.read("learner-a", {
    kind: "guardian",
    expeditionKey: "critical-thinking",
    challengeId
  });
  assert.equal(recovery.status, "ok");
  assert.equal(recovery.view.kind, "guardian");
  assert.equal(recovery.view.state, "recovery");
  assert.equal(recovery.view.remainingShield, 0);
  harness.version = recovery.stateVersion;
  await answerGuardianCurrentCorrectly(harness, recovery.view);
  recovery = await runtime.read("learner-a", {
    kind: "guardian",
    expeditionKey: "critical-thinking",
    challengeId
  });
  assert.equal(recovery.status, "ok");
  assert.equal(recovery.view.kind, "guardian");
  assert.notEqual(recovery.view.state, "won");
  assert.equal(
    (recovery.view as Extract<GuardianView, { state: "active" | "recovery" }>).remainingShield,
    1
  );
  harness.version = recovery.stateVersion;

  const won = await winGuardian(harness, challengeId);
  assert.equal(won.state, "won");
  assert.equal(won.firstWin, true);
  const afterFirst = await store.read("learner-a");
  assert.equal(afterFirst.found, true);
  assert.equal(afterFirst.state.awards.filter((award) => award.type === "leg_guardian_first_win").length, 1);

  const rematch = await harness.dispatch({
    kind: "create_guardian",
    expeditionKey: "critical-thinking",
    scope: { kind: "leg", legKey: "reasoning-foundations" }
  });
  assert.equal(rematch.status, "applied");
  assert.ok(rematch.effect.challengeId);
  const rematchWon = await winGuardian(harness, rematch.effect.challengeId);
  assert.equal(rematchWon.state, "won");
  assert.equal(rematchWon.firstWin, false);
  const afterRematch = await store.read("learner-a");
  assert.equal(afterRematch.found, true);
  assert.equal(afterRematch.state.awards.filter((award) => award.type === "leg_guardian_first_win").length, 1);
  const exposures = Object.values(afterRematch.state.expeditions["critical-thinking"].guardianExposure);
  assert.ok(exposures.every((exposure) => exposure >= 1));
});

test("Guardian retreat/resume/abandon is durable and never changes acquisition evidence", async () => {
  const { runtime, store } = setup();
  const harness = new Harness(runtime);
  await harness.adopt();
  await completeExpedition(harness);
  const created = await harness.dispatch({
    kind: "create_guardian",
    expeditionKey: "critical-thinking",
    scope: { kind: "leg", legKey: "reasoning-foundations" }
  });
  assert.equal(created.status, "applied");
  const challengeId = created.effect.challengeId;
  assert.ok(challengeId);
  const before = await store.read("learner-a");
  assert.equal(before.found, true);
  const attemptCount = before.state.expeditions["critical-thinking"].acquisitionAttempts.length;

  const retreated = await harness.dispatch({
    kind: "retreat_guardian",
    expeditionKey: "critical-thinking",
    challengeId
  });
  assert.equal(retreated.status, "applied");
  assert.equal(retreated.view.kind, "guardian");
  assert.equal(retreated.view.state === "active" || retreated.view.state === "recovery", true);
  if (retreated.view.kind === "guardian" && retreated.view.state !== "won") {
    assert.equal(retreated.view.retreated, true);
  }
  const blocked = await harness.dispatch({
    kind: "answer_guardian_selection",
    expeditionKey: "critical-thinking",
    challengeId,
    activityKey: created.view.kind === "guardian" && created.view.state !== "won"
      ? created.view.currentActivity.key
      : "missing",
    chosenKey: "missing"
  });
  assert.equal(blocked.status, "refused");
  assert.equal(blocked.reason, "guardian_retreated");
  await harness.dispatch({
    kind: "resume_guardian",
    expeditionKey: "critical-thinking",
    challengeId
  });
  await harness.dispatch({
    kind: "abandon_guardian",
    expeditionKey: "critical-thinking",
    challengeId
  });
  const gone = await runtime.read("learner-a", {
    kind: "guardian",
    expeditionKey: "critical-thinking",
    challengeId
  });
  assert.equal(gone.status, "not_found");
  const after = await store.read("learner-a");
  assert.equal(after.found, true);
  assert.equal(after.state.expeditions["critical-thinking"].acquisitionAttempts.length, attemptCount);
  assert.equal(after.state.expeditions["critical-thinking"].firstGradedStopCompletions.argument, undefined);
});

test("Expedition Guardian stays locked until every winnable Leg first win, then awards one summit reward", async () => {
  const { runtime, store } = setup();
  const harness = new Harness(runtime);
  await harness.adopt();
  await completeExpedition(harness);
  let final = await harness.dispatch({
    kind: "create_guardian",
    expeditionKey: "critical-thinking",
    scope: { kind: "expedition" }
  });
  assert.equal(final.status, "refused");
  assert.equal(final.reason, "guardian_locked");

  const leg = await harness.dispatch({
    kind: "create_guardian",
    expeditionKey: "critical-thinking",
    scope: { kind: "leg", legKey: "reasoning-foundations" }
  });
  assert.equal(leg.status, "applied");
  assert.ok(leg.effect.challengeId);
  await winGuardian(harness, leg.effect.challengeId);
  final = await harness.dispatch({
    kind: "create_guardian",
    expeditionKey: "critical-thinking",
    scope: { kind: "expedition" }
  });
  assert.equal(final.status, "applied");
  assert.ok(final.effect.challengeId);
  const won = await winGuardian(harness, final.effect.challengeId);
  assert.equal(won.state, "won");
  assert.equal(won.firstWin, true);
  const stored = await store.read("learner-a");
  assert.equal(stored.found, true);
  assert.equal(stored.state.awards.filter((award) => award.type === "expedition_guardian_first_win").length, 1);
});

test("leaderboard uses immutable first completions, includes zero-state viewers, and keeps deterministic rivals", async () => {
  const { runtime } = setup(["learner-a", "learner-b"]);
  const a = new Harness(runtime, "learner-a");
  await a.adopt();
  await completeStop(a, "argument-structure");
  const first = await runtime.read("learner-a", { kind: "leaderboard" });
  const second = await runtime.read("learner-a", { kind: "leaderboard" });
  assert.equal(first.status, "ok");
  assert.equal(second.status, "ok");
  assert.equal(first.view.kind, "leaderboard");
  assert.equal(second.view.kind, "leaderboard");
  assert.equal(first.view.viewerPoints, 1);
  assert.equal(first.view.masteredCrystalCount, 1);
  assert.deepEqual(first.view.division, {
    name: "Basecamp",
    threshold: 0,
    nextThreshold: 10
  });
  assert.deepEqual(first.view.entries, second.view.entries);
  assert.deepEqual(first.view.chase, second.view.chase);

  const zero = await runtime.read("learner-b", { kind: "leaderboard" });
  assert.equal(zero.status, "ok");
  assert.equal(zero.view.kind, "leaderboard");
  assert.equal(zero.view.viewerPoints, 0);
  assert.equal(zero.view.masteredCrystalCount, 0);
  assert.ok(zero.view.entries.some((entry) => entry.isViewer && entry.id === "learner-b"));
});

test("prior-week podium award is lazy, typed, and deduplicated", async () => {
  const learners = Array.from({ length: 10 }, (_, index) => `learner-${index}`);
  const clock = { current: new Date("2026-08-24T12:00:00.000Z") };
  const { runtime, store } = setup(learners, clock);
  for (const learnerRef of learners) {
    const harness = new Harness(runtime, learnerRef);
    await harness.adopt();
    await completeStop(harness, "argument-structure");
    if (learnerRef === "learner-0") {
      await completeStop(harness, "evidence-quality");
      await completeStop(harness, "causal-claims");
    }
  }
  clock.current = new Date("2026-08-31T12:00:00.000Z");
  const first = await runtime.read("learner-0", { kind: "leaderboard" });
  assert.equal(first.status, "ok");
  assert.equal(first.view.kind, "leaderboard");
  assert.equal(first.view.podiumEarnedForPreviousWeek, true);
  const second = await runtime.read("learner-0", { kind: "leaderboard" });
  assert.equal(second.status, "ok");
  assert.equal(second.view.kind, "leaderboard");
  assert.equal(second.view.podiumEarnedForPreviousWeek, false);
  const stored = await store.read("learner-0");
  assert.equal(stored.found, true);
  const podiums = stored.state.awards.filter((award) => award.type === "weekly_podium");
  assert.equal(podiums.length, 1);
  assert.equal(podiums[0].rank, 1);
  assert.equal(podiums[0].points, 6);
});

test("content revision mismatches fail closed on reads and commands without mutation", async () => {
  const { runtime, store } = setup();
  const harness = new Harness(runtime);
  await harness.adopt();
  const before = await store.read("learner-a");
  assert.equal(before.found, true);
  const corrupt = structuredClone(before.state);
  corrupt.expeditions["critical-thinking"].contentRevision = "old-revision";
  const mismatchedStore = new MemoryLearnerStateStore([
    {
      learnerRef: "learner-a",
      displayName: "Explorer A",
      state: corrupt,
      stateVersion: before.stateVersion
    }
  ]);
  const mismatchedRuntime = createLearnerRuntime({ catalog, stateStore: mismatchedStore });
  const read = await mismatchedRuntime.read("learner-a", {
    kind: "expedition",
    expeditionKey: "critical-thinking"
  });
  assert.equal(read.status, "content_changed");
  const command = await mismatchedRuntime.dispatch("learner-a", {
    requestId: "must-not-write",
    expectedStateVersion: 1n,
    command: {
      kind: "record_lesson_read",
      expeditionKey: "critical-thinking",
      stopKey: "argument-structure"
    }
  });
  assert.equal(command.status, "content_changed");
  const after = await mismatchedStore.read("learner-a");
  assert.equal(after.found, true);
  assert.equal(after.stateVersion, 1n);
  assert.equal(after.state.commandReceipts.length, 1);
  assert.deepEqual(after.state.expeditions["critical-thinking"].firstLessonReadAt, {});
});

test("learners are isolated and unknown Better Auth identities are never created", async () => {
  const { runtime, store } = setup(["learner-a", "learner-b"]);
  const a = new Harness(runtime, "learner-a");
  await a.adopt();
  await completeStop(a, "argument-structure");
  const bJournal = await runtime.read("learner-b", { kind: "journal" });
  assert.equal(bJournal.status, "ok");
  assert.equal(bJournal.view.kind, "journal");
  assert.deepEqual(bJournal.view.expeditions, []);
  const missing = await runtime.dispatch("unknown", {
    requestId: "no-user",
    expectedStateVersion: 0n,
    command: { kind: "adopt_expedition", expeditionKey: "critical-thinking" }
  });
  assert.equal(missing.status, "learner_not_found");
  assert.equal((await store.listBoardCohort()).length, 2);
});
