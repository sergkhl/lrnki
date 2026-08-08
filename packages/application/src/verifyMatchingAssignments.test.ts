import assert from "node:assert/strict";
import { test } from "node:test";
import type { MatchingAssignmentVerdict, MatchingItem } from "@lrnki/domain-core";
import type { MatchingAssignmentVerificationPort } from "@lrnki/ports";
import {
  matchingAssignmentPresentation,
  matchingAssignmentVetoReason,
  verifyMatchingAssignments,
  type MatchingAssignmentSubject
} from "./verifyMatchingAssignments";

// Matching Assignment Verification (plan 2026-08-07-001 U3). Three independent things are under
// test: the PRESENTATION that hides the answer key from the judge, the assignment-uniqueness RULE
// (a deterministic function of the returned grid), and the phase's use of the shared control flow.

const itemBase = {
  studyItemId: "item-1",
  graphVersionId: null,
  enrichmentId: "enr-1",
  derivedNodeId: "node-1",
  groundingProvenance: "generated" as const,
  generatingModel: "mock-gen",
  configHash: "cfg-1",
  explorableTerms: []
};

function matchingItem(pairs: { promptText: string; matchText: string }[]): MatchingItem {
  return {
    ...itemBase,
    itemType: "matching",
    question: "Match each aspect to the content answering it.",
    pairs: pairs.map((pair, index) => ({
      pairId: `pair-${index}`,
      matchId: `match-${index}`,
      promptText: pair.promptText,
      matchText: pair.matchText,
      citation: { provenance: "generated" as const, derivedNodeId: "node-1", passageText: "A passage." }
    }))
  };
}

// The frozen `Seawater density` subsumption shape from the plan's defect inventory: prompt 3 is
// broad enough that its keyed answer also answers prompts 0 and 1. Every one of these pairs is
// factually TRUE, which is why a per-candidate claim judge admits the board and a learner who
// answers defensibly is graded wrong.
const subsumptionItem = matchingItem([
  { promptText: "Effect of falling temperature", matchText: "Density rises" },
  { promptText: "Effect of rising salinity", matchText: "Density also rises" },
  { promptText: "Effect of depth", matchText: "Pressure compresses the water column" },
  { promptText: "What makes surface water sink", matchText: "Becoming cooler or saltier" }
]);

function grid(entries: [number, number, MatchingAssignmentVerdict["verdict"]][]): MatchingAssignmentVerdict[] {
  return entries.map(([promptOrdinal, matchOrdinal, verdict]) => ({
    promptOrdinal,
    matchOrdinal,
    verdict,
    reason: `judged ${verdict}`
  }));
}

// --- The presentation ------------------------------------------------------------------

test("matches are presented in normalized text order and renumbered, so no number or position reveals the key", () => {
  const item = matchingItem([
    { promptText: "First aspect", matchText: "Zebra answer" },
    { promptText: "Second aspect", matchText: "Alpha answer" },
    { promptText: "Third aspect", matchText: "Mango answer" }
  ]);
  const presentation = matchingAssignmentPresentation(item);

  // Prompts keep pair ordinals; the grid is expressed against them.
  assert.deepEqual(presentation.prompts.map((prompt) => prompt.ordinal), [0, 1, 2]);
  assert.deepEqual(presentation.prompts.map((prompt) => prompt.text), ["First aspect", "Second aspect", "Third aspect"]);

  // Matches are sorted by text AND renumbered by sorted position. Both halves matter: sorting
  // alone would still hand the judge the key through the printed pair ordinal, and a judge that
  // can read the key has no reason to test any other cell.
  assert.deepEqual(presentation.matches, [
    { ordinal: 0, text: "Alpha answer" },
    { ordinal: 1, text: "Mango answer" },
    { ordinal: 2, text: "Zebra answer" }
  ]);
  assert.deepEqual(presentation.matchPairOrdinals, [1, 2, 0]);
  // Nothing on the wire is the identity permutation, which is what a leaked diagonal looks like.
  assert.notDeepEqual(presentation.matchPairOrdinals, [0, 1, 2]);
});

