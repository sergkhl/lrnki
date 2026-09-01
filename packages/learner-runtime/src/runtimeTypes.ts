import type { LearnerActivityProjection, LearnerExpeditionProjection } from "./contentQualifier";
import type {
  CommandEffect,
  FirstGradedStopCompletion,
  GuardianScope
} from "./learnerState";

export type LearnerQuery =
  | Readonly<{ kind: "journal" }>
  | Readonly<{ kind: "catalog" }>
  | Readonly<{ kind: "expedition"; expeditionKey: string }>
  | Readonly<{ kind: "guardian"; expeditionKey: string; challengeId: string }>
  | Readonly<{ kind: "leaderboard" }>;

export type AcquisitionSource =
  | Readonly<{ kind: "trail" }>
  | Readonly<{ kind: "support"; supportPathKey: string }>;

export type LearnerCommand =
  | Readonly<{ kind: "adopt_expedition"; expeditionKey: string }>
  | Readonly<{ kind: "activate_expedition"; expeditionKey: string }>
  | Readonly<{ kind: "record_lesson_read"; expeditionKey: string; stopKey: string }>
  | Readonly<{ kind: "set_calibration_known"; expeditionKey: string; stopKey: string }>
  | Readonly<{ kind: "clear_calibration_known"; expeditionKey: string; stopKey: string }>
  | Readonly<{
      kind: "answer_option_select";
      expeditionKey: string;
      stopKey: string;
      activityKey: string;
      chosenOptionKey: string;
      source: AcquisitionSource;
    }>
  | Readonly<{
      kind: "answer_matching";
      expeditionKey: string;
      stopKey: string;
      activityKey: string;
      matches: ReadonlyArray<Readonly<{ leftKey: string; rightKey: string }>>;
      source: AcquisitionSource;
    }>
  | Readonly<{
      kind: "answer_impostor";
      expeditionKey: string;
      stopKey: string;
      activityKey: string;
      chosenStatementKey: string;
      source: AcquisitionSource;
    }>
  | Readonly<{
      kind: "open_support_path";
      expeditionKey: string;
      stopKey: string;
      supportPathKey: string;
    }>
  | Readonly<{
      kind: "hide_support_path";
      expeditionKey: string;
      supportPathKey: string;
    }>
  | Readonly<{
      kind: "create_guardian";
      expeditionKey: string;
      scope: GuardianScope;
    }>
  | Readonly<{
      kind: "answer_guardian_selection";
      expeditionKey: string;
      challengeId: string;
      activityKey: string;
      chosenKey: string;
    }>
  | Readonly<{
      kind: "answer_guardian_matching_pair";
      expeditionKey: string;
      challengeId: string;
      activityKey: string;
      leftKey: string;
      rightKey: string;
    }>
  | Readonly<{ kind: "retreat_guardian"; expeditionKey: string; challengeId: string }>
  | Readonly<{ kind: "resume_guardian"; expeditionKey: string; challengeId: string }>
  | Readonly<{ kind: "abandon_guardian"; expeditionKey: string; challengeId: string }>;

export type StopProgressView = Readonly<{
  stopKey: string;
  state: "locked" | "available" | "mastered" | "known";
  lessonReadAt: string | null;
  latestActivityOutcomes: ReadonlyArray<
    Readonly<{ activityKey: string; correct: boolean; answeredAt: string }>
  >;
  firstGradedCompletion: FirstGradedStopCompletion | null;
  restorationStopKeys: ReadonlyArray<string>;
}>;

export type GuardianScopeStatusView = Readonly<{
  scope: GuardianScope;
  state: "unavailable" | "locked" | "available" | "active" | "won";
  eligibleActivityCount: number;
  activeChallengeId: string | null;
  firstWinChallengeId: string | null;
}>;

export type JournalView = Readonly<{
  kind: "journal";
  activeExpeditionKey: string | null;
  expeditions: ReadonlyArray<
    Readonly<{
      expeditionKey: string;
      title: string;
      contentRevision: string;
      contentChanged: boolean;
      adoptedAt: string;
      masteredStopCount: number;
      knownStopCount: number;
      totalStopCount: number;
    }>
  >;
}>;

export type CatalogView = Readonly<{
  kind: "catalog";
  catalogRevision: string;
  expeditions: ReadonlyArray<
    Readonly<{
      expeditionKey: string;
      title: string;
      teaser: string;
      declaredDomain: string;
      audience: string;
      sourceCredits: LearnerExpeditionProjection["sourceCredits"];
      contentRevision: string;
      adopted: boolean;
      active: boolean;
    }>
  >;
}>;

