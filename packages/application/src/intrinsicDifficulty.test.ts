import assert from "node:assert/strict";
import { test } from "node:test";
import type { DifficultyBandEntry, DifficultyNodeContext } from "@lrnki/domain-core";
import type { IntrinsicDifficultyJudgmentPort } from "@lrnki/ports";
import { createIntrinsicDifficultyPort } from "./intrinsicDifficulty";

function node(id: string, declaredDomain = "test"): DifficultyNodeContext {
  return {
    derivedNodeId: id,
    canonicalLabel: id.toUpperCase(),
    aliases: [],
    declaredDomain,
    groundingOrigin: "document_anchored",
    definitions: [`${id} definition`],
    mentions: []
  };
}

// A judge whose banding draws are scripted per node LABEL: `bandsByLabel[label]` is the
// sequence of bands the K draws return for that node (in draw order). `compareHarder`
// answers from a scripted map keyed "first|second" labels, and records every comparison.
function scriptedJudge(input: {
  bandsByLabel: Record<string, number[]>;
  harder?: (first: string, second: string) => "first" | "second";
}) {
  const comparisons: { first: string; second: string }[] = [];
  let bandCalls = 0;
  const judge: IntrinsicDifficultyJudgmentPort = {
    model: "stub-judge",
    async bandDomainSet({ nodes }): Promise<DifficultyBandEntry[]> {
      const draw = bandCalls++;
      return nodes.map((candidate, index) => {
        const bands = input.bandsByLabel[candidate.canonicalLabel];
        assert.ok(bands, `unscripted node ${candidate.canonicalLabel}`);
        return { conceptNumber: index + 1, band: bands[draw % bands.length], rationale: `${candidate.canonicalLabel} draw ${draw} band ${bands[draw % bands.length]}` };
      });
    },
    async compareHarder({ first, second }) {
      comparisons.push({ first: first.canonicalLabel, second: second.canonicalLabel });
      return { harder: input.harder?.(first.canonicalLabel, second.canonicalLabel) ?? "second" };
    }
  };
  return { judge, comparisons, getBandCalls: () => bandCalls };
}

test("uncontested consensus takes the modal band, scores (band-1)/4, and records zero comparisons (AE2, AE3)", async () => {
  const { judge, comparisons } = scriptedJudge({ bandsByLabel: { A: [2, 2, 2, 2, 3], B: [5, 5, 5, 5, 5] } });
  const port = createIntrinsicDifficultyPort(judge, 5);
  const difficulties = await port.score({ nodes: [node("a"), node("b")] });

  assert.equal(port.method, "intrinsic-banded-v2");
  const byId = new Map(difficulties.map((difficulty) => [difficulty.derivedNodeId, difficulty] as const));
  const a = byId.get("a")!;
  assert.equal(a.method, "intrinsic-banded-v2");
  assert.equal(a.components.band, 2);
  assert.equal(a.components.kDraws, 5);
  assert.equal(a.components.modalShare, 0.8);
  assert.equal(a.components.contested, 0);
  assert.equal(a.components.pairwiseComparisons, 0);
  assert.equal(a.components.calibrationUnresolved, 0);
  assert.equal(a.score, 0.25);
  assert.equal(byId.get("b")!.score, 1);
  assert.equal(comparisons.length, 0);
  // AE3 round-trip: the diamond mapping recovers the band from the score.
  for (const difficulty of difficulties) {
    assert.equal(Math.round(difficulty.score * 4) + 1, difficulty.components.band);
  }
});

test("the rationale comes from the first draw that voted the final band", async () => {
  const { judge } = scriptedJudge({ bandsByLabel: { A: [3, 2, 2, 2, 2] } });
  const difficulties = await createIntrinsicDifficultyPort(judge, 5).score({ nodes: [node("a")] });
  assert.equal(difficulties[0].neuralRationale, "A draw 1 band 2");
});

test("a modal tie takes the LOWER band and is contested by construction", async () => {
  // a: bands 2,2,4,4,3 → tie 2/2 between bands 2 and 4 → modal 2, share 0.4 → contested.
  // Anchors: h at band 4 (5/5), l at band 2 (5/5). Bracket: not harder than H's anchor,
  // not easier than L's anchor → confirms the middle → keeps modal band 2.
  const { judge, comparisons } = scriptedJudge({
    bandsByLabel: { A: [2, 2, 4, 4, 3], H: [4, 4, 4, 4, 4], L: [2, 2, 2, 2, 2] },
    // Vs H's anchor: the anchor is harder. Vs L's anchor: A is harder. Middle confirmed.
    harder: (_first, second) => (second === "H" ? "second" : "first")
  });
  const difficulties = await createIntrinsicDifficultyPort(judge, 5).score({ nodes: [node("a"), node("h"), node("l")] });
  const a = difficulties.find((difficulty) => difficulty.derivedNodeId === "a")!;
  assert.equal(a.components.band, 2);
  assert.equal(a.components.contested, 1);
  assert.equal(a.components.pairwiseComparisons, 2);
  assert.equal(a.components.calibrationUnresolved, 0);
  assert.deepEqual(comparisons, [
    { first: "A", second: "H" },
    { first: "A", second: "L" }
  ]);
});

