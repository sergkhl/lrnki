import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { CheckpointCircle } from "./CheckpointCircle";
import { buildTrailView } from "@/learn/trailView";
import { sessionFixture } from "@/learn/sessionFixture";

function trail() {
  return buildTrailView(sessionFixture());
}

test("a locked checkpoint is inert and announces its locked state", async () => {
  const view = trail();
  const concept = view.concepts[0];
  const lockedStop = { ...concept.stops[0], state: "locked" as const, isNext: false };
  const onSelect = jest.fn();
  await render(<CheckpointCircle stop={lockedStop} concept={concept} onSelect={onSelect} />);
  const circle = screen.getByLabelText(/Field notes/);
  expect(circle.props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(circle);
  expect(onSelect).not.toHaveBeenCalled();
});

test("the guided next stop carries its label and opens on press", async () => {
  const view = trail();
  const concept = view.concepts[0];
  const next = concept.stops.find((stop) => stop.isNext)!;
  const onSelect = jest.fn();
  await render(<CheckpointCircle stop={next} concept={concept} onSelect={onSelect} />);
  await fireEvent.press(screen.getByLabelText(/Field notes/));
  expect(onSelect).toHaveBeenCalledWith(next.stopId);
  // The next stop shows its kind label under the circle.
  expect(screen.getByText("Field notes")).toBeTruthy();
});

test("a capstone renders the concept's crystal, not a generic icon", async () => {
  const view = trail();
  const concept = view.concepts[0];
  const capstone = concept.stops.find((stop) => stop.kind === "capstone")!;
  await render(<CheckpointCircle stop={{ ...capstone, state: "available" }} concept={concept} onSelect={() => {}} />);
  expect(screen.getByLabelText(/Crystal/)).toBeTruthy();
  expect(screen.getByLabelText("Growing crystal")).toBeTruthy();
});
