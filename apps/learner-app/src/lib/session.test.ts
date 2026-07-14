import { beforeEach, expect, jest, test } from "@jest/globals";

// One self-contained mock of the api seam: a real QueryClient (so cache operations are
// exercised for real), an in-memory token, and jest-fn network methods. Everything the
// session/queries modules import from "./api" resolves here.
jest.mock("@/lib/api", () => {
  // require() is the jest idiom here: a mock factory is hoisted above imports, so it
  // cannot close over an imported binding.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { QueryClient } = require("@tanstack/react-query") as typeof import("@tanstack/react-query");
  let token: string | null = null;
  return {
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }),
    readToken: () => token,
    writeToken: (next: string) => {
      token = next;
    },
    clearToken: () => {
      token = null;
    },
    api: {
      session: { $post: jest.fn(), $delete: jest.fn() },
      me: { $get: jest.fn() },
      journal: { $get: jest.fn() }
    }
  };
});

import { api, clearToken, queryClient, readToken, writeToken } from "@/lib/api";
import { enterSession, logout } from "./session";
import { expeditionQuery, journalQuery, learnerScopeKey, meQuery } from "./queries";

const sessionPost = jest.mocked(api.session.$post);
const sessionDelete = jest.mocked(api.session.$delete);
const meGet = jest.mocked(api.me.$get);

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  queryClient.clear();
  clearToken();
});

test("a /me 401 drops the stale token and every learner-scoped cache, settling signed out (R3)", async () => {
  writeToken("stale-token");
  queryClient.setQueryData(journalQuery.queryKey, { yours: [] } as never);
  queryClient.setQueryData(expeditionQuery("e1").queryKey, { session: {} } as never);
  meGet.mockResolvedValue(jsonResponse(401, { error: "unauthorized" }));

  const settled = await queryClient.fetchQuery(meQuery);

  expect(settled).toBeNull();
  expect(readToken()).toBeNull();
  expect(queryClient.getQueryData(journalQuery.queryKey)).toBeUndefined();
  expect(queryClient.getQueryData(expeditionQuery("e1").queryKey)).toBeUndefined();
});

test("a failed Enter followed by a successful Set out seeds the new session and drops old data (AE1)", async () => {
  // Stale prior-session state that must not survive the swap.
  writeToken("old-token");
  queryClient.setQueryData(journalQuery.queryKey, { yours: [{ stale: true }] } as never);

  // Failed Enter: wrong PIN. No token swap, old token retained.
  sessionPost.mockResolvedValueOnce(jsonResponse(200, { error: "wrong_pin" }));
  const failed = await enterSession({ intent: "enter", learnerStateRef: "ada", pin: "0000" });
  expect(failed).toEqual({ ok: false, error: "wrong_pin" });
  expect(readToken()).toBe("old-token");

  // Successful Set out: new identity returned.
  sessionPost.mockResolvedValueOnce(jsonResponse(200, { token: "new-token", learnerStateRef: "ada", displayName: "Ada" }));
  const ok = await enterSession({ intent: "create", learnerStateRef: "ada", pin: "1234" });

  expect(ok).toEqual({ ok: true });
  expect(readToken()).toBe("new-token");
  // `me` is seeded directly from the response — no second /me round-trip needed.
  expect(queryClient.getQueryData(meQuery.queryKey)).toEqual({ learnerStateRef: "ada", displayName: "Ada" });
  expect(meGet).not.toHaveBeenCalled();
  // The prior session's learner cache is gone.
  expect(queryClient.getQueryData(journalQuery.queryKey)).toBeUndefined();
});

test("a successful entry cancels an in-flight learner read so a late response cannot repopulate it", async () => {
  let resolveJournal: () => void = () => {};
  jest.mocked(api.journal.$get).mockReturnValue(
    new Promise((resolve) => {
      resolveJournal = () => resolve(jsonResponse(200, { yours: [{ stale: true }], catalog: [] }));
    }) as never
  );
  const inflight = queryClient.fetchQuery(journalQuery).catch(() => {});
  await Promise.resolve();

  sessionPost.mockResolvedValue(jsonResponse(200, { token: "new-token", learnerStateRef: "ada", displayName: "Ada" }));
  await enterSession({ intent: "enter", learnerStateRef: "ada", pin: "1234" });

  resolveJournal();
  await inflight;
  // The cancelled + removed read's late resolution is discarded, not written to the new session.
  expect(queryClient.getQueryData(journalQuery.queryKey)).toBeUndefined();
});

test("logout revokes server-side, and cleans up locally even if the revoke fails (R3)", async () => {
  writeToken("live-token");
  queryClient.setQueryData(journalQuery.queryKey, { yours: [] } as never);
  queryClient.setQueryData(meQuery.queryKey, { learnerStateRef: "ada", displayName: "Ada" } as never);
  sessionDelete.mockRejectedValue(new Error("network down"));

  // The revoke rejection propagates (the `void logout()` caller ignores it), but the
  // finally-block local cleanup still runs.
  await expect(logout()).rejects.toThrow("network down");

  expect(sessionDelete).toHaveBeenCalledTimes(1);
  expect(readToken()).toBeNull();
  expect(queryClient.getQueryData(journalQuery.queryKey)).toBeUndefined();
  // `me` settles to the signed-out null — the registry gate becomes the stable state.
  expect(queryClient.getQueryData(meQuery.queryKey)).toBeNull();
});

test("every learner read key sits under the one purge prefix; `me` stays outside it", () => {
  for (const key of [journalQuery.queryKey, expeditionQuery("e1").queryKey]) {
    expect(key[0]).toBe(learnerScopeKey[0]);
  }
  expect(meQuery.queryKey[0]).not.toBe(learnerScopeKey[0]);
});
