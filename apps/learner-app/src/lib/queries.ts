import type { DuelSetup, LearnerExpeditionEntry, StudySession } from "@lrnki/application/projection";
import type { LearnerExpedition, OperationTimelineDetail } from "@lrnki/ports";
import { queryOptions } from "@tanstack/react-query";
import { api, readToken } from "./api";
import type { LeaderboardView } from "./api";

// Typed read layer (R1). The hono client keeps the request paths honest; the response
// payloads are pinned to the SAME application types the SSR pages passed as props (the
// wire format is their JSON serialization), so every ported component keeps its contract.

export type JournalView = LearnerExpeditionEntry & {
  timelinesByOperationId: Record<string, OperationTimelineDetail | null>;
};
export type ExpeditionView = { session: StudySession; expedition: LearnerExpedition | null };
export type MeView = { learnerStateRef: string; displayName: string };

// Structural response shape instead of the DOM `Response`: React Native's fetch types
// disagree with lib.dom on FormData, and ok/status/json are all this layer reads.
async function unwrap<T>(res: { ok: boolean; status: number; json(): Promise<unknown> }): Promise<T> {
  if (!res.ok) throw new Error(`request failed: ${res.status}`);
  return (await res.json()) as T;
}

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<MeView | null> => {
    if (!readToken()) return null;
    const res = await api.me.$get();
    if (res.status === 401) return null;
    return unwrap<MeView>(res);
  },
  staleTime: Infinity
});

export const journalQuery = queryOptions({
  queryKey: ["journal"],
  queryFn: () => api.journal.$get().then((res) => unwrap<JournalView>(res))
});

export const leaderboardQuery = queryOptions({
  queryKey: ["leaderboard"],
  queryFn: () => api.leaderboard.$get().then((res) => unwrap<LeaderboardView>(res)),
  staleTime: 60_000
});

export const duelSetupQuery = queryOptions({
  queryKey: ["duel-setup"],
  queryFn: () => api["duel-setup"].$get().then((res) => unwrap<DuelSetup>(res)),
  staleTime: 60_000
});

export function expeditionQuery(enrichmentId: string) {
  return queryOptions({
    queryKey: ["expedition", enrichmentId],
    queryFn: async (): Promise<ExpeditionView | null> => {
      const res = await api.expedition[":enrichmentId"].$get({ param: { enrichmentId } });
      if (res.status === 404) return null;
      return unwrap<ExpeditionView>(res);
    }
  });
}
