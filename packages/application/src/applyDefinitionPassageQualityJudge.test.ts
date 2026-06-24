import assert from "node:assert/strict";
import test from "node:test";
import type { DefinitionPassageQualityJudgment, RunEvidenceProfile } from "@lrnki/domain-core";
import type { DefinitionPassageQualityJudgmentPort } from "@lrnki/ports";
import { applyDefinitionPassageQualityJudge } from "./applyDefinitionPassageQualityJudge";

// The canned verdicts are INPUT to the deterministic drop/keep transform (AGENTS rule
// 11); the assertions check the transform — which passages survive, the recomputed
// `complete`, the hollow-key signal, and the dispositions — never the judge's content.

function defProfile(candidateKey: string, definitions: { blockId: string; evidenceQuote: string }[]): RunEvidenceProfile {
  return {
    candidateKey,
    tier: "core",
    definitions,
    mentions: [],
    assertions: [],
    complete: definitions.length >= 1
  };
}

function cannedJudge(
  verdictsByKey: Map<string, DefinitionPassageQualityJudgment[]>,
  spy?: { calls: number }
): DefinitionPassageQualityJudgmentPort {
  return {
    model: "canned",
    async judgeDefinitions(input) {
      if (spy) spy.calls += 1;
      const verdicts = verdictsByKey.get(input.subject.canonicalLabel);
      if (!verdicts) throw new Error("no canned verdict for subject");
      return verdicts;
    }
  };
}

const conceptsByKey = new Map([
  ["ownership", { canonicalLabel: "ownership", aliases: [] }],
  ["borrowing", { canonicalLabel: "borrowing", aliases: [] }]
]);
const blockContextById = new Map([
  ["b1", { blockType: "paragraph", headingPath: ["Memory"] }],
  ["b2", { blockType: "heading", headingPath: ["Memory"] }],
  ["b3", { blockType: "paragraph", headingPath: ["Memory"] }]
]);

function keep(rationale = "ok"): DefinitionPassageQualityJudgment {
  return { establishesMeaning: true, category: "establishes_meaning", judgedSpan: "", rationale };
}
function veto(category: DefinitionPassageQualityJudgment["category"], judgedSpan: string): DefinitionPassageQualityJudgment {
  return { establishesMeaning: false, category, judgedSpan, rationale: "hollow" };
}

test("happy keep: sole defining passage stays, complete true, one kept disposition", async () => {
  const profiles = [defProfile("ownership", [{ blockId: "b1", evidenceQuote: "Ownership frees a value at scope exit." }])];
  const judge = cannedJudge(new Map([["ownership", [keep()]]]));
  const out = await applyDefinitionPassageQualityJudge({ profiles, declaredDomain: "se", conceptsByKey, blockContextById, judge });

  assert.equal(out.profiles[0], profiles[0]); // identity preserved, nothing dropped
  assert.equal(out.profiles[0].complete, true);
  assert.equal(out.hollowDefinitionKeys.size, 0);
  assert.deepEqual(out.dispositions.map((d) => d.disposition), ["kept"]);
});

test("drop non-last: one of two vetoed, survivor remains, complete true, key not hollow", async () => {
  const profiles = [
    defProfile("ownership", [
      { blockId: "b1", evidenceQuote: "Ownership frees a value at scope exit." },
      { blockId: "b2", evidenceQuote: "Ownership" }
    ])
  ];
  const judge = cannedJudge(new Map([["ownership", [keep(), veto("heading_or_title", "Ownership")]]]));
  const out = await applyDefinitionPassageQualityJudge({ profiles, declaredDomain: "se", conceptsByKey, blockContextById, judge });

  assert.equal(out.profiles[0].definitions.length, 1);
  assert.equal(out.profiles[0].definitions[0].blockId, "b1");
  assert.equal(out.profiles[0].complete, true);
  assert.equal(out.hollowDefinitionKeys.has("ownership"), false);
  assert.deepEqual(out.dispositions.map((d) => d.disposition), ["kept", "vetoed"]);
});

