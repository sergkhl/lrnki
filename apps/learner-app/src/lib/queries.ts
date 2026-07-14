import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, clearToken, queryClient, readToken } from "./api";

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
export type MeView = InferResponseType<typeof api.me.$get, 200>;

// Structural response shape instead of the DOM `Response`: React Native's fetch types
// disagree with lib.dom on FormData, and ok/status/json are all this layer reads. The
// payload type is INFERRED from the client's typed json() — no per-call generic asserts.
async function unwrap<T>(res: { ok: boolean; status: number; json(): Promise<T> }): Promise<T> {
  if (!res.ok) throw new Error(`request failed: ${res.status}`);
  return await res.json();
}

// The session state machine (KTD1). `me` is the SOLE signed-in source of truth:
//   - pending  → a stored token is being validated (visible loading, plan U2)
//   - error    → validation could not complete (network); the token is RETAINED and the
//                route offers retry — a transient failure must never silently sign out
//   - data     → signed in
//   - null     → signed out (no token, or the token was rejected)
// A 401 means the stored token is stale/revoked (a dev DB reset orphans tokens): drop it
// and every learner-scoped cache here so the registry gate becomes the stable signed-out
// state (R3), then settle to null. Only a 401 clears the credential; a thrown transport
// error propagates as the error state above.
export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<MeView | null> => {
    if (!readToken()) return null;
    const res = await api.me.$get();
    if (res.status === 401) {
      clearToken();
      queryClient.removeQueries({ queryKey: learnerScopeKey });
      return null;
    }
    return unwrap(res);
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
