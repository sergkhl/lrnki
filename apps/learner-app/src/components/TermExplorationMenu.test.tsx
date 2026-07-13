import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { TermExplorationMenu } from "./TermExplorationMenu";
import { requestScaffoldDetour } from "@/lib/actions";
import { learnerTerm } from "@/learn/vocabulary";

jest.mock("@/lib/actions", () => ({ requestScaffoldDetour: jest.fn() }));
const requestMock = requestScaffoldDetour as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

test("renders nothing when the activity advertises no terms (AE2)", async () => {
  const view = await render(
    <TermExplorationMenu enrichmentId="e" source={{ kind: "study_item", studyItemId: "i" }} terms={[]} onRequested={jest.fn()} />
  );
  expect(view.toJSON()).toBeNull();
});

test("Covers AE1: one overflow reveals at most three exact term actions", async () => {
  await render(<TermExplorationMenu enrichmentId="e" source={{ kind: "study_item", studyItemId: "i" }} terms={["alpha", "beta", "gamma", "delta"]} onRequested={jest.fn()} />);
  expect(screen.queryByTestId("explore-term-alpha")).toBeNull();
  await fireEvent.press(screen.getByTestId("term-menu-toggle"));
  expect(screen.getByTestId("explore-term-alpha")).toBeTruthy();
  expect(screen.getByTestId("explore-term-gamma")).toBeTruthy();
  // The fourth term is dropped — never more than three actions (R4).
  expect(screen.queryByTestId("explore-term-delta")).toBeNull();
});

test("selecting a term requests once and reports the created detour id (F1)", async () => {
  requestMock.mockImplementation(() => Promise.resolve({ created: true, detourId: "d1", status: "generating" }));
  const onRequested = jest.fn();
  await render(<TermExplorationMenu enrichmentId="e" source={{ kind: "lesson", derivedNodeId: "n" }} terms={["borrow checker"]} onRequested={onRequested} />);
  await fireEvent.press(screen.getByTestId("term-menu-toggle"));
  await fireEvent.press(screen.getByTestId("explore-term-borrow checker"));
  await waitFor(() => expect(onRequested).toHaveBeenCalledWith("d1"));
  expect(requestMock).toHaveBeenCalledTimes(1);
  expect(requestMock).toHaveBeenCalledWith({ enrichmentId: "e", source: { kind: "lesson", derivedNodeId: "n" }, term: "borrow checker" });
});

test("a refused request keeps the disclosure open with retryable copy (R5)", async () => {
  requestMock.mockImplementation(() => Promise.resolve({ created: false, reason: "term_not_advertised" }));
  const onRequested = jest.fn();
  await render(<TermExplorationMenu enrichmentId="e" source={{ kind: "lesson", derivedNodeId: "n" }} terms={["x"]} onRequested={onRequested} />);
  await fireEvent.press(screen.getByTestId("term-menu-toggle"));
  await fireEvent.press(screen.getByTestId("explore-term-x"));
  await waitFor(() => expect(screen.getByText(learnerTerm("termRequestFailed"))).toBeTruthy());
  expect(onRequested).not.toHaveBeenCalled();
});
