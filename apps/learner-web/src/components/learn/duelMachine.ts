// The Crystal Duel state machine (plan 2026-07-07-005, R9, KTD4): a hand-rolled PURE transition
// function over exhaustive discriminated unions, the house idiom (`activityProgress.ts`,
// `advanceMemory.ts`). The `DuelState`/`DuelEvent` types double as the mechanic's design
// description. Timers, grading calls, and rival simulation are EDGE EFFECTS that feed events in —
// this module holds no clock and no I/O, so it is fully replay-testable and the exhaustiveness of
// its switch is compiler-enforced (AE6). Illegal events (answering after the clock, double-start,
// advancing mid-question) are provably inert: the reducer returns the same state.

export type DuelOutcome = "win" | "loss" | "draw";

// Running tallies carried through every non-idle state. `time` is cumulative answer time in ms,
// the tie-breaker when correct counts match (R7).
type DuelTally = {
  questionCount: number;
  learnerCorrect: number;
  rivalCorrect: number;
  learnerTimeMs: number;
  rivalTimeMs: number;
};

export type DuelState =
  | { status: "idle" }
  | ({ status: "question"; index: number } & DuelTally)
  | ({ status: "reveal"; index: number; lastLearnerCorrect: boolean; lastRivalCorrect: boolean } & DuelTally)
  | ({ status: "complete"; outcome: DuelOutcome } & DuelTally);

export type DuelEvent =
  | { type: "START"; questionCount: number }
  // The learner answered (or the per-question timer fired). The edge effect supplies the rival's
  // simulated result and both answer times; `TIME_UP` is a learner miss at the full clock.
  | { type: "ANSWER"; correct: boolean; elapsedMs: number; rivalCorrect: boolean; rivalElapsedMs: number }
  | { type: "TIME_UP"; elapsedMs: number; rivalCorrect: boolean; rivalElapsedMs: number }
  | { type: "NEXT" };

// Most correct wins; a tie breaks on lower total answer time; identical time is a draw (R7).
export function decideDuelOutcome(tally: DuelTally): DuelOutcome {
  if (tally.learnerCorrect > tally.rivalCorrect) return "win";
  if (tally.learnerCorrect < tally.rivalCorrect) return "loss";
  if (tally.learnerTimeMs < tally.rivalTimeMs) return "win";
  if (tally.learnerTimeMs > tally.rivalTimeMs) return "loss";
  return "draw";
}

const INITIAL_TALLY = (questionCount: number): DuelTally => ({ questionCount, learnerCorrect: 0, rivalCorrect: 0, learnerTimeMs: 0, rivalTimeMs: 0 });

function foldAnswer(tally: DuelTally, learnerCorrect: boolean, rivalCorrect: boolean, learnerElapsedMs: number, rivalElapsedMs: number): DuelTally {
  return {
    questionCount: tally.questionCount,
    learnerCorrect: tally.learnerCorrect + (learnerCorrect ? 1 : 0),
    rivalCorrect: tally.rivalCorrect + (rivalCorrect ? 1 : 0),
    learnerTimeMs: tally.learnerTimeMs + learnerElapsedMs,
    rivalTimeMs: tally.rivalTimeMs + rivalElapsedMs
  };
}

function tallyOf(state: DuelState & { status: "question" | "reveal" }): DuelTally {
  return {
    questionCount: state.questionCount,
    learnerCorrect: state.learnerCorrect,
    rivalCorrect: state.rivalCorrect,
    learnerTimeMs: state.learnerTimeMs,
    rivalTimeMs: state.rivalTimeMs
  };
}

// The pure transition. Every (state, event) pair is total: unhandled combinations return the
// input state unchanged (inert), so no illegal sequence can corrupt the duel.
export function duelReduce(state: DuelState, event: DuelEvent): DuelState {
  switch (state.status) {
    case "idle":
      return event.type === "START" && event.questionCount > 0 ? { status: "question", index: 0, ...INITIAL_TALLY(event.questionCount) } : state;
    case "question": {
      if (event.type === "ANSWER" || event.type === "TIME_UP") {
        const learnerCorrect = event.type === "ANSWER" ? event.correct : false;
        const next = foldAnswer(tallyOf(state), learnerCorrect, event.rivalCorrect, event.elapsedMs, event.rivalElapsedMs);
        return { status: "reveal", index: state.index, lastLearnerCorrect: learnerCorrect, lastRivalCorrect: event.rivalCorrect, ...next };
      }
      return state;
    }
    case "reveal": {
      if (event.type === "NEXT") {
        const tally = tallyOf(state);
        const nextIndex = state.index + 1;
        return nextIndex >= state.questionCount
          ? { status: "complete", outcome: decideDuelOutcome(tally), ...tally }
          : { status: "question", index: nextIndex, ...tally };
      }
      return state;
    }
    case "complete":
      return state;
    default:
      return assertNever(state);
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled duel state: ${JSON.stringify(value)}`);
}
