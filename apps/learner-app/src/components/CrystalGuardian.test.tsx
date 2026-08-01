import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { CrystalGuardian, type GuardianPhase } from "./CrystalGuardian";
import { OBELISK_APEX_Y, OBELISK_BASE_Y } from "@/learn/guardianObelisk";
import { learnerTerm } from "@/learn/vocabulary";
import type { RecallChallengeView } from "@lrnki/application/projection";

// U2 rendering contract (plan 2026-07-31-002, KTD1–KTD9). The Guardian is ONE stable body whose
// ordered segments ARE the ward count — the separate ward arc and the three-crystal cluster are
// gone with no compatibility path. A real challenge carries one to five Leg wards or one to
// seven Expedition wards, so these scenarios exercise the actual production range rather than
// the illustrative three of the concept mock. (Jest gotcha: one render per test — later states
// come from `rerender`, which is also what proves the body never reflows.)
//
// There is no victory scenario because the component has no victory phase: a committed win is
// the Crystal Formation reward's beat, and `GuardianPhase` is the two drawn states only.

type GuardianProps = Readonly<{
  scopeKind: RecallChallengeView["scopeKind"];
  phase: GuardianPhase;
  wardTotal: number;
  wardsRemaining: number;
  shieldRemaining: number;
  shieldTotal: number;
}>;

function guardian(overrides: Partial<GuardianProps> = {}) {
  const props: GuardianProps = {
    scopeKind: "section",
    phase: "active",
    wardTotal: 5,
    wardsRemaining: 5,
    shieldRemaining: 3,
    shieldTotal: 3,
    ...overrides
  };
  return <CrystalGuardian {...props} />;
}

function segmentCount(state: "resolved" | "current" | "queued"): number {
  return screen.queryAllByTestId(`guardian-ward-segment-${state}`).length;
}

// react-native-svg compiles a polygon's `points` into a `d` path, so the rendered geometry is
// read back off `d` — the same seam CrystalSpecimen's suite uses.
function pathOf(testID: string): string {
  return screen.getByTestId(testID).props.d as string;
}

function pathsOfSegments(): string[] {
  return screen.queryAllByTestId(/guardian-ward-segment-/).map((segment) => segment.props.d as string);
}

function coordinates(path: string): number[] {
  return (path.match(/-?[\d.]+/g) ?? []).map(Number);
}

function topY(path: string): number {
  return Math.min(...coordinates(path).filter((_, index) => index % 2 === 1));
}

function bottomY(path: string): number {
  return Math.max(...coordinates(path).filter((_, index) => index % 2 === 1));
}

function vertexCount(path: string): number {
  return coordinates(path).length / 2;
}

test("a fresh five-ward Leg Guardian stands as one frame with the base ward current", async () => {
  await render(guardian({ wardTotal: 5, wardsRemaining: 5 }));
  expect(segmentCount("resolved")).toBe(0);
  expect(segmentCount("current")).toBe(1);
  expect(segmentCount("queued")).toBe(4);
  // The current ward is at the base, and the complete silhouette is already drawn.
  expect(bottomY(pathOf("guardian-ward-segment-current"))).toBe(OBELISK_BASE_Y);
  expect(topY(pathOf("guardian-obelisk-frame"))).toBe(OBELISK_APEX_Y);
  // The superseded encodings are gone, not merely unused.
  expect(screen.queryByTestId("ward-intact")).toBeNull();
  expect(screen.queryByTestId("ward-broken")).toBeNull();
});

test("a partly fought Guardian keeps resolved, current, and queued summing to the ward total", async () => {
  await render(guardian({ wardTotal: 5, wardsRemaining: 3 }));
  expect(segmentCount("resolved")).toBe(2);
  expect(segmentCount("current")).toBe(1);
  expect(segmentCount("queued")).toBe(2);
  expect(segmentCount("resolved") + segmentCount("current") + segmentCount("queued")).toBe(5);
});

test("the Final Ward is the crown of the body", async () => {
  await render(guardian({ wardTotal: 5, wardsRemaining: 1 }));
  expect(segmentCount("resolved")).toBe(4);
  expect(segmentCount("current")).toBe(1);
  expect(segmentCount("queued")).toBe(0);
  // Base-to-crown progression means the last ward standing is literally the apex.
  expect(topY(pathOf("guardian-ward-segment-current"))).toBe(OBELISK_APEX_Y);
});

test("Last Stand changes the phase treatment but never the ward segmentation", async () => {
  const rendered = await render(guardian({ wardTotal: 5, wardsRemaining: 3, shieldRemaining: 0 }));
  const active = pathOf("guardian-ward-segment-current");
  await rendered.rerender(
    guardian({ phase: "recovery", wardTotal: 5, wardsRemaining: 3, shieldRemaining: 0 })
  );
  expect(segmentCount("resolved")).toBe(2);
  expect(segmentCount("current")).toBe(1);
  expect(segmentCount("queued")).toBe(2);
  expect(pathOf("guardian-ward-segment-current")).toBe(active);
  // The learner's own shield is fully spent while every ward slot is untouched.
  expect(screen.queryAllByTestId("shield-intact")).toHaveLength(0);
  expect(screen.queryAllByTestId("shield-spent")).toHaveLength(3);
});