test("drop last -> hollow: sole passage vetoed, complete false, key hollow, category reflected", async () => {
  const profiles = [defProfile("ownership", [{ blockId: "b2", evidenceQuote: "Ownership" }])];
  const judge = cannedJudge(new Map([["ownership", [veto("heading_or_title", "Ownership")]]]));
  const out = await applyDefinitionPassageQualityJudge({ profiles, declaredDomain: "se", conceptsByKey, blockContextById, judge });

  assert.equal(out.profiles[0].definitions.length, 0);
  assert.equal(out.profiles[0].complete, false);
  assert.equal(out.hollowDefinitionKeys.has("ownership"), true);
  assert.equal(out.dispositions[0].disposition, "vetoed");
  assert.equal(out.dispositions[0].category, "heading_or_title");
});

test("fail-closed throw: all passages kept, complete unchanged, dispositions kept_judge_unavailable", async () => {
  const profiles = [defProfile("ownership", [{ blockId: "b1", evidenceQuote: "Ownership frees a value at scope exit." }])];
  const judge: DefinitionPassageQualityJudgmentPort = {
    model: "throws",
    async judgeDefinitions() {
      throw new Error("transport down");
    }
  };
  const out = await applyDefinitionPassageQualityJudge({ profiles, declaredDomain: "se", conceptsByKey, blockContextById, judge });

  assert.equal(out.profiles[0].definitions.length, 1);
  assert.equal(out.profiles[0].complete, true);
  assert.equal(out.hollowDefinitionKeys.size, 0);
  assert.deepEqual(out.dispositions.map((d) => d.disposition), ["kept_judge_unavailable"]);
});

test("stage trusts the port's grounded verdict (coercion is the adapter's job)", async () => {
  // A real adapter would have already coerced an ungrounded veto to keep. The stage
  // does no grounding; it drops exactly what the port reports as establishesMeaning:false.
  const profiles = [defProfile("ownership", [{ blockId: "b1", evidenceQuote: "Ownership frees a value at scope exit." }])];
  const judge = cannedJudge(new Map([["ownership", [keep()]]]));
  const out = await applyDefinitionPassageQualityJudge({ profiles, declaredDomain: "se", conceptsByKey, blockContextById, judge });
  assert.equal(out.profiles[0].complete, true);
  assert.equal(out.dispositions[0].disposition, "kept");
});

test("tier filter: an optional profile is returned untouched and never judged", async () => {
  const optional: RunEvidenceProfile = { ...defProfile("borrowing", [{ blockId: "b1", evidenceQuote: "Borrowing lends a reference." }]), tier: "optional" };
  const spy = { calls: 0 };
  const judge = cannedJudge(new Map(), spy);
  const out = await applyDefinitionPassageQualityJudge({ profiles: [optional], declaredDomain: "se", conceptsByKey, blockContextById, judge });

  assert.equal(out.profiles[0], optional);
  assert.equal(out.dispositions.length, 0);
  assert.equal(spy.calls, 0);
});

test("index/verdict mapping: each verdict maps to its passage by position", async () => {
  const profiles = [
    defProfile("ownership", [
      { blockId: "b1", evidenceQuote: "A defines ownership." },
      { blockId: "b2", evidenceQuote: "Ownership" },
      { blockId: "b3", evidenceQuote: "C also defines ownership distinctly." }
    ])
  ];
  const judge = cannedJudge(new Map([["ownership", [keep(), veto("heading_or_title", "Ownership"), keep()]]]));
  const out = await applyDefinitionPassageQualityJudge({ profiles, declaredDomain: "se", conceptsByKey, blockContextById, judge });

  assert.deepEqual(out.profiles[0].definitions.map((d) => d.blockId), ["b1", "b3"]);
  assert.deepEqual(out.dispositions.map((d) => `${d.sourceBlockId}:${d.disposition}`), ["b1:kept", "b2:vetoed", "b3:kept"]);
});
