import assert from "node:assert/strict";
import { test } from "node:test";
import { getStudySession } from "./studySession";

// The study projection's pure logic now lives in @lrnki/application
// (studySessionProjection.test.ts / getStudySession.test.ts). This shell carries only the
// DATABASE_URL-absent fallback and the adapter wiring; real-DB behavior is covered by the
// real-use parity run. Real DB errors propagate (no catch), matching the inspection shells.
test("getStudySession returns undefined when DATABASE_URL is unset (fallback preserved)", async () => {
  const prior = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    assert.equal(await getStudySession("e", "n", "L1"), undefined);
  } finally {
    if (prior !== undefined) process.env.DATABASE_URL = prior;
  }
});
