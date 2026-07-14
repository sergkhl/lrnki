import assert from "node:assert/strict";
import test from "node:test";
import { assembleWeeklyBoard, selectChase, simulateRivals } from "./rivalSimulation";

const base = { learnerRef: "Ada", weekKey: "2026-W28", viewerPoints: 20, count: 9, weekFraction: 0.5 };

test("simulateRivals is deterministic in (learnerRef, weekKey): identical on reload (AE2)", () => {
  const a = simulateRivals(base);
  const b = simulateRivals(base);
  assert.deepEqual(a, b);
  assert.equal(a.length, 9);
});

test("rivals reshuffle across weeks and differ per viewer (R5)", () => {
  const thisWeek = simulateRivals(base).map((rival) => rival.name);
  const nextWeek = simulateRivals({ ...base, weekKey: "2026-W29" }).map((rival) => rival.name);
  const otherViewer = simulateRivals({ ...base, learnerRef: "Grace" }).map((rival) => rival.name);
  assert.notDeepEqual(thisWeek, nextWeek);
  assert.notDeepEqual(thisWeek, otherViewer);
});

test("rival names are deterministic person-derived usernames, not bare first names (AE4)", () => {
  const names = simulateRivals(base).map((rival) => rival.name);

  assert.deepEqual(names, simulateRivals(base).map((rival) => rival.name));
  assert.ok(names.every((name) => /[._0-9]/.test(name)), `expected realistic usernames, got ${names.join(", ")}`);
});

test("scores grow across the day (AE2): later in the week yields higher rival totals", () => {
  const early = simulateRivals({ ...base, weekFraction: 0.2 });
  const late = simulateRivals({ ...base, weekFraction: 0.9 });
  const earlySum = early.reduce((sum, rival) => sum + rival.points, 0);
  const lateSum = late.reduce((sum, rival) => sum + rival.points, 0);
  assert.ok(lateSum > earlySum, "the cohort's total climbs as the week elapses");
});

test("there is always a rival just ahead and just behind the viewer (R6)", () => {
  const rivals = simulateRivals(base);
  assert.ok(rivals.some((rival) => rival.points > base.viewerPoints), "someone is ahead");
  assert.ok(rivals.some((rival) => rival.points < base.viewerPoints), "someone is behind");
});

test("selectChase picks the nearest rival above, else the nearest below when leading (R6)", () => {
  assert.deepEqual(selectChase(20, [{ name: "Nova", points: 23 }, { name: "Kit", points: 30 }, { name: "Lo", points: 12 }]), {
    name: "Nova",
    gap: 3,
    direction: "ahead"
  });
  assert.deepEqual(selectChase(50, [{ name: "Nova", points: 23 }, { name: "Kit", points: 44 }]), { name: "Kit", gap: 6, direction: "behind" });
  assert.equal(selectChase(10, []), null);
});

test("assembleWeeklyBoard fills to 10 rows, ranks them, and flags the viewer (AE2)", () => {
  const { entries, chase, viewerPoints } = assembleWeeklyBoard({
    viewerRef: "Ada",
    realRows: [
      { learnerRef: "Ada", displayName: "Ada", points: 20, badges: { podiums: 0 } },
      { learnerRef: "Bo", displayName: "Bo", points: 8, badges: { podiums: 0 } }
    ],
    weekKey: "2026-W28",
    nowMs: 500,
    weekStartMs: 0,
    weekEndMs: 1000
  });
  assert.equal(entries.length, 10, "2 real + 8 rivals");
  assert.deepEqual(entries.map((entry) => entry.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(entries.filter((entry) => entry.isViewer).length, 1);
  assert.equal(viewerPoints, 20);
  assert.ok(chase, "a chase target exists");
});

test("assembleWeeklyBoard hides zero-point non-viewers but keeps the viewer at 0 and still fills to 10 (R3/AE3)", () => {
  const { entries, viewerPoints } = assembleWeeklyBoard({
    viewerRef: "Ada",
    realRows: [
      { learnerRef: "Ada", displayName: "Ada", points: 0, badges: { podiums: 0 } },
      { learnerRef: "Dormant", displayName: "Dormant", points: 0, badges: { podiums: 0 } },
      { learnerRef: "junk-11c61546", displayName: "junk-11c61546", points: 0, badges: { podiums: 0 } },
      { learnerRef: "Bo", displayName: "Bo", points: 5, badges: { podiums: 0 } }
    ],
    weekKey: "2026-W28",
    nowMs: 500,
    weekStartMs: 0,
    weekEndMs: 1000
  });
  assert.equal(entries.length, 10, "viewer + one scoring real row + rivals fill to 10");
  assert.equal(viewerPoints, 0, "the viewer renders at 0 points");
  assert.equal(entries.filter((entry) => entry.isViewer).length, 1, "the viewer is present at 0");
  assert.ok(!entries.some((entry) => entry.id === "Dormant" || entry.id === "junk-11c61546"), "0-point non-viewers are hidden");
  assert.ok(entries.some((entry) => entry.id === "Bo"), "the scoring real row stays");
});

function realRow(index: number, points: number) {
  return {
    learnerRef: `L${index}`,
    displayName: `Learner ${index}`,
    points,
    badges: { podiums: 0 }
  };
}

test("assembleWeeklyBoard windows more than 10 real learners around a mid-pack viewer (AE2)", () => {
  const realRows = Array.from({ length: 15 }, (_, index) => realRow(index + 1, 150 - index * 10));

  const { entries, chase, viewerPoints } = assembleWeeklyBoard({
    viewerRef: "L8",
    realRows,
    weekKey: "2026-W28",
    nowMs: 500,
    weekStartMs: 0,
    weekEndMs: 1000
  });

  assert.equal(entries.length, 10);
  assert.deepEqual(entries.map((entry) => entry.id), ["L3", "L4", "L5", "L6", "L7", "L8", "L9", "L10", "L11", "L12"]);
  assert.deepEqual(entries.map((entry) => entry.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(entries.find((entry) => entry.isViewer)?.id, "L8");
  assert.equal(viewerPoints, 80);
  assert.deepEqual(chase, { name: "Learner 7", gap: 10, direction: "ahead" });
});

test("assembleWeeklyBoard spills the 10-real-learner window at top and bottom extremes", () => {
  const realRows = Array.from({ length: 15 }, (_, index) => realRow(index + 1, 150 - index * 10));

  const top = assembleWeeklyBoard({
    viewerRef: "L1",
    realRows,
    weekKey: "2026-W28",
    nowMs: 500,
    weekStartMs: 0,
    weekEndMs: 1000
  });
  assert.deepEqual(top.entries.map((entry) => entry.id), ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9", "L10"]);
  assert.deepEqual(top.chase, { name: "Learner 2", gap: 10, direction: "behind" });

  const bottom = assembleWeeklyBoard({
    viewerRef: "L15",
    realRows,
    weekKey: "2026-W28",
    nowMs: 500,
    weekStartMs: 0,
    weekEndMs: 1000
  });
  assert.deepEqual(bottom.entries.map((entry) => entry.id), ["L6", "L7", "L8", "L9", "L10", "L11", "L12", "L13", "L14", "L15"]);
  assert.deepEqual(bottom.chase, { name: "Learner 14", gap: 10, direction: "ahead" });
});
