import { faker } from "@faker-js/faker";

// Deterministic simulated rivals (plan 2026-07-07-005, R5/R6, KTD1). This is
// PRESENTATION-SIDE fiction: rivals never touch `learners`, the graded path, or any
// persistence. A seeded pure function reproduces the same names and scores on every reload
// within a week and reshuffles them across weeks. In a real-multiplayer future this module
// is simply deleted — the board already speaks `{ name, points, badges }`.

const MAX_WEEKLY_DRIFT = 8; // the most points a rival accrues on their own over a full week

// A stable 32-bit seed from string/number parts (FNV-1a). Feeds `faker.seed`, so a rival's
// identity is a pure function of (learnerRef, weekKey, index) — week-stable, cross-week fresh.
export function rivalSeed(...parts: (string | number)[]): number {
  let hash = 0x811c9dc5;
  const text = parts.join("");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export type RivalScore = { rivalId: string; name: string; points: number };

// Nine (or however many fill the board) rivals rubber-banded around the viewer: each rival's
// score is a seeded multiple of the viewer's current points PLUS a seeded weekly drift scaled by
// how much of the week has elapsed — so scores stay clustered around the viewer (the pace-car
// technique) yet still GROW across the day (AE2) even when the viewer is idle. Slots 0 and 1 sit
// just-ahead and just-behind so the chase framing (R6) always has a neighbor.
export function simulateRivals(input: {
  learnerRef: string;
  weekKey: string;
  viewerPoints: number;
  count: number;
  weekFraction: number;
}): RivalScore[] {
  if (input.count <= 0) return [];
  const fraction = Math.min(1, Math.max(0, input.weekFraction));

  const rivals: RivalScore[] = [];
  for (let i = 0; i < input.count; i += 1) {
    const seed = rivalSeed(input.learnerRef, input.weekKey, i);
    faker.seed(seed);
    const sex = faker.person.sexType();
    const firstName = faker.person.firstName(sex);
    const lastName = faker.person.lastName();
    const name = faker.internet.username({ firstName, lastName });
    // A seeded pace multiple around the viewer. Slot 0 sits just ahead, slot 1 just behind.
    const factor = i === 0 ? faker.number.float({ min: 1.05, max: 1.3 }) : i === 1 ? faker.number.float({ min: 0.7, max: 0.95 }) : faker.number.float({ min: 0.6, max: 1.4 });
    const drift = faker.number.int({ min: 0, max: MAX_WEEKLY_DRIFT });
    const points = Math.max(0, Math.round(input.viewerPoints * factor + drift * fraction));
    rivals.push({ rivalId: `rival-${i}`, name, points });
  }

  // Guarantee a strict neighbor above and (when the viewer has any points) below, so "someone
  // is always just ahead and someone just behind" holds even after rounding collisions.
  if (!rivals.some((rival) => rival.points > input.viewerPoints)) {
    const top = rivals.reduce((best, rival) => (rival.points >= best.points ? rival : best), rivals[0]);
    top.points = input.viewerPoints + 1;
  }
  if (input.viewerPoints > 0 && !rivals.some((rival) => rival.points < input.viewerPoints)) {
    const bottom = rivals.reduce((worst, rival) => (rival.points <= worst.points ? rival : worst), rivals[0]);
    bottom.points = Math.max(0, input.viewerPoints - 1);
  }
  return rivals;
}

// One simulated rival answer inside a Crystal Duel (R7, KTD1). Per-question success is seeded and
// scaled DOWN on higher item bands (a harder crystal is harder for the rival too), then gently
// rubber-banded toward a ~60% learner win rate: when the learner leads, the rival answers a little
// better; when the learner trails, a little worse. Pure and deterministic in its seed, so a duel
// replays identically. Answer time is seeded within the per-question clock for the tie-breaker.
export function rivalDuelAnswer(input: { seed: number; band: number; learnerLead: number; questionMs: number }): { correct: boolean; elapsedMs: number } {
  faker.seed(input.seed);
  const baseAccuracy = 0.78 - 0.08 * (input.band - 1); // band 1 ≈ 0.78, band 5 ≈ 0.46
  const rubberBand = Math.max(-0.15, Math.min(0.15, input.learnerLead * 0.08)); // lead → tougher rival
  const accuracy = Math.max(0.2, Math.min(0.9, baseAccuracy + rubberBand));
  const roll = faker.number.float({ min: 0, max: 1 });
  const elapsedMs = faker.number.int({ min: Math.round(input.questionMs * 0.2), max: Math.round(input.questionMs * 0.9) });
  return { correct: roll < accuracy, elapsedMs };
}

export type ChaseTarget = { name: string; gap: number; direction: "ahead" | "behind" };

// The one highlighted rival (R6): the nearest opponent above the viewer, or — when the viewer
// leads — the nearest below. `null` only when there is literally no one else on the board.
export function selectChase(viewerPoints: number, others: { name: string; points: number }[]): ChaseTarget | null {
  const ahead = others.filter((entry) => entry.points > viewerPoints).sort((a, b) => a.points - b.points)[0];
  if (ahead) return { name: ahead.name, gap: ahead.points - viewerPoints, direction: "ahead" };
  const behind = others.filter((entry) => entry.points < viewerPoints).sort((a, b) => b.points - a.points)[0];
  if (behind) return { name: behind.name, gap: viewerPoints - behind.points, direction: "behind" };
  return null;
}

export type BoardEntry = {
  id: string;
  name: string;
  points: number;
  rank: number;
  isViewer: boolean;
  isRival: boolean;
  badges: { duelWins: number; podiums: number };
};

export type RealBoardRow = {
  learnerRef: string;
  displayName: string;
  points: number;
  badges: { duelWins: number; podiums: number };
};

function windowRealRows(input: { viewerRef: string; realRows: RealBoardRow[]; size: number }): RealBoardRow[] {
  const sorted = input.realRows
    .slice()
    .sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName) || a.learnerRef.localeCompare(b.learnerRef));
  if (sorted.length <= input.size) return sorted;
  const viewerIndex = sorted.findIndex((row) => row.learnerRef === input.viewerRef);
  if (viewerIndex === -1) return sorted.slice(0, input.size);
  const idealStart = viewerIndex - Math.floor(input.size / 2);
  const start = Math.max(0, Math.min(idealStart, sorted.length - input.size));
  return sorted.slice(start, start + input.size);
}

