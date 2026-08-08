import { queryClient } from "./api";
import { authClient } from "./authClient";
import { learnerScopeKey, meQuery, type MeView } from "./queries";

// Every way a sign-in attempt can be refused, collapsed to what the gate can actually tell the
// learner. Better Auth's own codes are the input; this is the app's vocabulary (ADR-0033).
export type SessionError =
  | "invalid_credentials"
  | "email_taken"
  | "invalid_email"
  | "weak_password"
  | "rate_limited"
  | "unavailable";

export type SessionResult = { ok: true } | { ok: false; error: SessionError };

type AuthFailure = { code?: string | undefined; status?: number | undefined };

// Better Auth answers a rate-limited call with 429 and everything else with a stable `code`
// string (`BASE_ERROR_CODES`), so this maps codes, never messages — copy is free to change
// upstream without silently reclassifying a refusal as `unavailable`.
export function sessionError(failure: AuthFailure): SessionError {
  if (failure.status === 429) return "rate_limited";
  switch (failure.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_PASSWORD":
    case "USER_NOT_FOUND":
    case "CREDENTIAL_ACCOUNT_NOT_FOUND":
      return "invalid_credentials";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "email_taken";
    case "INVALID_EMAIL":
      return "invalid_email";
    case "PASSWORD_TOO_SHORT":
    case "PASSWORD_TOO_LONG":
      return "weak_password";
    default:
      return "unavailable";
  }
}

// The ATOMIC session swap (plan 2026-07-14-001 KTD2), unchanged in contract and now one step
// shorter because there is no client-held credential to install:
//   1. cancel any learner reads still in flight from a prior session, so a late response
//      cannot repopulate the new session's cache,
//   2. remove the learner-scoped subtree so no stale view leaks across learners,
//   3. seed the stable `me` key directly from the sign-in response identity.
// Step 3 is the whole fix for the failed-sign-in-then-sign-up race (R1/R2, AE1): the mounted
// `me` observer flips to signed-in from this write, with no second session round-trip and no
// separate `hasSession` boolean that a stale launch could have already set.
async function adoptSession(user: { id: string; name: string; profileComplete: boolean }): Promise<void> {
  await queryClient.cancelQueries({ queryKey: learnerScopeKey });
  queryClient.removeQueries({ queryKey: learnerScopeKey });
  const nextMe: MeView = { learnerStateRef: user.id, displayName: user.name, profileComplete: user.profileComplete };
  queryClient.setQueryData(meQuery.queryKey, nextMe);
}

// The Google leg cannot seed `me` from its own response: on web the browser has already left
// for the consent screen, and on native the session arrives out of band through the `lrnki://`
// return leg. So the cache is dropped and `me` is re-read from the server instead — same
// swap, one round-trip later.
async function adoptRedirectedSession(): Promise<void> {
  await queryClient.cancelQueries({ queryKey: learnerScopeKey });
  queryClient.removeQueries({ queryKey: learnerScopeKey });
  await queryClient.refetchQueries({ queryKey: meQuery.queryKey });
}

// Email + password is the fallback path and the only path any rig drives (D1). Sign-up takes
// the explorer name inline because Better Auth requires a name, which also marks the profile
// complete — so this route never meets the first-run naming screen (D7).
export async function signUpWithEmail(input: { email: string; password: string; name: string }): Promise<SessionResult> {
  const { data, error } = await authClient.signUp.email({ ...input, profileComplete: true });
  if (error || !data) return { ok: false, error: sessionError(error ?? {}) };
  await adoptSession({ id: data.user.id, name: data.user.name, profileComplete: true });
  return { ok: true };
}

export async function signInWithEmail(input: { email: string; password: string }): Promise<SessionResult> {
  const { data, error } = await authClient.signIn.email(input);
  if (error || !data) return { ok: false, error: sessionError(error ?? {}) };
  await adoptSession(data.user);
  return { ok: true };
}

// The primary sign-in (D1/D5). On web the client navigates to Google and this function's
// caller never resumes; on native the promise resolves only after the system browser has
// closed and the returned session cookie is in SecureStore.
export async function signInWithGoogle(): Promise<SessionResult> {
  const { error } = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
  if (error) return { ok: false, error: sessionError(error) };
  await adoptRedirectedSession();
  return { ok: true };
}

// First-run explorer naming (D7). `profileComplete` is what makes it exactly once, so it is
// written in the same call as the name — a name that landed without the flag would ask again
// on the next launch.
export async function nameExplorer(name: string): Promise<SessionResult> {
  const { error } = await authClient.updateUser({ name, profileComplete: true });
  if (error) return { ok: false, error: sessionError(error) };
  queryClient.setQueryData(meQuery.queryKey, (previous: MeView | null | undefined) =>
    previous ? { ...previous, displayName: name, profileComplete: true } : previous
  );
  return { ok: true };
}

// Sign out is the inverse settle (R3): revoke server-side best-effort, then always drop the
// learner-scoped cache and set `me` to the signed-out `null` so the sign-in gate becomes the
// stable state even if the revoke call fails.
export async function logout(): Promise<void> {
  try {
    await authClient.signOut();
  } finally {
    queryClient.removeQueries({ queryKey: learnerScopeKey });
    queryClient.setQueryData(meQuery.queryKey, null);
  }
}
