import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, queryClient } from "./api";
import { authClient } from "./authClient";

// Typed read layer (R1). The hono client keeps the request paths honest and the response
// payloads derive mechanically from `AppType` (plan 2026-07-12-001 R12): a projection
// field change in the application layer surfaces here as a type error, never as a stale
// hand-written alias.

// Every signed-in read lives under one learner-scoped prefix (plan 2026-07-14-001 KTD2):
// a session swap or sign-out removes this single subtree, so no prior learner's cached
// journal, catalog, expedition, challenge, or leaderboard view can survive into the next
// session. `me` stays OUTSIDE the prefix — it is the session state machine itself (KTD1),
// seeded and settled explicitly rather than purged.
export const LEARNER_SCOPE = "learner" as const;
export const learnerScopeKey = [LEARNER_SCOPE] as const;

export type JournalView = InferResponseType<typeof api.journal.$get, 200>;
export type CatalogView = InferResponseType<typeof api.catalog.$get, 200>;
export type ExpeditionView = InferResponseType<(typeof api.expedition)[":enrichmentId"]["$get"], 200>;

// The signed-in identity, projected from Better Auth's session (ADR-0041). `learnerStateRef`
// keeps its name through the whole app but now carries `user.id` — the same opaque value every
// learner-state row is keyed by (D3), so no screen below needs to know identity changed hands.
export type MeView = { learnerStateRef: string; displayName: string; profileComplete: boolean };

// Structural response shape instead of the DOM `Response`: React Native's fetch types
// disagree with lib.dom on FormData, and ok/status/json are all this layer reads. The
// payload type is INFERRED from the client's typed json() — no per-call generic asserts.
async function unwrap<T>(res: { ok: boolean; status: number; json(): Promise<T> }): Promise<T> {
  if (!res.ok) throw new Error(`request failed: ${res.status}`);
  return await res.json();
}

// The session state machine (KTD1). `me` is the SOLE signed-in source of truth:
//   - pending  → the session cookie is being validated (visible loading, plan U2)
//   - error    → validation could not complete (network); the cookie is UNTOUCHED and the
//                route offers retry — a transient failure must never silently sign out
//   - data     → signed in
//   - null     → signed out (no cookie, or the session behind it is gone)
// Better Auth separates those last two cleanly, which the retired bearer design could not:
// `get-session` answers 200-with-null for "no live session" and only ever populates `error`
// for a call that did not complete. So a revoked or reset-away session settles to the sign-in
// gate while a dead network settles to retry, with no status-code guessing in between.
// The learner-scoped purge stays on the null branch: a stale cookie (a dev DB reset orphans
// them) must not leave the previous learner's journal readable behind the gate (R3).
export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<MeView | null> => {
    const { data, error } = await authClient.getSession();
    if (error) throw new Error(`session read failed: ${error.status}`);
    if (!data) {
      queryClient.removeQueries({ queryKey: learnerScopeKey });
      return null;
    }
    return { learnerStateRef: data.user.id, displayName: data.user.name, profileComplete: data.user.profileComplete };
  },
  staleTime: Infinity
});

export const journalQuery = queryOptions({
  queryKey: [LEARNER_SCOPE, "journal"],
  queryFn: () => api.journal.$get().then(unwrap)
});

// The catalog is deliberately not part of the journal's generation-poll payload.
// It is fetched only after a learner opens Browse all.
export const catalogQuery = queryOptions({
  queryKey: [LEARNER_SCOPE, "catalog"],
  queryFn: () => api.catalog.$get().then(unwrap)
});

export const leaderboardQuery = queryOptions({
  queryKey: [LEARNER_SCOPE, "leaderboard"],
  queryFn: () => api.leaderboard.$get().then(unwrap),
  staleTime: 60_000
});

// The Recall Challenge read (plan 2026-07-13-003 U5, KTD7): the route read IS exact resume —
// the server refolds the immutable lineup + events, so a refreshed fight screen shows the
// same wards, shield, and current item. `null` means over/foreign/unknown: the screen
// returns safely to the trail instead of synthesizing local challenge state.
export type ChallengeReadView = InferResponseType<(typeof api.challenge)[":challengeId"]["$get"], 200>["view"];

export function challengeQuery(challengeId: string) {
  return queryOptions({
    queryKey: [LEARNER_SCOPE, "challenge", challengeId],
    queryFn: async (): Promise<ChallengeReadView | null> => {
      const res = await api.challenge[":challengeId"].$get({ param: { challengeId } });
      if (res.status === 404) return null;
      const body = await unwrap(res);
      return body.view;
    },
    // The fight is mutation-driven: every answer/lifecycle response carries the next view,
    // so background refetches would only race the committed state.
    staleTime: Infinity
  });
}

export function expeditionQuery(enrichmentId: string) {
  return queryOptions({
    queryKey: [LEARNER_SCOPE, "expedition", enrichmentId],
    queryFn: async (): Promise<ExpeditionView | null> => {
      const res = await api.expedition[":enrichmentId"].$get({ param: { enrichmentId } });
      if (res.status === 404) return null;
      return unwrap(res);
    },
    // Poll ONLY while the finished Study Session reports a generating Scaffold Detour (plan
    // 2026-07-12-002 U5): a ready/failed/hidden-only session stops polling. The topic-expedition
    // generation poll is driven by the journal; this cadence is the detour's own.
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && "session" in data && data.session?.generatingDetours ? 5_000 : false;
    }
  });
}
