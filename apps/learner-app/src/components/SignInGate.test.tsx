import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SignInGate, sessionErrorMessage } from "./SignInGate";
import { consumeOAuthError, signInWithEmail, signInWithGoogle, signUpWithEmail } from "@/lib/session";
import { learnerTerm } from "@/learn/vocabulary";
import { E2E_FIXTURE_EMAIL, E2E_FIXTURE_PASSWORD } from "@/lib/e2eFixture";

jest.mock("@/lib/session", () => ({
  consumeOAuthError: jest.fn(),
  signInWithEmail: jest.fn(),
  signInWithGoogle: jest.fn(),
  signUpWithEmail: jest.fn()
}));

const signIn = signInWithEmail as jest.MockedFunction<typeof signInWithEmail>;
const signUp = signUpWithEmail as jest.MockedFunction<typeof signUpWithEmail>;
const google = signInWithGoogle as jest.MockedFunction<typeof signInWithGoogle>;
const returnedError = consumeOAuthError as jest.MockedFunction<typeof consumeOAuthError>;

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_LRNKI_E2E_BUILD;
  jest.clearAllMocks();
  signIn.mockResolvedValue({ ok: true });
  signUp.mockResolvedValue({ ok: true });
  google.mockResolvedValue({ ok: true });
  // The ordinary mount: the learner arrived without a failed OAuth leg behind them.
  returnedError.mockReturnValue(null);
});

test("the fixture-only one-tap sign-in is absent outside e2e builds", async () => {
  await render(<SignInGate />);
  expect(screen.queryByTestId("gate-e2e-signin")).toBeNull();
});

test("the e2e build signs in through the real email route with the shared fixture identity", async () => {
  process.env.EXPO_PUBLIC_LRNKI_E2E_BUILD = "1";
  await render(<SignInGate />);

  await fireEvent.press(screen.getByTestId("gate-e2e-signin"));

  await waitFor(() =>
    expect(signIn).toHaveBeenCalledWith({
      email: E2E_FIXTURE_EMAIL,
      password: E2E_FIXTURE_PASSWORD
    })
  );
});

test("the gate opens on Enter and offers Google as the primary route", async () => {
  await render(<SignInGate />);
  expect(screen.getByText(learnerTerm("googleAction"))).toBeTruthy();
  expect(screen.getByText(learnerTerm("enterExplorerAction"))).toBeTruthy();
  // The name field belongs to sign-up only: asking a returning learner for it is what makes
  // a mistyped email silently create a second explorer.
  expect(screen.queryByTestId("gate-name")).toBeNull();
});

test("switching to Set out asks for the explorer name and signs up with all three fields", async () => {
  await render(<SignInGate />);
  await fireEvent.press(screen.getByTestId("gate-toggle-intent"));

  await fireEvent.changeText(screen.getByTestId("gate-name"), "Ada");
  await fireEvent.changeText(screen.getByTestId("gate-email"), "ada@example.com");
  await fireEvent.changeText(screen.getByTestId("gate-password"), "trailhead-8");
  await fireEvent.press(screen.getByTestId("gate-create"));

  await waitFor(() =>
    expect(signUp).toHaveBeenCalledWith({ email: "ada@example.com", password: "trailhead-8", name: "Ada" })
  );
  expect(signIn).not.toHaveBeenCalled();
});

test("the email route signs in with exactly what was typed", async () => {
  await render(<SignInGate />);
  await fireEvent.changeText(screen.getByTestId("gate-email"), "ada@example.com");
  await fireEvent.changeText(screen.getByTestId("gate-password"), "trailhead-8");
  await fireEvent.press(screen.getByTestId("gate-enter"));

  await waitFor(() => expect(signIn).toHaveBeenCalledWith({ email: "ada@example.com", password: "trailhead-8" }));
  expect(google).not.toHaveBeenCalled();
});

test("a route in flight locks the others, so one gate cannot open two sessions", async () => {
  let release: (result: { ok: true }) => void = () => {};
  google.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  await render(<SignInGate />);

  await fireEvent.press(screen.getByText(learnerTerm("googleAction")));
  await fireEvent.press(screen.getByTestId("gate-enter"));
  await fireEvent.press(screen.getByText(learnerTerm("googleAction")));

  expect(google).toHaveBeenCalledTimes(1);
  expect(signIn).not.toHaveBeenCalled();
  release({ ok: true });
  await waitFor(() => expect(screen.queryByText(sessionErrorMessage("unavailable"))).toBeNull());
});

test("a Google leg that failed away from the app is reported by the gate it returns to", async () => {
  // The browser left for the consent screen and came back to a fresh mount, so the refusal
  // arrives from the URL rather than from the press that started it — before this, the learner
  // was left on the API's error page on another domain with nothing to read.
  returnedError.mockReturnValue("unavailable");

  await render(<SignInGate />);

  await waitFor(() => expect(screen.getByText(sessionErrorMessage("unavailable"))).toBeTruthy());
  expect(returnedError).toHaveBeenCalled();
});

test("a refusal is shown in the gate's own words and cleared by switching intent", async () => {
  signIn.mockResolvedValue({ ok: false, error: "invalid_credentials" });
  await render(<SignInGate />);

  await fireEvent.press(screen.getByTestId("gate-enter"));
  await waitFor(() => expect(screen.getByText(sessionErrorMessage("invalid_credentials"))).toBeTruthy());

  // The message described the other intent's attempt; leaving it up would accuse the learner of
  // a bad password on a form that is now asking them to create one.
  await fireEvent.press(screen.getByTestId("gate-toggle-intent"));
  expect(screen.queryByText(sessionErrorMessage("invalid_credentials"))).toBeNull();
});
