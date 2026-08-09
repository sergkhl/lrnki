import { beforeEach, expect, jest, test } from "@jest/globals";

// Two mocked seams, because identity and data are now two clients (ADR-0041): a real
// QueryClient for `@/lib/api` (so cache operations are exercised for real) and jest-fn Better
// Auth methods for `@/lib/authClient`. The Better Auth packages are ESM-only and outside the
// preset's transform allow-list, so mocking the module is also what keeps them out of the
// runner; `authClient.test.ts` covers the one thing that has to be tested against the real one.
jest.mock("@/lib/api", () => {
  // require() is the jest idiom here: a mock factory is hoisted above imports, so it
  // cannot close over an imported binding.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { QueryClient } = require("@tanstack/react-query") as typeof import("@tanstack/react-query");
  return {
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }),
    api: { journal: { $get: jest.fn() } }
  };
});
jest.mock("@/lib/authClient", () => ({
  authClient: {
    getSession: jest.fn(),
    signIn: { email: jest.fn(), social: jest.fn() },
    signUp: { email: jest.fn() },
    signOut: jest.fn(),
    updateUser: jest.fn()
  },
  // The platform branch itself is proved in `authClient.test.ts`; here it is a fixed value, so
  // what these cases show is that both callback fields carry whatever it returns.
  oauthReturnURL: jest.fn(() => "https://lrnki.globesoul.com/")
}));

import { api, queryClient } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import {
  consumeOAuthError,
  logout,
  nameExplorer,
  sessionError,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  type SessionError
} from "./session";
import { expeditionQuery, journalQuery, learnerScopeKey, meQuery } from "./queries";

const getSession = jest.mocked(authClient.getSession);
const signInEmail = jest.mocked(authClient.signIn.email);
const signInSocial = jest.mocked(authClient.signIn.social);
const signUpEmail = jest.mocked(authClient.signUp.email);
const signOut = jest.mocked(authClient.signOut);
const updateUser = jest.mocked(authClient.updateUser);

