import assert from "node:assert/strict";
import test from "node:test";
import {
  badgesFromAwards,
  computeWeeklyPoints,
  difficultyBand,
  isoWeekKey,
  isoWeekRange,
  nodeCompletionTimeMs,
  previousIsoWeekKey
} from "./weeklyLeaderboard";

test("difficultyBand recovers 1..5 from the 0..1 score (R4) and floors a null score at 1", () => {
  assert.equal(difficultyBand(0), 1);
  assert.equal(difficultyBand(0.5), 3);
  assert.equal(difficultyBand(1), 5);
  assert.equal(difficultyBand(0.25), 2);
  assert.equal(difficultyBand(null), 1);
});

test("isoWeekKey anchors on the ISO week and previousIsoWeekKey steps back one week", () => {
  // 2026-06-29 is a Monday; the whole week shares one key, and Sunday 2026-07-05 too.
  assert.equal(isoWeekKey(new Date("2026-06-29T00:00:00Z")), isoWeekKey(new Date("2026-07-05T23:59:59Z")));
  const key = isoWeekKey(new Date("2026-07-07T12:00:00Z"));
  assert.match(key, /^2026-W\d{2}$/);
  assert.notEqual(previousIsoWeekKey(new Date("2026-07-07T12:00:00Z")), key);
});

test("isoWeekRange is a [Mon 00:00 UTC, +7d) half-open window", () => {
  const { startMs, endMs } = isoWeekRange(new Date("2026-07-08T12:00:00Z")); // Wed
  assert.equal(new Date(startMs).toISOString(), "2026-07-06T00:00:00.000Z");
  assert.equal(endMs - startMs, 7 * 86_400_000);
});

test("nodeCompletionTimeMs is the max evidence time, and null when a segment or a required lesson is missing", () => {
  assert.equal(nodeCompletionTimeMs({ segmentCorrectAtMs: [100, 300], lessonReadAtMs: 200, hasLesson: true }), 300);
  assert.equal(nodeCompletionTimeMs({ segmentCorrectAtMs: [100, 300], lessonReadAtMs: 400, hasLesson: true }), 400);
  assert.equal(nodeCompletionTimeMs({ segmentCorrectAtMs: [100, null], lessonReadAtMs: 200, hasLesson: true }), null);
  assert.equal(nodeCompletionTimeMs({ segmentCorrectAtMs: [100], lessonReadAtMs: null, hasLesson: true }), null);
  assert.equal(nodeCompletionTimeMs({ segmentCorrectAtMs: [], lessonReadAtMs: null, hasLesson: false }), null);
});

test("computeWeeklyPoints sums bands only for nodes completed inside the half-open week (AE2)", () => {
  const start = isoWeekRange(new Date("2026-07-08T00:00:00Z")).startMs;
  const inWeek = start + 3600_000;
  const lastWeek = start - 3600_000;
  const nextWeek = start + 7 * 86_400_000;
  const { points, contributingNodeIds } = computeWeeklyPoints({
    nodes: [
      { derivedNodeId: "a", difficultyScore: 0.5, completionTimeMs: inWeek }, // band 3
      { derivedNodeId: "b", difficultyScore: 1, completionTimeMs: lastWeek }, // excluded (prior week)
      { derivedNodeId: "c", difficultyScore: 0, completionTimeMs: inWeek }, // band 1
      { derivedNodeId: "d", difficultyScore: 1, completionTimeMs: nextWeek }, // excluded (end is exclusive)
      { derivedNodeId: "e", difficultyScore: 0.5, completionTimeMs: null } // excluded (known-skip)
    ],
    weekStartMs: start,
    weekEndMs: nextWeek
  });
  assert.equal(points, 4);
  assert.deepEqual(contributingNodeIds, ["a", "c"]);
});

test("badgesFromAwards counts by type", () => {
  const badges = badgesFromAwards([
    { awardId: "1", learnerRef: "x", awardType: "duel_win", dedupeKey: "d1", context: {}, createdAt: "2026-07-07T00:00:00Z" },
    { awardId: "2", learnerRef: "x", awardType: "duel_win", dedupeKey: "d2", context: {}, createdAt: "2026-07-07T00:00:00Z" },
    { awardId: "3", learnerRef: "x", awardType: "weekly_podium", dedupeKey: "2026-W27", context: {}, createdAt: "2026-07-07T00:00:00Z" }
  ]);
  assert.deepEqual(badges, { duelWins: 2, podiums: 1 });
});
