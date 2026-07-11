import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PlanExpeditionSheet, canPlanExpedition } from "./PlanExpeditionSheet";
import { learnerTerm } from "@/learn/vocabulary";

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 }
};

beforeEach(() => {
  jest.clearAllMocks();
});

async function openSheet(onCreate: (topic: string) => Promise<void>) {
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <PlanExpeditionSheet exampleTopics={["Game Theory", "Photosynthesis"]} onCreate={onCreate} />
    </SafeAreaProvider>
  );
  await fireEvent.press(screen.getByLabelText("Plan a new expedition"));
}

test("empty topic keeps the submit disabled; an example chip fills the field", async () => {
  const onCreate = jest.fn(() => Promise.resolve());
  await openSheet(onCreate);
  const submit = screen.getByLabelText(learnerTerm("topicDoor"));
  expect(submit.props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(submit);
  expect(onCreate).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText("Use example topic: Game Theory"));
  expect(screen.getByLabelText("Topic").props.value).toBe("Game Theory");
});

test("submitting sends one request and blocks sheet dismissal while pending", async () => {
  let release: () => void = () => {};
  const onCreate = jest.fn(() => new Promise<void>((resolve) => { release = resolve; }));
  await openSheet(onCreate);
  await fireEvent.press(screen.getByLabelText("Use example topic: Photosynthesis"));
  const submit = screen.getByLabelText(learnerTerm("topicDoor"));
  await fireEvent.press(submit);
  await fireEvent.press(submit);
  expect(onCreate).toHaveBeenCalledTimes(1);
  expect(onCreate).toHaveBeenCalledWith("Photosynthesis");
  // Pending: pan-down is disabled on the sheet primitive and the close control refuses.
  expect(screen.getByTestId("bottom-sheet").props.accessibilityHint).toBe("pan-disabled");
  const close = screen.getByLabelText("Close");
  expect(close.props.accessibilityState.disabled).toBe(true);
  release();
  await waitFor(() => expect(screen.queryByTestId("bottom-sheet")).toBeNull());
});
