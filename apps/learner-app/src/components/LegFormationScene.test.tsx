import { beforeEach, expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { useReducedMotion } from "react-native-reanimated";
import { LegFormationScene } from "./LegFormationScene";
import { SLOT_SIZE, buildLegModel, type FormationConceptInput, type FormationSectionInput } from "@/learn/crystalFormationLayout";
import { legStateCopy } from "@/learn/vocabulary";
import type { RecallScopeStatus } from "@lrnki/application/projection";

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

const LEG = () =>
  buildLegModel(
    section(),
    [
      concept("done", { state: "mastered", growthFraction: 1 }),
      concept("fresh", { state: "mastered", growthFraction: 1, sectionPositionIndex: 1 }),
      concept("skipped", { state: "mastered", isKnownSkipped: true, sectionPositionIndex: 2 }),
      concept("open", { sectionPositionIndex: 3 })
    ],
    [{ source: "done", target: "fresh", uncertain: false }]
  );

beforeEach(() => {
  (useReducedMotion as jest.Mock).mockReturnValue(false);
});

test("collection marks exactly the just-mastered specimen as entering; every other slot is static", async () => {
  await render(<LegFormationScene leg={LEG()} mode="collection" focusNodeId="fresh" enteringNodeId="fresh" width={220} />);
  expect(screen.getAllByTestId("leg-slot-entering")).toHaveLength(1);
  // The other collected, known-ghost, and awaiting slots render statically alongside.
  expect(screen.getAllByTestId("leg-slot-collected").length).toBeGreaterThanOrEqual(2);
  expect(screen.getAllByTestId("leg-slot-known")).toHaveLength(1);
  expect(screen.getAllByTestId("leg-slot-awaiting")).toHaveLength(1);
});

test("a settled scene without an entering event is fully static (AE2 reopen)", async () => {
  await render(<LegFormationScene leg={LEG()} mode="collection" focusNodeId="fresh" enteringNodeId={null} width={220} />);
  expect(screen.queryAllByTestId("leg-slot-entering")).toHaveLength(0);
});

test("rerendering the same entering event never multiplies the entrance", async () => {
  const view = await render(
    <LegFormationScene leg={LEG()} mode="collection" focusNodeId="fresh" enteringNodeId="fresh" width={220} />
  );
  await view.rerender(<LegFormationScene leg={LEG()} mode="collection" focusNodeId="fresh" enteringNodeId="fresh" width={220} />);
  expect(screen.getAllByTestId("leg-slot-entering")).toHaveLength(1);
});

test("reduced motion renders the final collected slot immediately with no entrance transform", async () => {
  (useReducedMotion as jest.Mock).mockReturnValue(true);
  await render(<LegFormationScene leg={LEG()} mode="collection" focusNodeId="fresh" enteringNodeId="fresh" width={220} />);
  expect(screen.queryAllByTestId("leg-slot-entering")).toHaveLength(0);
  expect(screen.getAllByTestId("leg-slot-collected").length).toBeGreaterThanOrEqual(2);
});

// One render per test: this jest environment drops any root mounted after the second
// render inside a single test, and an over-limit test poisons the rest of the file.
const STATE_CASES = [
  { name: "future", make: () => buildLegModel(section({ state: "locked" }), [concept("a")], []), state: "future" as const, substate: null },
  { name: "collecting", make: () => buildLegModel(section(), [concept("a")], []), state: "collecting" as const, substate: null },
  {
    name: "guardian_ready",
    make: () => buildLegModel(section({ state: "complete", recallScope: { ...wonScope(), state: "available", wonChallengeId: undefined } }), [concept("a", { state: "mastered" })], []),
    state: "guardian_ready" as const,
    substate: "available" as const
  },
  { name: "bound", make: () => buildLegModel(section({ state: "complete", recallScope: wonScope() }), [concept("a", { state: "mastered" })], []), state: "bound" as const, substate: null }
];

test.each(STATE_CASES)("the $name state announces its copy and shape-differentiated seam/matrix", async (entry) => {
  const leg = entry.make();
  expect(leg.structuralState).toBe(entry.state);
  await render(<LegFormationScene leg={leg} mode="overview" width={220} />);
  expect(screen.getByLabelText(new RegExp(legStateCopy(entry.state, entry.substate)))).toBeTruthy();
  expect(screen.getByTestId(`leg-matrix-${entry.state}`)).toBeTruthy();
  expect(screen.getByTestId(`leg-seam-${entry.state === "bound" ? "sealed" : "open"}`)).toBeTruthy();
});

test("exact veins render as their own structure alongside the nonsemantic branch", async () => {
  await render(<LegFormationScene leg={LEG()} mode="overview" width={220} />);
  expect(screen.getAllByTestId("leg-vein")).toHaveLength(1);
  expect(screen.getByTestId("leg-branch")).toBeTruthy();
});

test("a future leg ghosts every slot with no grown facet", async () => {
  const future = buildLegModel(section({ state: "locked" }), [concept("a", { state: "locked" }), concept("b", { state: "locked", sectionPositionIndex: 1 })], []);
  await render(<LegFormationScene leg={future} mode="overview" width={220} />);
  expect(screen.queryAllByTestId("facet-grown")).toHaveLength(0);
  expect(screen.getAllByTestId("facet-ghost").length).toBeGreaterThan(0);
});

test("the collection crop keeps the full specimen at 40 px or larger", async () => {
  const leg = LEG();
  await render(<LegFormationScene leg={leg} mode="collection" focusNodeId="fresh" enteringNodeId={null} width={220} />);
  const svg = screen.getByLabelText(/Ridge/);
  // The host component receives the parsed viewBox as vbWidth/vbHeight.
  const cropWidth = svg.props.vbWidth as number;
  expect(cropWidth).toBeLessThanOrEqual(leg.width);
  // Rendered specimen px = SLOT_SIZE / cropWidth * rendered width — never below 40 (R14).
  expect((SLOT_SIZE / cropWidth) * 220).toBeGreaterThanOrEqual(40);
});
