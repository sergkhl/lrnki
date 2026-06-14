import assert from "node:assert/strict";
import test from "node:test";
import type { ExtractedClaim } from "@lrnki/domain-core";
import { applyClaimPolicy } from "./applyClaimPolicy";

const blockText = new Map([
  ["block-1", "Move semantics is part of the Rust ownership system."],
  ["block-2", "Temporal signals support prerequisite inference."]
]);
const coreCandidateKeys = new Set(["move", "ownership"]);
const labelsByCandidateKey = new Map([
  ["move", ["Move semantics", "Rust move semantics"]],
  ["ownership", ["Rust ownership system", "Ownership"]]
]);

function claim(overrides: Partial<ExtractedClaim> = {}): ExtractedClaim {
  return {
    subjectCandidateKey: "move",
    predicate: "part-of",
    object: { kind: "concept", candidateKey: "ownership" },
    evidenceLinkNature: "structural",
    evidenceDirection: "subject-is-part-of-object",
    evidence: [{ blockId: "block-1", evidenceQuote: "Move semantics is part of the Rust ownership system." }],
    confidence: 0.9,
    ...overrides
  };
}

test("verifies a claim only when predicate, link nature, direction, and evidence agree", () => {
  const [result] = applyClaimPolicy({ claims: [claim()], coreCandidateKeys, labelsByCandidateKey, blockText });
  assert.equal(result.validationOutcome, "verified");
  assert.deepEqual(result.boundaryReasonCodes, []);
});

test("rejects a reversed relation direction without correcting it", () => {
  const [result] = applyClaimPolicy({
    claims: [claim({ predicate: "uses", evidenceLinkNature: "mechanism-employment", evidenceDirection: "object-uses-subject" })],
    coreCandidateKeys,
    labelsByCandidateKey,
    blockText
  });
  assert.equal(result.validationOutcome, "rejected");
  assert.ok(result.boundaryReasonCodes.includes("predicate_direction_mismatch"));
});

test("rejects competing is-a, part-of, and uses predicates for one directed pair", () => {
  const results = applyClaimPolicy({
    claims: [
      claim(),
      claim({ predicate: "is-a", evidenceLinkNature: "taxonomic", evidenceDirection: "subject-is-kind-of-object" }),
      claim({ predicate: "uses", evidenceLinkNature: "mechanism-employment", evidenceDirection: "subject-uses-object" })
    ],
    coreCandidateKeys,
    labelsByCandidateKey,
    blockText
  });
  assert.equal(results.every((result) => result.validationOutcome === "rejected"), true);
  assert.equal(results.every((result) => result.boundaryReasonCodes.includes("competing_structural_predicates")), true);
});

test("rejects reciprocal asymmetric claims in both directions", () => {
  const results = applyClaimPolicy({
    claims: [
      claim(),
      claim({ subjectCandidateKey: "ownership", object: { kind: "concept", candidateKey: "move" } })
    ],
    coreCandidateKeys,
    labelsByCandidateKey,
    blockText
  });
  assert.equal(results.every((result) => result.validationOutcome === "rejected"), true);
  assert.equal(results.every((result) => result.boundaryReasonCodes.includes("reciprocal_asymmetric_relation")), true);
});

// NOTE: concept-to-concept entailment is no longer decided here (ADR-0020). The
// former `evidence_does_not_name_both_endpoints` and
// `evidence_does_not_lexically_entail_relation` vetoes were hardcoded surface
// matchers that produced false negatives on ordinary prose (AGENTS rule 16); the
// semantic judge now decides entailment as a composed stage. The deterministic
// layer marks a structurally-valid concept claim "verified" PENDING that judge —
// see applyEntailmentJudge.test.ts for the entailment cases that used to live here.

test("marks a structurally-valid concept claim verified pending the entailment judge", () => {
  // Object label deliberately absent from the quote: the deterministic layer no
  // longer vetoes on surface co-mention — that is the judge's job downstream.
  const [result] = applyClaimPolicy({
    claims: [claim({ evidence: [{ blockId: "block-1", evidenceQuote: "Move semantics is part of the Rust ownership system." }] })],
    coreCandidateKeys,
    labelsByCandidateKey: new Map([
      ["move", ["Move semantics"]],
      ["ownership", ["Memory safety"]]
    ]),
    blockText
  });
  assert.equal(result.validationOutcome, "verified");
  assert.deepEqual(result.boundaryReasonCodes, []);
});

test("accepts an explicit literal definition", () => {
  const definitionBlockText = new Map([["block-3", "Ownership is a set of rules that govern how a Rust program manages memory."]]);
  const [result] = applyClaimPolicy({
    claims: [claim({
      subjectCandidateKey: "ownership",
      predicate: "defined-as",
      object: { kind: "literal", value: "a set of rules that govern how a Rust program manages memory" },
      evidenceLinkNature: "definitional",
      evidenceDirection: "subject-defined-by-literal",
      evidence: [{ blockId: "block-3", evidenceQuote: "Ownership is a set of rules that govern how a Rust program manages memory." }]
    })],
    coreCandidateKeys,
    labelsByCandidateKey,
    blockText: definitionBlockText
  });
  assert.equal(result.validationOutcome, "verified");
});

test("rejects a causal-origin statement miscast as a literal definition", () => {
  const quote = "The greatest improvements in the productive powers of labour, and the greater part of the skill, dexterity, and judgment, with which it is anywhere directed, or applied, seem to have been the effects of the division of labour.";
  const [result] = applyClaimPolicy({
    claims: [claim({
      subjectCandidateKey: "ownership",
      predicate: "defined-as",
      object: { kind: "literal", value: "the effects of the division of labour" },
      evidenceLinkNature: "definitional",
      evidenceDirection: "subject-defined-by-literal",
      evidence: [{ blockId: "block-4", evidenceQuote: quote }]
    })],
    coreCandidateKeys: new Set(["ownership"]),
    labelsByCandidateKey: new Map([["ownership", ["productive powers of labour"]]]),
    blockText: new Map([["block-4", quote]])
  });
  assert.equal(result.validationOutcome, "rejected");
  assert.ok(result.boundaryReasonCodes.includes("evidence_does_not_lexically_entail_definition"));
});

test("accepts explicit INSTRUCTKG evidence using the active leveraging inflection", () => {
  const quote = "INSTRUCTKG works by leveraging temporal signals to infer learning dependencies.";
  const [result] = applyClaimPolicy({
    claims: [claim({
      subjectCandidateKey: "instructkg",
      predicate: "uses",
      object: { kind: "concept", candidateKey: "temporal" },
      evidenceLinkNature: "mechanism-employment",
      evidenceDirection: "subject-uses-object",
      evidence: [{ blockId: "block-4", evidenceQuote: quote }]
    })],
    coreCandidateKeys: new Set(["instructkg", "temporal"]),
    labelsByCandidateKey: new Map([
      ["instructkg", ["Instructor-Aligned Knowledge Graphs", "INSTRUCTKG"]],
      ["temporal", ["Temporal Signals", "temporal signals"]]
    ]),
    blockText: new Map([["block-4", quote]])
  });
  assert.equal(result.validationOutcome, "verified");
});