// `consumeOAuthError` reads two web globals that a node runner does not have, under a
// `Platform.OS` this runner fixes to a native value. Both are supplied for the length of the
// call only — the native cases must keep proving they never reach for either. The module is
// loaded fresh per case because the answer is memoized for a page's lifetime, which is the
// property the two-call case is here to pin down.
function onWeb<T>(href: string, replaceState: jest.Mock, run: (consume: () => SessionError | null) => T): T {
  const target = globalThis as unknown as { window?: unknown };
  const had = "window" in target;
  const previous = target.window;
  target.window = { location: { href }, history: { replaceState } };
  try {
    let loaded!: typeof import("./session");
    jest.isolateModules(() => {
      jest.doMock("react-native", () => ({ Platform: { OS: "web" } }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      loaded = require("./session") as typeof import("./session");
    });
    return run(loaded.consumeOAuthError);
  } finally {
    jest.dontMock("react-native");
    if (had) target.window = previous;
    else delete target.window;
  }
}

// Better Auth's client resolves `{ data, error }` rather than throwing, so the fakes below
// return that envelope — the shape the mapping under test actually reads.
function ok(data: unknown) {
  return { data, error: null } as never;
}
function failed(error: { code?: string; status?: number }) {
  return { data: null, error } as never;
}
const ADA = { id: "user_ada", name: "Ada", profileComplete: true };

beforeEach(() => {
  jest.clearAllMocks();
  queryClient.clear();
});

test("a session that is gone settles signed out and drops every learner-scoped cache (R3)", async () => {
  queryClient.setQueryData(journalQuery.queryKey, { yours: [] } as never);
  queryClient.setQueryData(expeditionQuery("e1").queryKey, { session: {} } as never);
  // A revoked cookie, or one orphaned by a dev DB reset, reads as "no session" — 200 with a
  // null body, never an error.
  getSession.mockResolvedValue(ok(null));

  const settled = await queryClient.fetchQuery(meQuery);

  expect(settled).toBeNull();
  expect(queryClient.getQueryData(journalQuery.queryKey)).toBeUndefined();
  expect(queryClient.getQueryData(expeditionQuery("e1").queryKey)).toBeUndefined();
});

test("a session read that could not complete surfaces as an error, never as a sign-out (R2)", async () => {
  queryClient.setQueryData(journalQuery.queryKey, { yours: [] } as never);
  getSession.mockResolvedValue(failed({ status: 0 }));

  await expect(queryClient.fetchQuery(meQuery)).rejects.toThrow(/session read failed/);

  // The signed-out purge must NOT have run: the learner is still signed in as far as anyone
  // knows, and the route offers retry instead.
  expect(queryClient.getQueryData(journalQuery.queryKey)).toEqual({ yours: [] });
});

test("a failed Enter followed by a successful Set out seeds the new session and drops old data (AE1)", async () => {
  // Stale prior-session state that must not survive the swap.
  queryClient.setQueryData(journalQuery.queryKey, { yours: [{ stale: true }] } as never);

  // Failed Enter: wrong password. No swap.
  signInEmail.mockResolvedValueOnce(failed({ code: "INVALID_EMAIL_OR_PASSWORD", status: 401 }));
  const failure = await signInWithEmail({ email: "ada@example.com", password: "wrong-one" });
  expect(failure).toEqual({ ok: false, error: "invalid_credentials" });
  expect(queryClient.getQueryData(journalQuery.queryKey)).toEqual({ yours: [{ stale: true }] });

  // Successful Set out: new identity returned.
  signUpEmail.mockResolvedValueOnce(ok({ user: { id: "user_ada", name: "Ada" } }));
  const entered = await signUpWithEmail({ email: "ada@example.com", password: "right-one", name: "Ada" });

  expect(entered).toEqual({ ok: true });
  // `me` is seeded directly from the response — no second session round-trip needed.
  expect(queryClient.getQueryData(meQuery.queryKey)).toEqual({
    learnerStateRef: "user_ada",
    displayName: "Ada",
    profileComplete: true
  });
  expect(getSession).not.toHaveBeenCalled();
  // The prior session's learner cache is gone.
  expect(queryClient.getQueryData(journalQuery.queryKey)).toBeUndefined();
});

test("email sign-up completes the profile, so the rigs' path never meets the naming screen (D7)", async () => {
  signUpEmail.mockResolvedValue(ok({ user: { id: "user_ada", name: "Ada" } }));

  await signUpWithEmail({ email: "ada@example.com", password: "right-one", name: "Ada" });

  // The flag is written with the name in ONE call: a name that landed without it would send
  // the learner to a naming screen they already answered.
  expect(signUpEmail).toHaveBeenCalledWith({
    email: "ada@example.com",
    password: "right-one",
    name: "Ada",
    profileComplete: true
  });
});

test("the Google leg sends the same absolute return URL for the success and the failure exit", async () => {
  signInSocial.mockResolvedValue(ok({ url: "https://accounts.google.com/o/oauth2/v2/auth", redirect: true }));

  const result = await signInWithGoogle();

  expect(result).toEqual({ ok: true });
  // Both fields, not just the success one. Better Auth emits each verbatim as the callback's
  // `Location`: a relative `callbackURL` resolved against the API host and landed a successful
  // sign-in on a 404, and an unset `errorCallbackURL` dead-ends a refused leg on the API's own
  // error page — a different domain, with no route back to the app.
  expect(signInSocial).toHaveBeenCalledWith({
    provider: "google",
    callbackURL: "https://lrnki.globesoul.com/",
    errorCallbackURL: "https://lrnki.globesoul.com/"
  });
});

test("a refused Google leg is read off the returned URL, classified once, and stripped", () => {
  const replaceState = jest.fn();

  const returned = onWeb(
    "https://lrnki.globesoul.com/?error=state_mismatch&error_description=state+not+persisted&topic=aqueducts",
    replaceState,
    (consume) => consume()
  );

  // Every OAuth code collapses here: none of them names something the learner can retype.
  expect(returned).toBe("unavailable");
  // Consumed, not merely read — left in place, a reload would re-accuse a learner who has since
  // signed in fine. The strip stays surgical: an unrelated param survives it.
  expect(replaceState).toHaveBeenCalledWith({}, "", "/?topic=aqueducts");
});

test("asking twice in one page load answers the same and strips once (the initializer's premise)", () => {
  const replaceState = jest.fn();

  // The gate reads this from a `useState` initializer, which StrictMode double-invokes. A
  // second answer of `null` would hide the refusal in development only; a second strip would
  // rewrite a URL the learner may have navigated since.
  const answers = onWeb("https://lrnki.globesoul.com/?error=access_denied", replaceState, (consume) => [
    consume(),
    consume()
  ]);

  expect(answers).toEqual(["unavailable", "unavailable"]);
  expect(replaceState).toHaveBeenCalledTimes(1);
});

test("an ordinary web load carries no error param and the URL is left untouched", () => {
  const replaceState = jest.fn();

  expect(onWeb("https://lrnki.globesoul.com/?topic=aqueducts", replaceState, (consume) => consume())).toBeNull();
  expect(replaceState).not.toHaveBeenCalled();
});

test("native never reports a returned OAuth error, because there is no URL to read", () => {
  // Under the runner's native `Platform.OS` and with no `window` stubbed: the guard has to
  // answer before the globals are touched, or this throws instead of returning null.
  expect(consumeOAuthError()).toBeNull();
});

test("a successful entry cancels an in-flight learner read so a late response cannot repopulate it", async () => {
  let resolveJournal: () => void = () => {};
  jest.mocked(api.journal.$get).mockReturnValue(
    new Promise((resolve) => {
      resolveJournal = () => resolve({ ok: true, status: 200, json: async () => ({ yours: [{ stale: true }] }) });
    }) as never
  );
  const inflight = queryClient.fetchQuery(journalQuery).catch(() => {});
  await Promise.resolve();

  signInEmail.mockResolvedValue(ok({ user: ADA }));
  await signInWithEmail({ email: "ada@example.com", password: "right-one" });

  resolveJournal();
  await inflight;
  // The cancelled + removed read's late resolution is discarded, not written to the new session.
  expect(queryClient.getQueryData(journalQuery.queryKey)).toBeUndefined();
});

test("naming the explorer writes the name and the completion flag together (D7)", async () => {
  queryClient.setQueryData(meQuery.queryKey, {
    learnerStateRef: "user_ada",
    displayName: "Ada Lovelace",
    profileComplete: false
  } as never);
  updateUser.mockResolvedValue(ok({ status: true }));

  const result = await nameExplorer("Trailblazer");

  expect(result).toEqual({ ok: true });
  expect(updateUser).toHaveBeenCalledWith({ name: "Trailblazer", profileComplete: true });
  // The route decides on `me`, so the screen must unwind from this write alone.
  expect(queryClient.getQueryData(meQuery.queryKey)).toEqual({
    learnerStateRef: "user_ada",
    displayName: "Trailblazer",
    profileComplete: true
  });
});

test("logout revokes server-side, and cleans up locally even if the revoke fails (R3)", async () => {
  queryClient.setQueryData(journalQuery.queryKey, { yours: [] } as never);
  queryClient.setQueryData(meQuery.queryKey, { learnerStateRef: "user_ada", displayName: "Ada", profileComplete: true } as never);
  signOut.mockRejectedValue(new Error("network down"));

  // The revoke rejection propagates (the `void logout()` caller ignores it), but the
  // finally-block local cleanup still runs.
  await expect(logout()).rejects.toThrow("network down");

  expect(signOut).toHaveBeenCalledTimes(1);
  expect(queryClient.getQueryData(journalQuery.queryKey)).toBeUndefined();
  // `me` settles to the signed-out null — the sign-in gate becomes the stable state.
  expect(queryClient.getQueryData(meQuery.queryKey)).toBeNull();
});

test("refusals are classified by Better Auth's stable code, and 429 outranks all of them", () => {
  expect(sessionError({ code: "INVALID_EMAIL_OR_PASSWORD", status: 401 })).toBe("invalid_credentials");
  expect(sessionError({ code: "USER_ALREADY_EXISTS", status: 422 })).toBe("email_taken");
  expect(sessionError({ code: "PASSWORD_TOO_SHORT", status: 400 })).toBe("weak_password");
  expect(sessionError({ code: "INVALID_EMAIL", status: 400 })).toBe("invalid_email");
  // The limiter answers before the credential is ever checked, so its status decides even when
  // a code rides along.
  expect(sessionError({ code: "INVALID_EMAIL_OR_PASSWORD", status: 429 })).toBe("rate_limited");
  // Anything unrecognized reads as "we could not complete this", never as a bad credential —
  // telling a learner their password is wrong when the server is down is the worse failure.
  expect(sessionError({ status: 500 })).toBe("unavailable");
  expect(sessionError({})).toBe("unavailable");
});

test("every learner read key sits under the one purge prefix; `me` stays outside it", () => {
  for (const key of [journalQuery.queryKey, expeditionQuery("e1").queryKey]) {
    expect(key[0]).toBe(learnerScopeKey[0]);
  }
  expect(meQuery.queryKey[0]).not.toBe(learnerScopeKey[0]);
});
