import assert from "node:assert/strict";
import test from "node:test";
import type { RunEvidenceProfile } from "@lrnki/domain-core";
import type { AssertionEntailmentJudgmentPort } from "@lrnki/ports";
import { applyAssertionEntailmentJudge } from "./applyAssertionEntailmentJudge";

const conceptsByKey = new Map([
  ["ownership", { canonicalLabel: "Ownership", aliases: ["Ownership"] }],
  ["borrowing", { canonicalLabel: "Borrowing", aliases: ["Borrowing"] }]
]);

function baseProfile(): RunEvidenceProfile {
  return {
    candidateKey: "ownership",
    tier: "core",
    definitions: [{ blockId: "block-1", evidenceQuote: "Ownership is a set of rules" }],
    mentions: [{ blockId: "block-1", evidenceQuote: "The compiler checks the rules" }],
    assertions: [
      { type: "defines", literalValue: "the rules governing memory", evidence: [{ blockId: "block-1", evidenceQuote: "Ownership is a set of rules" }] },
      { type: "explicit-prerequisite-hint", objectCandidateKey: "borrowing", evidence: [{ blockId: "block-1", evidenceQuote: "Borrowing requires ownership" }] }
    ],
    complete: true
  };
}

test("keeps only assertions the judge accepts", async () => {
  const judge: AssertionEntailmentJudgmentPort = {
    model: "test",
    judgeDefinition: async () => ({ entailed: true, entailingSpan: "", rationale: "ok" }),
    judgePrerequisiteHint: async () => ({ entailed: true, entailingSpan: "", rationale: "ok" })
  };
  const [profile] = await applyAssertionEntailmentJudge({ profiles: [baseProfile()], declaredDomain: "rust", conceptsByKey, judge });
  assert.equal(profile.assertions.length, 2);
});

test("drops a rejected assertion but preserves its underlying passage as a mention", async () => {
  const judge: AssertionEntailmentJudgmentPort = {
    model: "test",
    judgeDefinition: async () => ({ entailed: true, entailingSpan: "", rationale: "ok" }),
    judgePrerequisiteHint: async () => ({ entailed: false, entailingSpan: "", rationale: "no explicit prerequisite" })
  };
  const [profile] = await applyAssertionEntailmentJudge({ profiles: [baseProfile()], declaredDomain: "rust", conceptsByKey, judge });
  assert.equal(profile.assertions.length, 1);
  assert.equal(profile.assertions[0].type, "defines");
  // The rejected hint's passage survives as a mention.
  assert.equal(profile.mentions.some((m) => m.evidenceQuote === "Borrowing requires ownership"), true);
});

test("fails closed when the judge throws, preserving the passage", async () => {
  const judge: AssertionEntailmentJudgmentPort = {
    model: "test",
    judgeDefinition: async () => { throw new Error("judge unavailable"); },
    judgePrerequisiteHint: async () => ({ entailed: true, entailingSpan: "", rationale: "ok" })
  };
  const [profile] = await applyAssertionEntailmentJudge({ profiles: [baseProfile()], declaredDomain: "rust", conceptsByKey, judge });
  assert.equal(profile.assertions.some((a) => a.type === "defines"), false);
  assert.equal(profile.mentions.some((m) => m.evidenceQuote === "Ownership is a set of rules"), true);
});
