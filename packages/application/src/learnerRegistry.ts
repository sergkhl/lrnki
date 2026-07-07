import { createHash, timingSafeEqual } from "node:crypto";
import type { Learner, LearnerStorePort } from "@lrnki/ports";

// PIN handling (KTD8). A short numeric PIN is a LABELED placeholder for real
// authentication, not a security claim: the dev database is open and the swap point is
// the `/learn/session` route. Hashing is habit — a salted SHA-256 keyed by the learner
// ref so identical PINs across learners never collide to the same digest. `node:crypto`
// only, no new dependency. This module is the ONE place the app knows PINs exist.
const PIN_SALT = "lrnki-learner-pin-v1";
const PIN_PATTERN = /^\d{4,8}$/;

export function hashLearnerPin(learnerRef: string, pin: string): string {
  return createHash("sha256").update(`${PIN_SALT}:${learnerRef}:${pin}`).digest("hex");
}

function pinMatches(learnerRef: string, pin: string, pinHash: string): boolean {
  const candidate = Buffer.from(hashLearnerPin(learnerRef, pin), "hex");
  const stored = Buffer.from(pinHash, "hex");
  // Length guard keeps `timingSafeEqual` from throwing on a malformed stored hash.
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

export type RegisterLearnerResult =
  | { registered: true; learner: Learner }
  | { registered: false; reason: "invalid_name" | "invalid_pin" | "name_taken" };

// Create a new learner with a uniqueness check at creation (R1/R2 — the conventional
// fix for free-text identity keys). The caller passes the already-compacted ref
// (`compactLearnerRef`). A duplicate ref is `name_taken` (the store's insert is a no-op),
// which the gate renders instead of silently sharing state.
export async function registerLearner(
  input: { learnerRef: string; displayName: string; pin: string },
  deps: { learnerStore: LearnerStorePort }
): Promise<RegisterLearnerResult> {
  const displayName = input.displayName.trim();
  const learnerRef = input.learnerRef.trim();
  if (!learnerRef || !displayName) return { registered: false, reason: "invalid_name" };
  if (!PIN_PATTERN.test(input.pin)) return { registered: false, reason: "invalid_pin" };
  const pinHash = hashLearnerPin(learnerRef, input.pin);
  const { created } = await deps.learnerStore.create({ learnerRef, displayName, pinHash });
  if (!created) return { registered: false, reason: "name_taken" };
  const learner = await deps.learnerStore.get(learnerRef);
  if (!learner) return { registered: false, reason: "name_taken" };
  return { registered: true, learner };
}

export type EnterLearnerSessionResult =
  | { entered: true; learner: Learner }
  | { entered: false; reason: "not_found" | "wrong_pin" };

// Verify a PIN to switch to an existing learner (R2). A cookie-resumed session never
// calls this — the route only invokes it when a learner is explicitly (re)selected — so
// resuming an existing session never re-prompts. Wrong PIN never returns the learner, so
// the route can refuse to swap the cookie.
export async function enterLearnerSession(
  input: { learnerRef: string; pin: string },
  deps: { learnerStore: LearnerStorePort }
): Promise<EnterLearnerSessionResult> {
  const learner = await deps.learnerStore.get(input.learnerRef.trim());
  if (!learner) return { entered: false, reason: "not_found" };
  if (!pinMatches(learner.learnerRef, input.pin, learner.pinHash)) return { entered: false, reason: "wrong_pin" };
  return { entered: true, learner };
}
