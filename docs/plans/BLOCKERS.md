# Blockers

- **The two Google sign-in legs of U4's gate (plan
  [2026-08-08-001](./2026-08-08-001-integrate-better-auth-plan.md)).** Both need a person at a
  Google consent screen — no rig may drive Google
  ([ADR-0041](../adr/0041-own-learner-identity-with-self-hosted-better-auth.md)), so this is the
  only part of the plan an agent cannot run. Everything else is deployed and gated.
  1. **Web:** on `https://lrnki.globesoul.com`, Continue with Google → fresh account → name the
     explorer → one graded answer → sign out, and confirm the session cookie is gone.
  2. **Android:** the same on a physical device, which additionally exercises the `lrnki://` return
     leg of the browser-redirect flow (D5) that no emulator gate covers.

  If either fails at the consent screen with `redirect_uri_mismatch`, the registered redirect URI
  and `BETTER_AUTH_URL` disagree; the deployed value is `https://api.lrnki.globesoul.com` and the
  URI must be that plus `/auth/callback/google`. Report the outcome into the plan's Validation Log;
  the plan closes on it.
