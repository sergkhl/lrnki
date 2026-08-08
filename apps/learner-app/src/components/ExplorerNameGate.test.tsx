import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ExplorerNameGate } from "./ExplorerNameGate";
import { sessionErrorMessage } from "./SignInGate";
import { nameExplorer } from "@/lib/session";
import { learnerTerm } from "@/learn/vocabulary";

jest.mock("@/lib/session", () => ({ nameExplorer: jest.fn() }));

const name = nameExplorer as jest.MockedFunction<typeof nameExplorer>;

beforeEach(() => {
  jest.clearAllMocks();
  name.mockResolvedValue({ ok: true });
});

test("the provider's name is prefilled but editable, and submitted as chosen", async () => {
  await render(<ExplorerNameGate suggestedName="Ada Lovelace" />);
  expect(screen.getByDisplayValue("Ada Lovelace")).toBeTruthy();

  await fireEvent.changeText(screen.getByTestId("name-gate-name"), "Trailblazer");
  await fireEvent.press(screen.getByTestId("name-gate-submit"));

  await waitFor(() => expect(name).toHaveBeenCalledWith("Trailblazer"));
});

test("a blank name is refused here, because nothing upstream refuses it", async () => {
  await render(<ExplorerNameGate suggestedName="Ada Lovelace" />);
  await fireEvent.changeText(screen.getByTestId("name-gate-name"), "   ");
  await fireEvent.press(screen.getByTestId("name-gate-submit"));

  expect(screen.getByText(learnerTerm("invalidNameMessage"))).toBeTruthy();
  // Better Auth accepts an empty name, so a call here would put a nameless explorer on the
  // shared board AND mark the profile complete, closing the only screen that could fix it.
  expect(name).not.toHaveBeenCalled();
});

test("surrounding whitespace never reaches the shared board", async () => {
  await render(<ExplorerNameGate suggestedName="  Ada  " />);
  await fireEvent.press(screen.getByTestId("name-gate-submit"));

  await waitFor(() => expect(name).toHaveBeenCalledWith("Ada"));
});

test("a failed write keeps the learner on the screen with the refusal in view", async () => {
  name.mockResolvedValue({ ok: false, error: "unavailable" });
  await render(<ExplorerNameGate suggestedName="Ada" />);

  await fireEvent.press(screen.getByTestId("name-gate-submit"));

  await waitFor(() => expect(screen.getByText(sessionErrorMessage("unavailable"))).toBeTruthy());
  // The screen is gated on `profileComplete`, which the failed write did not set — so it must
  // still be here to retry rather than having unwound on an unsaved name.
  expect(screen.getByText(learnerTerm("nameGateTitle"))).toBeTruthy();
});
