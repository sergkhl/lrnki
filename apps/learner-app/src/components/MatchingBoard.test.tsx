import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { MatchingBoard } from "./MatchingBoard";
import type { StudyMatchingView } from "@lrnki/application/projection";

function matchingItem(): StudyMatchingView {
  return {
    studyItemId: "m1",
    derivedNodeId: "n1",
    question: "Match each term.",
    groundingProvenance: "generated",
    prompts: [
      { promptId: "p1", text: "Owner" },
      { promptId: "p2", text: "Borrower" }
    ],
    matches: [
      { matchId: "a1", text: "Holds the value" },
      { matchId: "a2", text: "Uses it temporarily" }
    ]
  } as StudyMatchingView;
}

beforeEach(() => {
  jest.clearAllMocks();
});

test("a correct pair locks with its check and completion submits the trace once", async () => {
  const onAttempt = jest.fn(() => Promise.resolve(true));
  const onComplete = jest.fn(() => Promise.resolve());
  await render(<MatchingBoard item={matchingItem()} result={null} disabled={false} onAttempt={onAttempt} onComplete={onComplete} />);
  await fireEvent.press(screen.getByLabelText("Owner"));
  await fireEvent.press(screen.getByLabelText("Holds the value"));
  await waitFor(() => expect(onAttempt).toHaveBeenCalledWith("p1", "a1"));
  await waitFor(() => expect(screen.getByLabelText("Owner").props.accessibilityState.disabled).toBe(true));
  await fireEvent.press(screen.getByLabelText("Borrower"));
  await fireEvent.press(screen.getByLabelText("Uses it temporarily"));
  await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  expect((onComplete as jest.Mock).mock.calls[0][0]).toEqual([
    { promptId: "p1", chosenMatchId: "a1" },
    { promptId: "p2", chosenMatchId: "a2" }
  ]);
});

test("a wrong pair resets for another attempt without submitting", async () => {
  const onAttempt = jest.fn(() => Promise.resolve(false));
  const onComplete = jest.fn(() => Promise.resolve());
  await render(<MatchingBoard item={matchingItem()} result={null} disabled={false} onAttempt={onAttempt} onComplete={onComplete} />);
  await fireEvent.press(screen.getByLabelText("Owner"));
  await fireEvent.press(screen.getByLabelText("Uses it temporarily"));
  await waitFor(() => expect(onAttempt).toHaveBeenCalledWith("p1", "a2"));
  expect(onComplete).not.toHaveBeenCalled();
  // Both tiles stay enabled for the retry.
  await waitFor(() => expect(screen.getByLabelText("Owner").props.accessibilityState.disabled).toBe(false));
});

test("a wrong pair fires one warning haptic and completion one success haptic (scenarios 4, 9)", async () => {
  const onAttempt = jest.fn((promptId: string) => Promise.resolve(promptId === "p1"));
  const onComplete = jest.fn(() => Promise.resolve());
  await render(<MatchingBoard item={matchingItem()} result={null} disabled={false} onAttempt={onAttempt} onComplete={onComplete} />);
  // Wrong pair: exactly one warning notification for the attempt.
  await fireEvent.press(screen.getByLabelText("Borrower"));
  await fireEvent.press(screen.getByLabelText("Holds the value"));
  await waitFor(() => expect(onAttempt).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(Haptics.notificationAsync).toHaveBeenCalledWith("warning"));
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
});
