import { QueryClient } from "@tanstack/react-query";
import { hc } from "hono/client";
import type { AppType } from "@lrnki/learner-api/client";
import { readToken } from "./tokenStore";

export type { LearnerGradingResult, LearnerMatchingAttemptResult, LearnerMatchingResult, LeaderboardView } from "@lrnki/learner-api/client";
export { clearToken, hydrateToken, readToken, writeToken } from "./tokenStore";

// One QueryClient for the whole app so the actions layer can invalidate queries the way
// `revalidatePath` used to.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } }
});

export const API_URL: string = process.env.EXPO_PUBLIC_LEARNER_API_URL ?? "http://localhost:8787";

// The typed RPC client (R1): plain fetch underneath, identical on web and native. The
// headers callback is synchronous against the token mirror hydrated at app boot.
export const api = hc<AppType>(API_URL, {
  headers: (): Record<string, string> => {
    const token = readToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
});
