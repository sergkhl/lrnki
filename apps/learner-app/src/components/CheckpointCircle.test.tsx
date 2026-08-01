import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { CheckpointCircle } from "./CheckpointCircle";
import { buildTrailView } from "@lrnki/application/projection";
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
  // Uncharted parchment treatment (plan 2026-07-18-001 KTD7): faded ink ring on the
  // deep wash, never the legacy dark fog fill.
  expect(circle.props.className).toContain("border-map-ink-soft");
  expect(circle.props.className).toContain("bg-map-parchment-deep");
  expect(circle.props.className).not.toContain("bg-fog");
});

test("an available checkpoint reads as an ink ring on parchment", async () => {
  const view = trail();
  const concept = view.concepts[0];
  const available = { ...concept.stops[0], state: "available" as const, isNext: false };
  await render(<CheckpointCircle stop={available} concept={concept} onSelect={() => {}} />);
  const circle = screen.getByLabelText(/Field notes/);
  expect(circle.props.className).toContain("border-map-ink");
  expect(circle.props.className).toContain("bg-card");
});

test("the guided next stop carries its label and opens on press", async () => {
  const view = trail();
  const concept = view.concepts[0];
  const next = concept.stops.find((stop) => stop.isNext)!;
  const onSelect = jest.fn();
  await render(<CheckpointCircle stop={next} concept={concept} onSelect={onSelect} />);
  const circle = screen.getByLabelText(/Field notes/);
  await fireEvent.press(circle);
  expect(onSelect).toHaveBeenCalledWith(next.stopId);
  expect(circle.props.className).toContain("rounded-full");
  expect(circle.props.style[0]).toEqual({ width: 72, height: 72 });
  expect(circle.props.style[1]).toEqual({ transform: [{ scale: 1 }] });
  // The next stop shows its kind label under the circle.
  expect(screen.getByText("Field notes")).toBeTruthy();
});

test("a capstone renders the concept's mineral specimen, not a generic icon", async () => {
  const view = trail();
  const concept = view.concepts[0];
  const capstone = concept.stops.find((stop) => stop.kind === "capstone")!;
  await render(<CheckpointCircle stop={{ ...capstone, state: "available" }} concept={concept} onSelect={() => {}} />);
  expect(screen.getByLabelText(/Crystal/)).toBeTruthy();
  expect(screen.getByLabelText("Growing crystal")).toBeTruthy();
  // The capstone is the smallest surface carrying real crystal art (MIN_SPECIMEN_PX).
  expect(screen.getByTestId("specimen-body")).toBeTruthy();
});

test("a known-skipped complete capstone stays a ghost slot and never a collected mineral", async () => {
  const view = trail();
  const concept = { ...view.concepts[0], isKnownSkipped: true };
  const capstone = concept.stops.find((stop) => stop.kind === "capstone")!;
  await render(<CheckpointCircle stop={{ ...capstone, state: "complete" }} concept={concept} onSelect={() => {}} />);
  // Known ground stays fogged stone: no risen fill, so a skip never reads as collected.
  expect(screen.getByTestId("specimen-body")).toBeTruthy();
  expect(screen.queryAllByTestId("specimen-fill")).toHaveLength(0);
  expect(screen.getByLabelText("Ghost slot")).toBeTruthy();
});
