import { describe, expect, jest, test } from "@jest/globals";

import { createNavigationMemory, type NavigationMemoryStorage } from "./navigationMemory";

function memoryStorage(): NavigationMemoryStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); }
  };
}

describe("navigation memory", () => {
  test("slow storage cannot overwrite a newer learning cursor", async () => {
    let release!: () => void;
    const storage = memoryStorage();
    const delayed = jest.fn(async (key: string, value: string) => {
      if (delayed.mock.calls.length === 1) await new Promise<void>(resolve => { release = resolve; });
      await storage.setItem(key, value);
    });
    const memory = createNavigationMemory({ getItem: storage.getItem, setItem: delayed });
    const scope = { learnerRef: "one", expeditionKey: "reasoning", contentRevision: "v1" };
    const first = memory.writeLearningCursor(scope, { stepKey: "s", kind: "theory", itemKey: "one" });
    const second = memory.writeLearningCursor(scope, { stepKey: "s", kind: "theory", itemKey: "two" });
    const reopened = memory.readLearningCursor(scope);
    await Promise.resolve();
    expect(delayed).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(delayed).toHaveBeenCalledTimes(2);
    await expect(reopened).resolves.toEqual({ stepKey: "s", kind: "theory", itemKey: "two" });
    await expect(memory.readLearningCursor(scope)).resolves.toEqual({ stepKey: "s", kind: "theory", itemKey: "two" });
  });
  test("learning pointers are isolated by learner, expedition, revision and Support path", async () => {
    const memory = createNavigationMemory(memoryStorage());
    const scope = { learnerRef: "one", expeditionKey: "reasoning", contentRevision: "v1" };
    const cursor = { stepKey: "claims", kind: "theory" as const, itemKey: "examples" };
    await memory.writeLearningCursor(scope, cursor);
    await expect(memory.readLearningCursor(scope)).resolves.toEqual(cursor);
    for (const other of [{ learnerRef: "two" }, { expeditionKey: "probability" }, { contentRevision: "v2" }, { supportPathKey: "help" }]) {
      await expect(memory.readLearningCursor({ ...scope, ...other })).resolves.toBeNull();
    }
    await memory.writeLearningCursor({ ...scope, supportPathKey: "help" }, cursor);
    await expect(memory.readLearningCursor({ ...scope, supportPathKey: "help" })).resolves.toEqual(cursor);
  });

  test("corrupt and unavailable learning memory falls back without changing progress", async () => {
    const scope = { learnerRef: "one", expeditionKey: "reasoning", contentRevision: "v1" };
    const storage = memoryStorage();
    const memory = createNavigationMemory(storage);
    await memory.writeLearningCursor(scope, { stepKey: "s", kind: "question", itemKey: "q" });
    const key = [...storage.values.keys()][0];
    expect(await memory.readLearningCursor(scope)).not.toBeNull();
    for (const raw of ["{", "{}", '{"stepKey":"s","kind":"answer","itemKey":"q"}']) {
      storage.values.set(key, raw);
      await expect(memory.readLearningCursor(scope)).resolves.toBeNull();
    }
  });
  test("isolates learner keys and round-trips one valid board snapshot", async () => {
    const storage = memoryStorage();
    const memory = createNavigationMemory(storage);
    await memory.writeBoardSeen("learner/one", { weekKey: "2026-W35", rank: 2, points: 41 });

    await expect(memory.readBoardSeen("learner/one")).resolves.toEqual({
      weekKey: "2026-W35",
      rank: 2,
      points: 41
    });
    await expect(memory.readBoardSeen("learner-two")).resolves.toBeNull();
    expect([...storage.values.keys()]).toEqual(["lrnki_board_seen_learner%2Fone"]);
  });

  test("treats corrupt, incomplete, and invalid snapshots as loss", async () => {
    const storage = memoryStorage();
    const memory = createNavigationMemory(storage);
    for (const raw of ["{", "{}", '{"weekKey":"2026-W35","rank":0,"points":1}', '{"weekKey":"2026-W35","rank":1,"points":-1}']) {
      storage.values.set("lrnki_board_seen_scout", raw);
      await expect(memory.readBoardSeen("scout")).resolves.toBeNull();
    }
  });

  test("contains raw storage failures because the memory is not learner authority", async () => {
    const memory = createNavigationMemory({
      async getItem() { throw new Error("unavailable"); },
      async setItem() { throw new Error("unavailable"); }
    });
    await expect(memory.readBoardSeen("scout")).resolves.toBeNull();
    await expect(memory.writeBoardSeen("scout", { weekKey: "2026-W35", rank: null, points: 0 })).resolves.toBeUndefined();
  });
});
