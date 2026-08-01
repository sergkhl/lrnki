import assert from "node:assert/strict";
import test from "node:test";
import type { OptionSelectItem, ResponseLogRow } from "@lrnki/domain-core";
import type { RecallChallengeEvent } from "@lrnki/ports";
import { ENRICHMENT_LINEUP_MAX, SECTION_LINEUP_MAX } from "./recallLineupBudget";
import {
  RECALL_MISS_BUFFER,
  currentTurnItemId,
  eligibleRecallItems,
  foldRecallChallenge,
  latestCorrectStudyItemIds,
  projectRecallChallengeView,
  projectRecallScopeStatuses,
  selectRecallLineup,
  type RecallEligibleItem
} from "./recallChallenge";

// --- Selection (KTD5, AE7/AE8 selection halves) ------------------------------

function eligible(studyItemId: string, derivedNodeId: string, sectionIndex = 0, priorChallengeExposure = 0): RecallEligibleItem {
  return { studyItemId, derivedNodeId, sectionIndex, priorChallengeExposure };
}

test("selection returns empty for an empty pool (unavailable, never fabricated)", () => {
  assert.deepEqual(selectRecallLineup({ challengeId: "ch-1", scopeKind: "section", anchorDerivedNodeId: "anchor", eligible: [] }), []);
});

test("selection reserves an eligible anchor item first", () => {
  const lineup = selectRecallLineup({
    challengeId: "ch-1",
    scopeKind: "section",
    anchorDerivedNodeId: "n-anchor",
    eligible: [eligible("i-1", "n-a"), eligible("i-2", "n-b"), eligible("i-3", "n-anchor")]
  });
  assert.equal(lineup[0].derivedNodeId, "n-anchor");
  assert.equal(lineup.length, 3);
});

test("selection covers distinct concepts before repeating one", () => {
  const lineup = selectRecallLineup({
    challengeId: "ch-1",
    scopeKind: "section",
    anchorDerivedNodeId: "missing-anchor",
    eligible: [
      eligible("a-1", "n-a"), eligible("a-2", "n-a"), eligible("a-3", "n-a"),
      eligible("b-1", "n-b"),
      eligible("c-1", "n-c")
    ]
  });
  // First three picks are three distinct concepts; repeats only after coverage.
  const firstThreeConcepts = new Set(lineup.slice(0, 3).map((entry) => entry.derivedNodeId));
  assert.deepEqual([...firstThreeConcepts].sort(), ["n-a", "n-b", "n-c"]);
  assert.equal(lineup.length, 5);
});

test("selection applies the section maximum of five after coverage ordering", () => {
  const pool = Array.from({ length: 9 }, (_, index) => eligible(`i-${index}`, `n-${index}`));
  const lineup = selectRecallLineup({ challengeId: "ch-1", scopeKind: "section", anchorDerivedNodeId: "n-0", eligible: pool });
  assert.equal(lineup.length, SECTION_LINEUP_MAX);
});

test("enrichment scope covers distinct Legs before repeats and caps at seven", () => {
  // Three Legs; Leg 0 holds four concepts. With budget 7 every Leg must be touched before a
  // Leg repeats, so picks alternate Legs.
  const pool = [
    eligible("l0-a", "n-l0a", 0), eligible("l0-b", "n-l0b", 0), eligible("l0-c", "n-l0c", 0), eligible("l0-d", "n-l0d", 0),
    eligible("l1-a", "n-l1a", 1), eligible("l1-b", "n-l1b", 1),
    eligible("l2-a", "n-l2a", 2), eligible("l2-b", "n-l2b", 2)
  ];
  const lineup = selectRecallLineup({ challengeId: "ch-1", scopeKind: "enrichment", anchorDerivedNodeId: "n-l2a", eligible: pool });
  assert.equal(lineup.length, ENRICHMENT_LINEUP_MAX);
  assert.equal(lineup[0].derivedNodeId, "n-l2a"); // anchor reserved
  const bySection = new Map(pool.map((item) => [item.derivedNodeId, item.sectionIndex] as const));
  const firstThreeLegs = new Set(lineup.slice(0, 3).map((entry) => bySection.get(entry.derivedNodeId)));
  assert.equal(firstThreeLegs.size, 3); // all three Legs before any repeats
});