export type SupportPathView = Readonly<{
  supportPathKey: string;
  parentStopKey: string;
  term: string;
  status: "closed" | "open" | "hidden";
  steps: ReadonlyArray<
    Readonly<{
      stopKey: string;
      activityKey: string;
      stopLabel: string;
      lesson: LearnerExpeditionProjection["legs"][number]["stops"][number]["lesson"];
      activity: LearnerActivityProjection;
    }>
  >;
}>;

export type ExpeditionView = Readonly<{
  kind: "expedition";
  expedition: LearnerExpeditionProjection;
  active: boolean;
  progress: ReadonlyArray<StopProgressView>;
  supportPaths: ReadonlyArray<SupportPathView>;
  guardians: ReadonlyArray<GuardianScopeStatusView>;
}>;

export type GuardianMatchingProgressView = Readonly<{
  matchedLeftKeys: ReadonlyArray<string>;
  roundIndex: number;
}>;

export type GuardianView =
  | Readonly<{
      kind: "guardian";
      state: "active" | "recovery";
      expeditionKey: string;
      challengeId: string;
      scope: GuardianScope;
      wardTotal: number;
      unresolvedWardCount: number;
      resolvedWardCount: number;
      remainingShield: number;
      shieldTotal: number;
      retreated: boolean;
      sourceCredits: LearnerExpeditionProjection["sourceCredits"];
      currentActivity: LearnerActivityProjection;
      matchingProgress: GuardianMatchingProgressView | null;
    }>
  | Readonly<{
      kind: "guardian";
      state: "won";
      expeditionKey: string;
      challengeId: string;
      scope: GuardianScope;
      wardTotal: number;
      firstWin: boolean;
    }>;

export type LeaderboardEntryView = Readonly<{
  id: string;
  name: string;
  points: number;
  rank: number;
  isViewer: boolean;
  isRival: boolean;
  badges: Readonly<{ podiums: number }>;
}>;

export type LeaderboardView = Readonly<{
  kind: "leaderboard";
  weekKey: string;
  entries: ReadonlyArray<LeaderboardEntryView>;
  chase: Readonly<{ name: string; gap: number; direction: "ahead" | "behind" }> | null;
  viewerPoints: number;
  viewerRank: number | null;
  masteredCrystalCount: number;
  division: Readonly<{ name: string; threshold: number; nextThreshold: number | null }>;
  podiumEarnedForPreviousWeek: boolean;
}>;

export type LearnerView =
  | JournalView
  | CatalogView
  | ExpeditionView
  | GuardianView
  | LeaderboardView;

export type LearnerReadResult =
  | Readonly<{ status: "ok"; stateVersion: bigint; view: LearnerView }>
  | Readonly<{ status: "learner_not_found" }>
  | Readonly<{
      status: "not_found";
      stateVersion: bigint;
      resource: "expedition" | "guardian";
    }>
  | Readonly<{
      status: "content_changed";
      stateVersion: bigint;
      expeditionKey: string;
      view: JournalView;
    }>;

export type CommandRefusal =
  | "invalid_command"
  | "expedition_not_adopted"
  | "expedition_already_adopted"
  | "stop_locked"
  | "activity_not_found"
  | "activity_family_mismatch"
  | "invalid_answer"
  | "support_path_not_found"
  | "support_activity_mismatch"
  | "guardian_locked"
  | "guardian_unavailable"
  | "active_guardian_exists"
  | "guardian_not_found"
  | "guardian_not_active"
  | "guardian_retreated"
  | "guardian_out_of_turn"
  | "request_id_reused";

export type LearnerTransitionResult =
  | Readonly<{
      status: "applied";
      replayed: boolean;
      stateVersion: bigint;
      committedStateVersion: bigint;
      effect: CommandEffect;
      view: JournalView | ExpeditionView | GuardianView;
    }>
  | Readonly<{
      status: "stale";
      stateVersion: bigint;
      view: JournalView;
    }>
  | Readonly<{
      status: "refused";
      reason: CommandRefusal;
      stateVersion: bigint;
      view: JournalView;
    }>
  | Readonly<{
      status: "content_changed";
      stateVersion: bigint;
      expeditionKey: string;
      view: JournalView;
    }>
  | Readonly<{ status: "learner_not_found" }>
  | Readonly<{
      status: "not_found";
      stateVersion: bigint;
      resource: "expedition";
    }>;

export interface LearnerRuntime {
  read(learnerRef: string, query: LearnerQuery): Promise<LearnerReadResult>;

  dispatch(
    learnerRef: string,
    envelope: Readonly<{
      requestId: string;
      expectedStateVersion: bigint;
      command: LearnerCommand;
    }>
  ): Promise<LearnerTransitionResult>;
}
