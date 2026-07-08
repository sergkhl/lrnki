import { QueryClient } from "@tanstack/react-query";
import { hc } from "hono/client";
import type { AppType } from "@lrnki/learner-api/client";

export type { LearnerGradingResult, LearnerMatchingAttemptResult, LearnerMatchingResult, LeaderboardView } from "@lrnki/learner-api/client";

// One QueryClient for the whole app — created here (not in main.tsx) so the actions
// layer can invalidate queries the way `revalidatePath` used to.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } }
});

const TOKEN_KEY = "lrnki_learner_token";

// Opaque bearer token (KTD3): web keeps it in localStorage; the Expo app will keep the
// SAME token contract in SecureStore. XSS exposure is accepted for a PIN-gated learning
// app (recorded in the ADR).
export function readToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function writeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// `import.meta.env` exists under Vite only; the node test runner imports this module
// through components, so fall back gracefully there.
export const API_URL: string = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_LEARNER_API_URL ?? "http://localhost:8787";

// The typed RPC client (R1): plain fetch underneath, so the identical data layer works
// in the browser today and React Native later.
export const api = hc<AppType>(API_URL, {
  headers: (): Record<string, string> => {
    const token = readToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
});