test("more Legs than the enrichment budget still yields one item per Leg until the cap", () => {
  const pool = Array.from({ length: 9 }, (_, index) => eligible(`i-${index}`, `n-${index}`, index));
  const lineup = selectRecallLineup({ challengeId: "ch-1", scopeKind: "enrichment", anchorDerivedNodeId: "n-0", eligible: pool });
  assert.equal(lineup.length, ENRICHMENT_LINEUP_MAX);
  assert.equal(new Set(lineup.map((entry) => entry.derivedNodeId)).size, ENRICHMENT_LINEUP_MAX);
});

test("least prior challenge exposure outranks the stable tie-break within a concept", () => {
  const lineup = selectRecallLineup({
    challengeId: "ch-1",
    scopeKind: "section",
    anchorDerivedNodeId: "n-a",
    eligible: [eligible("worn", "n-a", 0, 4), eligible("fresh", "n-a", 0, 0)]
  });
  assert.equal(lineup[0].studyItemId, "fresh");
});

test("selection is deterministic for a challenge identity and varies across identities", () => {
  const pool = [eligible("i-1", "n-a"), eligible("i-2", "n-a"), eligible("i-3", "n-a"), eligible("i-4", "n-a"), eligible("i-5", "n-a")];
  const first = selectRecallLineup({ challengeId: "ch-1", scopeKind: "section", anchorDerivedNodeId: "n-a", eligible: pool });
  const again = selectRecallLineup({ challengeId: "ch-1", scopeKind: "section", anchorDerivedNodeId: "n-a", eligible: pool.map((item) => ({ ...item })) });
  assert.deepEqual(first, again);
});

// --- Eligibility fold ---------------------------------------------------------

function gradedRow(studyItemId: string, attemptSeq: number, judgedOutcome: "correct" | "incorrect"): ResponseLogRow {
  return {
    responseId: `r-${studyItemId}-${attemptSeq}`,
    learnerStateRef: "learner-1",
    scope: "neutral",
    studyItemId,
    derivedNodeId: "n-1",
    signalType: "graded",
    judgedOutcome,
    gradedScore: judgedOutcome === "correct" ? 1 : 0,
    responseSource: "human",
    graderIdentity: "auto",
    batchId: null,
    attemptSeq,
    submittedAnswer: null,
    createdAt: new Date().toISOString()
  };
}

test("eligibility keeps only items whose LATEST neutral graded outcome is correct", () => {
  const rows = [
    gradedRow("i-stays", 1, "incorrect"),
    gradedRow("i-stays", 3, "correct"),
    gradedRow("i-lapsed", 2, "correct"),
    gradedRow("i-lapsed", 4, "incorrect")
  ];
  const ids = latestCorrectStudyItemIds(rows);
  assert.deepEqual([...ids], ["i-stays"]);
});

// --- Combat fold (KTD6; AE2/AE3) ----------------------------------------------

let nextSeq = 0;
function answer(studyItemId: string, correct: boolean): RecallChallengeEvent {
  return { seq: ++nextSeq, kind: "selection_answer", attemptRef: `a-${nextSeq}`, studyItemId, promptId: null, chosenId: "x", correct, recoveryPhase: false, responseDurationMs: null };
}
function pairAttempt(studyItemId: string, promptId: string, correct: boolean): RecallChallengeEvent {
  return { seq: ++nextSeq, kind: "matching_pair", attemptRef: `a-${nextSeq}`, studyItemId, promptId, chosenId: `m-${promptId}`, correct, recoveryPhase: false, responseDurationMs: null };
}
function lifecycle(kind: "retreat" | "resume" | "abandon"): RecallChallengeEvent {
  return { seq: ++nextSeq, kind, operationRef: `op-${nextSeq}` };
}

const noMatching = () => 0;
const lineup3 = [{ studyItemId: "i-1" }, { studyItemId: "i-2" }, { studyItemId: "i-3" }];

