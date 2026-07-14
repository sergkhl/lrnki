import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, readToken } from "./api";

// Typed read layer (R1). The hono client keeps the request paths honest and the response
// payloads derive mechanically from `AppType` (plan 2026-07-12-001 R12): a projection
// field change in the application layer surfaces here as a type error, never as a stale
// hand-written alias.

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

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<MeView | null> => {
    if (!readToken()) return null;
    const res = await api.me.$get();
    if (res.status === 401) return null;
    return unwrap(res);
  },
  staleTime: Infinity
});

export const journalQuery = queryOptions({
  queryKey: ["journal"],
  queryFn: () => api.journal.$get().then(unwrap)
});

// The catalog is deliberately not part of the journal's generation-poll payload.
// It is fetched only after a learner opens Browse all.
export const catalogQuery = queryOptions({
  queryKey: ["catalog"],
  queryFn: () => api.catalog.$get().then(unwrap)
});

export const leaderboardQuery = queryOptions({
  queryKey: ["leaderboard"],
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
    queryKey: ["challenge", challengeId],
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
    queryKey: ["expedition", enrichmentId],
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
