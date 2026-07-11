import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { OptionSelectBody } from "./ActivityCards";
import { sessionFixture } from "@/learn/sessionFixture";
import type { LearnerGradingResult } from "@/lib/api";

function optionItem() {
  const segment = sessionFixture().studySegmentsByNode.n1[0];
  if (segment.kind !== "option_select") throw new Error("fixture changed");
  return segment.item;
}

test("an ungraded tile selects and submits once", async () => {
  const onSelect = jest.fn();
  await render(<OptionSelectBody item={optionItem()} selectedId={null} result={null} disabled={false} onSelect={onSelect} />);
  await fireEvent.press(screen.getByLabelText("Assignment"));
  expect(onSelect).toHaveBeenCalledWith("o1");
});

test("graded tiles freeze, mark the keyed answer with a check and the wrong pick with an X", async () => {
  const onSelect = jest.fn();
  const result: LearnerGradingResult = {
    kind: "selection",
    graded: true,
    correct: false,
    chosenId: "o2",
    keyedCorrectId: "o1"
  } as LearnerGradingResult;
  await render(<OptionSelectBody item={optionItem()} selectedId={"o2"} result={result} disabled={false} onSelect={onSelect} />);
  await fireEvent.press(screen.getByLabelText("Assignment"));
  expect(onSelect).not.toHaveBeenCalled();
  // Explanation panel appears with the verdict copy; the states are icon+copy, not color alone.
  expect(screen.getByText("Not quite.")).toBeTruthy();
  expect(screen.getByText("Assignment moves ownership.")).toBeTruthy();
  expect(screen.getByLabelText("Assignment").props.accessibilityState.disabled).toBe(true);
  expect(screen.getByLabelText("Borrowing").props.accessibilityState.disabled).toBe(true);
});

test("a pending grade disables further picks without hiding options", async () => {
  const onSelect = jest.fn();
  await render(<OptionSelectBody item={optionItem()} selectedId={"o1"} result={null} disabled={true} onSelect={onSelect} />);
  await fireEvent.press(screen.getByLabelText("Borrowing"));
  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Assignment")).toBeTruthy();
});