test("the presentation is a deterministic function of the item, so a re-run judges the same board", () => {
  const first = matchingAssignmentPresentation(subsumptionItem);
  const second = matchingAssignmentPresentation(subsumptionItem);
  assert.deepEqual(first, second);
});

// --- The assignment-uniqueness rule ----------------------------------------------------

test("a non-keyed cell judged fits vetoes, and the reason names both sides of the collision", () => {
  const presentation = matchingAssignmentPresentation(subsumptionItem);
  const broadIndex = presentation.matchPairOrdinals.indexOf(3);
  // Pair 3's match ("Becoming cooler or saltier") also answers prompts 0 and 1 — the defect.
  const reason = matchingAssignmentVetoReason(
    { item: subsumptionItem, matchPairOrdinals: presentation.matchPairOrdinals },
    grid([[0, broadIndex, "fits"], [1, broadIndex, "fits"]])
  );
  assert.ok(reason, "a board with a match that answers two prompts must not be admitted");
  assert.match(reason, /match "Becoming cooler or saltier" also fits prompt "Effect of falling temperature", which is keyed to "Density rises"/);
  assert.match(reason, /match "Becoming cooler or saltier" also fits prompt "Effect of rising salinity"/);
  // The stable prefix a gate greps for.
  assert.match(reason, /^matching assignment verification rejected the item:/);
});

test("a keyed cell judged does_not_fit vetoes — the mis-keyed pair a per-prompt fit list would miss", () => {
  const presentation = matchingAssignmentPresentation(subsumptionItem);
  const keyedIndex = presentation.matchPairOrdinals.indexOf(2);
  const reason = matchingAssignmentVetoReason(
    { item: subsumptionItem, matchPairOrdinals: presentation.matchPairOrdinals },
    grid([[2, keyedIndex, "does_not_fit"]])
  );
  assert.ok(reason);
  assert.match(reason, /the keyed match "Pressure compresses the water column" was judged not to fit its own prompt "Effect of depth"/);
});

test("unclear never vetoes, and neither does a cell the judge never returned", () => {
  const presentation = matchingAssignmentPresentation(subsumptionItem);
  const subject = { item: subsumptionItem, matchPairOrdinals: presentation.matchPairOrdinals };
  const allCells = subsumptionItem.pairs.flatMap((_, promptOrdinal) =>
    presentation.matches.map((match): [number, number, MatchingAssignmentVerdict["verdict"]] => [promptOrdinal, match.ordinal, "unclear"])
  );
  assert.equal(matchingAssignmentVetoReason(subject, grid(allCells)), null);
  // A short response leaves most of the grid unjudged. "The judge did not say" is exactly as weak
  // a guarantee as "the judge was unsure", so neither may subtract an item (AGENTS rule 16).
  assert.equal(matchingAssignmentVetoReason(subject, []), null);
});

test("a fully correct board admits: the keyed diagonal fits and every other cell does not", () => {
  // The discrimination-not-distrust control, in the `North Atlantic Deep Water` facet shape.
  const presentation = matchingAssignmentPresentation(subsumptionItem);
  const cells = subsumptionItem.pairs.flatMap((_, promptOrdinal) =>
    presentation.matchPairOrdinals.map((pairOrdinal, presentationIndex): [number, number, MatchingAssignmentVerdict["verdict"]] =>
      [promptOrdinal, presentationIndex, pairOrdinal === promptOrdinal ? "fits" : "does_not_fit"]
    )
  );
  assert.equal(
    matchingAssignmentVetoReason({ item: subsumptionItem, matchPairOrdinals: presentation.matchPairOrdinals }, grid(cells)),
    null
  );
});

// --- The phase -------------------------------------------------------------------------

function subject(
  item: MatchingItem,
  regenerate: MatchingAssignmentSubject["regenerate"]
): MatchingAssignmentSubject {
  const presentation = matchingAssignmentPresentation(item);
  return {
    request: {
      declaredDomain: "sentinel domain",
      node: { derivedNodeId: "node-1", canonicalLabel: "Node", aliases: [] },
      question: item.question,
      prompts: presentation.prompts,
      matches: presentation.matches,
      groundingPassages: [],
      siblings: []
    },
    item,
    matchPairOrdinals: presentation.matchPairOrdinals,
    regenerate
  };
}

