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

type Verdict = () => Promise<ClaimEntailmentJudgment> | ClaimEntailmentJudgment;

// Both port methods are stubbed; an unexpected call throws so a test that wires the
// wrong path fails loudly rather than silently passing.
function judgePort(opts: { judge?: Verdict; judgeDefinition?: Verdict }): ClaimEntailmentJudgmentPort {
  return {
    model: "fake-judge",
    judge: async () => (opts.judge ?? (() => { throw new Error("judge() not expected"); }))(),
    judgeDefinition: async () => (opts.judgeDefinition ?? (() => { throw new Error("judgeDefinition() not expected"); }))()
  };
}

function literalClaim(overrides: Partial<RunClaim> = {}): RunClaim {
  return runClaim({
    subjectCandidateKey: "ownership",
    predicate: "defined-as",
    object: { kind: "literal", value: "a set of rules that govern how a Rust program manages memory" },
    evidence: [{ blockId: "block-1", evidenceQuote: "Ownership is a set of rules that govern how a Rust program manages memory." }],
    ...overrides
  });
}

test("keeps a verified concept claim the judge entails", async () => {
  const judge = judgePort({ judge: () => ({ entailed: true, entailingSpan: "is part of", rationale: "membership stated" }) });
  const [result] = await applyEntailmentJudge({ claims: [runClaim()], declaredDomain: "software engineering", conceptsByKey, judge });
  assert.equal(result.validationOutcome, "verified");
  assert.deepEqual(result.boundaryReasonCodes, []);
});

test("downgrades a verified concept claim the judge does not entail", async () => {
  const judge = judgePort({ judge: () => ({ entailed: false, entailingSpan: "", rationale: "only co-mentioned" }) });
  const [result] = await applyEntailmentJudge({ claims: [runClaim()], declaredDomain: "software engineering", conceptsByKey, judge });
  assert.equal(result.validationOutcome, "rejected");
  assert.ok(result.boundaryReasonCodes.includes("evidence_does_not_entail_relation"));
});

test("never re-examines an already-rejected claim", async () => {
  let called = false;
  const judge = judgePort({ judge: () => { called = true; return { entailed: true, entailingSpan: "x", rationale: "" }; } });
  const rejected = runClaim({ validationOutcome: "rejected", boundaryReasonCodes: ["competing_structural_predicates"] });
  const [result] = await applyEntailmentJudge({ claims: [rejected], declaredDomain: "software engineering", conceptsByKey, judge });
  assert.equal(result.validationOutcome, "rejected");
  assert.equal(called, false);
});

test("keeps a verified literal definition the judge entails", async () => {
  const judge = judgePort({ judgeDefinition: () => ({ entailed: true, entailingSpan: "a set of rules", rationale: "defines the subject" }) });
  const [result] = await applyEntailmentJudge({ claims: [literalClaim()], declaredDomain: "software engineering", conceptsByKey, judge });
  assert.equal(result.validationOutcome, "verified");
  assert.deepEqual(result.boundaryReasonCodes, []);
});

test("downgrades a verified literal definition the judge does not entail", async () => {
  const judge = judgePort({ judgeDefinition: () => ({ entailed: false, entailingSpan: "", rationale: "evidence supports a different meaning" }) });
  const [result] = await applyEntailmentJudge({ claims: [literalClaim()], declaredDomain: "software engineering", conceptsByKey, judge });
  assert.equal(result.validationOutcome, "rejected");
  assert.ok(result.boundaryReasonCodes.includes("evidence_does_not_entail_definition"));
});

test("fails closed when the concept judge transport throws", async () => {
  const judge = judgePort({ judge: () => { throw new Error("boom"); } });
  const [result] = await applyEntailmentJudge({ claims: [runClaim()], declaredDomain: "software engineering", conceptsByKey, judge });
  assert.equal(result.validationOutcome, "rejected");
  assert.ok(result.boundaryReasonCodes.includes("entailment_judge_unavailable"));
});

test("fails closed when the definition judge transport throws", async () => {
  const judge = judgePort({ judgeDefinition: () => { throw new Error("boom"); } });
  const [result] = await applyEntailmentJudge({ claims: [literalClaim()], declaredDomain: "software engineering", conceptsByKey, judge });
  assert.equal(result.validationOutcome, "rejected");
  assert.ok(result.boundaryReasonCodes.includes("entailment_judge_unavailable"));
});

test("fails closed when the subject label is missing", async () => {
  const judge = judgePort({ judgeDefinition: () => ({ entailed: true, entailingSpan: "a set of rules", rationale: "" }) });
  const orphan = literalClaim({ subjectCandidateKey: "not-admitted" });
  const [result] = await applyEntailmentJudge({ claims: [orphan], declaredDomain: "software engineering", conceptsByKey, judge });
  assert.equal(result.validationOutcome, "rejected");
  assert.ok(result.boundaryReasonCodes.includes("entailment_judge_missing_endpoint_labels"));
});
