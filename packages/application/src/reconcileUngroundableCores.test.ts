import assert from "node:assert/strict";
import test from "node:test";
import { CORE_DEMOTED_UNGROUNDABLE_REASON, type AdmissionProposal, type DiscoveredCandidate, type RunCandidate, type RunEvidenceProfile } from "@lrnki/domain-core";
import { applyAdmissionPolicy } from "./applyAdmissionPolicy";
import { reconcileUngroundableCores } from "./reconcileUngroundableCores";

// Pure post-CEP reconciliation: a core whose CEP is incomplete is demoted to optional.
// Candidates are minted through applyAdmissionPolicy so the admission object is a real
// one rather than a hand-built stub.

const quote = "The stack stores values in order and has a known fixed size at compile time.";
const blockText = new Map([["block-1", quote]]);

const discovered: DiscoveredCandidate = {
  candidateKey: "stack",
  canonicalLabel: "The stack",
  mentions: [{ blockId: "block-1", evidenceQuote: "The stack" }]
};

const coreProposal: AdmissionProposal = {
  atomicKey: "stack",
  parentCandidateKey: "stack",
  proposedCanonicalLabel: "The stack",
  tier: "core",
  sourceRole: "declared_domain_concept",
  standaloneLearningObjective: { passed: true, rationale: "standalone", evidence: [{ blockId: "block-1", evidenceQuote: quote }] },
  establishedDomainMeaning: { passed: true, rationale: "established", evidence: [{ blockId: "block-1", evidenceQuote: quote }] },
  definitionBearingTreatment: { passed: true, rationale: "definition-bearing", evidence: [{ blockId: "block-1", evidenceQuote: quote }] },
  organizingPower: {
    passed: true,
    rationale: "organizes",
    aspects: [
      { summary: "ordering", nature: "mechanism", evidence: { blockId: "block-1", evidenceQuote: "The stack stores values in order" } },
      { summary: "fixed size", nature: "definition-or-property", evidence: { blockId: "block-1", evidenceQuote: "known fixed size at compile time" } }
    ]
  },
  coreSelected: true,
  selectionReasonCode: "source_level_core",
  reasonCodes: ["source_level_core"],
  confidence: 0.9
};

function coreCandidate(): RunCandidate {
  const candidate = applyAdmissionPolicy({ parentCandidate: discovered, proposal: coreProposal, blockText });
  assert.equal(candidate.admission.tier, "core"); // guard: fixture must mint a core
  return candidate;
}

function profile(complete: boolean): RunEvidenceProfile {
  return { candidateKey: "stack", tier: "core", definitions: [], mentions: [], assertions: [], complete };
}

test("demotes a core with an incomplete CEP to optional and tags the reason, immutably", async () => {
  const candidates = [coreCandidate()];
  const profiles = [profile(false)];
  const result = reconcileUngroundableCores({ candidates, evidenceProfiles: profiles, coreKeys: new Set(["stack"]) });

  assert.equal(result.demotedCoreCount, 1);
  assert.equal(result.candidates[0].admission.tier, "optional");
  assert.equal(result.candidates[0].admission.modelTier, "core");
  assert.ok(result.candidates[0].admission.boundaryReasonCodes.includes(CORE_DEMOTED_UNGROUNDABLE_REASON));
  assert.equal(result.evidenceProfiles[0].tier, "optional");

  // Inputs are not mutated.
  assert.equal(candidates[0].admission.tier, "core");
  assert.equal(profiles[0].tier, "core");
  assert.ok(!candidates[0].admission.boundaryReasonCodes.includes(CORE_DEMOTED_UNGROUNDABLE_REASON));
});

test("keeps a core with a complete CEP and returns the same array references", async () => {
  const candidates = [coreCandidate()];
  const profiles = [profile(true)];
  const result = reconcileUngroundableCores({ candidates, evidenceProfiles: profiles, coreKeys: new Set(["stack"]) });

  assert.equal(result.demotedCoreCount, 0);
  assert.equal(result.candidates[0].admission.tier, "core");
  // No demotion: untouched arrays are returned by reference.
  assert.equal(result.candidates, candidates);
  assert.equal(result.evidenceProfiles, profiles);
});
