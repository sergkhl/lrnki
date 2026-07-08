import { cookies } from "next/headers";

export const LEARNER_REF_COOKIE = "lrnki_learner_ref";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
export const LEARNER_REF_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/learn",
  maxAge: COOKIE_MAX_AGE_SECONDS
} as const;

export function compactLearnerRef(learnerStateRef: string): string {
  return learnerStateRef.trim().replace(/\s+/g, " ");
}

export async function readLearnerRef(): Promise<string | undefined> {
  const value = (await cookies()).get(LEARNER_REF_COOKIE)?.value.trim();
  return value ? value : undefined;
}

export async function setLearnerRefCookie(learnerStateRef: string): Promise<void> {
  const compact = compactLearnerRef(learnerStateRef);
  if (!compact) return;
  (await cookies()).set(LEARNER_REF_COOKIE, compact, LEARNER_REF_COOKIE_OPTIONS);
}
