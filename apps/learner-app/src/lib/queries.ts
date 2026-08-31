import { queryOptions } from "@tanstack/react-query";

import type { LearnerReadDto } from "./api";
import { api, queryClient } from "./api";
import { authClient } from "./authClient";

type OkRead = Extract<LearnerReadDto, { status: "ok" }>;
export type JournalView = Extract<OkRead["view"], { kind: "journal" }>;
export type CatalogView = Extract<OkRead["view"], { kind: "catalog" }>;
export type ExpeditionView = Extract<OkRead["view"], { kind: "expedition" }>;
export type GuardianView = Extract<OkRead["view"], { kind: "guardian" }>;
export type LeaderboardView = Extract<OkRead["view"], { kind: "leaderboard" }>;
export type RuntimeRead<View> = Readonly<{ stateVersion: string; view: View }>;

export const LEARNER_SCOPE = "learner" as const;
export const learnerScopeKey = [LEARNER_SCOPE] as const;

export type MeView = { learnerStateRef: string; displayName: string; profileComplete: boolean };

export class LearnerReadError extends Error {
  constructor(readonly result: Exclude<LearnerReadDto, { status: "ok" }>) {
    super(`learner read refused: ${result.status}`);
    this.name = "LearnerReadError";
  }
}

async function read<View>(response: Promise<{ json(): Promise<LearnerReadDto> }>): Promise<RuntimeRead<View>> {
  const result = await (await response).json();
  if (result.status !== "ok") throw new LearnerReadError(result);
  return { stateVersion: result.stateVersion, view: result.view as View };
}

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<MeView | null> => {
    const { data, error } = await authClient.getSession();
    if (error) throw new Error(`session read failed: ${error.status}`);
    if (!data) {
      queryClient.removeQueries({ queryKey: learnerScopeKey });
      return null;
    }
    return {
      learnerStateRef: data.user.id,
      displayName: data.user.name,
      profileComplete: data.user.profileComplete
    };
  },
  staleTime: Infinity
});

export const journalQuery = queryOptions({
  queryKey: [LEARNER_SCOPE, "journal"],
  queryFn: () => read<JournalView>(api.journal.$get())
});

export const catalogQuery = queryOptions({
  queryKey: [LEARNER_SCOPE, "catalog"],
  queryFn: () => read<CatalogView>(api.catalog.$get())
});

export const leaderboardQuery = queryOptions({
  queryKey: [LEARNER_SCOPE, "leaderboard"],
  queryFn: () => read<LeaderboardView>(api.leaderboard.$get()),
  staleTime: 60_000
});

export function expeditionQuery(expeditionKey: string) {
  return queryOptions({
    queryKey: [LEARNER_SCOPE, "expedition", expeditionKey],
    queryFn: () => read<ExpeditionView>(
      api.expedition[":expeditionKey"].$get({ param: { expeditionKey } })
    )
  });
}

export function guardianQuery(expeditionKey: string, challengeId: string) {
  return queryOptions({
    queryKey: [LEARNER_SCOPE, "guardian", expeditionKey, challengeId],
    queryFn: () => read<GuardianView>(
      api.guardian[":expeditionKey"][":challengeId"].$get({
        param: { expeditionKey, challengeId }
      })
    ),
    staleTime: Infinity
  });
}
