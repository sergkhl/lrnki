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

export const duelSetupQuery = queryOptions({
  queryKey: ["duel-setup"],
  queryFn: () => api["duel-setup"].$get().then(unwrap),
  staleTime: 60_000
});

export function expeditionQuery(enrichmentId: string) {
  return queryOptions({
    queryKey: ["expedition", enrichmentId],
    queryFn: async (): Promise<ExpeditionView | null> => {
      const res = await api.expedition[":enrichmentId"].$get({ param: { enrichmentId } });
      if (res.status === 404) return null;
      return unwrap(res);
    }
  });
}
