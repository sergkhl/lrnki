import { beforeEach, expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { useReducedMotion } from "react-native-reanimated";
import { LegFormationScene } from "./LegFormationScene";
import { buildLegModel, type FormationConceptInput, type FormationSectionInput } from "@/learn/crystalFormationLayout";
import { legStateCopy } from "@/learn/vocabulary";
import type { RecallScopeStatus } from "@lrnki/application/projection";

const WIDTH = 320;

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

const LEG = () =>
  buildLegModel(
    section(),
    [
      concept("done", { state: "mastered", growthFraction: 1 }),
      concept("fresh", { state: "mastered", growthFraction: 1, sectionPositionIndex: 1 }),
      concept("skipped", { state: "mastered", isKnownSkipped: true, sectionPositionIndex: 2 }),
      concept("open", { sectionPositionIndex: 3 })
    ],
    WIDTH
  );

beforeEach(() => {
  (useReducedMotion as jest.Mock).mockReturnValue(false);
});

test("collection marks exactly the just-mastered specimen as entering; every other slot is static", async () => {
  await render(<LegFormationScene leg={LEG()} mode="collection" enteringNodeId="fresh" />);
  expect(screen.getAllByTestId("leg-slot-entering")).toHaveLength(1);
  // The other collected, known-ghost, and awaiting slots render statically alongside.
  expect(screen.getAllByTestId("leg-slot-collected").length).toBeGreaterThanOrEqual(2);
  expect(screen.getAllByTestId("leg-slot-known")).toHaveLength(1);
  expect(screen.getAllByTestId("leg-slot-awaiting")).toHaveLength(1);
});

test("a settled scene without an entering event is fully static (reopen honesty)", async () => {
  await render(<LegFormationScene leg={LEG()} mode="collection" enteringNodeId={null} />);
  expect(screen.queryAllByTestId("leg-slot-entering")).toHaveLength(0);
});

test("rerendering the same entering event never multiplies the entrance", async () => {
  const view = await render(<LegFormationScene leg={LEG()} mode="collection" enteringNodeId="fresh" />);
  await view.rerender(<LegFormationScene leg={LEG()} mode="collection" enteringNodeId="fresh" />);
  expect(screen.getAllByTestId("leg-slot-entering")).toHaveLength(1);
});

test("reduced motion renders the final collected slot immediately with no entrance transform", async () => {
  (useReducedMotion as jest.Mock).mockReturnValue(true);
  await render(<LegFormationScene leg={LEG()} mode="collection" enteringNodeId="fresh" />);
  expect(screen.queryAllByTestId("leg-slot-entering")).toHaveLength(0);
  expect(screen.getAllByTestId("leg-slot-collected").length).toBeGreaterThanOrEqual(2);
});

// One render per test: this jest environment drops any root mounted after the second
// render inside a single test, and an over-limit test poisons the rest of the file.
const STATE_CASES = [
  { name: "future", make: () => buildLegModel(section({ state: "locked" }), [concept("a")], WIDTH), state: "future" as const, substate: null, badge: null },
  { name: "collecting", make: () => buildLegModel(section(), [concept("a")], WIDTH), state: "collecting" as const, substate: null, badge: null },
  {
    name: "guardian_ready",
    make: () => buildLegModel(section({ state: "complete", recallScope: { ...wonScope(), state: "available", wonChallengeId: undefined } }), [concept("a", { state: "mastered" })], WIDTH),
    state: "guardian_ready" as const,
    substate: "available" as const,
    badge: "island-badge-guardian"
  },
  {
    name: "bound",
    make: () => buildLegModel(section({ state: "complete", recallScope: wonScope() }), [concept("a", { state: "mastered" })], WIDTH),
    state: "bound" as const,
    substate: null,
    badge: "island-badge-seal"
  }
];

test.each(STATE_CASES)("the $name state announces its copy on the rim with its shape badge (D4)", async (entry) => {
  const leg = entry.make();
  expect(leg.structuralState).toBe(entry.state);
  await render(<LegFormationScene leg={leg} mode="overview" />);
  expect(screen.getByLabelText(new RegExp(legStateCopy(entry.state, entry.substate)))).toBeTruthy();
  expect(screen.getByTestId(`island-rim-${entry.state}`)).toBeTruthy();
  if (entry.badge) expect(screen.getByTestId(entry.badge)).toBeTruthy();
  else {
    expect(screen.queryByTestId("island-badge-guardian")).toBeNull();
    expect(screen.queryByTestId("island-badge-seal")).toBeNull();
  }
});

test("binding plays the keyed one-shot seal + rim sweep; reduced motion settles immediately", async () => {
  const leg = buildLegModel(section({ state: "complete", recallScope: wonScope() }), [concept("a", { state: "mastered" })], WIDTH);
  await render(<LegFormationScene leg={leg} mode="binding" bindingEventId="win-1" />);
  expect(screen.getByTestId("leg-binding-event")).toBeTruthy();
});

test("reduced motion skips the binding overlay and shows the sealed bound rim directly", async () => {
  (useReducedMotion as jest.Mock).mockReturnValue(true);
  const leg = buildLegModel(section({ state: "complete", recallScope: wonScope() }), [concept("a", { state: "mastered" })], WIDTH);
  await render(<LegFormationScene leg={leg} mode="binding" bindingEventId="win-1" />);
  expect(screen.queryByTestId("leg-binding-event")).toBeNull();
  expect(screen.getByTestId("island-rim-bound")).toBeTruthy();
});

test("a future leg ghosts every slot with no fill", async () => {
  const future = buildLegModel(section({ state: "locked" }), [concept("a", { state: "locked" }), concept("b", { state: "locked", sectionPositionIndex: 1 })], WIDTH);
  await render(<LegFormationScene leg={future} mode="overview" />);
  expect(screen.getByTestId("island-rim-future").props.opacity).toBeUndefined();
  expect(screen.queryAllByTestId("specimen-fill")).toHaveLength(0);
  expect(screen.getAllByTestId("specimen-ghost").length).toBe(2);
});