test("a contested concept harder than the high anchor takes band H after one comparison", async () => {
  // a: 2,2,4,4,5 → modal tie 2/2 → modal 2 (lower), contested; candidates L=2, H=5.
  const { judge, comparisons } = scriptedJudge({
    bandsByLabel: { A: [2, 2, 4, 4, 5], H: [5, 5, 5, 5, 5], L: [2, 2, 2, 2, 2] },
    harder: (first) => (first === "A" ? "first" : "second")
  });
  const difficulties = await createIntrinsicDifficultyPort(judge, 5).score({ nodes: [node("a"), node("h"), node("l")] });
  const a = difficulties.find((difficulty) => difficulty.derivedNodeId === "a")!;
  assert.equal(a.components.band, 5);
  assert.equal(a.score, 1);
  assert.equal(a.components.pairwiseComparisons, 1);
  assert.equal(comparisons.length, 1);
  // The rationale still comes from a draw that voted band 5.
  assert.equal(a.neuralRationale, "A draw 4 band 5");
});

test("a contested concept easier than the low anchor takes band L after two comparisons", async () => {
  // a: 3,3,4,4,2 → modal tie 3/3... counts: 3→2, 4→2, 2→1 → tie 3 vs 4 → modal 3, contested; L=2, H=4.
  const { judge } = scriptedJudge({
    bandsByLabel: { A: [3, 3, 4, 4, 2], H: [4, 4, 4, 4, 4], L: [2, 2, 2, 2, 2] },
    // A vs H → H harder (second); A vs L → L harder (second) means A is easier than L's anchor.
    harder: () => "second"
  });
  const difficulties = await createIntrinsicDifficultyPort(judge, 5).score({ nodes: [node("a"), node("h"), node("l")] });
  const a = difficulties.find((difficulty) => difficulty.derivedNodeId === "a")!;
  assert.equal(a.components.band, 2);
  assert.equal(a.components.pairwiseComparisons, 2);
  assert.equal(a.components.calibrationUnresolved, 0);
});

test("a missing needed anchor keeps the modal band and records calibrationUnresolved (AE5 shape)", async () => {
  // Single contested concept in its domain: no uncontested anchors exist at all.
  const { judge, comparisons } = scriptedJudge({ bandsByLabel: { A: [1, 2, 3, 4, 5] } });
  const difficulties = await createIntrinsicDifficultyPort(judge, 5).score({ nodes: [node("a")] });
  const a = difficulties[0];
  assert.equal(a.components.contested, 1);
  assert.equal(a.components.band, 1, "modal tie across all bands takes the lowest");
  assert.equal(a.components.calibrationUnresolved, 1);
  assert.equal(a.components.pairwiseComparisons, 0);
  assert.equal(comparisons.length, 0);
});

test("a single-concept domain passes through as one accepted banding call (AE5)", async () => {
  const { judge, getBandCalls } = scriptedJudge({ bandsByLabel: { A: [3] } });
  const difficulties = await createIntrinsicDifficultyPort(judge, 5).score({ nodes: [node("a")] });
  assert.equal(difficulties.length, 1);
  assert.equal(difficulties[0].components.band, 3);
  assert.equal(difficulties[0].components.contested, 0);
  assert.equal(getBandCalls(), 5, "K draws still run; the set is just size 1");
});

test("domains band independently: one call set per Declared Domain, K draws each", async () => {
  const { judge, getBandCalls } = scriptedJudge({ bandsByLabel: { A: [2], B: [4] } });
  const difficulties = await createIntrinsicDifficultyPort(judge, 3).score({
    nodes: [node("a", "domain one"), node("b", "domain two")]
  });
  assert.equal(difficulties.length, 2);
  assert.equal(getBandCalls(), 6, "3 draws for each of the 2 domains");
});

test("components are strictly numeric and the rationale lives beside them", async () => {
  const { judge } = scriptedJudge({ bandsByLabel: { A: [2] } });
  const difficulties = await createIntrinsicDifficultyPort(judge, 5).score({ nodes: [node("a")] });
  assert.equal(Object.values(difficulties[0].components).every((value) => typeof value === "number"), true);
  assert.equal(typeof difficulties[0].neuralRationale, "string");
});

test("a non-finite or non-positive sample count fails loudly at composition time", () => {
  const { judge } = scriptedJudge({ bandsByLabel: { A: [2] } });
  assert.throws(() => createIntrinsicDifficultyPort(judge, Number.NaN), /positive integer/);
  assert.throws(() => createIntrinsicDifficultyPort(judge, 0), /positive integer/);
  assert.throws(() => createIntrinsicDifficultyPort(judge, undefined as unknown as number), /positive integer/);
});

test("a draw with bad coverage or an out-of-range band fails the stage closed", async () => {
  const badCoverage: IntrinsicDifficultyJudgmentPort = {
    model: "bad",
    async bandDomainSet({ nodes }) {
      // Duplicate number 1, missing the last listed concept.
      return nodes.map(() => ({ conceptNumber: 1, band: 2, rationale: "r" }));
    },
    async compareHarder() {
      return { harder: "first" };
    }
  };
  await assert.rejects(
    () => createIntrinsicDifficultyPort(badCoverage, 2).score({ nodes: [node("a"), node("b")] }),
    /outside or twice/
  );

  const badBand: IntrinsicDifficultyJudgmentPort = {
    model: "bad",
    async bandDomainSet({ nodes }) {
      return nodes.map((candidate, index) => ({ conceptNumber: index + 1, band: 6, rationale: "r" }));
    },
    async compareHarder() {
      return { harder: "first" };
    }
  };
  await assert.rejects(() => createIntrinsicDifficultyPort(badBand, 2).score({ nodes: [node("a")] }), /out-of-range band/);

  const throwing: IntrinsicDifficultyJudgmentPort = {
    model: "throwing",
    async bandDomainSet() {
      throw new Error("banding re-prompt exhausted");
    },
    async compareHarder() {
      return { harder: "first" };
    }
  };
  await assert.rejects(() => createIntrinsicDifficultyPort(throwing, 5).score({ nodes: [node("a")] }), /re-prompt exhausted/);
});
