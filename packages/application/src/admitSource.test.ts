import assert from "node:assert/strict";
import test from "node:test";
import type { AdmissionProposal, DiscoveredCandidate } from "@lrnki/domain-core";
import type { AdmissionLabelJudgmentPort } from "@lrnki/ports";
import { admitSource } from "./admitSource";

// admitSource owns the whole-source admission decision. These tests exercise its
// interface directly — the fail-closed cross-atom invariants no longer require the
// full six-port extraction orchestrator (they were previously only reachable through
// executeExtractionRun).

const block = "The stack and the heap are two regions of memory. The stack stores values in order; the heap stores data of unknown size.";
const blockText = new Map([["block-1", block]]);

const conflated: DiscoveredCandidate = {
  candidateKey: "stack_heap",
  canonicalLabel: "The stack and the heap",
  mentions: [{ blockId: "block-1", evidenceQuote: "The stack and the heap are two regions of memory." }]
};

// Calls every label a concept, so candidates keep their deterministic tier and these
// tests isolate the cross-atom + per-atom behaviour. Proposition demotion is covered
// in applyAdmissionLabelJudge.test.ts.
const everythingIsAConcept: AdmissionLabelJudgmentPort = {
  model: "test-admission-judge",
  judge: async () => ({ labelKind: "concept", underlyingNounPhrase: "", groundingSpan: "", rationale: "test" })
};

function atom(atomicKey: string, label: string, defQuote: string, overrides: Partial<AdmissionProposal> = {}): AdmissionProposal {
  return {
    atomicKey,
    parentCandidateKey: "stack_heap",
    proposedCanonicalLabel: label,
    tier: "core",
    sourceRole: "declared_domain_concept",
    standaloneLearningObjective: { passed: true, rationale: "standalone", evidence: [{ blockId: "block-1", evidenceQuote: defQuote }] },
    establishedDomainMeaning: { passed: true, rationale: "established", evidence: [{ blockId: "block-1", evidenceQuote: defQuote }] },
    definitionBearingTreatment: { passed: true, rationale: "definition-bearing", evidence: [{ blockId: "block-1", evidenceQuote: defQuote }] },
    organizingPower: {
      passed: true,
      rationale: "organizes",
      aspects: [
        { summary: "memory region", nature: "definition-or-property", evidence: { blockId: "block-1", evidenceQuote: "The stack and the heap are two regions of memory." } },
        { summary: "storage behavior", nature: "mechanism", evidence: { blockId: "block-1", evidenceQuote: defQuote } }
      ]
    },
    coreSelected: true,
    selectionReasonCode: "source_level_core",
    reasonCodes: ["source_level_core"],
    confidence: 0.9,
    ...overrides
  };
}

function admit(admissionProposals: AdmissionProposal[], discovered: DiscoveredCandidate[] = [conflated]) {
  return admitSource({ discovered, admissionProposals, blockText, declaredDomain: "rust", labelJudge: everythingIsAConcept });
}

test("splits one conflated candidate into independently-tiered atomic concepts retaining the parent key", async () => {
  const candidates = await admit([
    atom("stack_heap__stack", "The stack", "The stack stores values in order"),
    atom("stack_heap__heap", "The heap", "the heap stores data of unknown size", { coreSelected: false, selectionReasonCode: "supporting_mechanism", tier: "optional" })
  ]);
  const core = candidates.filter((candidate) => candidate.admission.tier === "core");
  const optional = candidates.filter((candidate) => candidate.admission.tier === "optional");
  assert.equal(core.length, 1);
  assert.equal(core[0].candidateKey, "stack_heap__stack");
  assert.equal(core[0].canonicalLabel, "The stack");
  assert.equal(core[0].parentCandidateKey, "stack_heap");
  assert.equal(optional[0].candidateKey, "stack_heap__heap");
  assert.equal(optional[0].parentCandidateKey, "stack_heap");
});

test("drops duplicate atomic keys fail-closed so neither publishes a core concept", async () => {
  const candidates = await admit([
    atom("dup", "The stack", "The stack stores values in order"),
    atom("dup", "The heap", "the heap stores data of unknown size")
  ]);
  assert.equal(candidates.filter((candidate) => candidate.admission.tier === "core").length, 0);
  assert.ok(candidates.every((candidate) => candidate.candidateKey !== "dup"));
});

test("drops an atom whose parent candidate is unknown", async () => {
  const orphan: AdmissionProposal = { ...atom("orphan", "The stack", "The stack stores values in order"), parentCandidateKey: "does-not-exist" };
  const candidates = await admit([atom("stack_heap__stack", "The stack", "The stack stores values in order"), orphan]);
  assert.equal(candidates.some((candidate) => candidate.candidateKey === "orphan"), false);
  assert.equal(candidates.filter((candidate) => candidate.admission.tier === "core").length, 1);
});

test("a discovered candidate with no surviving proposal becomes a rejected RunCandidate", async () => {
  const candidates = await admit([]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].candidateKey, "stack_heap");
  assert.equal(candidates[0].admission.tier, "reject");
  assert.ok(candidates[0].admission.boundaryReasonCodes.includes("no_admission_decision"));
});
