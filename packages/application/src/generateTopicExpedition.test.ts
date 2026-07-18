import assert from "node:assert/strict";
import test from "node:test";
import type { LearnerExpeditionStorePort } from "@lrnki/ports";
import { createTopicExpeditionGeneration, type TopicExpeditionRequest } from "./generateTopicExpedition";

// The deep interface is the lifecycle test surface (plan 2026-07-13-001 KTD8): every
// scenario drives the factory-returned callable with lifecycle facts and observes only
// fenced progress writes, adapter activity, and rejection behavior.

type ProgressWrite = Parameters<LearnerExpeditionStorePort["updateProgress"]>[0];

type Harness = {
  calls: string[];
  writes: ProgressWrite[];
  progress: Pick<LearnerExpeditionStorePort, "updateProgress">;
  setWriteResult: (result: (write: ProgressWrite) => number | Promise<number>) => void;
};

function harness(): Harness {
  const calls: string[] = [];
  const writes: ProgressWrite[] = [];
  let writeResult: (write: ProgressWrite) => number | Promise<number> = () => 1;
  return {
    calls,
    writes,
    progress: {
      async updateProgress(input) {
        const affected = await writeResult(input);
        if (affected !== 0) {
          writes.push(input);
          calls.push(describeWrite(input));
        }
        return affected;
      }
    },
    setWriteResult(result) {
      writeResult = result;
    }
  };
}

function describeWrite(input: ProgressWrite): string {
  if (input.status === "generating") return "write:claim";
  if (input.status === "ready") return "write:ready";
  if (input.status === "failed") return `write:failed:${input.failureMessage}`;
  if (input.declaredDomain !== undefined && input.status === undefined) return `write:domain:${input.declaredDomain}`;
  if (input.currentOperationType === null) return "write:release";
  return `write:${input.currentOperationType}`;
}

const request: TopicExpeditionRequest = {
  learnerExpeditionId: "expedition",
  enrichmentId: "enrichment-1",
  topic: "Rust ownership",
  declaredDomain: "software engineering"
};

function generator(h: Harness, overrides?: Partial<Parameters<typeof createTopicExpeditionGeneration>[0]>) {
  return createTopicExpeditionGeneration({
    expeditionProgress: h.progress,
    syntheticGeneration: async () => {
      h.calls.push("synthetic");
      return { conceptCount: 1 };
    },
    studyItemBankGeneration: async () => {
      h.calls.push("study");
    },
    ...overrides
  });
}

test("a claimed expedition with a Declared Domain records enrichment, study items, and ready in order and resolves void", async () => {
  const h = harness();
  const result = await generator(h)(request);

  assert.equal(result, undefined);
  assert.deepEqual(h.calls, ["write:claim", "synthetic", "write:study_items", "study", "write:ready"]);
  // The claim already installed this run's enrichment id; every write expects it.
  assert.deepEqual(h.writes.map((write) => write.expectedOperationId), ["enrichment-1", "enrichment-1", "enrichment-1"]);
  assert.deepEqual(h.writes[0], {
    learnerExpeditionId: "expedition",
    expectedOperationId: "enrichment-1",
    status: "generating"
  });
  assert.deepEqual(h.writes[2], {
    learnerExpeditionId: "expedition",
    expectedOperationId: "enrichment-1",
    status: "ready",
    enrichmentId: "enrichment-1",
    declaredDomain: "software engineering",
    currentOperationId: null,
    currentOperationType: null,
    failureMessage: null
  });
});

test("a null Declared Domain reaches the synthetic adapter unchanged, persists through the fence, and survives into the ready row", async () => {
  const h = harness();
  await generator(h, {
    syntheticGeneration: async (activity) => {
      h.calls.push(`synthetic:${activity.declaredDomain}`);
      await activity.onDeclaredDomain("software engineering");
      return { conceptCount: 1 };
    }
  })({ ...request, declaredDomain: null });

  assert.deepEqual(h.calls, [
    "write:claim",
    "synthetic:null",
    "write:domain:software engineering",
    "write:study_items",
    "study",
    "write:ready"
  ]);
  const domainWrite = h.writes[1];
  assert.equal(domainWrite.expectedOperationId, "enrichment-1");
  const readyWrite = h.writes.at(-1);
  assert.equal(readyWrite?.declaredDomain, "software engineering");
});