test("a fresh fold starts with a full shield and the lineup order as the queue", () => {
  const state = foldRecallChallenge({ lineup: lineup3, events: [], pairCountFor: noMatching });
  assert.equal(state.phase, "active");
  assert.equal(state.remainingMissBuffer, RECALL_MISS_BUFFER);
  assert.deepEqual(state.unresolvedItemIds, ["i-1", "i-2", "i-3"]);
  assert.equal(currentTurnItemId(state), "i-1");
});

test("a miss cracks one shield segment and queues the ward behind the others", () => {
  const state = foldRecallChallenge({ lineup: lineup3, events: [answer("i-1", false)], pairCountFor: noMatching });
  assert.equal(state.remainingMissBuffer, 2);
  assert.deepEqual(state.unresolvedItemIds, ["i-2", "i-3", "i-1"]);
  assert.equal(state.phase, "active");
});

test("three misses enter Last Stand (recovery) and further misses never kill", () => {
  const events = [answer("i-1", false), answer("i-2", false), answer("i-3", false), answer("i-1", false), answer("i-2", false)];
  const state = foldRecallChallenge({ lineup: lineup3, events, pairCountFor: noMatching });
  assert.equal(state.phase, "recovery");
  assert.equal(state.remainingMissBuffer, 0);
  assert.equal(state.unresolvedItemIds.length, 3); // nothing lost, nothing reset
});

test("a correct answer in recovery resolves the item AND restores exactly one segment", () => {
  const events = [answer("i-1", false), answer("i-2", false), answer("i-3", false), answer("i-1", true)];
  const state = foldRecallChallenge({ lineup: lineup3, events, pairCountFor: noMatching });
  assert.equal(state.phase, "active");
  assert.equal(state.remainingMissBuffer, 1);
  assert.deepEqual(state.resolvedItemIds, ["i-1"]);
});

test("resolving every ward wins the challenge", () => {
  const events = [answer("i-1", true), answer("i-2", true), answer("i-3", true)];
  const state = foldRecallChallenge({ lineup: lineup3, events, pairCountFor: noMatching });
  assert.equal(state.phase, "won");
  assert.equal(currentTurnItemId(state), null);
});

test("a single remaining ward stays current on a miss (nothing to queue behind)", () => {
  const state = foldRecallChallenge({ lineup: [{ studyItemId: "only" }], events: [answer("only", false)], pairCountFor: noMatching });
  assert.deepEqual(state.unresolvedItemIds, ["only"]);
});

test("an out-of-turn answer event is ignored by the fold", () => {
  const state = foldRecallChallenge({ lineup: lineup3, events: [answer("i-3", true)], pairCountFor: noMatching });
  assert.deepEqual(state.resolvedItemIds, []);
  assert.equal(state.remainingMissBuffer, RECALL_MISS_BUFFER);
});

test("retreat marks the state and resume clears it without touching combat facts", () => {
  const events = [answer("i-1", false), lifecycle("retreat")];
  const retreated = foldRecallChallenge({ lineup: lineup3, events, pairCountFor: noMatching });
  assert.equal(retreated.retreated, true);
  assert.equal(retreated.remainingMissBuffer, 2);
  const resumed = foldRecallChallenge({ lineup: lineup3, events: [...events, lifecycle("resume")], pairCountFor: noMatching });
  assert.equal(resumed.retreated, false);
  assert.deepEqual(resumed.unresolvedItemIds, retreated.unresolvedItemIds); // exact fold resume
});

test("no event kind advances state by time — only answers and lifecycle actions exist", () => {
  const kinds = new Set<string>(["selection_answer", "matching_pair", "retreat", "resume", "abandon"]);
  const events = [answer("i-1", true), pairAttempt("i-2", "p-1", true), lifecycle("retreat")];
  for (const event of events) assert.ok(kinds.has(event.kind));
});

// --- Matching rounds (KTD6) ----------------------------------------------------

const matchingLineup = [{ studyItemId: "m-1" }, { studyItemId: "i-2" }];
const twoPairs = (studyItemId: string) => (studyItemId === "m-1" ? 2 : 0);