test("a one-ward Guardian is the complete body rather than a lone fragment", async () => {
  await render(guardian({ wardTotal: 1, wardsRemaining: 1 }));
  expect(segmentCount("current")).toBe(1);
  expect(segmentCount("resolved") + segmentCount("queued")).toBe(0);
  expect(pathOf("guardian-ward-segment-current")).toBe(pathOf("guardian-obelisk-frame"));
});

test("the Expedition Guardian renders seven wards under its own summit ward crown", async () => {
  const rendered = await render(
    guardian({ scopeKind: "enrichment", wardTotal: 7, wardsRemaining: 4 })
  );
  expect(segmentCount("resolved")).toBe(3);
  expect(segmentCount("current")).toBe(1);
  expect(segmentCount("queued")).toBe(3);
  const trident = pathOf("guardian-ward-emblem");
  await rendered.rerender(guardian({ scopeKind: "section", wardTotal: 7, wardsRemaining: 4 }));
  const diamond = pathOf("guardian-ward-emblem");
  // Shape, not hue, is what separates the two duels: the summit's trident and the Leg's
  // diamond come from the crystal library's own silhouettes.
  expect(vertexCount(trident)).toBe(13);
  expect(vertexCount(diamond)).toBe(4);
  expect(trident).not.toBe(diamond);
});

// Regression (plan 2026-07-31-003 U5 real-use gate): the first real summit duel rendered the
// visible title "Expedition Guardian" over a figure whose accessible label said "Crystal
// Guardian" — the Leg's name. Sighted and assistive readers must be told the same thing.
test("the summit figure announces itself by its own scope title", async () => {
  const rendered = await render(guardian({ scopeKind: "enrichment", wardTotal: 7, wardsRemaining: 7 }));
  expect(
    screen.getByLabelText(`${learnerTerm("guardianSummitTitle")}: 7 of 7 wards, shield 3 of 3`)
  ).toBeTruthy();
  await rendered.rerender(guardian({ scopeKind: "section", wardTotal: 5, wardsRemaining: 5 }));
  expect(
    screen.getByLabelText(`${learnerTerm("guardianTitle")}: 5 of 5 wards, shield 3 of 3`)
  ).toBeTruthy();
});

test("the body never reflows as wards resolve", async () => {
  const rendered = await render(guardian({ wardTotal: 5, wardsRemaining: 5 }));
  const frame = pathOf("guardian-obelisk-frame");
  const geometry = pathsOfSegments();
  for (const wardsRemaining of [4, 3, 2, 1, 0]) {
    await rendered.rerender(guardian({ wardTotal: 5, wardsRemaining }));
    expect(pathOf("guardian-obelisk-frame")).toBe(frame);
    expect(pathsOfSegments()).toEqual(geometry);
  }
});

test("spending a shield leaves every ward exactly where it was", async () => {
  const rendered = await render(guardian({ wardTotal: 5, wardsRemaining: 3, shieldRemaining: 3 }));
  const states = screen.queryAllByTestId(/guardian-ward-segment-/).map((segment) => segment.props.testID as string);
  await rendered.rerender(guardian({ wardTotal: 5, wardsRemaining: 3, shieldRemaining: 1 }));
  expect(screen.queryAllByTestId(/guardian-ward-segment-/).map((segment) => segment.props.testID as string)).toEqual(states);
  expect(screen.queryAllByTestId("shield-intact")).toHaveLength(1);
  expect(screen.queryAllByTestId("shield-spent")).toHaveLength(2);
});

test("the whole figure is one labeled image carrying the exact ward and shield counts", async () => {
  await render(guardian({ wardTotal: 5, wardsRemaining: 3, shieldRemaining: 2 }));
  expect(
    screen.getByLabelText(`${learnerTerm("guardianTitle")}: 3 of 5 wards, shield 2 of 3`)
  ).toBeTruthy();
  // Segments are never separate accessibility elements — the figure label and the visible
  // status line in GuardianStage are the concise state authority.
  expect(
    screen.queryAllByTestId(/guardian-ward-segment-/).every((segment) => segment.props.accessibilityLabel === undefined)
  ).toBe(true);
});

test("Last Stand names itself in the accessible label", async () => {
  await render(guardian({ phase: "recovery", wardTotal: 5, wardsRemaining: 2, shieldRemaining: 0 }));
  expect(
    screen.getByLabelText(
      `${learnerTerm("guardianTitle")}: 2 of 5 wards, shield 0 of 3, ${learnerTerm("guardianLastStand")}`
    )
  ).toBeTruthy();
});
