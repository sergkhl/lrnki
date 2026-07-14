import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { LearnerNameGate, gateErrorMessage } from "./LearnerNameGate";
import { enterSession } from "@/lib/session";
import { learnerTerm } from "@/learn/vocabulary";

jest.mock("@/lib/session", () => ({
  enterSession: jest.fn(),
  logout: jest.fn()
}));

const enterSessionMock = enterSession as jest.MockedFunction<typeof enterSession>;

beforeEach(() => {
  jest.clearAllMocks();
});

test("the PIN field is secure and numeric, both fields keep labels and hints", async () => {
  await render(<LearnerNameGate />);
  const pin = screen.getByLabelText(learnerTerm("pinLabel"));
  expect(pin.props.secureTextEntry).toBe(true);
  expect(pin.props.inputMode).toBe("numeric");
  expect(screen.getByLabelText(learnerTerm("learnerRefLabel"))).toBeTruthy();
  expect(screen.getByText(learnerTerm("gateNameHint"))).toBeTruthy();
  expect(screen.getByText(learnerTerm("gatePinHint"))).toBeTruthy();
});

test("rapid repeated presses submit exactly one session request", async () => {
  let release: (value: { ok: true }) => void = () => {};
  enterSessionMock.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  await render(<LearnerNameGate />);
  const enter = screen.getByLabelText(learnerTerm("enterExplorerAction"));
  await fireEvent.press(enter);
  await fireEvent.press(enter);
  await fireEvent.press(screen.getByLabelText(learnerTerm("createAction")));
  // Single-flight: only the first intent submits while one is pending (the transition to
  // signed-in is owned by the seeded `me` query, not a gate callback — plan U1 KTD1).
  expect(enterSessionMock).toHaveBeenCalledTimes(1);
  release({ ok: true });
  await waitFor(() => expect(screen.queryByText(gateErrorMessage("wrong_pin"))).toBeNull());
});

test("a refusal shows its themed message and clears no error on success", async () => {
  enterSessionMock.mockResolvedValue({ ok: false, error: "wrong_pin" });
  await render(<LearnerNameGate />);
  await fireEvent.press(screen.getByLabelText(learnerTerm("enterExplorerAction")));
  await waitFor(() => expect(screen.getByText(gateErrorMessage("wrong_pin"))).toBeTruthy());
});