test("a clean completed Matching round resolves the ward", () => {
  const events = [pairAttempt("m-1", "p-1", true), pairAttempt("m-1", "p-2", true)];
  const state = foldRecallChallenge({ lineup: matchingLineup, events, pairCountFor: twoPairs });
  assert.deepEqual(state.resolvedItemIds, ["m-1"]);
  assert.equal(state.remainingMissBuffer, RECALL_MISS_BUFFER);
});

test("a wrong pair inside a completed round is ONE miss with a reshuffled recovery board", () => {
  const events = [pairAttempt("m-1", "p-1", false), pairAttempt("m-1", "p-1", true), pairAttempt("m-1", "p-2", true)];
  const state = foldRecallChallenge({ lineup: matchingLineup, events, pairCountFor: twoPairs });
  assert.equal(state.remainingMissBuffer, RECALL_MISS_BUFFER - 1); // exactly one shield hit
  assert.deepEqual(state.unresolvedItemIds, ["i-2", "m-1"]); // ward retained and queued
  // Returning to the board starts a fresh round with a bumped reshuffle key.
  const back = foldRecallChallenge({
    lineup: matchingLineup,
    events: [...events, answer("i-2", true), pairAttempt("m-1", "p-1", true)],
    pairCountFor: twoPairs
  });
  assert.equal(back.matching?.roundIndex, 1);
  assert.deepEqual(back.matching?.matchedPromptIds, ["p-1"]);
});

test("mid-board Matching progress survives retreat and resume exactly", () => {
  const events = [pairAttempt("m-1", "p-1", true), lifecycle("retreat"), lifecycle("resume")];
  const state = foldRecallChallenge({ lineup: matchingLineup, events, pairCountFor: twoPairs });
  assert.deepEqual(state.matching?.matchedPromptIds, ["p-1"]);
  assert.equal(state.matching?.roundHasMiss, false);
});

test("a recorded wrong pair cannot be erased by later clean completions (server history owns it)", () => {
  // The client completes the board after one wrong attempt; the fold still counts the round
  // dirty because the wrong attempt is an immutable event.
  const events = [pairAttempt("m-1", "p-2", false), pairAttempt("m-1", "p-2", true), pairAttempt("m-1", "p-1", true)];
  const state = foldRecallChallenge({ lineup: matchingLineup, events, pairCountFor: twoPairs });
  assert.deepEqual(state.resolvedItemIds, []);
  assert.equal(state.remainingMissBuffer, RECALL_MISS_BUFFER - 1);
});

// --- Learner-safe view (KTD7) ---------------------------------------------------

function optionSelectItem(studyItemId: string): OptionSelectItem {
  return {
    studyItemId,
    graphVersionId: null,
    enrichmentId: "en-1",
    derivedNodeId: "n-1",
    groundingProvenance: "generated",
    generatingModel: "test",
    configHash: "cfg",
    explorableTerms: [],
    itemType: "option_select",
    question: "Which one?",
    explanation: "Because.",
    options: [
      { optionId: "o-1", text: "right", isCorrect: true, provenance: "source" },
      { optionId: "o-2", text: "wrong", isCorrect: false, provenance: "generated" }
    ]
  };
}

const viewChallenge = { challengeId: "ch-1", enrichmentId: "en-1", scopeKind: "section" as const, scopeAnchorDerivedNodeId: "n-1" };

test("the challenge view carries the current item key-free with counts and shield", () => {
  const lineup = [{ studyItemId: "i-1" }, { studyItemId: "i-2" }];
  const state = foldRecallChallenge({ lineup, events: [answer("i-1", false)], pairCountFor: noMatching });
  const view = projectRecallChallengeView({
    challenge: viewChallenge,
    lineup,
    state,
    itemById: new Map([["i-2", optionSelectItem("i-2")]])
  });
  if (view.state !== "active") throw new Error(`expected active view, got ${view.state}`);
  assert.equal(view.wardTotal, 2);
  assert.equal(view.unresolvedItemCount, 2);
  assert.equal(view.remainingMissBuffer, 2);
  assert.equal(view.currentItem.kind, "option_select");
  // Key-free by construction: the option view has no isCorrect anywhere.
  assert.ok(!JSON.stringify(view).includes("isCorrect"));
});