// Assemble the full board a learner sees: a viewer-centered cohort of real rows plus enough
// rivals to fill `size`, ranked together. The viewer is flagged so the surface can highlight
// their row and derive the chase. Deterministic given (viewerRef, weekKey, nowMs).
export function assembleWeeklyBoard(input: {
  viewerRef: string;
  realRows: RealBoardRow[];
  weekKey: string;
  nowMs: number;
  weekStartMs: number;
  weekEndMs: number;
  size?: number;
}): { entries: BoardEntry[]; chase: ChaseTarget | null; viewerPoints: number } {
  const size = input.size ?? 10;
  const viewerPoints = input.realRows.find((row) => row.learnerRef === input.viewerRef)?.points ?? 0;
  const weekFraction = (input.nowMs - input.weekStartMs) / (input.weekEndMs - input.weekStartMs);
  // Drop real rows that scored nothing this week (dormant or residual junk learners) BEFORE
  // windowing, so the viewer-centered cohort is never padded with 0-point neighbors (R3). The
  // viewer's own row is always kept — a viewer at 0 points still renders at 0 (AE3) — and the
  // rival fill still tops the board up to `size`.
  const scoringRows = input.realRows.filter((row) => row.learnerRef === input.viewerRef || row.points > 0);
  const realRows = windowRealRows({ viewerRef: input.viewerRef, realRows: scoringRows, size });
  const rivalCount = Math.max(0, size - realRows.length);
  const rivals = simulateRivals({ learnerRef: input.viewerRef, weekKey: input.weekKey, viewerPoints, count: rivalCount, weekFraction });

  const unranked = [
    ...realRows.map((row) => ({ id: row.learnerRef, name: row.displayName, points: row.points, isViewer: row.learnerRef === input.viewerRef, isRival: false, badges: row.badges })),
    ...rivals.map((rival) => ({ id: rival.rivalId, name: rival.name, points: rival.points, isViewer: false, isRival: true, badges: { duelWins: 0, podiums: 0 } }))
  ];
  unranked.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  const entries: BoardEntry[] = unranked.map((entry, index) => ({ ...entry, rank: index + 1 }));
  const chase = selectChase(viewerPoints, entries.filter((entry) => !entry.isViewer));
  return { entries, chase, viewerPoints };
}
