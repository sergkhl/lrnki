import assert from "node:assert/strict";
import test from "node:test";
import { evidenceQuoteMatches, type AdmissionProposal, type DiscoveredCandidate } from "@lrnki/domain-core";
import { applyAdmissionPolicy } from "./applyAdmissionPolicy";

const candidate: DiscoveredCandidate = {
  candidateKey: "move",
  canonicalLabel: "Move",
  aliases: [],
  mentions: [{ blockId: "block-1", evidenceQuote: "Ownership is a set of rules." }]
};

const blockText = new Map([
  ["block-1", "Ownership is a set of rules. Assigning a value to another variable moves it."],
  ["block-2", "After a move, the first variable is no longer valid."]
]);

function eligibleProposal(overrides: Partial<AdmissionProposal> = {}): AdmissionProposal {
  return {
    candidateKey: "move",
    proposedCanonicalLabel: "Rust move semantics",
    tier: "core",
    standaloneLearningObjective: {
      passed: true,
      rationale: "The source teaches move behavior as a distinct rule.",
      evidence: [{ blockId: "block-1", evidenceQuote: "Assigning a value to another variable moves it." }]
    },
    establishedDomainMeaning: {
      passed: true,
      rationale: "Move has a specific meaning in Rust ownership.",
      evidence: [{ blockId: "block-2", evidenceQuote: "After a move, the first variable is no longer valid." }]
    },
    organizingPower: {
      passed: true,
      rationale: "It explains transfer and invalidation.",
      aspects: [
        {
          summary: "Ownership transfer",
          nature: "mechanism",
          evidence: { blockId: "block-1", evidenceQuote: "Assigning a value to another variable moves it." }
        },
        {
          summary: "Source invalidation",
          nature: "constraint",
          evidence: { blockId: "block-2", evidenceQuote: "After a move, the first variable is no longer valid." }
        }
      ]
    },
    coreSelected: true,
    selectionReasonCode: "source_level_core",
    reasonCodes: ["standalone_objective"],
    confidence: 0.9,
    ...overrides
  };
}

test("admits core only with all verified eligibility criteria", () => {
  const result = applyAdmissionPolicy({ candidate, proposal: eligibleProposal(), blockText });

  assert.equal(result.admission.tier, "core");
  assert.equal(result.canonicalLabel, "Rust move semantics");
  assert.deepEqual(result.aliases, ["Move"]);
  assert.equal(result.admission.organizingPower.aspects.length, 2);
});

test("corrects model core to optional when organizing power lacks two distinct evidence references", () => {
  const proposal = eligibleProposal({
    organizingPower: {
      passed: true,
      rationale: "Duplicated aspect.",
      aspects: [
        {
          summary: "Ownership transfer",
          nature: "mechanism",
          evidence: { blockId: "block-1", evidenceQuote: "Assigning a value to another variable moves it." }
        },
        {
          summary: "Ownership transfer",
          nature: "mechanism",
          evidence: { blockId: "block-1", evidenceQuote: "Assigning a value to another variable moves it." }
        }
      ]
    }
  });
  const result = applyAdmissionPolicy({ candidate, proposal, blockText });

  assert.equal(result.admission.tier, "optional");
  assert.equal(result.canonicalLabel, "Move");
  assert.equal(result.admission.organizingPower.passed, false);
  assert.ok(result.admission.boundaryReasonCodes.includes("effective_tier_corrected"));
});

test("promotes an eligible model-optional proposal because criteria are authoritative", () => {
  const result = applyAdmissionPolicy({
    candidate,
    proposal: eligibleProposal({ tier: "optional" }),
    blockText
  });

  assert.equal(result.admission.modelTier, "optional");
  assert.equal(result.admission.tier, "core");
  assert.ok(result.admission.boundaryReasonCodes.includes("effective_tier_corrected"));
});

test("preserves quarantine even when all criteria pass", () => {
  const result = applyAdmissionPolicy({
    candidate,
    proposal: eligibleProposal({ tier: "quarantine" }),
    blockText
  });

  assert.equal(result.admission.tier, "quarantine");
});

test("keeps an individually eligible but source-level-demoted candidate optional", () => {
  const result = applyAdmissionPolicy({
    candidate,
    proposal: eligibleProposal({
      coreSelected: false,
      selectionReasonCode: "supporting_mechanism"
    }),
    blockText
  });

  assert.equal(result.admission.tier, "optional");
  assert.equal(result.admission.selectionReasonCode, "supporting_mechanism");
});

test("demotes a selected candidate whose organizing evidence is confined to illustrative blocks", () => {
  const result = applyAdmissionPolicy({
    candidate,
    proposal: eligibleProposal(),
    blockText,
    illustrativeBlockIds: new Set(["block-1", "block-2"])
  });

  assert.equal(result.admission.tier, "optional");
  assert.ok(result.admission.boundaryReasonCodes.includes("illustrative_only_source_treatment"));
});

test("demotes a proposition-shaped canonical label to optional fail-closed", () => {
  const result = applyAdmissionPolicy({
    candidate,
    proposal: eligibleProposal({ proposedCanonicalLabel: "Division of Labour Limited by the Extent of the Market" }),
    blockText
  });

  assert.equal(result.admission.tier, "optional");
  assert.ok(result.admission.boundaryReasonCodes.includes("proposition_shaped_label"));
  assert.ok(result.admission.boundaryReasonCodes.includes("effective_tier_corrected"));
});

test("keeps a multi-word nominal label core (no false proposition demotion)", () => {
  const result = applyAdmissionPolicy({
    candidate,
    proposal: eligibleProposal({ proposedCanonicalLabel: "Division of Labour" }),
    blockText
  });

  assert.equal(result.admission.tier, "core");
  assert.ok(!result.admission.boundaryReasonCodes.includes("proposition_shaped_label"));
});

test("does not count motivation or examples as organizing aspects", () => {
  const proposal = eligibleProposal();
  proposal.organizingPower.aspects[1] = {
    summary: "Avoids tedious ownership passing",
    nature: "motivation-or-example",
    evidence: { blockId: "block-2", evidenceQuote: "After a move, the first variable is no longer valid." }
  };

  const result = applyAdmissionPolicy({ candidate, proposal, blockText });

  assert.equal(result.admission.organizingPower.passed, false);
  assert.equal(result.admission.tier, "optional");
});

test("fails a missing decision closed to reject", () => {
  const result = applyAdmissionPolicy({ candidate, blockText });

  assert.equal(result.admission.tier, "reject");
  assert.ok(result.admission.boundaryReasonCodes.includes("no_admission_decision"));
});

test("evidence verification tolerates parser-only punctuation and isotope spacing", () => {
  const block = "There were three models suggested ( Figure 14.12 ): conservative, semi-conservative, and dispersive . DNA grown in 15 N is called “heavy.”";

  assert.equal(
    evidenceQuoteMatches(block, "There were three models suggested (Figure 14.12): conservative, semi-conservative, and dispersive."),
    true
  );
  assert.equal(evidenceQuoteMatches(block, "DNA grown in 15N is called 'heavy.'"), true);
  assert.equal(evidenceQuoteMatches(block, "DNA grown in 15N ... heavy."), false);
});
