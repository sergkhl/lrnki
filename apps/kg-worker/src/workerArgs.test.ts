import assert from "node:assert/strict";
import test from "node:test";
import {
  parseBuildGraphVersionArgs,
  parseCanonicalizeConceptsArgs,
  parseGenerateStudyItemsArgs,
  parseInspectConceptCanonicalizationArgs
} from "./workerArgs";

test("canonicalize-concepts parses semantic/exact modes, base, and ordered run IDs", () => {
  assert.deepEqual(parseCanonicalizeConceptsArgs(["run-b", "run-a"]), {
    mode: "semantic",
    baseGraphVersionId: null,
    runIds: ["run-b", "run-a"]
  });
  assert.deepEqual(
    parseCanonicalizeConceptsArgs(["--exact-label-only", "--base", "gv-1", "run-b", "run-a"]),
    {
      mode: "exact_label_only",
      baseGraphVersionId: "gv-1",
      runIds: ["run-b", "run-a"]
    }
  );
});

test("canonicalize-concepts rejects missing/duplicate runs and malformed flags", () => {
  assert.throws(() => parseCanonicalizeConceptsArgs([]), /one or more explicit run IDs/);
  assert.throws(() => parseCanonicalizeConceptsArgs(["run-1", "run-1"]), /unique ordered/);
  assert.throws(() => parseCanonicalizeConceptsArgs(["--base"]), /requires a graphVersionId/);
  assert.throws(() => parseCanonicalizeConceptsArgs(["--unknown", "run-1"]), /unknown/);
});

test("build-graph-version requires one artifact and preserves ordered run selection", () => {
  assert.deepEqual(
    parseBuildGraphVersionArgs(["--canonicalization", "canon-1", "--base=gv-1", "run-b", "run-a"]),
    {
      canonicalizationArtifactId: "canon-1",
      baseGraphVersionId: "gv-1",
      runIds: ["run-b", "run-a"]
    }
  );
  assert.throws(() => parseBuildGraphVersionArgs(["run-1"]), /requires --canonicalization/);
  assert.throws(
    () => parseBuildGraphVersionArgs(["--canonicalization", "canon-1"]),
    /one or more explicit run IDs/
  );
  assert.throws(
    () => parseBuildGraphVersionArgs(["--canonicalization", "canon-1", "run-1", "run-1"]),
    /unique ordered/
  );
});

test("inspect-concept-canonicalization accepts one artifact and optional JSON", () => {
  assert.deepEqual(parseInspectConceptCanonicalizationArgs(["canon-1"]), {
    artifactId: "canon-1",
    json: false
  });
  assert.deepEqual(parseInspectConceptCanonicalizationArgs(["--json", "canon-1"]), {
    artifactId: "canon-1",
    json: true
  });
  assert.throws(() => parseInspectConceptCanonicalizationArgs([]), /requires <artifactId>/);
  assert.throws(
    () => parseInspectConceptCanonicalizationArgs(["canon-1", "canon-2"]),
    /exactly one/
  );
});

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
