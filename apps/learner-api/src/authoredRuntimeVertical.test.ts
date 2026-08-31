import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  loadQualifiedCatalogOrThrow,
  qualifiedExpeditionDocument
} from "@lrnki/learner-runtime/content-node";
import type { AuthoredActivity } from "@lrnki/learner-runtime";
import {
  createLearnerRuntime,
  MemoryLearnerStateStore,
  type CommandEffect,
  type ExpeditionView,
  type GuardianView,
  type LearnerCommand,
  type LearnerQuery,
  type LearnerView
} from "@lrnki/learner-runtime/runtime";
import { Hono } from "hono";

type HttpResult = {
  status: string;
  stateVersion?: string;
  replayed?: boolean;
  effect?: CommandEffect;
  view?: LearnerView;
  reason?: string;
};

function jsonSafe(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, nested) =>
      typeof nested === "bigint" ? nested.toString() : nested
    )
  );
}

function createTestOnlyApi(runtime: ReturnType<typeof createLearnerRuntime>) {
  const app = new Hono();
  const learner = (header: string | undefined): string | undefined =>
    header?.trim() || undefined;

  app.get("/test/game/:query", async (context) => {
    const learnerRef = learner(context.req.header("x-test-session-learner"));
    if (!learnerRef) return context.json({ error: "unauthorized" }, 401);
    const queryName = context.req.param("query");
    let query: LearnerQuery;
    if (queryName === "journal" || queryName === "catalog" || queryName === "leaderboard") {
      query = { kind: queryName };
    } else if (queryName === "expedition") {
      query = {
        kind: "expedition",
        expeditionKey: context.req.query("expeditionKey") ?? ""
      };
    } else if (queryName === "guardian") {
      query = {
        kind: "guardian",
        expeditionKey: context.req.query("expeditionKey") ?? "",
        challengeId: context.req.query("challengeId") ?? ""
      };
    } else {
      return context.json({ error: "unknown query" }, 404);
    }
    return context.json(jsonSafe(await runtime.read(learnerRef, query)));
  });

  app.post("/test/game/commands", async (context) => {
    const learnerRef = learner(context.req.header("x-test-session-learner"));
    if (!learnerRef) return context.json({ error: "unauthorized" }, 401);
    const body = await context.req.json<{
      requestId: string;
      expectedStateVersion: string;
      command: LearnerCommand;
      learnerRef?: string;
    }>();
    if (!/^\d+$/.test(body.expectedStateVersion)) {
      return context.json({ error: "invalid state version" }, 400);
    }
    return context.json(
      jsonSafe(
        await runtime.dispatch(learnerRef, {
          requestId: body.requestId,
          expectedStateVersion: BigInt(body.expectedStateVersion),
          command: body.command
        })
      )
    );
  });
  return app;
}

class InterceptedClient {
  version = "0";
  request = 0;

  constructor(
    readonly app: ReturnType<typeof createTestOnlyApi>,
    readonly learnerRef: string
  ) {}

  async read(
    query: "journal" | "catalog" | "leaderboard" | "expedition" | "guardian",
    parameters: Record<string, string> = {}
  ): Promise<HttpResult> {
    const url = new URL(`http://test.invalid/test/game/${query}`);
    for (const [key, value] of Object.entries(parameters)) {
      url.searchParams.set(key, value);
    }
    const response = await this.app.request(url, {
      headers: { "x-test-session-learner": this.learnerRef }
    });
    assert.equal(response.status, 200);
    const result = (await response.json()) as HttpResult;
    if (result.stateVersion) this.version = result.stateVersion;
    return result;
  }

  async command(command: LearnerCommand): Promise<HttpResult> {
    const response = await this.app.request("http://test.invalid/test/game/commands", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-session-learner": this.learnerRef
      },
      body: JSON.stringify({
        requestId: `http-${this.learnerRef}-${++this.request}`,
        expectedStateVersion: this.version,
        // Deliberately hostile body identity: the adapter must use only the session header.
        learnerRef: "bob",
        command
      })
    });
    assert.equal(response.status, 200);
    const result = (await response.json()) as HttpResult;
    if (result.stateVersion) this.version = result.stateVersion;
    return result;
  }
}

function activityIn(view: ExpeditionView, activityKey: string) {
  return view.expedition.legs
    .flatMap((leg) => leg.stops)
    .flatMap((stop) => stop.activities)
    .find((activity) => activity.key === activityKey);
}

