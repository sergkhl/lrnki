import {
  emptyLearnerStateV1,
  parseLearnerStateV1,
  type LearnerStateV1
} from "./learnerState";

export type StateRead =
  | Readonly<{ found: false }>
  | Readonly<{
      found: true;
      state: Readonly<LearnerStateV1>;
      stateVersion: bigint;
    }>;

export type StateCommit<Result> =
  | Readonly<{ found: false }>
  | Readonly<{
      found: true;
      committed: boolean;
      state: Readonly<LearnerStateV1>;
      stateVersion: bigint;
      result: Result;
    }>;

export type BoardLearnerState = Readonly<{
  learnerRef: string;
  displayName: string;
  state: Readonly<LearnerStateV1>;
  stateVersion: bigint;
}>;

export interface LearnerStateStore {
  read(learnerRef: string): Promise<StateRead>;

  transact<Result>(
    learnerRef: string,
    transition: (
      current: Readonly<LearnerStateV1>
    ) => {
      next: LearnerStateV1;
      result: Result;
    }
  ): Promise<StateCommit<Result>>;

  listBoardCohort(): Promise<BoardLearnerState[]>;
}

type MemoryLearner = {
  displayName: string;
  state: LearnerStateV1;
  stateVersion: bigint;
};

export type MemoryLearnerSeed = Readonly<{
  learnerRef: string;
  displayName: string;
  state?: unknown;
  stateVersion?: bigint;
}>;

function cloneState(state: Readonly<LearnerStateV1>): LearnerStateV1 {
  return parseLearnerStateV1(structuredClone(state));
}

// Test and local-composition adapter. A per-learner promise tail gives it the same
// serial transition semantics as SELECT ... FOR UPDATE without making the runtime aware
// of locks. The callback is invoked exactly once after the learner lock is acquired.
export class MemoryLearnerStateStore implements LearnerStateStore {
  readonly #learners = new Map<string, MemoryLearner>();
  readonly #tails = new Map<string, Promise<void>>();

  constructor(seeds: readonly MemoryLearnerSeed[] = []) {
    for (const seed of seeds) {
      this.register(seed);
    }
  }

  register(seed: MemoryLearnerSeed): void {
    if (this.#learners.has(seed.learnerRef)) {
      throw new Error(`learner ${seed.learnerRef} is already registered`);
    }
    this.#learners.set(seed.learnerRef, {
      displayName: seed.displayName,
      state: seed.state === undefined
        ? emptyLearnerStateV1()
        : parseLearnerStateV1(structuredClone(seed.state)),
      stateVersion: seed.stateVersion ?? 0n
    });
  }

  async read(learnerRef: string): Promise<StateRead> {
    return this.#withLearnerLock(learnerRef, () => {
      const learner = this.#learners.get(learnerRef);
      if (!learner) return { found: false };
      const state = cloneState(learner.state);
      return { found: true, state, stateVersion: learner.stateVersion };
    });
  }

  async transact<Result>(
    learnerRef: string,
    transition: (
      current: Readonly<LearnerStateV1>
    ) => { next: LearnerStateV1; result: Result }
  ): Promise<StateCommit<Result>> {
    return this.#withLearnerLock(learnerRef, () => {
      const learner = this.#learners.get(learnerRef);
      if (!learner) return { found: false };

      const current = cloneState(learner.state);
      const transitioned = transition(current);
      if (transitioned.next === current) {
        return {
          found: true,
          committed: false,
          state: current,
          stateVersion: learner.stateVersion,
          result: transitioned.result
        };
      }

      const next = parseLearnerStateV1(structuredClone(transitioned.next));
      learner.state = next;
      learner.stateVersion += 1n;
      return {
        found: true,
        committed: true,
        state: cloneState(next),
        stateVersion: learner.stateVersion,
        result: transitioned.result
      };
    });
  }

  async listBoardCohort(): Promise<BoardLearnerState[]> {
    const refs = [...this.#learners.keys()].sort();
    return Promise.all(
      refs.map((learnerRef) =>
        this.#withLearnerLock(learnerRef, () => {
          const learner = this.#learners.get(learnerRef);
          if (!learner) throw new Error(`learner ${learnerRef} disappeared`);
          return {
            learnerRef,
            displayName: learner.displayName,
            state: cloneState(learner.state),
            stateVersion: learner.stateVersion
          };
        })
      )
    );
  }

  async #withLearnerLock<Result>(learnerRef: string, operation: () => Result): Promise<Result> {
    const prior = this.#tails.get(learnerRef) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = prior.then(() => current);
    this.#tails.set(learnerRef, tail);
    await prior;
    try {
      return operation();
    } finally {
      release?.();
      if (this.#tails.get(learnerRef) === tail) {
        this.#tails.delete(learnerRef);
      }
    }
  }
}
