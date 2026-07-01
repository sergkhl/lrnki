import assert from "node:assert/strict";
import test from "node:test";
import { parseGenerateStudyItemsArgs } from "./workerArgs";

test("generate-study-items passes no concurrency override by default", () => {
  assert.deepEqual(parseGenerateStudyItemsArgs("enr-1", []), { enrichmentId: "enr-1" });
});

test("generate-study-items accepts a positive integer concurrency override", () => {
  assert.deepEqual(parseGenerateStudyItemsArgs("enr-1", ["--concurrency", "3"]), {
    enrichmentId: "enr-1",
    concurrency: 3
  });
  assert.deepEqual(parseGenerateStudyItemsArgs("enr-1", ["--concurrency=2"]), {
    enrichmentId: "enr-1",
    concurrency: 2
  });
});

test("generate-study-items rejects invalid concurrency before generation", () => {
  for (const flags of [
    ["--concurrency", "0"],
    ["--concurrency", "-1"],
    ["--concurrency", "1.5"],
    ["--concurrency", "many"],
    ["--concurrency"]
  ]) {
    assert.throws(() => parseGenerateStudyItemsArgs("enr-1", flags), /positive integer/);
  }
});

test("generate-study-items rejects missing id, unknown flags, and duplicate concurrency", () => {
  assert.throws(() => parseGenerateStudyItemsArgs(undefined, []), /requires <enrichmentId>/);
  assert.throws(() => parseGenerateStudyItemsArgs("enr-1", ["--bogus"]), /unknown/);
  assert.throws(
    () => parseGenerateStudyItemsArgs("enr-1", ["--concurrency", "2", "--concurrency=3"]),
    /provided more than once/
  );
});
