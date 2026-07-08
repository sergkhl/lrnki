import { NextResponse } from "next/server";
import { enterLearnerSession, registerLearner } from "@lrnki/application";
import { PostgresLearnerStore, createDatabaseClient } from "@lrnki/infrastructure-postgres";
import {
  LEARNER_REF_COOKIE,
  LEARNER_REF_COOKIE_OPTIONS,
  compactLearnerRef
} from "@/lib/learnerSession";

// The `/learn/session` route is the ONE place PINs exist (KTD8) — the swap point for real
// authentication later. It handles login, registration, and logout. Any refusal (name taken,
// wrong PIN, invalid input) redirects back to the gate with a themed `error` code; the cookie
// only changes on success, so a wrong PIN can never swap the active explorer.
export function redirectToGate(error?: string, learnerRef?: string): NextResponse {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  if (learnerRef) params.set("ref", learnerRef);
  const query = params.toString();
  return new NextResponse(null, { status: 303, headers: { Location: query ? `/learn?${query}` : "/learn" } });
}

export function enterSession(learnerRef: string): NextResponse {
  const response = new NextResponse(null, { status: 303, headers: { Location: "/learn" } });
  response.cookies.set(LEARNER_REF_COOKIE, learnerRef, LEARNER_REF_COOKIE_OPTIONS);
  return response;
}

export function logoutSession(): NextResponse {
  const response = new NextResponse(null, { status: 303, headers: { Location: "/learn" } });
  response.cookies.set(LEARNER_REF_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/learn", maxAge: 0 });
  return response;
}

export async function POST(request: Request): Promise<NextResponse> {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "enter");
  if (intent === "logout") return logoutSession();
  const learnerRef = compactLearnerRef(String(formData.get("learnerStateRef") ?? ""));
  const pin = String(formData.get("pin") ?? "").trim();
  if (!learnerRef) return redirectToGate("invalid_name");
  if (!process.env.DATABASE_URL) return redirectToGate("invalid_name");

  const sql = createDatabaseClient();
  try {
    const learnerStore = new PostgresLearnerStore(sql);
    if (intent === "create") {
      const displayName = compactLearnerRef(String(formData.get("displayName") ?? "")) || learnerRef;
      const result = await registerLearner({ learnerRef, displayName, pin }, { learnerStore });
      if (!result.registered) {
        const error = result.reason === "invalid_pin" ? "invalid_pin" : result.reason === "invalid_name" ? "invalid_name" : "name_taken";
        return redirectToGate(error, learnerRef);
      }
      return enterSession(result.learner.learnerRef);
    }
    const result = await enterLearnerSession({ learnerRef, pin }, { learnerStore });
    if (!result.entered) return redirectToGate(result.reason === "not_found" ? "invalid_name" : "wrong_pin", learnerRef);
    return enterSession(result.learner.learnerRef);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
