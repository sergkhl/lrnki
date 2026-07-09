import { createHash, randomBytes } from "node:crypto";
import type { LearnerSessionStorePort } from "@lrnki/ports";
import { createMiddleware } from "hono/factory";

// Opaque bearer tokens (KTD3): 32 random bytes, base64url on the wire, SHA-256 at rest.
// No JWT machinery — revocation is row deletion in `learner_sessions`.
export function mintSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function compactLearnerRef(learnerStateRef: string): string {
  return learnerStateRef.trim().replace(/\s+/g, " ");
}

export type AuthEnv = { Variables: { learnerStateRef: string; tokenHash: string } };

// Bearer middleware (R2): every authenticated route derives the learner from the token —
// no route ever accepts a client-supplied `learnerStateRef`.
export function bearerAuth(sessions: LearnerSessionStorePort) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return c.json({ error: "unauthorized" as const }, 401);
    const tokenHash = hashSessionToken(token);
    const session = await sessions.resolve(tokenHash);
    if (!session) return c.json({ error: "unauthorized" as const }, 401);
    c.set("learnerStateRef", session.learnerRef);
    c.set("tokenHash", tokenHash);
    await next();
  });
}

// In-process fixed-window rate limit for the session route (R2): per-IP and per-name
// counters against PIN brute force. Fixed window is enough for a single-process API.
export class FixedWindowRateLimiter {
  private readonly counts = new Map<string, { windowStart: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now
  ) {}

  allow(key: string): boolean {
    const at = this.now();
    const entry = this.counts.get(key);
    if (!entry || at - entry.windowStart >= this.windowMs) {
      this.counts.set(key, { windowStart: at, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }
}