test("a vetoed board is regenerated once and the SECOND verification judges the new board", async () => {
  const clean = matchingItem([
    { promptText: "First aspect", matchText: "Distinct one" },
    { promptText: "Second aspect", matchText: "Distinct two" },
    { promptText: "Third aspect", matchText: "Distinct three" }
  ]);
  const feedbacks: string[] = [];
  const judged: string[][] = [];
  const verifier: MatchingAssignmentVerificationPort = {
    model: "mock-matching-verifier",
    async verify(input) {
      judged.push(input.matches.map((match) => match.text));
      // Veto only the board carrying the subsuming answer; the regenerated one is clean.
      return input.prompts.flatMap((prompt) =>
        input.matches.map((match) => ({
          promptOrdinal: prompt.ordinal,
          matchOrdinal: match.ordinal,
          verdict: match.text === "Becoming cooler or saltier" ? "fits" as const : "unclear" as const,
          reason: "stub"
        }))
      );
    }
  };

  const outcomes = await verifyMatchingAssignments(
    [subject(subsumptionItem, async (feedback) => {
      feedbacks.push(feedback);
      return { ok: true, subject: subject(clean, async () => ({ ok: false, reason: "a third round must never happen" })) };
    })],
    { verifier }
  );

  assert.equal(judged.length, 2);
  assert.deepEqual(judged[1], ["Distinct one", "Distinct three", "Distinct two"], "the second pass judges the REGENERATED board");
  assert.equal(feedbacks.length, 1);
  assert.match(feedbacks[0], /matching assignment verification rejected the item:/);
  assert.equal(outcomes.length, 1);
  assert.ok(outcomes[0].admitted);
  assert.equal(outcomes[0].item.pairs[0].matchText, "Distinct one");
});

test("an unavailable judge admits the board unverified and can never reach the rule", async () => {
  // D6: matching's disposition is pass-through, the opposite of impostor's. `gateByJudgment`'s
  // invariant is what makes that safe rather than hopeful — a thrown judge cannot reach the veto.
  const verifier: MatchingAssignmentVerificationPort = {
    model: "mock-matching-verifier",
    async verify() { throw new Error("judge offline"); }
  };
  const outcomes = await verifyMatchingAssignments(
    [subject(subsumptionItem, async () => ({ ok: false, reason: "unreachable in this test" }))],
    { verifier }
  );
  assert.equal(outcomes.length, 1);
  assert.ok(outcomes[0].admitted);
  assert.equal(outcomes[0].item.studyItemId, "item-1");
});

test("outcomes stay index-aligned to the input when judgments resolve out of order", async () => {
  // The merge back into per-node results walks the pending subset by cursor, so a phase that
  // reordered its outputs would attach one node's verdict to another node's board.
  const boards = [0, 1, 2].map((index) =>
    matchingItem([
      { promptText: `Aspect ${index}a`, matchText: `Answer ${index}a` },
      { promptText: `Aspect ${index}b`, matchText: `Answer ${index}b` },
      { promptText: `Aspect ${index}c`, matchText: `Answer ${index}c` }
    ])
  );
  let call = 0;
  const verifier: MatchingAssignmentVerificationPort = {
    model: "mock-matching-verifier",
    async verify(input) {
      const index = call;
      call += 1;
      await new Promise((resolve) => setTimeout(resolve, index === 0 ? 12 : 0));
      const vetoed = input.matches.some((match) => match.text.startsWith("Answer 1"));
      return input.prompts.flatMap((prompt) =>
        input.matches.map((match) => ({
          promptOrdinal: prompt.ordinal,
          matchOrdinal: match.ordinal,
          verdict: vetoed && prompt.ordinal !== match.ordinal ? "fits" as const : "unclear" as const,
          reason: "stub"
        }))
      );
    }
  };

  const outcomes = await verifyMatchingAssignments(
    boards.map((board, index) => subject(board, async () => ({ ok: false, reason: `regeneration ${index} failed` }))),
    { verifier }
  );

  assert.ok(outcomes[0].admitted);
  assert.deepEqual(outcomes[1], { admitted: false, reason: "regeneration 1 failed" });
  assert.ok(outcomes[2].admitted);
});
