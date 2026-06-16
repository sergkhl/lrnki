import assert from "node:assert/strict";
import test from "node:test";
import { evidenceQuoteMatches, type AdmissionProposal, type DiscoveredCandidate } from "@lrnki/domain-core";
import { applyAdmissionPolicy } from "./applyAdmissionPolicy";

const candidate: DiscoveredCandidate = {
  candidateKey: "move",
  canonicalLabel: "Move",
  mentions: [{ blockId: "block-1", evidenceQuote: "Ownership is a set of rules." }]
};

const blockText = new Map([
  ["block-1", "Ownership is a set of rules. Assigning a value to another variable moves it."],
  ["block-2", "After a move, the first variable is no longer valid."]
]);

function eligibleProposal(overrides: Partial<AdmissionProposal> = {}): AdmissionProposal {
  return {
    atomicKey: "move",
    parentCandidateKey: "move",
    proposedCanonicalLabel: "Rust move semantics",
    tier: "core",
    sourceRole: "declared_domain_concept",
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
    definitionBearingTreatment: {
      passed: true,
      rationale: "The source establishes the meaning of move.",
      evidence: [{ blockId: "block-1", evidenceQuote: "Assigning a value to another variable moves it." }]
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

test("does not accept unadjudicated discovery aliases", () => {
  const unsafeCandidate = {
    ...candidate,
    aliases: ["Move subset"]
  } as DiscoveredCandidate & { aliases: string[] };
  const result = applyAdmissionPolicy({ parentCandidate: unsafeCandidate, proposal: eligibleProposal(), blockText });

  assert.deepEqual(result.aliases, []);
});

test("admits core only with all verified eligibility criteria", () => {
  const result = applyAdmissionPolicy({ parentCandidate: candidate, proposal: eligibleProposal(), blockText });

  assert.equal(result.admission.tier, "core");
  assert.equal(result.canonicalLabel, "Move");
  assert.equal(result.candidateKey, "move");
  assert.equal(result.parentCandidateKey, "move");
  assert.deepEqual(result.aliases, []);
  assert.ok(result.admission.boundaryReasonCodes.includes("proposed_canonical_label_not_source_grounded"));
  assert.equal(result.admission.organizingPower.aspects.length, 2);
});

test("corrects core to optional when the definition-bearing passage does not verify verbatim (Rust String type / Heap allocation failure mode)", () => {
  // U1/R1: admission marked the criterion passed but its cited definition passage is
  // not in any block, so the boundary fails it closed and core is unreachable.
  const result = applyAdmissionPolicy({
    parentCandidate: candidate,
    proposal: eligibleProposal({
      definitionBearingTreatment: {
        passed: true,
        rationale: "Claims a definition the source does not actually contain.",
        evidence: [{ blockId: "block-1", evidenceQuote: "A String is a growable, heap-allocated UTF-8 buffer." }]
      }
    }),
    blockText
  });

  assert.equal(result.admission.tier, "optional");
  assert.equal(result.admission.definitionBearingTreatment.passed, false);
  assert.ok(result.admission.boundaryReasonCodes.includes("definition_bearing_treatment_missing_verified_evidence"));
  assert.ok(result.admission.boundaryReasonCodes.includes("effective_tier_corrected"));
});

test("does not admit core when the model omits definition-bearing treatment", () => {
  const result = applyAdmissionPolicy({
    parentCandidate: candidate,
    proposal: eligibleProposal({
      definitionBearingTreatment: { passed: false, rationale: "Source only mentions the concept.", evidence: [] }
    }),
    blockText
  });

  assert.equal(result.admission.tier, "optional");
  assert.equal(result.admission.definitionBearingTreatment.passed, false);
});

test("definition-bearing treatment does not change an optional/reject/quarantine tier (gates core only)", () => {
  const missingDefinition = { passed: false, rationale: "no definition", evidence: [] };
  for (const tier of ["optional", "reject", "quarantine"] as const) {
    const result = applyAdmissionPolicy({
      parentCandidate: candidate,
      proposal: eligibleProposal({ tier, coreSelected: false, definitionBearingTreatment: missingDefinition }),
      blockText
    });
    assert.equal(result.admission.tier, tier);
  }
});

test("a meaning-bearing definition passage with no copula still passes (no lexical whitelist)", () => {
  // U1 domain-neutrality: meaning established by mechanism, not 'X is Y'. The model
  // marks it passed and the quote verifies, so the criterion passes without any
  // copula/keyword check (AGENTS rule 16).
  const result = applyAdmissionPolicy({
    parentCandidate: candidate,
    proposal: eligibleProposal({
      definitionBearingTreatment: {
        passed: true,
        rationale: "Meaning established by describing the mechanism, no copula.",
        evidence: [{ blockId: "block-1", evidenceQuote: "Assigning a value to another variable moves it." }]
      }
    }),
    blockText
  });

  assert.equal(result.admission.tier, "core");
  assert.equal(result.admission.definitionBearingTreatment.passed, true);
});

test("accepts an admission canonical label that is explicitly source-grounded", () => {
  const groundedBlockText = new Map(blockText);
  groundedBlockText.set("block-3", "Rust move semantics transfers ownership and invalidates the source binding.");
  const result = applyAdmissionPolicy({ parentCandidate: candidate, proposal: eligibleProposal(), blockText: groundedBlockText });

  assert.equal(result.canonicalLabel, "Rust move semantics");
  assert.deepEqual(result.aliases, ["Move"]);
  assert.equal(result.admission.boundaryReasonCodes.includes("proposed_canonical_label_not_source_grounded"), false);
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
  const result = applyAdmissionPolicy({ parentCandidate: candidate, proposal, blockText });

  assert.equal(result.admission.tier, "optional");
  assert.equal(result.canonicalLabel, "Move");
  assert.equal(result.admission.organizingPower.passed, false);
  assert.ok(result.admission.boundaryReasonCodes.includes("effective_tier_corrected"));
});

test("promotes an eligible model-optional proposal because criteria are authoritative", () => {
  const result = applyAdmissionPolicy({
    parentCandidate: candidate,
    proposal: eligibleProposal({ tier: "optional" }),
    blockText
  });

  assert.equal(result.admission.modelTier, "optional");
  assert.equal(result.admission.tier, "core");
  assert.ok(result.admission.boundaryReasonCodes.includes("effective_tier_corrected"));
});

test("preserves quarantine even when all criteria pass", () => {
  const result = applyAdmissionPolicy({
    parentCandidate: candidate,
    proposal: eligibleProposal({ tier: "quarantine" }),
    blockText
  });

  assert.equal(result.admission.tier, "quarantine");
});

test("keeps an individually eligible but source-level-demoted candidate optional", () => {
  const result = applyAdmissionPolicy({
    parentCandidate: candidate,
    proposal: eligibleProposal({
      coreSelected: false,
      selectionReasonCode: "supporting_mechanism"
    }),
    blockText
  });

  assert.equal(result.admission.tier, "optional");
  assert.equal(result.admission.selectionReasonCode, "supporting_mechanism");
});

test("rejects out-of-domain illustrative material rather than keeping it optional (neural source-role, no regex)", () => {
  // R12: the deterministic illustrative-section regex is gone. An algorithm/SQL
  // example used only to illustrate an ed-tech source is rejected by the model's
  // neural sourceRole, and can never linger as optional.
  const result = applyAdmissionPolicy({
    parentCandidate: candidate,
    proposal: eligibleProposal({ sourceRole: "out_of_domain_illustration" }),
    blockText
  });

  assert.equal(result.admission.tier, "reject");
  assert.ok(result.admission.boundaryReasonCodes.includes("out_of_domain_illustration"));
});

test("carries atomic identity and parent provenance for a split atom", () => {
  // R13: a conflated parent ('stack_heap') splits into an atom ('Heap') whose
  // grounded atomic label is the published identity, with the parent retained.
  const splitBlockText = new Map([
    ["block-1", "The stack and the heap are two regions of memory. The heap stores data of unknown size."]
  ]);
  const parent: DiscoveredCandidate = {
    candidateKey: "stack_heap",
    canonicalLabel: "The stack and the heap",
    mentions: [{ blockId: "block-1", evidenceQuote: "The stack and the heap are two regions of memory." }]
  };
  const result = applyAdmissionPolicy({
    parentCandidate: parent,
    proposal: eligibleProposal({
      atomicKey: "stack_heap__heap",
      parentCandidateKey: "stack_heap",
      proposedCanonicalLabel: "The heap",
      standaloneLearningObjective: { passed: true, rationale: "heap as its own objective", evidence: [{ blockId: "block-1", evidenceQuote: "The heap stores data of unknown size." }] },
      establishedDomainMeaning: { passed: true, rationale: "established", evidence: [{ blockId: "block-1", evidenceQuote: "The heap stores data of unknown size." }] },
      definitionBearingTreatment: { passed: true, rationale: "definition-bearing", evidence: [{ blockId: "block-1", evidenceQuote: "The heap stores data of unknown size." }] },
      organizingPower: {
        passed: true,
        rationale: "organizes",
        aspects: [
          { summary: "memory region", nature: "definition-or-property", evidence: { blockId: "block-1", evidenceQuote: "The stack and the heap are two regions of memory." } },
          { summary: "stores unknown size", nature: "mechanism", evidence: { blockId: "block-1", evidenceQuote: "The heap stores data of unknown size." } }
        ]
      }
    }),
    blockText: splitBlockText
  });

  assert.equal(result.candidateKey, "stack_heap__heap");
  assert.equal(result.parentCandidateKey, "stack_heap");
  assert.equal(result.canonicalLabel, "The heap");
  assert.equal(result.admission.tier, "core");
});

test("fails an ungrounded split-atom label closed so it cannot reach core", () => {
  // R13 scenario 2: a split atom whose label is not source-grounded has no
  // discovered label to fall back to, so it fails closed and never publishes core.
  const parent: DiscoveredCandidate = {
    candidateKey: "stack_heap",
    canonicalLabel: "The stack and the heap",
    mentions: [{ blockId: "block-1", evidenceQuote: "Ownership is a set of rules." }]
  };
  const result = applyAdmissionPolicy({
    parentCandidate: parent,
    proposal: eligibleProposal({
      atomicKey: "stack_heap__ghost",
      parentCandidateKey: "stack_heap",
      proposedCanonicalLabel: "Quantum Entanglement"
    }),
    blockText
  });

  assert.notEqual(result.admission.tier, "core");
  assert.ok(result.admission.boundaryReasonCodes.includes("atomic_label_not_source_grounded"));
});

test("no longer demotes a proposition-shaped label by lexical policy (now the admission judge's job)", () => {
  // The deterministic looksLikePropositionLabel veto was removed (ADR-0005,
  // AGENTS rule 16). Concept-vs-proposition is a semantic call made downstream by
  // the measured admission-label judge, so the pure policy must NOT demote here.
  const result = applyAdmissionPolicy({
    parentCandidate: candidate,
    proposal: eligibleProposal({ proposedCanonicalLabel: "Division of Labour Limited by the Extent of the Market" }),
    blockText
  });

  assert.equal(result.admission.tier, "core");
  assert.ok(!result.admission.boundaryReasonCodes.includes("proposition_shaped_label"));
  assert.ok(!result.admission.boundaryReasonCodes.includes("proposition_label_judged"));
});

test("keeps a multi-word nominal label core", () => {
  const result = applyAdmissionPolicy({
    parentCandidate: candidate,
    proposal: eligibleProposal({ proposedCanonicalLabel: "Division of Labour" }),
    blockText
  });

  assert.equal(result.admission.tier, "core");
});

test("does not count motivation or examples as organizing aspects", () => {
  const proposal = eligibleProposal();
  proposal.organizingPower.aspects[1] = {
    summary: "Avoids tedious ownership passing",
    nature: "motivation-or-example",
    evidence: { blockId: "block-2", evidenceQuote: "After a move, the first variable is no longer valid." }
  };

  const result = applyAdmissionPolicy({ parentCandidate: candidate, proposal, blockText });

  assert.equal(result.admission.organizingPower.passed, false);
  assert.equal(result.admission.tier, "optional");
});

test("fails a missing decision closed to reject", () => {
  const result = applyAdmissionPolicy({ parentCandidate: candidate, blockText });

  assert.equal(result.admission.tier, "reject");
  assert.equal(result.parentCandidateKey, "move");
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
