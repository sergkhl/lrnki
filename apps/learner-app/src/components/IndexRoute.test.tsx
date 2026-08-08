import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";

jest.mock("@/lib/api", () => {
  // require() is the jest idiom here: a mock factory is hoisted above imports, so it
  // cannot close over an imported binding.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { QueryClient } = require("@tanstack/react-query") as typeof import("@tanstack/react-query");
  return {
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }),
    api: { journal: { $get: jest.fn() }, leaderboard: { $get: jest.fn() } }
  };
});
jest.mock("@/lib/authClient", () => ({ authClient: { getSession: jest.fn() } }));
jest.mock("@/lib/session", () => ({
  logout: jest.fn(() => Promise.resolve()),
  signInWithEmail: jest.fn(),
  signInWithGoogle: jest.fn(),
  signUpWithEmail: jest.fn(),
  nameExplorer: jest.fn()
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
  useLocalSearchParams: () => ({})
}));

import JournalPage from "@/app/index";
import { api, queryClient } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { logout } from "@/lib/session";
import { meQuery } from "@/lib/queries";
import { learnerTerm } from "@/learn/vocabulary";

const getSession = jest.mocked(authClient.getSession);
const journalGet = jest.mocked(api.journal.$get);
const logoutMock = jest.mocked(logout);

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 }
};

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as never;
}

function renderPage() {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <QueryClientProvider client={queryClient}>
        <JournalPage />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  queryClient.clear();
  getSession.mockResolvedValue({ data: null, error: null } as never);
  jest.mocked(api.leaderboard.$get).mockResolvedValue(jsonResponse(200, { rows: [], week: "2026-W28" }));
});

test("a session cookie being validated shows a visible loading state, never a blank frame (R6)", async () => {
  getSession.mockReturnValue(new Promise(() => {}) as never); // pending forever
  await renderPage();
  expect(screen.getByText(learnerTerm("sessionValidating"))).toBeTruthy();
});

test("a session validation network error offers retry instead of signing out (R2)", async () => {
  getSession.mockResolvedValue({ data: null, error: { status: 0 } } as never);
  await renderPage();
  await waitFor(() => expect(screen.getByText(learnerTerm("sessionErrorTitle"))).toBeTruthy());
  expect(screen.getByText(learnerTerm("retryAction"))).toBeTruthy();
  // A transport failure is NOT a sign-out: the gate must not be what the learner sees.
  expect(screen.queryByText(learnerTerm("gateTitle"))).toBeNull();
});

test("no live session settles to the sign-in gate (R3)", async () => {
  await renderPage();
  await waitFor(() => expect(screen.getByText(learnerTerm("gateTitle"))).toBeTruthy());
});

test("a signed-in learner who has not named their explorer is routed to the naming screen (D7)", async () => {
  // What a first Google sign-in looks like: a real session carrying the provider's own name.
  queryClient.setQueryData(meQuery.queryKey, {
    learnerStateRef: "user_ada",
    displayName: "Ada Lovelace",
    profileComplete: false
  } as never);

  await renderPage();

  await waitFor(() => expect(screen.getByText(learnerTerm("nameGateTitle"))).toBeTruthy());
  // The journal is not merely hidden behind the screen — it is never requested. The route's
  // hooks run before its early returns, so this is what proves the gate actually gates rather
  // than fetching the surface it is standing in front of.
  expect(journalGet).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue("Ada Lovelace")).toBeTruthy();
});

test("a Journal failure after sign-in stays signed in and offers Retry + Sign out (AE2)", async () => {
  // Seed a signed-in, named session directly, as a successful entry would (KTD2).
  queryClient.setQueryData(meQuery.queryKey, {
    learnerStateRef: "user_ada",
    displayName: "Ada",
    profileComplete: true
  } as never);
  journalGet.mockRejectedValue(new Error("journal down"));

  await renderPage();

  await waitFor(() => expect(screen.getByText(learnerTerm("journalErrorTitle"))).toBeTruthy());
  // Never bounced back to the gate.
  expect(screen.queryByText(learnerTerm("gateTitle"))).toBeNull();

  await fireEvent.press(screen.getByText(learnerTerm("logoutAction")));
  expect(logoutMock).toHaveBeenCalledTimes(1);

  const callsBeforeRetry = journalGet.mock.calls.length;
  await fireEvent.press(screen.getByText(learnerTerm("retryAction")));
  await waitFor(() => expect(journalGet.mock.calls.length).toBeGreaterThan(callsBeforeRetry));
});
