import { api, clearToken, queryClient, writeToken } from "./api";
import { learnerScopeKey, meQuery, type MeView } from "./queries";
import type { GateError } from "@/components/LearnerNameGate";

export type SessionResult = { ok: true } | { ok: false; error: GateError | "rate_limited" };

// Login/register against POST /session — the one place PINs exist (KTD8). On success the
// session is swapped ATOMICALLY (plan 2026-07-14-001 KTD2) instead of `queryClient.clear()`:
//   1. cancel any learner reads still in flight from a prior session, so a late response
//      cannot repopulate the new session's cache,
//   2. remove the learner-scoped subtree so no stale view leaks across learners,
//   3. install the new token,
//   4. seed the stable `me` key directly from the response identity.
// Step 4 is the whole fix for the failed-login-then-signup race (R1/R2, AE1): the mounted
// `me` observer flips to signed-in from this write, with no second `/me` round-trip and no
// separate `hasToken` boolean that a stale launch could have already set.
export async function enterSession(input: { intent: "enter" | "create"; learnerStateRef: string; pin: string }): Promise<SessionResult> {
  const res = await api.session.$post({ json: input });
  const body = await res.json();
  if ("token" in body) {
    await queryClient.cancelQueries({ queryKey: learnerScopeKey });
    queryClient.removeQueries({ queryKey: learnerScopeKey });
    writeToken(body.token);
    const nextMe: MeView = { learnerStateRef: body.learnerStateRef, displayName: body.displayName };
    queryClient.setQueryData(meQuery.queryKey, nextMe);
    return { ok: true };
  }
  // A zod 400 has a structured error object; the gate shows it as invalid input.
  const error = typeof body.error === "string" ? body.error : "invalid_name";
  return { ok: false, error };
}

// Sign out is the inverse settle (R3): revoke server-side best-effort, then always drop the
// credential and the learner-scoped cache and set `me` to the signed-out `null` so the
// registry gate becomes the stable state even if the revoke call fails.
export async function logout(): Promise<void> {
  try {
    await api.session.$delete();
  } finally {
    clearToken();
    queryClient.removeQueries({ queryKey: learnerScopeKey });
    queryClient.setQueryData(meQuery.queryKey, null);
  }
}