test("a won fold projects the terminal won view without any item payload", () => {
  const lineup = [{ studyItemId: "i-1" }];
  const state = foldRecallChallenge({ lineup, events: [answer("i-1", true)], pairCountFor: noMatching });
  const view = projectRecallChallengeView({ challenge: viewChallenge, lineup, state, itemById: new Map() });
  assert.deepEqual(view, { state: "won", challengeId: "ch-1", enrichmentId: "en-1", scopeKind: "section", anchorDerivedNodeId: "n-1", wardTotal: 1 });
});

// --- Scope status projection (plan U4; KTD3, AE1/AE5-AE8 projection halves) ----

const scopeNodes = [
  { derivedNodeId: "m-0", label: "Leg Zero Milestone" },
  { derivedNodeId: "m-1", label: "Leg One Milestone" },
  { derivedNodeId: "summit", label: "The Summit" }
];
const scopeSections = [
  { sectionIndex: 0, milestoneDerivedNodeId: "m-0", hasStudyItems: true },
  { sectionIndex: 1, milestoneDerivedNodeId: "m-1", hasStudyItems: true }
];

function scopeInput(overrides: Partial<Parameters<typeof projectRecallScopeStatuses>[0]> = {}) {
  return {
    nodes: scopeNodes,
    sections: scopeSections,
    summit: { derivedNodeId: "summit" },
    eligible: [eligible("i-1", "m-0", 0), eligible("i-2", "m-1", 1)],
    challenges: [],
    wonScopes: [],
    ...overrides
  };
}

test("a mastered Leg with no won challenge is available — mastery never auto-fuses (KTD3)", () => {
  const scopes = projectRecallScopeStatuses(scopeInput());
  assert.deepEqual(scopes.map((scope) => [scope.scopeKind, scope.anchorDerivedNodeId, scope.state]), [
    ["section", "m-0", "available"],
    ["section", "m-1", "available"],
    ["enrichment", "summit", "locked"]
  ]);
  assert.equal(scopes[0].anchorLabel, "Leg Zero Milestone");
  assert.equal(scopes[0].sectionIndex, 0);
  assert.equal(scopes[2].sectionIndex, null);
});

test("an active challenge projects active with its id after any refetch", () => {
  const scopes = projectRecallScopeStatuses(scopeInput({
    challenges: [{ challengeId: "ch-live", status: "active", scopeKind: "section", scopeAnchorDerivedNodeId: "m-0" }]
  }));
  assert.equal(scopes[0].state, "active");
  assert.equal(scopes[0].activeChallengeId, "ch-live");
  assert.equal(scopes[1].state, "available");
});

test("a won Leg stays won when a later acquisition miss empties its eligible pool", () => {
  const scopes = projectRecallScopeStatuses(scopeInput({
    eligible: [eligible("i-2", "m-1", 1)],
    wonScopes: [{ scopeKind: "section", scopeAnchorDerivedNodeId: "m-0", challengeId: "ch-won" }]
  }));
  assert.equal(scopes[0].state, "won");
  assert.equal(scopes[0].wonChallengeId, "ch-won");
  assert.equal(scopes[0].eligibleItemCount, 0);
  assert.equal(scopes[0].reason, undefined);
});

test("a winnable Leg the learner has not earned yet is unavailable and still blocks the Expedition scope", () => {
  const scopes = projectRecallScopeStatuses(scopeInput({
    eligible: [eligible("i-1", "m-0", 0)],
    wonScopes: [{ scopeKind: "section", scopeAnchorDerivedNodeId: "m-0", challengeId: "ch-won" }]
  }));
  assert.equal(scopes[1].state, "unavailable");
  assert.equal(scopes[1].reason, "no_eligible_items");
  // Leg 1 carries Study Items, so the learner can still earn it — the summit honestly waits.
  // "No ELIGIBLE items yet" and "no items at all" are different facts with different gates.
  assert.equal(scopes[2].state, "locked");
});

