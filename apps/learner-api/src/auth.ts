import { createAuthDatabase } from "@lrnki/infrastructure-postgres";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createMiddleware } from "hono/factory";
import type { DatabaseClient } from "./db";

export type LearnerAuth = ReturnType<typeof createLearnerAuth>;

// `learnerStateRef` is Better Auth's `user.id` (ADR-0041). Every route reads it off this
// variable and no route accepts a client-supplied value, exactly as under the retired bearer
// design — only the credential and its verifier changed.
export type AuthEnv = { Variables: { learnerStateRef: string } };

// The learner web origin plus the two local Expo dev servers. CORS must echo one exact origin
// because credentialed requests forbid `*`, so every new web origin is an explicit entry here.
export function learnerWebOrigins(): string[] {
  return [
    process.env.LEARNER_WEB_ORIGIN ?? "https://lrnki.globesoul.com",
    "http://localhost:8881",
    "http://localhost:3000"
  ];
}

// Refuse to start without a real signing secret. Better Auth's own fallback is a constant
// published in its source, and its guard against that fallback fires only when
// `NODE_ENV === "production"` — which this repo deliberately leaves unset (README, `## Environment`).
// Relying on that guard here would mean the deployed API silently signs every learner's session
// cookie with a public key, visible nowhere in any log. Failing the boot is the cheap side of that
// trade: it is loud, immediate, and impossible to deploy past.
function requiredAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET is not set. Generate one with `openssl rand -base64 32` and put it in the repo-root .env."
    );
  }
  return secret;
}

// The ONE identity and session authority for the whole system (ADR-0041), mounted inside this
// process over the same pool the routes use. Google is the primary sign-in; email + password is
// the fallback and the only path any rig drives. Email verification and password reset are
// deliberately absent until an email provider exists — deferred, not mocked, so nothing here
// pretends to send mail.
export function createLearnerAuth(sql: DatabaseClient) {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return betterAuth({
    database: drizzleAdapter(createAuthDatabase(sql), { provider: "pg" }),
    baseURL: process.env.BETTER_AUTH_URL ?? "https://api.lrnki.globesoul.com",
    basePath: "/auth",
    secret: requiredAuthSecret(),
    emailAndPassword: { enabled: true },
    // Google is configured only when its credentials are present, so a checkout without them
    // still runs the credential path rather than failing at construction.
    socialProviders: googleClientId && googleClientSecret
      ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
      : {},
    // Gates the one-time explorer-naming screen (D7): false until the learner names themselves,
    // so a provider's real name never reaches the shared leaderboard unless they choose it.
    user: { additionalFields: { profileComplete: { type: "boolean", defaultValue: false } } },
    // `lrnki://` is the native return leg of the browser-redirect Google flow.
    trustedOrigins: [...learnerWebOrigins(), "lrnki://"],
    // Replaces the hand-rolled fixed-window limiter that guarded the PIN route.
    rateLimit: { enabled: true }
  });
}

// Session middleware: resolve the request's own cookie into a learner id, or refuse. A request
// with no session cookie is rejected without reaching the database, which is what keeps the
// DB-free 401 surface tests honest.
export function requireSession(auth: LearnerAuth) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "unauthorized" as const }, 401);
    c.set("learnerStateRef", session.user.id);
    await next();
  });
}
