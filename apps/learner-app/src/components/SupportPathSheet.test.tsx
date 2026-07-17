import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { PortalHost } from "@rn-primitives/portal";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { ScaffoldDetourView, ScaffoldStepView } from "@lrnki/application/projection";
import { SupportPathSheet } from "./SupportPathSheet";
import { markScaffoldLessonRead, submitScaffoldOptionSelect } from "@/lib/actions";
import { learnerTerm, supportStepsDoneCopy } from "@/learn/vocabulary";

jest.mock("@/lib/actions", () => ({
  markScaffoldLessonRead: jest.fn(() => Promise.resolve()),
  submitScaffoldOptionSelect: jest.fn()
}));

const readMock = markScaffoldLessonRead as jest.Mock;
const submitMock = submitScaffoldOptionSelect as jest.Mock;

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 }
};

function genStep(id: string, ordinal: number, complete: boolean, overrides: Partial<Extract<ScaffoldStepView, { kind: "generated" }>> = {}): Extract<ScaffoldStepView, { kind: "generated" }> {
  return {
    scaffoldStepId: id,
    ordinal,
    kind: "generated",
    label: `Step ${id}`,
    lesson: [{ kind: "definition", text: `Lesson for ${id}.`, groundingProvenance: "generated", isSourceCited: false }],
    item: { scaffoldStepId: id, question: `Question ${id}?`, explanation: "Because.", options: [{ optionId: "o1", text: "Right" }, { optionId: "o2", text: "Wrong" }] },
    lessonRead: complete,
    itemCorrect: complete,
    complete,
    ...overrides
  };
}

function detour(overrides: Partial<ScaffoldDetourView> = {}): ScaffoldDetourView {
  const steps = [genStep("s1", 0, true), genStep("s2", 1, false), genStep("s3", 2, false)];
  return { detourId: "d1", parentDerivedNodeId: "p", term: "borrow checker", status: "ready", steps, completedStepCount: 1, totalStepCount: 3, firstIncompleteStepId: "s2", complete: false, phase: null, ...overrides };
}

async function renderSheet(view: ScaffoldDetourView, handlers: { onHide?: jest.Mock; onOpenReference?: jest.Mock; onOpenChange?: jest.Mock } = {}) {
  const onHide = handlers.onHide ?? jest.fn();
  const onOpenReference = handlers.onOpenReference ?? jest.fn();
  const onOpenChange = handlers.onOpenChange ?? jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <SupportPathSheet
        enrichmentId="e"
        detour={view}
        open
        onOpenChange={onOpenChange}
        onHide={onHide}
        onOpenReference={onOpenReference}
        referenceLabelFor={(id) => `Node ${id}`}
      />
      <PortalHost />
    </SafeAreaProvider>
  );
  return { onHide, onOpenReference, onOpenChange };
}

beforeEach(() => {
  jest.clearAllMocks();
});

test("Covers AE6: an incomplete path resumes at its first incomplete step with the progress header", async () => {
  await renderSheet(detour());
  // Opens step s2 (the projected first incomplete), not the overview and not s1.
  expect(screen.getByText("Lesson for s2.")).toBeTruthy();
  expect(screen.queryByTestId("support-path-step-s1")).toBeNull();
  expect(screen.getAllByText(supportStepsDoneCopy(1, 3)).length).toBeGreaterThan(0);
});

test("the progress header always reaches the step overview for selective review (R13)", async () => {
  await renderSheet(detour());
  await fireEvent.press(screen.getByTestId("support-path-overview"));
  expect(screen.getByTestId("support-path-step-s1")).toBeTruthy();
  expect(screen.getByTestId("support-path-step-s3")).toBeTruthy();
  // Revisit the COMPLETED step without clearing completion: its lesson renders read-first-done.
  await fireEvent.press(screen.getByTestId("support-path-step-s1"));
  expect(screen.getByText("Question s1?")).toBeTruthy();
  expect(screen.getByText(learnerTerm("supportStepDone"))).toBeTruthy();
});

test("a completed path opens at the overview (R13)", async () => {
  const steps = [genStep("s1", 0, true), genStep("s2", 1, true)];
  await renderSheet(detour({ steps, completedStepCount: 2, totalStepCount: 2, firstIncompleteStepId: null, complete: true }));
  expect(screen.getByTestId("support-path-step-s1")).toBeTruthy();
  expect(screen.getByTestId("support-path-step-s2")).toBeTruthy();
});

test("a generated step reads the lesson, grades scaffold-scoped, then advances to the next incomplete step (F2, R17)", async () => {
  submitMock.mockImplementation(() => Promise.resolve({ kind: "selection", graded: true, correct: true, chosenId: "o1", keyedCorrectId: "o1" }));
  await renderSheet(detour());
  await fireEvent.press(screen.getByLabelText(learnerTerm("continueAction")));
  await waitFor(() => expect(readMock).toHaveBeenCalledWith({ enrichmentId: "e", scaffoldStepId: "s2" }));
  await waitFor(() => expect(screen.getByText("Question s2?")).toBeTruthy());
  await fireEvent.press(screen.getByLabelText("Right"));
  await waitFor(() => expect(submitMock).toHaveBeenCalledWith({ enrichmentId: "e", scaffoldStepId: "s2", chosenOptionId: "o1" }));
  await waitFor(() => expect(screen.getByTestId("support-path-continue")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("support-path-continue"));
  // Advances to s3, the next incomplete step, inside the same flow.
  await waitFor(() => expect(screen.getByText("Lesson for s3.")).toBeTruthy());
});

test("Covers AE7: a reference step renders a map transition, never copied neutral content, and routes to the trail (F3)", async () => {
  const refStep: ScaffoldStepView = {
    scaffoldStepId: "r1",
    ordinal: 0,
    kind: "reference",
    referencedDerivedNodeId: "n-9",
    lessonRead: false,
    itemCorrect: false,
    complete: false,
    destination: { kind: "checkpoint", stopId: "n-9:theory:main" }
  };
  const { onOpenReference } = await renderSheet(detour({ steps: [refStep, genStep("s2", 1, false)], completedStepCount: 0, totalStepCount: 2, firstIncompleteStepId: "r1" }));
  expect(screen.getByText("Node n-9")).toBeTruthy();
  expect(screen.getByText(learnerTerm("supportReferenceBody"))).toBeTruthy();
  await fireEvent.press(screen.getByTestId("support-path-reference-go"));
  expect(onOpenReference).toHaveBeenCalledWith(refStep);
});

test("hide lives in the overview and hides the whole path (F4)", async () => {
  const steps = [genStep("s1", 0, true)];
  const { onHide } = await renderSheet(detour({ steps, completedStepCount: 1, totalStepCount: 1, firstIncompleteStepId: null, complete: true }));
  await fireEvent.press(screen.getByTestId("support-path-hide-d1"));
  expect(onHide).toHaveBeenCalledWith("d1");
});