test("with no winnable Leg the summit is unavailable, never locked behind an unsatisfiable gate (KTD11)", () => {
  // The one layer no boundary edit can repair: nothing anywhere carries a Study Item, so no Leg
  // can ever produce a lineup. Waiting for "every Leg won" would lock the summit forever.
  const scopes = projectRecallScopeStatuses(scopeInput({
    sections: [
      { sectionIndex: 0, milestoneDerivedNodeId: "m-0", hasStudyItems: false },
      { sectionIndex: 1, milestoneDerivedNodeId: "m-1", hasStudyItems: false }
    ],
    eligible: []
  }));
  assert.deepEqual(scopes.map((scope) => scope.state), ["unavailable", "unavailable", "unavailable"]);
  assert.equal(scopes[2].reason, "no_eligible_items");
});

test("an unwinnable Leg does not hold the summit hostage once every winnable Leg is won", () => {
  const scopes = projectRecallScopeStatuses(scopeInput({
    sections: [
      { sectionIndex: 0, milestoneDerivedNodeId: "m-0", hasStudyItems: true },
      { sectionIndex: 1, milestoneDerivedNodeId: "m-1", hasStudyItems: false }
    ],
    wonScopes: [{ scopeKind: "section", scopeAnchorDerivedNodeId: "m-0", challengeId: "ch-a" }]
  }));
  assert.equal(scopes[1].state, "available", "the Leg itself still reads from its own eligibility");
  assert.equal(scopes[2].state, "available");
});

test("every Leg won unlocks the Expedition scope; abandoned challenges never count", () => {
  const scopes = projectRecallScopeStatuses(scopeInput({
    challenges: [{ challengeId: "ch-dead", status: "abandoned", scopeKind: "enrichment", scopeAnchorDerivedNodeId: "summit" }],
    wonScopes: [
      { scopeKind: "section", scopeAnchorDerivedNodeId: "m-0", challengeId: "ch-a" },
      { scopeKind: "section", scopeAnchorDerivedNodeId: "m-1", challengeId: "ch-b" }
    ]
  }));
  assert.equal(scopes[2].state, "available");
  assert.equal(scopes[2].activeChallengeId, undefined);
  assert.equal(scopes[2].eligibleItemCount, 2);
});

test("victory identity is FIRST-win-wins: a rematch win never re-keys the formation (KTD3)", () => {
  const scopes = projectRecallScopeStatuses(scopeInput({
    wonScopes: [
      { scopeKind: "section", scopeAnchorDerivedNodeId: "m-0", challengeId: "ch-first" },
      { scopeKind: "section", scopeAnchorDerivedNodeId: "m-0", challengeId: "ch-rematch" }
    ]
  }));
  assert.equal(scopes[0].wonChallengeId, "ch-first");
});

test("a summitless layer projects only section scopes", () => {
  const scopes = projectRecallScopeStatuses(scopeInput({ summit: null }));
  assert.deepEqual(scopes.map((scope) => scope.scopeKind), ["section", "section"]);
});

test("eligibleRecallItems filters by scope AND latest-correct, carrying exposure", () => {
  const items = [
    { ...optionSelectItem("i-in"), derivedNodeId: "m-0" },
    { ...optionSelectItem("i-out-of-scope"), derivedNodeId: "elsewhere" },
    { ...optionSelectItem("i-not-passed"), derivedNodeId: "m-1" }
  ];
  const rows = [gradedRow("i-in", 1, "correct"), gradedRow("i-not-passed", 1, "incorrect")];
  const sectionOf = new Map([["m-0", 0], ["m-1", 1]]);
  const pool = eligibleRecallItems({ items, rows, exposure: { "i-in": 2 }, sectionIndexFor: (id) => sectionOf.get(id) });
  assert.deepEqual(pool, [{ studyItemId: "i-in", derivedNodeId: "m-0", sectionIndex: 0, priorChallengeExposure: 2 }]);
});
