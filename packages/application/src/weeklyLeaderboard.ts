import type { LearnerAward } from "@lrnki/ports";

// The weekly leaderboard's pure core (plan 2026-07-07-005, R3/R4). Data-in/data-out: it
// imports no store or clock, so it is replay-testable with plain data. The `getWeeklyLeaderboard`
// use-case is the reader that runs the Study Session projection per learner (the ONE completion
// rule, KTD2) and folds the mastered nodes here into a difficulty-weighted weekly score.

// ISO week key (Monday 00:00 UTC). Two moments in the same ISO week share a key, so the board
// resets on the week boundary and the `weekly_podium` dedupe key (KTD6) is stable within a week.
export function isoWeekKey(date: Date): string {
  // Shift to the Thursday of the current week (ISO weeks belong to the year of their Thursday),
  // then count weeks from the year's first Thursday. Pure UTC arithmetic — no locale.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

// The [start, end) millisecond window of the ISO week containing `date`, anchored on
// Monday 00:00 UTC. Membership tests use `start <= t < end`.
export function isoWeekRange(date: Date): { startMs: number; endMs: number; key: string } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (day - 1));
  const startMs = monday.getTime();
  return { startMs, endMs: startMs + 7 * 86_400_000, key: isoWeekKey(date) };
}

// The prior ISO week's key — the podium dedupe key computed on first entry into a new week (KTD6).
export function previousIsoWeekKey(date: Date): string {
  return isoWeekKey(new Date(isoWeekRange(date).startMs - 86_400_000));
}

// Difficulty band 1–5 recovered from the raw difficulty score (R4). A band-3 concept is worth
// exactly 3 points. A node with no difficulty row (score null, fail-open per ADR-0024) still
// counts, at the floor band of 1, so mastering it is never worth zero.
export function difficultyBand(score: number | null): number {
  if (score === null) return 1;
  return Math.min(5, Math.max(1, Math.round(1 + 4 * score)));
}

// One mastered node's contribution to the weekly score. `completionTimeMs` is the moment the
// node became mastered — the max over its evidence timestamps (KTD2) — or null when the node
// carries no timestamped evidence (a calibration-known skip), in which case it never scores.
export type MasteredNodeContribution = {
  derivedNodeId: string;
  difficultyScore: number | null;
  completionTimeMs: number | null;
};

// Sum the difficulty bands of the nodes whose mastery COMPLETED inside [weekStartMs, weekEndMs).
// Deterministic and ordering-independent. Returns the total and the contributing nodes so the
// caller can attribute a "+3" beat to the concept that moved the score (AE2).
export function computeWeeklyPoints(input: {
  nodes: MasteredNodeContribution[];
  weekStartMs: number;
  weekEndMs: number;
}): { points: number; contributingNodeIds: string[] } {
  let points = 0;
  const contributingNodeIds: string[] = [];
  for (const node of input.nodes) {
    if (node.completionTimeMs === null) continue;
    if (node.completionTimeMs < input.weekStartMs || node.completionTimeMs >= input.weekEndMs) continue;
    points += difficultyBand(node.difficultyScore);
    contributingNodeIds.push(node.derivedNodeId);
  }
  return { points, contributingNodeIds };
}

// The completion time of one mastered node (KTD2): the LATEST of its evidence timestamps — the
// latest-correct time of every study segment plus the lesson read time. `null` if any required
// evidence timestamp is missing (so a node the projection called mastered but that carries no
// timestamped evidence — a known-skip — is excluded rather than scored at time zero).
export function nodeCompletionTimeMs(input: {
  segmentCorrectAtMs: (number | null)[];
  lessonReadAtMs: number | null;
  hasLesson: boolean;
}): number | null {
  const stamps: number[] = [];
  for (const at of input.segmentCorrectAtMs) {
    if (at === null) return null; // an "incomplete" segment cannot have made the node mastered
    stamps.push(at);
  }
  if (input.hasLesson) {
    if (input.lessonReadAtMs === null) return null;
    stamps.push(input.lessonReadAtMs);
  }
  if (stamps.length === 0) return null;
  return Math.max(...stamps);
}

// The board flair counts folded from a learner's durable awards (R6/R8).
export type LearnerBadges = { podiums: number };

export function badgesFromAwards(awards: LearnerAward[]): LearnerBadges {
  let podiums = 0;
  for (const award of awards) {
    if (award.awardType === "weekly_podium") podiums += 1;
  }
  return { podiums };
}

// One real learner's row on the weekly board (real rows only; rivals are merged presentation-side
// in the Learner App per KTD1). `contributingNodeIds` supports the mastery-beat "+N" attribution.
export type WeeklyLeaderboardRow = {
  learnerRef: string;
  displayName: string;
  points: number;
  badges: LearnerBadges;
  contributingNodeIds: string[];
};
