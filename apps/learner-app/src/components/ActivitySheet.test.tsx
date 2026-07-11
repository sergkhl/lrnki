import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { PortalHost } from "@rn-primitives/portal";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ActivitySheet } from "./ActivitySheet";
import { submitLearnerOptionSelect } from "@/lib/actions";
import { sessionFixture } from "@/learn/sessionFixture";
import { learnerTerm } from "@/learn/vocabulary";

jest.mock("@/lib/actions", () => ({
  markLearnerLessonRead: jest.fn(() => Promise.resolve()),
  refreshLearnerExpedition: jest.fn(() => Promise.resolve()),
  submitLearnerOptionSelect: jest.fn(),
  submitLearnerImpostor: jest.fn(),
  submitLearnerMatching: jest.fn(),
  validateLearnerMatchingAttempt: jest.fn()
}));

const submitMock = submitLearnerOptionSelect as jest.Mock;

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 }
};

beforeEach(() => {
  jest.clearAllMocks();
});

function renderSheet(stopId: string, onOpenChange = jest.fn()) {
  const session = sessionFixture();
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ActivitySheet session={session} stopId={stopId} open onOpenChange={onOpenChange} />
      <PortalHost />
    </SafeAreaProvider>
  ).then(() => onOpenChange);
}

test("an option-select stop opens under its own question header (AE3)", async () => {
  await renderSheet("n1:option_select:i1");
  // Header title is the concept label; the description is the kind label the trail used.
  expect(screen.getAllByText(learnerTerm("question")).length).toBeGreaterThan(0);
  expect(screen.getByText("What moves ownership?")).toBeTruthy();
});

test("grading blocks explicit close until the request settles, then one result is shown", async () => {
  let release: (value: unknown) => void = () => {};
  submitMock.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  const onOpenChange = await renderSheet("n1:option_select:i1");
  await fireEvent.press(screen.getByLabelText("Assignment"));
  expect(submitMock).toHaveBeenCalledTimes(1);
  // While pending: close control is disabled and dismissal is refused.
  await fireEvent.press(screen.getByLabelText("Close"));
  expect(onOpenChange).not.toHaveBeenCalled();
  release({ kind: "selection", graded: true, correct: true, chosenId: "o1", keyedCorrectId: "o1" });
  await waitFor(() => expect(screen.getByText("Correct.")).toBeTruthy());
  await fireEvent.press(screen.getByLabelText("Close"));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("a theory stop shows lesson content and its continue action", async () => {
  await renderSheet("n1:theory:main");
  expect(screen.getAllByText(learnerTerm("theoryStop")).length).toBeGreaterThan(0);
  expect(screen.getByLabelText(learnerTerm("continueAction"))).toBeTruthy();
});
