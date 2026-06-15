import assert from "node:assert/strict";
import test from "node:test";
import type { ExtractedClaim } from "@lrnki/domain-core";
import { applyClaimPolicy } from "./applyClaimPolicy";

const blockText = new Map([
  ["block-1", "Move semantics is part of the Rust ownership system."],
  ["block-2", "Temporal signals support prerequisite inference."]
]);
const coreCandidateKeys = new Set(["move", "ownership"]);

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
  const [result] = applyClaimPolicy({ claims: [claim()], coreCandidateKeys, blockText });
  assert.equal(result.validationOutcome, "verified");
  assert.deepEqual(result.boundaryReasonCodes, []);
});

test("rejects a reversed relation direction without correcting it", () => {
  const [result] = applyClaimPolicy({
    claims: [claim({ predicate: "uses", evidenceLinkNature: "mechanism-employment", evidenceDirection: "object-uses-subject" })],
    coreCandidateKeys,
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
    blockText
  });
  assert.equal(results.every((result) => result.validationOutcome === "rejected"), true);
  assert.equal(results.every((result) => result.boundaryReasonCodes.includes("reciprocal_asymmetric_relation")), true);
});

// NOTE: semantic entailment is no longer decided here for EITHER claim shape
// (ADR-0007). The former `evidence_does_not_name_both_endpoints` /
// `evidence_does_not_lexically_entail_relation` (concept) and
// `evidence_does_not_lexically_entail_definition` (literal) vetoes were hardcoded
// surface matchers that produced false negatives on ordinary prose (AGENTS rule
// 16); the semantic judge now decides entailment as a composed stage. The
// deterministic layer marks a structurally-valid claim "verified" PENDING that
// judge — see applyEntailmentJudge.test.ts for the entailment cases.

test("marks a structurally-valid concept claim verified pending the entailment judge", () => {
  // Object label deliberately absent from the quote: the deterministic layer no
  // longer vetoes on surface co-mention — that is the judge's job downstream.
  const [result] = applyClaimPolicy({
    claims: [claim({ evidence: [{ blockId: "block-1", evidenceQuote: "Move semantics is part of the Rust ownership system." }] })],
    coreCandidateKeys,
    blockText
  });
  assert.equal(result.validationOutcome, "verified");
  assert.deepEqual(result.boundaryReasonCodes, []);
});

test("marks a PARAPHRASED literal definition verified pending the entailment judge", () => {
  // Regression for the residual lexical definition gate (run e9052daf). The literal
  // is a faithful paraphrase, NOT a verbatim substring of the appositive evidence;
  // the old `evidence_does_not_lexically_entail_definition` gate wrongly rejected it.
  // The deterministic layer now only requires verbatim evidence + correct
  // nature/direction; the semantic judge decides definition entailment downstream.
  const quote = "Due to finite sample effects, the validation score is not perfectly predictive of performance on the test set—a discrepancy known as the generalization gap.";
  const [result] = applyClaimPolicy({
    claims: [claim({
      subjectCandidateKey: "ownership",
      predicate: "defined-as",
      object: { kind: "literal", value: "the discrepancy between validation score and test set performance due to finite sample effects" },
      evidenceLinkNature: "definitional",
      evidenceDirection: "subject-defined-by-literal",
      evidence: [{ blockId: "block-5", evidenceQuote: quote }]
    })],
    coreCandidateKeys: new Set(["ownership"]),
    blockText: new Map([["block-5", quote]])
  });
  assert.equal(result.validationOutcome, "verified");
  assert.deepEqual(result.boundaryReasonCodes, []);
});

test("rejects a literal definition whose evidence does not verify verbatim", () => {
  // The verbatim-evidence floor stays deterministic and provable (ADR-0007): a quote
  // that is not a substring of the cited block is dropped, leaving no evidence.
  const [result] = applyClaimPolicy({
    claims: [claim({
      subjectCandidateKey: "ownership",
      predicate: "defined-as",
      object: { kind: "literal", value: "a set of rules" },
      evidenceLinkNature: "definitional",
      evidenceDirection: "subject-defined-by-literal",
      evidence: [{ blockId: "block-1", evidenceQuote: "text that is absent from the cited block" }]
    })],
    coreCandidateKeys: new Set(["ownership"]),
    blockText
  });
  assert.equal(result.validationOutcome, "rejected");
  assert.ok(result.boundaryReasonCodes.includes("no_verifiable_evidence"));
});

test("rejects a literal definition with a mismatched self-reported link nature", () => {
  const quote = "Ownership is a set of rules that govern how a Rust program manages memory.";
  const [result] = applyClaimPolicy({
    claims: [claim({
      subjectCandidateKey: "ownership",
      predicate: "defined-as",
      object: { kind: "literal", value: "a set of rules that govern how a Rust program manages memory" },
      evidenceLinkNature: "causal-or-motivational",
      evidenceDirection: "subject-defined-by-literal",
      evidence: [{ blockId: "block-6", evidenceQuote: quote }]
    })],
    coreCandidateKeys: new Set(["ownership"]),
    blockText: new Map([["block-6", quote]])
  });
  assert.equal(result.validationOutcome, "rejected");
  assert.ok(result.boundaryReasonCodes.includes("causal_or_motivational_link"));
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
    blockText: new Map([["block-4", quote]])
  });
  assert.equal(result.validationOutcome, "verified");
});
