import assert from "node:assert/strict";
import test from "node:test";
import type { Learner, LearnerStorePort } from "@lrnki/ports";
import { enterLearnerSession, hashLearnerPin, registerLearner } from "./learnerRegistry";

// In-memory registry: `create` mimics the store's insert-or-noop uniqueness (R1).
function fakeStore(): LearnerStorePort & { rows: Map<string, Learner> } {
  const rows = new Map<string, Learner>();
  return {
    rows,
    async create(input) {
      if (rows.has(input.learnerRef)) return { created: false };
      rows.set(input.learnerRef, {
        learnerRef: input.learnerRef,
        displayName: input.displayName,
        pinHash: input.pinHash,
        createdAt: new Date().toISOString()
      });
      return { created: true };
    },
    async get(learnerRef) {
      return rows.get(learnerRef);
    },
    async list() {
      return [...rows.values()];
    }
  };
}

test("registerLearner creates a learner; a duplicate ref is name_taken (AE1)", async () => {
  const learnerStore = fakeStore();
  const first = await registerLearner({ learnerRef: "Alex", displayName: "Alex", pin: "1234" }, { learnerStore });
  assert.equal(first.registered, true);
  const second = await registerLearner({ learnerRef: "Alex", displayName: "Alex", pin: "9999" }, { learnerStore });
  assert.deepEqual(second, { registered: false, reason: "name_taken" });
  assert.equal(learnerStore.rows.size, 1, "the second registration never mints a second row");
});

test("registerLearner rejects a blank name and a non-numeric or too-short PIN", async () => {
  const learnerStore = fakeStore();
  assert.equal((await registerLearner({ learnerRef: "  ", displayName: "  ", pin: "1234" }, { learnerStore })).registered, false);
  assert.deepEqual(await registerLearner({ learnerRef: "Bo", displayName: "Bo", pin: "12" }, { learnerStore }), { registered: false, reason: "invalid_pin" });
  assert.deepEqual(await registerLearner({ learnerRef: "Bo", displayName: "Bo", pin: "abcd" }, { learnerStore }), { registered: false, reason: "invalid_pin" });
});

test("the PIN hash is salted per learner ref: identical PINs hash differently", () => {
  assert.notEqual(hashLearnerPin("Alex", "1234"), hashLearnerPin("Bo", "1234"));
  assert.equal(hashLearnerPin("Alex", "1234"), hashLearnerPin("Alex", "1234"));
});

test("enterLearnerSession returns the learner on the right PIN and refuses a wrong one (AE1)", async () => {
  const learnerStore = fakeStore();
  await registerLearner({ learnerRef: "Alex", displayName: "Alex", pin: "1234" }, { learnerStore });
  assert.equal((await enterLearnerSession({ learnerRef: "Alex", pin: "1234" }, { learnerStore })).entered, true);
  assert.deepEqual(await enterLearnerSession({ learnerRef: "Alex", pin: "0000" }, { learnerStore }), { entered: false, reason: "wrong_pin" });
  assert.deepEqual(await enterLearnerSession({ learnerRef: "Nobody", pin: "1234" }, { learnerStore }), { entered: false, reason: "not_found" });
});