test("a positive concept count with a resolving study adapter becomes ready without any item threshold", async () => {
  // ADR-0026: a sparse but valid Study Item Bank is still ready — the lifecycle sees only
  // completion, so there is no item or lesson count to gate on.
  const h = harness();
  await generator(h, {
    syntheticGeneration: async () => {
      h.calls.push("synthetic");
      return { conceptCount: 1 };
    },
    studyItemBankGeneration: async () => {
      h.calls.push("study:sparse");
    }
  })(request);

  assert.equal(h.calls.at(-1), "write:ready");
});

test("a zero concept count fails before the study adapter with the bounded failure message", async () => {
  const h = harness();
  await assert.rejects(
    () => generator(h, { syntheticGeneration: async () => ({ conceptCount: 0 }) })(request),
    /no concepts/
  );
  assert.deepEqual(h.calls, ["write:claim", "write:failed:Scouting produced no concepts."]);
});

test("infrastructure-only attempt trails release the claim, stay generating, and reject the original error", async () => {
  const trails = [
    [{ attempt: 0, kind: "network", code: "ECONNRESET" }],
    [{ attempt: 0, kind: "timeout", code: "UND_ERR_HEADERS_TIMEOUT" }],
    [{ attempt: 0, kind: "http", status: 429 }],
    [{ attempt: 0, kind: "http", status: 503 }, { attempt: 1, kind: "http", status: 500 }]
  ];
  for (const attempts of trails) {
    const h = harness();
    const transient = Object.assign(new Error("upstream unavailable"), {
      stageErrorDetail: { kind: "forced_tool_exhaustion", message: "upstream unavailable", attempts }
    });
    await assert.rejects(
      () => generator(h, { syntheticGeneration: async () => { throw transient; } })(request),
      (error: unknown) => error === transient
    );
    // No failed write: the operation fields are cleared under the current fence and the
    // row stays `generating` for the supervisor's attempt budget to re-claim.
    assert.deepEqual(h.calls, ["write:claim", "write:release"]);
    assert.deepEqual(h.writes[1], {
      learnerExpeditionId: "expedition",
      expectedOperationId: "enrichment-1",
      currentOperationId: null,
      currentOperationType: null
    });
  }
});

test("plain errors, non-429 client errors, schema deviations, and mixed trails write failed and reject the original error", async () => {
  const withTrail = (attempts: object[]) =>
    Object.assign(new Error("model deviated"), {
      stageErrorDetail: { kind: "forced_tool_exhaustion", message: "model deviated", attempts }
    });
  const deterministic: Error[] = [
    new Error("model down"),
    withTrail([{ attempt: 0, kind: "http", status: 400 }]),
    withTrail([{ attempt: 0, kind: "schema_invalid" }]),
    withTrail([{ attempt: 0, kind: "network" }, { attempt: 1, kind: "schema_invalid" }])
  ];
  for (const error of deterministic) {
    const h = harness();
    await assert.rejects(
      () => generator(h, { syntheticGeneration: async () => { throw error; } })(request),
      (rejected: unknown) => rejected === error
    );
    assert.deepEqual(h.calls, ["write:claim", `write:failed:${error.message}`]);
    assert.equal(h.writes[1].status, "failed");
  }
});

test("losing the initial fence prevents all generation activity and rejects claim loss", async () => {
  const h = harness();
  h.setWriteResult(() => 0);
  await assert.rejects(() => generator(h)(request), /claim lost/i);
  // The run stopped at the first fenced write — no adapter ran and no LLM work was spent.
  assert.deepEqual(h.calls, []);
});

test("losing the domain fence stops the run before any further activity or lifecycle write", async () => {
  const h = harness();
  h.setWriteResult((write) => (write.declaredDomain !== undefined && write.status === undefined ? 0 : 1));
  await assert.rejects(() => generator(h, {
    syntheticGeneration: async (activity) => {
      h.calls.push("synthetic");
      await activity.onDeclaredDomain("inferred domain");
      h.calls.push("synthetic:after-domain");
      return { conceptCount: 1 };
    }
  })({ ...request, declaredDomain: null }), /claim lost/i);
  assert.deepEqual(h.calls, ["write:claim", "synthetic"]);
});

test("losing the study-items phase fence prevents bank generation and any terminal write", async () => {
  const h = harness();
  h.setWriteResult((write) => (write.currentOperationType === "study_items" ? 0 : 1));
  await assert.rejects(() => generator(h)(request), /claim lost/i);
  assert.deepEqual(h.calls, ["write:claim", "synthetic"]);
});

