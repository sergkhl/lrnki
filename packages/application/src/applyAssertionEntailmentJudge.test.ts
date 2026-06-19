import assert from "node:assert/strict";
import test from "node:test";
import type { RunEvidenceProfile } from "@lrnki/domain-core";
import type { AssertionEntailmentJudgmentPort } from "@lrnki/ports";
import { applyAssertionEntailmentJudge } from "./applyAssertionEntailmentJudge";

const conceptsByKey = new Map([
  ["ownership", { canonicalLabel: "Ownership", aliases: ["Ownership"] }]
]);

function baseProfile(): RunEvidenceProfile {
  return {
    candidateKey: "ownership",
    tier: "core",
    definitions: [{ blockId: "block-1", evidenceQuote: "Ownership is a set of rules" }],
    mentions: [{ blockId: "block-1", evidenceQuote: "The compiler checks the rules" }],
    assertions: [
      { type: "defines", literalValue: "the rules governing memory", evidence: [{ blockId: "block-1", evidenceQuote: "Ownership is a set of rules" }] }
    ],
    complete: true
  };
}

test("keeps only assertions the judge accepts", async () => {
  const judge: AssertionEntailmentJudgmentPort = {
    model: "test",
    judgeDefinition: async () => ({ entailed: true, entailingSpan: "", rationale: "ok" })
  };
  const [profile] = await applyAssertionEntailmentJudge({ profiles: [baseProfile()], declaredDomain: "rust", conceptsByKey, judge });
  assert.equal(profile.assertions.length, 1);
});

test("drops a rejected assertion but preserves its underlying passage as a mention", async () => {
  const judge: AssertionEntailmentJudgmentPort = {
    model: "test",
    judgeDefinition: async () => ({ entailed: false, entailingSpan: "", rationale: "unsupported definition" })
  };
  const [profile] = await applyAssertionEntailmentJudge({ profiles: [baseProfile()], declaredDomain: "rust", conceptsByKey, judge });
  assert.equal(profile.assertions.length, 0);
  assert.equal(profile.mentions.some((m) => m.evidenceQuote === "Ownership is a set of rules"), true);
});

test("fails closed when the judge throws, preserving the passage", async () => {
  const judge: AssertionEntailmentJudgmentPort = {
    model: "test",
    judgeDefinition: async () => { throw new Error("judge unavailable"); }
  };
  const [profile] = await applyAssertionEntailmentJudge({ profiles: [baseProfile()], declaredDomain: "rust", conceptsByKey, judge });
  assert.equal(profile.assertions.some((a) => a.type === "defines"), false);
  assert.equal(profile.mentions.some((m) => m.evidenceQuote === "Ownership is a set of rules"), true);
});
