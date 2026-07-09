import { api, clearToken, queryClient, writeToken } from "./api";
import type { GateError } from "@/components/learn/LearnerNameGate";

export type SessionResult = { ok: true } | { ok: false; error: GateError | "rate_limited" };

// Login/register against POST /session — the one place PINs exist (KTD8). On success the
// opaque token is stored and every cached query is dropped so no state leaks across learners.
export async function enterSession(input: { intent: "enter" | "create"; learnerStateRef: string; pin: string }): Promise<SessionResult> {
  const res = await api.session.$post({ json: input });
  const body = await res.json();
  if ("token" in body) {
    writeToken(body.token);
    queryClient.clear();
    return { ok: true };
  }
  // A zod 400 has a structured error object; the gate shows it as invalid input.
  const error = typeof body.error === "string" ? body.error : "invalid_name";
  return { ok: false, error };
}

export async function logout(): Promise<void> {
  try {
    await api.session.$delete();
  } finally {
    clearToken();
    queryClient.clear();
  }
}
