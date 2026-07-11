import assert from "node:assert/strict";
import { test } from "@jest/globals";
import { decideDuelOutcome, duelReduce, type DuelEvent, type DuelState } from "./duelMachine";

const START: DuelEvent = { type: "START", questionCount: 2 };
const ANSWER_OK: DuelEvent = { type: "ANSWER", correct: true, elapsedMs: 1000, rivalCorrect: false, rivalElapsedMs: 1500 };
const ANSWER_MISS: DuelEvent = { type: "ANSWER", correct: false, elapsedMs: 2000, rivalCorrect: true, rivalElapsedMs: 900 };
const TIME_UP: DuelEvent = { type: "TIME_UP", elapsedMs: 15000, rivalCorrect: true, rivalElapsedMs: 4000 };
const NEXT: DuelEvent = { type: "NEXT" };
const ALL_EVENTS: DuelEvent[] = [START, ANSWER_OK, ANSWER_MISS, TIME_UP, NEXT];

// Representative state of each status, for the state × event sweep (AE6).
const STATES: DuelState[] = [
  { status: "idle" },
  { status: "question", index: 0, questionCount: 2, learnerCorrect: 0, rivalCorrect: 0, learnerTimeMs: 0, rivalTimeMs: 0 },
  { status: "reveal", index: 0, questionCount: 2, learnerCorrect: 1, rivalCorrect: 0, learnerTimeMs: 1000, rivalTimeMs: 1500, lastLearnerCorrect: true, lastRivalCorrect: false },
  { status: "complete", outcome: "win", questionCount: 2, learnerCorrect: 2, rivalCorrect: 1, learnerTimeMs: 2000, rivalTimeMs: 3000 }
];

test("every state × event pair is total and never throws; illegal pairs are inert (AE6)", () => {
  for (const state of STATES) {
    for (const event of ALL_EVENTS) {
      const next = duelReduce(state, event);
      assert.ok(next, "the reducer returns a state for every pair");
      // Legal transitions: idle+START, question+ANSWER/TIME_UP, reveal+NEXT. Everything else inert.
      const legal =
        (state.status === "idle" && event.type === "START") ||
        (state.status === "question" && (event.type === "ANSWER" || event.type === "TIME_UP")) ||
        (state.status === "reveal" && event.type === "NEXT");
      if (!legal) assert.deepEqual(next, state, `${state.status} + ${event.type} must be inert`);
    }
  }
});

test("a full duel plays idle → question → reveal → question → reveal → complete", () => {
  let state = duelReduce({ status: "idle" }, START);
  assert.equal(state.status, "question");
  state = duelReduce(state, ANSWER_OK); // learner right, rival wrong
  assert.equal(state.status, "reveal");
  state = duelReduce(state, NEXT);
  assert.equal(state.status, "question");
  state = duelReduce(state, ANSWER_MISS); // learner wrong, rival right → 1–1, times decide
  assert.equal(state.status, "reveal");
  state = duelReduce(state, NEXT);
  assert.equal(state.status, "complete");
  assert.equal(state.status === "complete" && state.learnerCorrect, 1);
  assert.equal(state.status === "complete" && state.rivalCorrect, 1);
});

test("answering after the clock (TIME_UP) or double-starting is provably inert", () => {
  const question: DuelState = { status: "question", index: 0, questionCount: 1, learnerCorrect: 0, rivalCorrect: 0, learnerTimeMs: 0, rivalTimeMs: 0 };
  const afterTimeUp = duelReduce(question, TIME_UP);
  assert.equal(afterTimeUp.status, "reveal");
  assert.deepEqual(duelReduce(afterTimeUp, ANSWER_OK), afterTimeUp, "no answer is accepted after the timer resolved the question");
  assert.deepEqual(duelReduce(question, START), question, "a second START never restarts an in-flight duel");
});

test("decideDuelOutcome: most correct wins, tie breaks on lower total time, equal time draws (R7)", () => {
  assert.equal(decideDuelOutcome({ questionCount: 5, learnerCorrect: 3, rivalCorrect: 2, learnerTimeMs: 9, rivalTimeMs: 1 }), "win");
  assert.equal(decideDuelOutcome({ questionCount: 5, learnerCorrect: 2, rivalCorrect: 4, learnerTimeMs: 1, rivalTimeMs: 9 }), "loss");
  assert.equal(decideDuelOutcome({ questionCount: 5, learnerCorrect: 3, rivalCorrect: 3, learnerTimeMs: 100, rivalTimeMs: 200 }), "win");
  assert.equal(decideDuelOutcome({ questionCount: 5, learnerCorrect: 3, rivalCorrect: 3, learnerTimeMs: 200, rivalTimeMs: 100 }), "loss");
  assert.equal(decideDuelOutcome({ questionCount: 5, learnerCorrect: 3, rivalCorrect: 3, learnerTimeMs: 100, rivalTimeMs: 100 }), "draw");
});
