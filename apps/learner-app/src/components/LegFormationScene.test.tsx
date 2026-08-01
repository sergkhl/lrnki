import { beforeEach, expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { processColor } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { LegFormationScene } from "./LegFormationScene";
import { buildLegPanel, type FormationConceptInput, type FormationSectionInput } from "@/learn/crystalFormationLayout";
import { legStateCopy } from "@/learn/vocabulary";
import type { RecallScopeStatus } from "@lrnki/application/projection";
import { colors } from "@/ui";

const WIDTH = 292; // a 320 px phone's panel width

function concept(id: string, over: Partial<FormationConceptInput> = {}): FormationConceptInput {
  return {
    derivedNodeId: id,
    label: id,
    difficulty: 0.3,
    state: "frontier",
    isKnownSkipped: false,
    sectionIndex: 0,
    sectionPositionIndex: 0,
    growthFraction: 0,
    isMilestone: false,
    isSummit: false,
    gist: null,
    ...over
  };
}

function section(over: Partial<FormationSectionInput> = {}): FormationSectionInput {
  return { sectionIndex: 0, milestoneLabel: "Ridge", state: "available", recallScope: null, ...over };
}

function wonScope(): RecallScopeStatus {
  return {
    scopeKind: "section",
    anchorDerivedNodeId: "m",
    anchorLabel: "Ridge",
    sectionIndex: 0,
    eligibleItemCount: 3,
    state: "won",
    wonChallengeId: "first"
  };
}

const PANEL = () =>
  buildLegPanel(
    section(),
    [
      concept("done", { state: "mastered", growthFraction: 1 }),
      concept("fresh", { state: "mastered", growthFraction: 1, sectionPositionIndex: 1 }),
      concept("skipped", { state: "mastered", isKnownSkipped: true, sectionPositionIndex: 2 }),
      concept("open", { sectionPositionIndex: 3 })
    ],
    WIDTH,
    "open"
  );

beforeEach(() => {
  (useReducedMotion as jest.Mock).mockReturnValue(false);
});

test("collection marks exactly the just-mastered crystal as entering; every other cell is static", async () => {
  await render(<LegFormationScene panel={PANEL()} mode="collection" enteringNodeId="fresh" />);
  expect(screen.getAllByTestId("leg-slot-entering")).toHaveLength(1);
  // The other collected, known-ghost, and awaiting cells render statically alongside.
  expect(screen.getAllByTestId("cavern-cell-collected").length).toBeGreaterThanOrEqual(2);
  expect(screen.getAllByTestId("cavern-cell-known")).toHaveLength(1);
  expect(screen.getAllByTestId("cavern-cell-awaiting")).toHaveLength(1);
});

test("a settled panel without an entering event is fully static (reopen honesty)", async () => {
  await render(<LegFormationScene panel={PANEL()} mode="collection" enteringNodeId={null} />);
  expect(screen.queryAllByTestId("leg-slot-entering")).toHaveLength(0);
});

test("rerendering the same entering event never multiplies the entrance", async () => {
  const view = await render(<LegFormationScene panel={PANEL()} mode="collection" enteringNodeId="fresh" />);
  await view.rerender(<LegFormationScene panel={PANEL()} mode="collection" enteringNodeId="fresh" />);
  expect(screen.getAllByTestId("leg-slot-entering")).toHaveLength(1);
});

test("reduced motion renders the final collected cell immediately with no entrance transform", async () => {
  (useReducedMotion as jest.Mock).mockReturnValue(true);
  await render(<LegFormationScene panel={PANEL()} mode="collection" enteringNodeId="fresh" />);
  expect(screen.queryAllByTestId("leg-slot-entering")).toHaveLength(0);
  expect(screen.getAllByTestId("cavern-cell-collected").length).toBeGreaterThanOrEqual(2);
});

// The single study target says so in words: a fully grown `open` crystal is pixel-identical to a
// collected one, so the chip is load-bearing text, not decoration.
test("exactly one cell carries the Next chip and announces it", async () => {
  await render(<LegFormationScene panel={PANEL()} mode="overview" onSelectNode={() => undefined} />);
  expect(screen.getAllByTestId("cavern-cell-next")).toHaveLength(1);
  expect(screen.getByLabelText("open — Next stop")).toBeTruthy();
});

// One render per test: this jest environment drops any root mounted after the second
// render inside a single test, and an over-limit test poisons the rest of the file.
const STATE_CASES = [
  { name: "future", make: () => buildLegPanel(section({ state: "locked" }), [concept("a")], WIDTH), state: "future" as const, substate: null, badge: null },
  { name: "collecting", make: () => buildLegPanel(section(), [concept("a")], WIDTH), state: "collecting" as const, substate: null, badge: null },
  {
    name: "guardian_ready",
    make: () => buildLegPanel(section({ state: "complete", recallScope: { ...wonScope(), state: "available", wonChallengeId: undefined } }), [concept("a", { state: "mastered" })], WIDTH),
    state: "guardian_ready" as const,
    substate: "available" as const,
    badge: "cavern-badge-ward"
  },
  {
    name: "bound",
    make: () => buildLegPanel(section({ state: "complete", recallScope: wonScope() }), [concept("a", { state: "mastered" })], WIDTH),
    state: "bound" as const,
    substate: null,
    badge: "cavern-badge-seal"
  }
];

test.each(STATE_CASES)("the $name state announces its copy on the panel with its shape badge", async (entry) => {
  const panel = entry.make();
  expect(panel.structuralState).toBe(entry.state);
  await render(<LegFormationScene panel={panel} mode="overview" />);
  expect(screen.getByLabelText(new RegExp(legStateCopy(entry.state, entry.substate)))).toBeTruthy();
  expect(screen.getByTestId(`cavern-panel-${entry.state}`)).toBeTruthy();
  if (entry.badge) expect(screen.getByTestId(entry.badge)).toBeTruthy();
  else {
    expect(screen.queryByTestId("cavern-badge-ward")).toBeNull();
    expect(screen.queryByTestId("cavern-badge-seal")).toBeNull();
  }
});

test("binding plays the keyed one-shot seal + panel-edge sweep; reduced motion settles immediately", async () => {
  const panel = buildLegPanel(section({ state: "complete", recallScope: wonScope() }), [concept("a", { state: "mastered" })], WIDTH);
  await render(<LegFormationScene panel={panel} mode="binding" bindingEventId="win-1" />);
  expect(screen.getByTestId("leg-binding-event")).toBeTruthy();
});

test("the bright gold seal is bounded by the contrast-safe gold ink", async () => {
  const panel = buildLegPanel(section({ state: "complete", recallScope: wonScope() }), [concept("a", { state: "mastered" })], WIDTH);
  await render(<LegFormationScene panel={panel} mode="overview" />);
  expect(screen.getByTestId("cavern-seal-shape").props.fill.payload).toBe(processColor(colors.gold));
  expect(screen.getByTestId("cavern-seal-shape").props.stroke.payload).toBe(processColor(colors["gold-ink"]));
  expect(screen.getByTestId("cavern-seal-roundel").props.stroke.payload).toBe(processColor(colors["gold-ink"]));
});

test("reduced motion skips the binding overlay and shows the sealed bound panel directly", async () => {
  (useReducedMotion as jest.Mock).mockReturnValue(true);
  const panel = buildLegPanel(section({ state: "complete", recallScope: wonScope() }), [concept("a", { state: "mastered" })], WIDTH);
  await render(<LegFormationScene panel={panel} mode="binding" bindingEventId="win-1" />);
  expect(screen.queryByTestId("leg-binding-event")).toBeNull();
  expect(screen.getByTestId("cavern-panel-bound")).toBeTruthy();
  expect(screen.getByTestId("cavern-badge-seal")).toBeTruthy();
});

test("a future leg fogs every cell with no growth fill and no growth bar", async () => {
  const future = buildLegPanel(
    section({ state: "locked" }),
    [concept("a", { state: "locked" }), concept("b", { state: "locked", sectionPositionIndex: 1 })],
    WIDTH
  );
  await render(<LegFormationScene panel={future} mode="overview" />);
  expect(screen.getByTestId("cavern-panel-future")).toBeTruthy();
  expect(screen.queryAllByTestId("specimen-fill")).toHaveLength(0);
  expect(screen.queryAllByTestId("cavern-cell-bar")).toHaveLength(0);
  expect(screen.getAllByTestId("specimen-body").length).toBe(2);
});