test("test-only Hono composition completes Critical Thinking through one authenticated command route", async () => {
  const contentRoot = fileURLToPath(new URL("../../../content/", import.meta.url));
  const catalog = await loadQualifiedCatalogOrThrow(contentRoot);
  const document = qualifiedExpeditionDocument(catalog, "critical-thinking");
  if (!document) throw new Error("Critical Thinking content is missing");
  const store = new MemoryLearnerStateStore([
    { learnerRef: "alice", displayName: "Alice" },
    { learnerRef: "bob", displayName: "Bob" }
  ]);
  const runtime = createLearnerRuntime({
    catalog,
    stateStore: store,
    now: () => new Date("2026-08-31T12:00:00.000Z")
  });
  const app = createTestOnlyApi(runtime);
  const alice = new InterceptedClient(app, "alice");
  const bob = new InterceptedClient(app, "bob");

  const unauthorized = await app.request("http://test.invalid/test/game/journal");
  assert.equal(unauthorized.status, 401);
  const catalogRead = await alice.read("catalog");
  assert.equal(catalogRead.status, "ok");
  assert.equal(catalogRead.view?.kind, "catalog");
  assert.deepEqual(
    catalogRead.view.kind === "catalog"
      ? catalogRead.view.expeditions.map((entry) => entry.expeditionKey)
      : [],
    [
      "critical-thinking",
      "probability-and-statistics",
      "personal-finance",
      "machine-learning",
      "neuroscience-of-memory-and-attention"
    ]
  );

  assert.equal(
    (await alice.command({
      kind: "adopt_expedition",
      expeditionKey: "critical-thinking"
    })).status,
    "applied"
  );
  assert.equal(
    (await alice.command({
      kind: "activate_expedition",
      expeditionKey: "critical-thinking"
    })).status,
    "applied"
  );

  // Exact authored Support state and its ordinary target evidence cross the same command seam.
  await alice.command({
    kind: "open_support_path",
    expeditionKey: "critical-thinking",
    stopKey: "evidence-quality",
    supportPathKey: "review-support-relationship"
  });
  const supportAnswer = await alice.command({
    kind: "answer_option_select",
    expeditionKey: "critical-thinking",
    stopKey: "argument-structure",
    activityKey: "identify-conclusion",
    chosenOptionKey: "take-southern-road",
    source: {
      kind: "support",
      supportPathKey: "review-support-relationship"
    }
  });
  assert.equal(supportAnswer.status, "applied");
  assert.equal(supportAnswer.effect?.stopKey, "argument-structure");
  await alice.command({
    kind: "hide_support_path",
    expeditionKey: "critical-thinking",
    supportPathKey: "review-support-relationship"
  });
  await alice.command({
    kind: "open_support_path",
    expeditionKey: "critical-thinking",
    stopKey: "evidence-quality",
    supportPathKey: "review-support-relationship"
  });

  const correctCommand = (
    view: ExpeditionView,
    stopKey: string,
    activityKey: string
  ): LearnerCommand => {
    const server = document.legs
      .flatMap((leg) => leg.stops)
      .flatMap((stop) => stop.activities)
      .find((activity) => activity.key === activityKey);
    const projected = activityIn(view, activityKey);
    if (!server || !projected || server.family !== projected.family) {
      throw new Error(`Activity ${activityKey} failed to hydrate`);
    }
    if (server.family === "option_select") {
      return {
        kind: "answer_option_select",
        expeditionKey: "critical-thinking",
        stopKey,
        activityKey,
        chosenOptionKey: server.answerKey,
        source: { kind: "trail" }
      };
    }
    if (server.family === "impostor") {
      return {
        kind: "answer_impostor",
        expeditionKey: "critical-thinking",
        stopKey,
        activityKey,
        chosenStatementKey:
          server.statements.find((statement) => statement.kind === "impostor")?.key ?? "",
        source: { kind: "trail" }
      };
    }
    if (projected.family !== "matching") throw new Error("Matching projection changed family");
    return {
      kind: "answer_matching",
      expeditionKey: "critical-thinking",
      stopKey,
      activityKey,
      matches: projected.left.map((left) => {
        const pair = server.pairs.find((candidate) => candidate.left === left.text);
        const right = projected.right.find((candidate) => candidate.text === pair?.right);
        if (!pair || !right) throw new Error("Matching pair failed to hydrate");
        return { leftKey: left.key, rightKey: right.key };
      }),
      source: { kind: "trail" }
    };
  };

  for (const stop of document.legs.flatMap((leg) => leg.stops)) {
    assert.equal(
      (await alice.command({
        kind: "record_lesson_read",
        expeditionKey: "critical-thinking",
        stopKey: stop.key
      })).status,
      "applied"
    );
    for (const activity of stop.activities) {
      const read = await alice.read("expedition", {
        expeditionKey: "critical-thinking"
      });
      assert.equal(read.status, "ok");
      assert.equal(read.view?.kind, "expedition");
      const answered = await alice.command(
        correctCommand(read.view as ExpeditionView, stop.key, activity.key)
      );
      assert.equal(answered.status, "applied");
      assert.equal(answered.effect?.correct, true);
    }
  }

  const answerGuardian = async (challengeId: string): Promise<GuardianView> => {
    for (let turn = 0; turn < 60; turn += 1) {
      const read = await alice.read("guardian", {
        expeditionKey: "critical-thinking",
        challengeId
      });
      assert.equal(read.status, "ok");
      assert.equal(read.view?.kind, "guardian");
      const guardian = read.view as GuardianView;
      if (guardian.state === "won") return guardian;
      const server: AuthoredActivity | undefined = document.legs
        .flatMap((leg) => leg.stops)
        .flatMap((stop) => stop.activities)
        .find((activity) => activity.key === guardian.currentActivity.key);
      if (!server || server.family !== guardian.currentActivity.family) {
        throw new Error("Guardian Activity failed to hydrate");
      }
      if (server.family === "matching" && guardian.currentActivity.family === "matching") {
        const matched = new Set(guardian.matchingProgress?.matchedLeftKeys ?? []);
        for (const left of guardian.currentActivity.left) {
          if (matched.has(left.key)) continue;
          const pair: { key: string; left: string; right: string } | undefined =
            server.pairs.find((candidate): boolean => candidate.left === left.text);
          const right: { key: string; text: string } | undefined = guardian.currentActivity.right.find(
            (candidate): boolean => candidate.text === pair?.right
          );
          if (!pair || !right) throw new Error("Guardian Matching pair failed to hydrate");
          assert.equal(
            (await alice.command({
              kind: "answer_guardian_matching_pair",
              expeditionKey: "critical-thinking",
              challengeId,
              activityKey: server.key,
              leftKey: left.key,
              rightKey: right.key
            })).status,
            "applied"
          );
        }
      } else if (server.family !== "matching") {
        const keyed: string = server.family === "option_select"
          ? server.answerKey
          : server.statements.find((statement) => statement.kind === "impostor")?.key ?? "";
        assert.equal(
          (await alice.command({
            kind: "answer_guardian_selection",
            expeditionKey: "critical-thinking",
            challengeId,
            activityKey: server.key,
            chosenKey: keyed
          })).status,
          "applied"
        );
      }
    }
    throw new Error("Guardian did not finish");
  };

  const legCreated = await alice.command({
    kind: "create_guardian",
    expeditionKey: "critical-thinking",
    scope: { kind: "leg", legKey: "reasoning-foundations" }
  });
  assert.equal(legCreated.status, "applied");
  assert.ok(legCreated.effect?.challengeId);
  assert.equal((await answerGuardian(legCreated.effect.challengeId)).state, "won");

  const finalCreated = await alice.command({
    kind: "create_guardian",
    expeditionKey: "critical-thinking",
    scope: { kind: "expedition" }
  });
  assert.equal(finalCreated.status, "applied");
  assert.ok(finalCreated.effect?.challengeId);
  assert.equal((await answerGuardian(finalCreated.effect.challengeId)).state, "won");

  const board = await alice.read("leaderboard");
  assert.equal(board.status, "ok");
  assert.equal(board.view?.kind, "leaderboard");
  if (board.view?.kind === "leaderboard") {
    assert.equal(board.view.viewerPoints, 6);
    assert.equal(board.view.masteredCrystalCount, 3);
  }
  const aliceJournal = await alice.read("journal");
  assert.equal(aliceJournal.view?.kind, "journal");
  assert.equal(
    aliceJournal.view?.kind === "journal"
      ? aliceJournal.view.expeditions[0]?.masteredStopCount
      : 0,
    3
  );
  const bobJournal = await bob.read("journal");
  assert.equal(bobJournal.view?.kind, "journal");
  assert.deepEqual(
    bobJournal.view?.kind === "journal" ? bobJournal.view.expeditions : [],
    [],
    "the body learnerRef never overrides the authenticated session learner"
  );
});
