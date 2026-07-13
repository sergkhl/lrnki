import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ScaffoldDetourView, ScaffoldStepView } from "@lrnki/application/projection";
import { SupportPathNode } from "./SupportPathNode";
import { learnerTerm, scaffoldPhaseCopy, supportStepsDoneCopy } from "@/learn/vocabulary";

function genStep(id: string, complete: boolean): ScaffoldStepView {
  return { scaffoldStepId: id, ordinal: 0, kind: "generated", label: `Step ${id}`, lesson: [], item: { scaffoldStepId: id, question: "q", explanation: "e", options: [] }, lessonRead: complete, itemCorrect: complete, complete };
}

function detour(overrides: Partial<ScaffoldDetourView> = {}): ScaffoldDetourView {
  return { detourId: "d1", parentDerivedNodeId: "p", term: "borrow checker", status: "ready", steps: [genStep("s1", true), genStep("s2", false), genStep("s3", false)], completedStepCount: 1, totalStepCount: 3, firstIncompleteStepId: "s2", complete: false, phase: null, ...overrides };
}

async function renderNode(view: ScaffoldDetourView) {
  const onPress = jest.fn();
  await render(<SupportPathNode detour={view} onPress={onPress} />);
  return onPress;
}

test("Covers AE6: a partial ready detour renders ONE node with 1/3 progress and no step rows or chevron", async () => {
  await renderNode(detour());
  expect(screen.getByText("borrow checker")).toBeTruthy();
  expect(screen.getByText("1/3")).toBeTruthy();
  expect(screen.getByText(supportStepsDoneCopy(1, 3))).toBeTruthy();
  // No map-level Support Step text rows or disclosure remain (R12).
  expect(screen.queryByText("Step s1")).toBeNull();
  expect(screen.queryByTestId("scaffold-step-s1")).toBeNull();
});

test("pressing the node delegates the whole detour to the root", async () => {
  const onPress = await renderNode(detour());
  await fireEvent.press(screen.getByTestId("support-path-node-d1"));
  expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ detourId: "d1", status: "ready" }));
});

test("generating and failed states are distinguishable by text, not color alone, on the same footprint", async () => {
  await renderNode(detour({ status: "generating", phase: "building", steps: [], completedStepCount: 0, totalStepCount: 0, firstIncompleteStepId: null }));
  expect(screen.getByText(scaffoldPhaseCopy("building"))).toBeTruthy();
  expect(
    screen.getByLabelText(`${learnerTerm("supportPathNode")}: “borrow checker”. ${scaffoldPhaseCopy("building")}`)
  ).toBeTruthy();

  await render(<SupportPathNode detour={detour({ status: "failed", steps: [], firstIncompleteStepId: null })} onPress={() => {}} />);
  expect(screen.getByText(learnerTerm("supportFailedTitle"))).toBeTruthy();
});

test("a complete path announces the completed state in its accessible name", async () => {
  await renderNode(detour({ steps: [genStep("s1", true)], completedStepCount: 1, totalStepCount: 1, firstIncompleteStepId: null, complete: true }));
  expect(screen.getByText(learnerTerm("supportPathComplete"))).toBeTruthy();
  expect(
    screen.getByLabelText(`${learnerTerm("supportPathNode")}: “borrow checker”. ${learnerTerm("supportPathComplete")}`)
  ).toBeTruthy();
});
