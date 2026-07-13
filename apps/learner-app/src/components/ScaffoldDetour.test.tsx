import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ScaffoldDetourView, ScaffoldStepView } from "@lrnki/application/projection";
import { ScaffoldDetour } from "./ScaffoldDetour";
import { learnerTerm } from "@/learn/vocabulary";

function genStep(id: string, complete: boolean): ScaffoldStepView {
  return { scaffoldStepId: id, ordinal: 0, kind: "generated", label: `Step ${id}`, lesson: [], item: { scaffoldStepId: id, question: "q", explanation: "e", options: [] }, lessonRead: complete, itemCorrect: complete, complete };
}

function detour(overrides: Partial<ScaffoldDetourView> = {}): ScaffoldDetourView {
  return { detourId: "d1", parentDerivedNodeId: "p", term: "borrow checker", status: "ready", group: "active", steps: [genStep("s1", false)], complete: false, phase: null, ...overrides };
}

const noop = {
  onToggleExpand: jest.fn(),
  onOpenGeneratedStep: jest.fn(),
  onOpenReferenceStep: jest.fn(),
  onRetry: jest.fn(),
  onHide: jest.fn(),
  onOpenProgress: jest.fn(),
  referenceLabelFor: (id: string) => `Node ${id}`
};

async function renderDetour(view: ScaffoldDetourView, expanded = false, overrides: Partial<typeof noop> = {}) {
  const handlers = { ...noop, ...overrides };
  await render(<ScaffoldDetour detour={view} expanded={expanded} {...handlers} />);
  return handlers;
}

test("a generating detour shows a broad phase and reopens the progress dialog (R15)", async () => {
  const onOpenProgress = jest.fn();
  await renderDetour(detour({ status: "generating", group: "generating", phase: "building", steps: [] }), false, { onOpenProgress });
  expect(screen.getByText(learnerTerm("supportPhaseBuilding"))).toBeTruthy();
  await fireEvent.press(screen.getByLabelText(learnerTerm("supportViewProgress")));
  expect(onOpenProgress).toHaveBeenCalledWith("d1");
});

test("Covers AE5: a failed detour offers Retry and Dismiss", async () => {
  const onRetry = jest.fn();
  const onHide = jest.fn();
  await renderDetour(detour({ status: "failed", group: "failed", steps: [] }), false, { onRetry, onHide });
  await fireEvent.press(screen.getByLabelText(learnerTerm("supportRetry")));
  expect(onRetry).toHaveBeenCalledWith("d1");
  await fireEvent.press(screen.getByLabelText(learnerTerm("supportDismiss")));
  expect(onHide).toHaveBeenCalledWith("d1");
});

test("a ready detour toggles expansion (collapsed) and opens a generated step (expanded) (AE6)", async () => {
  const onToggleExpand = jest.fn();
  await renderDetour(detour(), false, { onToggleExpand });
  await fireEvent.press(screen.getByLabelText(`${learnerTerm("exploreTermAction")} “borrow checker”`));
  expect(onToggleExpand).toHaveBeenCalled();
});

test("an expanded ready detour opens its generated step (AE6)", async () => {
  const onOpenGeneratedStep = jest.fn();
  await renderDetour(detour({ steps: [genStep("s1", false)] }), true, { onOpenGeneratedStep });
  await fireEvent.press(screen.getByTestId("scaffold-step-s1"));
  expect(onOpenGeneratedStep).toHaveBeenCalledTimes(1);
});

test("a reference step uses the referenced node label and opens the neutral node (R9)", async () => {
  const onOpenReferenceStep = jest.fn();
  const refStep: ScaffoldStepView = { scaffoldStepId: "r1", ordinal: 0, kind: "reference", referencedDerivedNodeId: "n-9", complete: false };
  await renderDetour(detour({ steps: [refStep] }), true, { onOpenReferenceStep });
  await fireEvent.press(screen.getByTestId("scaffold-step-r1"));
  expect(onOpenReferenceStep).toHaveBeenCalledWith("n-9");
  expect(screen.getByText("Node n-9")).toBeTruthy();
});

test("Covers R20: support_explored group label under a mastered parent", async () => {
  await renderDetour(detour({ group: "support_explored", complete: true, steps: [genStep("s1", true)] }), false);
  expect(screen.getByText(learnerTerm("supportExploredGroup"))).toBeTruthy();
});

test("Covers R20: support_available group label for a not-yet-complete detour", async () => {
  await renderDetour(detour({ group: "support_available", steps: [genStep("s1", false)] }), false);
  expect(screen.getByText(learnerTerm("supportAvailableGroup"))).toBeTruthy();
});

test("a ready detour's expanded overflow hides the support (R18)", async () => {
  const onHide = jest.fn();
  await renderDetour(detour(), true, { onHide });
  await fireEvent.press(screen.getByLabelText(learnerTerm("supportHide")));
  expect(onHide).toHaveBeenCalledWith("d1");
});
