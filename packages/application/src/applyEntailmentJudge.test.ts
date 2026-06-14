import assert from "node:assert/strict";
import test from "node:test";
import type { ClaimEntailmentJudgment, RunClaim } from "@lrnki/domain-core";
import type { ClaimEntailmentJudgmentPort } from "@lrnki/ports";
import { applyEntailmentJudge } from "./applyEntailmentJudge";

const conceptsByKey = new Map([
  ["move", { canonicalLabel: "Rust move semantics", aliases: ["Move semantics"] }],
  ["ownership", { canonicalLabel: "Rust ownership system", aliases: ["Ownership"] }]
]);

function runClaim(overrides: Partial<RunClaim> = {}): RunClaim {
  return {
    subjectCandidateKey: "move",
    predicate: "part-of",
    object: { kind: "concept", candidateKey: "ownership" },
    evidence: [{ blockId: "block-1", evidenceQuote: "Move semantics is part of the Rust ownership system." }],
    modelConfidence: 0.9,
    evidenceCount: 1,
    validationOutcome: "verified",
    boundaryReasonCodes: [],
    extractionAttempt: 1,
    ...overrides
  };
}

function judgePort(fn: () => Promise<ClaimEntailmentJudgment> | ClaimEntailmentJudgment): ClaimEntailmentJudgmentPort {
  return { model: "fake-judge", judge: async () => fn() };
}

test("keeps a verified concept claim the judge entails", async () => {
  const judge = judgePort(() => ({ entailed: true, entailingSpan: "is part of", rationale: "membership stated" }));
  const [result] = await applyEntailmentJudge({ claims: [runClaim()], declaredDomain: "software engineering", conceptsByKey, judge });
  assert.equal(result.validationOutcome, "verified");
  assert.deepEqual(result.boundaryReasonCodes, []);
});

test("downgrades a verified concept claim the judge does not entail", async () => {
  const judge = judgePort(() => ({ entailed: false, entailingSpan: "", rationale: "only co-mentioned" }));
  const [result] = await applyEntailmentJudge({ claims: [runClaim()], declaredDomain: "software engineering", conceptsByKey, judge });
  assert.equal(result.validationOutcome, "rejected");
  assert.ok(result.boundaryReasonCodes.includes("evidence_does_not_entail_relation"));
});

test("never re-examines an already-rejected claim", async () => {
  let called = false;
  const judge = judgePort(() => { called = true; return { entailed: true, entailingSpan: "x", rationale: "" } as ClaimEntailmentJudgment; });
  const rejected = runClaim({ validationOutcome: "rejected", boundaryReasonCodes: ["competing_structural_predicates"] });
  const [result] = await applyEntailmentJudge({ claims: [rejected], declaredDomain: "software engineering", conceptsByKey, judge });
  assert.equal(result.validationOutcome, "rejected");
  assert.equal(called, false);
});

test("does not judge literal defined-as claims", async () => {
  let called = false;
  const judge = judgePort(() => { called = true; return { entailed: false, entailingSpan: "", rationale: "" }; });
  const literal = runClaim({ predicate: "defined-as", object: { kind: "literal", value: "a set of rules" } });
  const [result] = await applyEntailmentJudge({ claims: [literal], declaredDomain: "software engineering", conceptsByKey, judge });
  assert.equal(result.validationOutcome, "verified");
  assert.equal(called, false);
});

test("fails closed when the judge transport throws", async () => {
  const judge: ClaimEntailmentJudgmentPort = { model: "fake", judge: async () => { throw new Error("boom"); } };
  const [result] = await applyEntailmentJudge({ claims: [runClaim()], declaredDomain: "software engineering", conceptsByKey, judge });
  assert.equal(result.validationOutcome, "rejected");
  assert.ok(result.boundaryReasonCodes.includes("entailment_judge_unavailable"));
});
