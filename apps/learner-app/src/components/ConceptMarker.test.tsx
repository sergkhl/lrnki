import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ConceptMarker } from "./ConceptMarker";
import { setLearnerVerdict, refreshLearnerExpedition } from "@/lib/actions";
import { buildTrailView } from "@lrnki/application/projection";
import { sessionFixture } from "@/learn/sessionFixture";
import { learnerTerm } from "@/learn/vocabulary";

jest.mock("@/lib/actions", () => ({
  setLearnerVerdict: jest.fn(() => Promise.resolve()),
  clearLearnerVerdict: jest.fn(() => Promise.resolve()),
  refreshLearnerExpedition: jest.fn(() => Promise.resolve())
}));

beforeEach(() => {
  jest.clearAllMocks();
});

test("the concept row is a disclosure: expanded state toggles and the panel appears", async () => {
  const session = sessionFixture();
  const concept = buildTrailView(session).concepts[0];
  await render(<ConceptMarker concept={concept} session={session} />);
  const row = screen.getByLabelText("Ownership");
  expect(row.props.accessibilityState.expanded).toBe(false);
  await fireEvent.press(row);
  expect(screen.getByLabelText("Ownership").props.accessibilityState.expanded).toBe(true);
  expect(screen.getByLabelText(learnerTerm("skipKnown"))).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Ownership"));
  expect(screen.getByLabelText("Ownership").props.accessibilityState.expanded).toBe(false);
  expect(screen.queryByLabelText(learnerTerm("skipKnown"))).toBeNull();
});

test("skip-as-known still runs the verdict mutation and refresh", async () => {
  const session = sessionFixture();
  const concept = buildTrailView(session).concepts[0];
  await render(<ConceptMarker concept={concept} session={session} />);
  await fireEvent.press(screen.getByLabelText("Ownership"));
  await fireEvent.press(screen.getByLabelText(learnerTerm("skipKnown")));
  await waitFor(() => expect(setLearnerVerdict).toHaveBeenCalledWith({ enrichmentId: "e1", derivedNodeId: "n1", verdict: "known" }));
  await waitFor(() => expect(refreshLearnerExpedition).toHaveBeenCalled());
});
