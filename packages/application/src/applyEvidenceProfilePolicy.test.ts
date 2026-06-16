import assert from "node:assert/strict";
import test from "node:test";
import type { ExtractedEvidenceProfile } from "@lrnki/domain-core";
import { applyEvidenceProfilePolicy } from "./applyEvidenceProfilePolicy";

const blockText = new Map<string, string>([
  ["block-1", "Ownership is a set of rules that govern how a Rust program manages memory. The compiler checks the rules. Move semantics transfer ownership. Borrowing lets you reference a value. The stack stores values. The heap stores data. References point to data. Lifetimes track validity."]
]);

function profile(overrides: Partial<ExtractedEvidenceProfile> = {}): ExtractedEvidenceProfile {
  return { definitions: [], mentions: [], assertions: [], ...overrides };
}

test("keeps both verified definitions and the first N distinct mentions in neural order, deduplicating", async () => {
  const eight = [
    "The compiler checks the rules", "Move semantics transfer ownership", "Borrowing lets you reference a value",
    "The stack stores values", "The heap stores data", "References point to data",
    "Lifetimes track validity", "Ownership is a set of rules"
  ];
  const result = applyEvidenceProfilePolicy({
    candidateKey: "ownership",
    tier: "core",
    profile: profile({
      definitions: [
        { blockId: "block-1", evidenceQuote: "Ownership is a set of rules that govern how a Rust program manages memory" },
        { blockId: "block-1", evidenceQuote: "Ownership is a set of rules" }
      ],
      // duplicate the first mention to prove dedup does not consume a slot
      mentions: [eight[0], eight[0], ...eight.slice(1)].map((q) => ({ blockId: "block-1", evidenceQuote: q }))
    }),
    admittedKeys: new Set(["ownership"]),
    blockText,
    maxMentionsPerConceptPerSource: 6
  });
  assert.equal(result.definitions.length, 2);
  assert.equal(result.complete, true);
  assert.equal(result.mentions.length, 6);
  // Neural order preserved (deduped first element appears once, at front).
  assert.equal(result.mentions[0].evidenceQuote, eight[0]);
  assert.equal(result.mentions[5].evidenceQuote, eight[5]);
});

test("honors a non-default mention bound without changing neural order", async () => {
  const result = applyEvidenceProfilePolicy({
    candidateKey: "ownership",
    tier: "core",
    profile: profile({
      definitions: [{ blockId: "block-1", evidenceQuote: "Ownership is a set of rules" }],
      mentions: ["The compiler checks the rules", "Move semantics transfer ownership", "Borrowing lets you reference a value"].map((q) => ({ blockId: "block-1", evidenceQuote: q }))
    }),
    admittedKeys: new Set(["ownership"]),
    blockText,
    maxMentionsPerConceptPerSource: 2
  });
  assert.equal(result.mentions.length, 2);
  assert.equal(result.mentions[0].evidenceQuote, "The compiler checks the rules");
});

test("removes ungrounded definition and mention passages and reports an incomplete profile", async () => {
  const result = applyEvidenceProfilePolicy({
    candidateKey: "ownership",
    tier: "core",
    profile: profile({
      definitions: [{ blockId: "block-1", evidenceQuote: "this sentence is not in the source block" }],
      mentions: [
        { blockId: "block-1", evidenceQuote: "The compiler checks the rules" },
        { blockId: "missing", evidenceQuote: "The compiler checks the rules" }
      ]
    }),
    admittedKeys: new Set(["ownership"]),
    blockText,
    maxMentionsPerConceptPerSource: 6
  });
  assert.equal(result.definitions.length, 0);
  assert.equal(result.complete, false);
  assert.equal(result.mentions.length, 1);
});

test("keeps a grounded defines literal and a hint to an admitted concept, dropping a hint to an unknown target", async () => {
  const result = applyEvidenceProfilePolicy({
    candidateKey: "ownership",
    tier: "core",
    profile: profile({
      definitions: [{ blockId: "block-1", evidenceQuote: "Ownership is a set of rules" }],
      assertions: [
        { type: "defines", literalValue: "the rules governing memory", evidence: [{ blockId: "block-1", evidenceQuote: "Ownership is a set of rules" }] },
        { type: "explicit-prerequisite-hint", objectCandidateKey: "borrowing", evidence: [{ blockId: "block-1", evidenceQuote: "Borrowing lets you reference a value" }] },
        { type: "explicit-prerequisite-hint", objectCandidateKey: "not-admitted", evidence: [{ blockId: "block-1", evidenceQuote: "References point to data" }] },
        { type: "explicit-prerequisite-hint", objectCandidateKey: "ownership", evidence: [{ blockId: "block-1", evidenceQuote: "References point to data" }] }
      ]
    }),
    admittedKeys: new Set(["ownership", "borrowing"]),
    blockText,
    maxMentionsPerConceptPerSource: 6
  });
  // Pre-entailment: structurally valid + grounded assertions survive; self-target and unknown target dropped.
  assert.equal(result.assertions.length, 2);
  assert.equal(result.assertions.some((a) => a.type === "defines"), true);
  assert.equal(result.assertions.some((a) => a.type === "explicit-prerequisite-hint" && a.objectCandidateKey === "borrowing"), true);
});

test("drops an ungrounded or empty assertion fail-closed", async () => {
  const result = applyEvidenceProfilePolicy({
    candidateKey: "ownership",
    tier: "core",
    profile: profile({
      definitions: [{ blockId: "block-1", evidenceQuote: "Ownership is a set of rules" }],
      assertions: [
        { type: "defines", literalValue: "   ", evidence: [{ blockId: "block-1", evidenceQuote: "Ownership is a set of rules" }] },
        { type: "defines", literalValue: "x", evidence: [{ blockId: "block-1", evidenceQuote: "absent from block" }] }
      ]
    }),
    admittedKeys: new Set(["ownership"]),
    blockText,
    maxMentionsPerConceptPerSource: 6
  });
  assert.equal(result.assertions.length, 0);
});
