import { QueryClient } from "@tanstack/react-query";
import { hc } from "hono/client";
import type { AppType } from "@lrnki/learner-api/client";
import { API_URL, sessionTransport } from "./authClient";

export type { LearnerGradingResult, LearnerMatchingAttemptResult, LearnerMatchingResult, LeaderboardView } from "@lrnki/learner-api/client";
export { API_URL };

// One QueryClient for the whole app so the actions layer can invalidate queries the way
// `revalidatePath` used to.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } }
});

// The typed RPC client (R1): plain fetch underneath, identical on web and native. It carries
// the Better Auth session cookie exactly the way the auth client does (ADR-0041) — no
// app-readable credential exists on either platform, so there is nothing here to hydrate,
// mirror, or clear.
export const api = hc<AppType>(API_URL, {
  init: sessionTransport.init,
  headers: sessionTransport.headers
});
