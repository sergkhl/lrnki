import { describe, expect, test } from "@jest/globals";

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
