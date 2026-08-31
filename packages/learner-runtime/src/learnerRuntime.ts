import type { QualifiedCatalog } from "./contentQualifier";
import { applyLearnerCommand } from "./runtimeTransition";
import {
  buildLeaderboardView,
  previousWeekPodiumAward
} from "./leaderboard";
import {
  parseLearnerStateV1,
  type CommandReceipt,
  type LearnerStateV1
} from "./learnerState";
import type { LearnerStateStore } from "./learnerStateStore";
import {
  projectCatalogView,
  projectExpeditionView,
  projectGuardianChallenge,
  projectJournal
} from "./runtimeProjection";
import type {
  JournalView,
  LearnerCommand,
  LearnerReadResult,
  LearnerRuntime,
  LearnerTransitionResult,
  LearnerView
} from "./runtimeTypes";
import {
  buildRuntimeCatalog,
  deterministicId,
  stableIdentity,
  type RuntimeCatalog,
  type RuntimeExpedition
} from "./runtimeContent";

export type LearnerRuntimeDependencies = Readonly<{
  catalog: QualifiedCatalog;
  stateStore: LearnerStateStore;
  now?: () => Date;
}>;

type InternalTransition =
  | Readonly<{ kind: "applied"; receipt: CommandReceipt }>
  | Readonly<{ kind: "duplicate"; receipt: CommandReceipt }>
  | Readonly<{ kind: "stale" }>
  | Readonly<{ kind: "content_changed" }>
  | Readonly<{
      kind: "refused";
      reason: Extract<LearnerTransitionResult, { status: "refused" }>["reason"];
    }>;

function contentChanged(
  expedition: RuntimeExpedition,
  state: Readonly<Parameters<typeof projectJournal>[1]>
): boolean {
  const journey = state.expeditions[expedition.document.key];
  return Boolean(journey && journey.contentRevision !== expedition.revision);
}

function viewForEffect(input: {
  catalog: RuntimeCatalog;
  expedition: RuntimeExpedition;
  state: Readonly<Parameters<typeof projectJournal>[1]>;
  receipt: CommandReceipt;
}): Extract<LearnerView, { kind: "journal" | "expedition" | "guardian" }> {
  const effect = input.receipt.effect;
  if (
    effect.challengeId &&
    effect.kind !== "guardian_abandoned"
  ) {
    const guardian = projectGuardianChallenge(
      input.expedition,
      input.state,
      effect.challengeId
    );
    if (guardian) return guardian;
  }
  if (input.state.expeditions[input.expedition.document.key]) {
    return projectExpeditionView(input.expedition, input.state);
  }
  return projectJournal(input.catalog, input.state);
}

function journalResult(
  catalog: RuntimeCatalog,
  state: Readonly<Parameters<typeof projectJournal>[1]>,
  stateVersion: bigint
): { stateVersion: bigint; view: JournalView } {
  return { stateVersion, view: projectJournal(catalog, state) };
}

