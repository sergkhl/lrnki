import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { PortalHost } from "@rn-primitives/portal";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { ScaffoldStepView } from "@lrnki/application/projection";
import { ScaffoldStepSheet } from "./ScaffoldStepSheet";
import { markScaffoldLessonRead, submitScaffoldOptionSelect } from "@/lib/actions";
import { learnerTerm } from "@/learn/vocabulary";

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

function step(overrides: Partial<Extract<ScaffoldStepView, { kind: "generated" }>> = {}): Extract<ScaffoldStepView, { kind: "generated" }> {
  return {
    scaffoldStepId: "s1",
    ordinal: 0,
    kind: "generated",
    label: "Borrow checker",
    lesson: [{ kind: "definition", text: "The borrow checker enforces aliasing rules.", groundingProvenance: "generated", isSourceCited: false }],
    item: { scaffoldStepId: "s1", question: "What does it enforce?", explanation: "Aliasing rules.", options: [{ optionId: "o1", text: "Aliasing rules" }, { optionId: "o2", text: "Nothing" }] },
    lessonRead: false,
    itemCorrect: false,
    complete: false,
    ...overrides
  };
}

async function renderSheet(generated = step()) {
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ScaffoldStepSheet enrichmentId="e" step={generated} open onOpenChange={jest.fn()} />
      <PortalHost />
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

test("reads the generated micro-lesson first, marks it read, then reveals the question (R11-R12)", async () => {
  await renderSheet();
  expect(screen.getByText("The borrow checker enforces aliasing rules.")).toBeTruthy();
  expect(screen.getByText(learnerTerm("supportGeneratedBadge"))).toBeTruthy();
  await fireEvent.press(screen.getByLabelText(learnerTerm("continueAction")));
  await waitFor(() => expect(readMock).toHaveBeenCalledWith({ enrichmentId: "e", scaffoldStepId: "s1" }));
  await waitFor(() => expect(screen.getByText("What does it enforce?")).toBeTruthy());
});

test("answering the generated option-select grades through the scaffold-scoped path (R19)", async () => {
  submitMock.mockImplementation(() => Promise.resolve({ kind: "selection", graded: true, correct: true, chosenId: "o1", keyedCorrectId: "o1" }));
  await renderSheet(step({ lessonRead: true }));
  await fireEvent.press(screen.getByLabelText("Aliasing rules"));
  await waitFor(() => expect(submitMock).toHaveBeenCalledWith({ enrichmentId: "e", scaffoldStepId: "s1", chosenOptionId: "o1" }));
  await waitFor(() => expect(screen.getByText("Correct.")).toBeTruthy());
});