test("losing the ready fence rejects claim loss without a failure write", async () => {
  const h = harness();
  h.setWriteResult((write) => (write.status === "ready" ? 0 : 1));
  await assert.rejects(() => generator(h)(request), /claim lost/i);
  assert.deepEqual(h.calls, ["write:claim", "synthetic", "write:study_items", "study"]);
});

test("a rejected best-effort failure or release write still rethrows the original error", async () => {
  for (const error of [
    new Error("deterministic failure"),
    Object.assign(new Error("transient failure"), {
      stageErrorDetail: { kind: "forced_tool_exhaustion", message: "transient failure", attempts: [{ attempt: 0, kind: "timeout" }] }
    })
  ]) {
    const h = harness();
    let installed = false;
    h.setWriteResult(() => {
      if (!installed) {
        installed = true;
        return 1;
      }
      throw new Error("store unavailable");
    });
    await assert.rejects(
      () => generator(h, { syntheticGeneration: async () => { throw error; } })(request),
      (rejected: unknown) => rejected === error
    );
  }
});

test("failure messages are redacted: control characters removed, whitespace compacted, capped at 240, with a fallback", async () => {
  const cases: Array<{ thrown: Error; written: string }> = [
    { thrown: new Error("bad\x00\x01\ncontrol\tchars"), written: "bad control chars" },
    { thrown: new Error(`long ${"x".repeat(300)}`), written: `long ${"x".repeat(300)}`.slice(0, 240) },
    { thrown: new Error("   \n\t  "), written: "Scouting failed. Try again later." }
  ];
  for (const { thrown, written } of cases) {
    const h = harness();
    await assert.rejects(() => generator(h, { syntheticGeneration: async () => { throw thrown; } })(request));
    assert.equal(h.writes[1].failureMessage, written);
  }
});

test("two interleaved calls through one constructed generator keep isolated identity, fence, domain, and terminal state", async () => {
  const h = harness();
  const gates = new Map<string, () => void>();
  const blocked = (key: string) => new Promise<void>((resolve) => gates.set(key, resolve));
  const generate = generator(h, {
    syntheticGeneration: async (activity) => {
      h.calls.push(`synthetic:${activity.enrichmentId}:${activity.topic}`);
      await blocked(activity.enrichmentId);
      await activity.onDeclaredDomain(`domain for ${activity.topic}`);
      return { conceptCount: 1 };
    },
    studyItemBankGeneration: async (activity) => {
      h.calls.push(`study:${activity.enrichmentId}`);
    }
  });

  const first = generate({ learnerExpeditionId: "expedition-a", enrichmentId: "enrichment-1", topic: "Rust ownership", declaredDomain: null });
  const second = generate({ learnerExpeditionId: "expedition-b", enrichmentId: "enrichment-2", topic: "Cell biology", declaredDomain: null });
  // Let both installs and synthetic starts happen, then finish them in reverse order.
  await new Promise((resolve) => setImmediate(resolve));
  gates.get("enrichment-2")?.();
  gates.get("enrichment-1")?.();
  await Promise.all([first, second]);

  const byExpedition = (id: string) => h.writes.filter((write) => write.learnerExpeditionId === id);
  for (const [expedition, enrichmentId, topic] of [
    ["expedition-a", "enrichment-1", "Rust ownership"],
    ["expedition-b", "enrichment-2", "Cell biology"]
  ] as const) {
    const writes = byExpedition(expedition);
    // install → domain → study_items phase → ready, all fenced on this call's own id.
    assert.deepEqual(
      writes.map((write) => write.expectedOperationId),
      [enrichmentId, enrichmentId, enrichmentId, enrichmentId]
    );
    assert.equal(writes[0].status, "generating");
    assert.equal(writes[1].declaredDomain, `domain for ${topic}`);
    const ready = writes.at(-1);
    assert.equal(ready?.status, "ready");
    assert.equal(ready?.enrichmentId, enrichmentId);
    assert.equal(ready?.declaredDomain, `domain for ${topic}`);
  }
  assert.ok(h.calls.includes("synthetic:enrichment-1:Rust ownership"));
  assert.ok(h.calls.includes("synthetic:enrichment-2:Cell biology"));
  assert.ok(h.calls.includes("study:enrichment-1"));
  assert.ok(h.calls.includes("study:enrichment-2"));
});