export function createLearnerRuntime(
  dependencies: LearnerRuntimeDependencies
): LearnerRuntime {
  const catalog = buildRuntimeCatalog(dependencies.catalog);
  const now = dependencies.now ?? (() => new Date());
  const stateStore = dependencies.stateStore;

  async function readLeaderboard(
    learnerRef: string,
    readStateVersion: bigint
  ): Promise<LearnerReadResult> {
    let cohort = await stateStore.listBoardCohort();
    const viewer = cohort.find((candidate) => candidate.learnerRef === learnerRef);
    if (!viewer) return { status: "learner_not_found" };
    let stateVersion = viewer.stateVersion ?? readStateVersion;
    let podiumEarnedForPreviousWeek = false;
    const readAt = now();
    const podium = previousWeekPodiumAward({
      catalog,
      cohort,
      viewerRef: learnerRef,
      now: readAt
    });
    if (podium) {
      const awardedAt = readAt.toISOString();
      const committed = await stateStore.transact(learnerRef, (current) => {
        if (
          current.awards.some(
            (award) =>
              award.type === "weekly_podium" && award.dedupeKey === podium.dedupeKey
          )
        ) {
          return { next: current as LearnerStateV1, result: false };
        }
        const next = structuredClone(current);
        next.awards.push({ ...podium, awardedAt });
        return { next: parseLearnerStateV1(next), result: true };
      });
      if (!committed.found) return { status: "learner_not_found" };
      stateVersion = committed.stateVersion;
      podiumEarnedForPreviousWeek = committed.result;
      cohort = cohort.map((candidate) =>
        candidate.learnerRef === learnerRef
          ? {
              ...candidate,
              state: committed.state,
              stateVersion: committed.stateVersion
            }
          : candidate
      );
    }
    return {
      status: "ok",
      stateVersion,
      view: buildLeaderboardView({
        catalog,
        cohort,
        viewerRef: learnerRef,
        now: readAt,
        podiumEarnedForPreviousWeek
      })
    };
  }

  return {
    async read(learnerRef, query): Promise<LearnerReadResult> {
      const loaded = await stateStore.read(learnerRef);
      if (!loaded.found) return { status: "learner_not_found" };
      const { state, stateVersion } = loaded;

      if (query.kind === "journal") {
        return {
          status: "ok",
          stateVersion,
          view: projectJournal(catalog, state)
        };
      }
      if (query.kind === "catalog") {
        return {
          status: "ok",
          stateVersion,
          view: projectCatalogView(catalog, state)
        };
      }
      if (query.kind === "leaderboard") {
        return readLeaderboard(learnerRef, stateVersion);
      }

      const expedition = catalog.expeditions.get(query.expeditionKey);
      if (!expedition || !state.expeditions[query.expeditionKey]) {
        return { status: "not_found", stateVersion, resource: "expedition" };
      }
      if (contentChanged(expedition, state)) {
        return {
          status: "content_changed",
          expeditionKey: query.expeditionKey,
          ...journalResult(catalog, state, stateVersion)
        };
      }
      if (query.kind === "expedition") {
        return {
          status: "ok",
          stateVersion,
          view: projectExpeditionView(expedition, state)
        };
      }
      const guardian = projectGuardianChallenge(
        expedition,
        state,
        query.challengeId
      );
      return guardian
        ? { status: "ok", stateVersion, view: guardian }
        : { status: "not_found", stateVersion, resource: "guardian" };
    },

    async dispatch(learnerRef, envelope): Promise<LearnerTransitionResult> {
      const loaded = await stateStore.read(learnerRef);
      if (!loaded.found) return { status: "learner_not_found" };
      if (
        envelope.requestId.trim().length === 0 ||
        envelope.expectedStateVersion < 0n
      ) {
        return {
          status: "refused",
          reason: "invalid_command",
          ...journalResult(catalog, loaded.state, loaded.stateVersion)
        };
      }
      const command: LearnerCommand = envelope.command;
      const expedition = catalog.expeditions.get(command.expeditionKey);
      if (!expedition) {
        return {
          status: "not_found",
          stateVersion: loaded.stateVersion,
          resource: "expedition"
        };
      }
      if (contentChanged(expedition, loaded.state)) {
        return {
          status: "content_changed",
          expeditionKey: expedition.document.key,
          ...journalResult(catalog, loaded.state, loaded.stateVersion)
        };
      }

      const commandFingerprint = deterministicId(stableIdentity(command));
      const priorReceipt = loaded.state.commandReceipts.find(
        (receipt) => receipt.requestId === envelope.requestId
      );
      if (priorReceipt) {
        if (priorReceipt.commandFingerprint !== commandFingerprint) {
          return {
            status: "refused",
            reason: "request_id_reused",
            ...journalResult(catalog, loaded.state, loaded.stateVersion)
          };
        }
        return {
          status: "applied",
          replayed: true,
          stateVersion: loaded.stateVersion,
          committedStateVersion: BigInt(priorReceipt.committedStateVersion),
          effect: priorReceipt.effect,
          view: viewForEffect({
            catalog,
            expedition,
            state: loaded.state,
            receipt: priorReceipt
          })
        };
      }
      if (envelope.expectedStateVersion !== loaded.stateVersion) {
        return {
          status: "stale",
          ...journalResult(catalog, loaded.state, loaded.stateVersion)
        };
      }

      const initialStateIdentity = stableIdentity(loaded.state);
      const occurredAt = now().toISOString();
      const challengeId = deterministicId(
        "guardian",
        learnerRef,
        envelope.requestId,
        expedition.document.key
      );

      const committed = await stateStore.transact<InternalTransition>(
        learnerRef,
        (current) => {
          const prior = current.commandReceipts.find(
            (receipt) => receipt.requestId === envelope.requestId
          );
          if (prior) {
            return prior.commandFingerprint === commandFingerprint
              ? {
                  next: current as LearnerStateV1,
                  result: { kind: "duplicate", receipt: prior }
                }
              : {
                  next: current as LearnerStateV1,
                  result: { kind: "refused", reason: "request_id_reused" }
                };
          }
          if (stableIdentity(current) !== initialStateIdentity) {
            return {
              next: current as LearnerStateV1,
              result: { kind: "stale" }
            };
          }
          if (contentChanged(expedition, current)) {
            return {
              next: current as LearnerStateV1,
              result: { kind: "content_changed" }
            };
          }

          const applied = applyLearnerCommand({
            state: current,
            expedition,
            command,
            requestId: envelope.requestId,
            occurredAt,
            challengeId
          });
          if (!applied.applied) {
            return {
              next: current as LearnerStateV1,
              result: { kind: "refused", reason: applied.reason }
            };
          }
          const receipt: CommandReceipt = {
            requestId: envelope.requestId,
            commandFingerprint,
            committedStateVersion: (envelope.expectedStateVersion + 1n).toString(),
            effect: applied.effect
          };
          applied.next.commandReceipts.push(receipt);
          return {
            next: parseLearnerStateV1(applied.next),
            result: { kind: "applied", receipt }
          };
        }
      );
      if (!committed.found) return { status: "learner_not_found" };

      if (committed.result.kind === "stale") {
        return {
          status: "stale",
          ...journalResult(catalog, committed.state, committed.stateVersion)
        };
      }
      if (committed.result.kind === "content_changed") {
        return {
          status: "content_changed",
          expeditionKey: expedition.document.key,
          ...journalResult(catalog, committed.state, committed.stateVersion)
        };
      }
      if (committed.result.kind === "refused") {
        return {
          status: "refused",
          reason: committed.result.reason,
          ...journalResult(catalog, committed.state, committed.stateVersion)
        };
      }

      const receipt = committed.result.receipt;
      return {
        status: "applied",
        replayed: committed.result.kind === "duplicate",
        stateVersion: committed.stateVersion,
        committedStateVersion: BigInt(receipt.committedStateVersion),
        effect: receipt.effect,
        view: viewForEffect({
          catalog,
          expedition,
          state: committed.state,
          receipt
        })
      };
    }
  };
}
