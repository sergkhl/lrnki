import type { LearnerAward, LearnerStateV1 } from "./learnerState";
import type { BoardLearnerState } from "./learnerStateStore";
import type {
  LeaderboardEntryView,
  LeaderboardView
} from "./runtimeTypes";
import type { RuntimeCatalog } from "./runtimeContent";
import { stableFingerprint } from "./runtimeContent";

const BOARD_SIZE = 10;
const PODIUM_RANK = 3;
const MAX_WEEKLY_DRIFT = 8;
const RIVAL_NAMES = [
  "AsterPeak",
  "BirchCompass",
  "CedarNorth",
  "DawnAtlas",
  "EmberTrail",
  "FernSummit",
  "GaleQuartz",
  "HarborPine",
  "IrisRidge",
  "JuniperMap",
  "KiteValley",
  "LumenPath"
] as const;

export function isoWeekKey(date: Date): string {
  const shifted = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const day = shifted.getUTCDay() === 0 ? 7 : shifted.getUTCDay();
  shifted.setUTCDate(shifted.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(shifted.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((shifted.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
  );
  return `${shifted.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function isoWeekRange(date: Date): {
  startMs: number;
  endMs: number;
  key: string;
} {
  const dayStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const day = dayStart.getUTCDay() === 0 ? 7 : dayStart.getUTCDay();
  const monday = new Date(dayStart);
  monday.setUTCDate(dayStart.getUTCDate() - (day - 1));
  const startMs = monday.getTime();
  return {
    startMs,
    endMs: startMs + 7 * 86_400_000,
    key: isoWeekKey(date)
  };
}

export function previousIsoWeekKey(date: Date): string {
  return isoWeekKey(new Date(isoWeekRange(date).startMs - 86_400_000));
}

type RealRow = Readonly<{
  learnerRef: string;
  displayName: string;
  points: number;
  badges: Readonly<{ podiums: number }>;
}>;

function validJourney(
  catalog: RuntimeCatalog,
  expeditionKey: string,
  contentRevision: string
): boolean {
  return catalog.expeditions.get(expeditionKey)?.revision === contentRevision;
}

function weeklyPoints(
  catalog: RuntimeCatalog,
  state: Readonly<LearnerStateV1>,
  startMs: number,
  endMs: number
): number {
  let points = 0;
  for (const [expeditionKey, journey] of Object.entries(state.expeditions)) {
    if (!validJourney(catalog, expeditionKey, journey.contentRevision)) continue;
    for (const completion of Object.values(journey.firstGradedStopCompletions)) {
      const completedAt = new Date(completion.completedAt).getTime();
      if (completedAt >= startMs && completedAt < endMs) points += completion.points;
    }
  }
  return points;
}

function lifetimeMasteredCrystals(
  catalog: RuntimeCatalog,
  state: Readonly<LearnerStateV1>
): number {
  let total = 0;
  for (const [expeditionKey, journey] of Object.entries(state.expeditions)) {
    if (!validJourney(catalog, expeditionKey, journey.contentRevision)) continue;
    total += Object.keys(journey.firstGradedStopCompletions).length;
  }
  return total;
}

function podiumCount(state: Readonly<LearnerStateV1>): number {
  return state.awards.filter((award) => award.type === "weekly_podium").length;
}

function realRows(input: {
  catalog: RuntimeCatalog;
  cohort: readonly BoardLearnerState[];
  startMs: number;
  endMs: number;
}): RealRow[] {
  return input.cohort.map((learner) => ({
    learnerRef: learner.learnerRef,
    displayName: learner.displayName,
    points: weeklyPoints(
      input.catalog,
      learner.state,
      input.startMs,
      input.endMs
    ),
    badges: { podiums: podiumCount(learner.state) }
  }));
}

function seededNumber(...parts: readonly string[]): number {
  return Number.parseInt(stableFingerprint(parts), 16) >>> 0;
}

function simulatedRivals(input: {
  learnerRef: string;
  weekKey: string;
  viewerPoints: number;
  count: number;
  weekFraction: number;
}): Array<{ id: string; name: string; points: number }> {
  const rivals: Array<{ id: string; name: string; points: number }> = [];
  const fraction = Math.max(0, Math.min(1, input.weekFraction));
  for (let index = 0; index < input.count; index += 1) {
    const seed = seededNumber(input.learnerRef, input.weekKey, String(index));
    const factor = index === 0
      ? 1.05 + (seed % 26) / 100
      : index === 1
        ? 0.7 + (seed % 26) / 100
        : 0.6 + (seed % 81) / 100;
    const drift = (seed >>> 8) % (MAX_WEEKLY_DRIFT + 1);
    rivals.push({
      id: `rival-${index}`,
      name: `${RIVAL_NAMES[seed % RIVAL_NAMES.length]}${(seed >>> 16) % 97}`,
      points: Math.max(0, Math.round(input.viewerPoints * factor + drift * fraction))
    });
  }
  if (
    rivals.length > 0 &&
    !rivals.some((rival) => rival.points > input.viewerPoints)
  ) {
    rivals[0].points = input.viewerPoints + 1;
  }
  if (
    input.viewerPoints > 0 &&
    rivals.length > 1 &&
    !rivals.some((rival) => rival.points < input.viewerPoints)
  ) {
    rivals[1].points = Math.max(0, input.viewerPoints - 1);
  }
  return rivals;
}

function windowRows(
  viewerRef: string,
  rows: readonly RealRow[],
  size: number
): RealRow[] {
  const sorted = [...rows].sort(
    (left, right) =>
      right.points - left.points ||
      left.displayName.localeCompare(right.displayName) ||
      left.learnerRef.localeCompare(right.learnerRef)
  );
  if (sorted.length <= size) return sorted;
  const viewerIndex = sorted.findIndex((row) => row.learnerRef === viewerRef);
  if (viewerIndex < 0) return sorted.slice(0, size);
  const start = Math.max(
    0,
    Math.min(viewerIndex - Math.floor(size / 2), sorted.length - size)
  );
  return sorted.slice(start, start + size);
}

function assembleBoard(input: {
  viewerRef: string;
  rows: readonly RealRow[];
  weekKey: string;
  nowMs: number;
  startMs: number;
  endMs: number;
}): {
  entries: LeaderboardEntryView[];
  chase: LeaderboardView["chase"];
  viewerPoints: number;
} {
  const viewerPoints =
    input.rows.find((row) => row.learnerRef === input.viewerRef)?.points ?? 0;
  const scoringRows = input.rows.filter(
    (row) => row.learnerRef === input.viewerRef || row.points > 0
  );
  const visibleReal = windowRows(input.viewerRef, scoringRows, BOARD_SIZE);
  const rivals = simulatedRivals({
    learnerRef: input.viewerRef,
    weekKey: input.weekKey,
    viewerPoints,
    count: Math.max(0, BOARD_SIZE - visibleReal.length),
    weekFraction: (input.nowMs - input.startMs) / (input.endMs - input.startMs)
  });
  const unranked = [
    ...visibleReal.map((row) => ({
      id: row.learnerRef,
      name: row.displayName,
      points: row.points,
      isViewer: row.learnerRef === input.viewerRef,
      isRival: false,
      badges: row.badges
    })),
    ...rivals.map((rival) => ({
      ...rival,
      isViewer: false,
      isRival: true,
      badges: { podiums: 0 }
    }))
  ];
  unranked.sort(
    (left, right) => right.points - left.points || left.name.localeCompare(right.name)
  );
  const entries = unranked.map((entry, index) => ({ ...entry, rank: index + 1 }));
  const others = entries.filter((entry) => !entry.isViewer);
  const ahead = others
    .filter((entry) => entry.points > viewerPoints)
    .sort((left, right) => left.points - right.points)[0];
  const behind = others
    .filter((entry) => entry.points < viewerPoints)
    .sort((left, right) => right.points - left.points)[0];
  const chase = ahead
    ? { name: ahead.name, gap: ahead.points - viewerPoints, direction: "ahead" as const }
    : behind
      ? { name: behind.name, gap: viewerPoints - behind.points, direction: "behind" as const }
      : null;
  return { entries, chase, viewerPoints };
}

export function divisionForMasteredCrystals(masteredCrystals: number): {
  name: string;
  threshold: number;
  nextThreshold: number | null;
} {
  const count = Math.max(0, Math.floor(masteredCrystals));
  const divisions = [
    { name: "Basecamp", threshold: 0 },
    { name: "Foothills", threshold: 10 },
    { name: "Ridge", threshold: 30 },
    { name: "Summit", threshold: 75 }
  ] as const;
  let index = 0;
  for (let candidate = 0; candidate < divisions.length; candidate += 1) {
    if (count >= divisions[candidate].threshold) index = candidate;
  }
  return {
    name: divisions[index].name,
    threshold: divisions[index].threshold,
    nextThreshold: divisions[index + 1]?.threshold ?? null
  };
}

export function buildLeaderboardView(input: {
  catalog: RuntimeCatalog;
  cohort: readonly BoardLearnerState[];
  viewerRef: string;
  now: Date;
  podiumEarnedForPreviousWeek: boolean;
}): LeaderboardView {
  const range = isoWeekRange(input.now);
  const rows = realRows({
    catalog: input.catalog,
    cohort: input.cohort,
    startMs: range.startMs,
    endMs: range.endMs
  });
  const board = assembleBoard({
    viewerRef: input.viewerRef,
    rows,
    weekKey: range.key,
    nowMs: input.now.getTime(),
    startMs: range.startMs,
    endMs: range.endMs
  });
  const viewerState = input.cohort.find(
    (learner) => learner.learnerRef === input.viewerRef
  )?.state;
  const masteredCrystalCount = viewerState
    ? lifetimeMasteredCrystals(input.catalog, viewerState)
    : 0;
  return {
    kind: "leaderboard",
    weekKey: range.key,
    entries: board.entries,
    chase: board.chase,
    viewerPoints: board.viewerPoints,
    viewerRank:
      board.entries.find((entry) => entry.isViewer)?.rank ?? null,
    masteredCrystalCount,
    division: divisionForMasteredCrystals(masteredCrystalCount),
    podiumEarnedForPreviousWeek: input.podiumEarnedForPreviousWeek
  };
}

export function previousWeekPodiumAward(input: {
  catalog: RuntimeCatalog;
  cohort: readonly BoardLearnerState[];
  viewerRef: string;
  now: Date;
}): Omit<Extract<LearnerAward, { type: "weekly_podium" }>, "awardedAt"> | null {
  const weekKey = previousIsoWeekKey(input.now);
  const viewer = input.cohort.find(
    (learner) => learner.learnerRef === input.viewerRef
  );
  if (!viewer) return null;
  if (
    viewer.state.awards.some(
      (award) => award.type === "weekly_podium" && award.dedupeKey === weekKey
    )
  ) {
    return null;
  }

  const priorEnd = isoWeekRange(input.now).startMs;
  const priorStart = priorEnd - 7 * 86_400_000;
  const rows = realRows({
    catalog: input.catalog,
    cohort: input.cohort,
    startMs: priorStart,
    endMs: priorEnd
  });
  const board = assembleBoard({
    viewerRef: input.viewerRef,
    rows,
    weekKey,
    nowMs: priorEnd - 1,
    startMs: priorStart,
    endMs: priorEnd
  });
  const viewerEntry = board.entries.find((entry) => entry.isViewer);
  if (!viewerEntry || viewerEntry.points <= 0 || viewerEntry.rank > PODIUM_RANK) {
    return null;
  }
  return {
    type: "weekly_podium",
    dedupeKey: weekKey,
    weekKey,
    rank: viewerEntry.rank,
    points: viewerEntry.points
  };
}
