# Blockers

- **The two Google sign-in legs.** Both need a person at a Google consent screen — no rig may drive
  Google ([ADR-0041](../adr/0041-own-learner-identity-with-self-hosted-better-auth.md)), so this is
  the only part of either plan an agent cannot run. Everything else is deployed and gated.
  1. **Web** — owned by [2026-08-09-001](./2026-08-09-001-web-google-signin-leg.md), because the
     return leg it gates is that plan's fix. On `https://lrnki.globesoul.com`, Continue with Google
     → fresh account → name the explorer → one graded answer → sign out, and confirm the session
     cookie is gone. **Blocked until that plan deploys**: consent and callback already succeed, but
     a successful sign-in still lands on the API's 404 instead of the app.
  2. **Android** — owned by [2026-08-08-001](./2026-08-08-001-integrate-better-auth-plan.md). The
     same round trip on a physical device, which additionally exercises the `lrnki://` return leg of
     the browser-redirect flow (D5) that no emulator gate covers. Runnable now; native never carried
     the web defect.

  Report each outcome into its owning plan's Validation Log; each plan closes on its own leg.
  **`state_mismatch` on the web leg means a cross-site web origin, not a bad redirect URI** — the
  registered URI is verified correct, and `localhost` origins cannot complete the leg at all.
  `redirect_uri_mismatch` at the consent screen is the different failure where the registered URI
  and `BETTER_AUTH_URL` disagree; the deployed value is `https://api.lrnki.globesoul.com` and the
  URI must be that plus `/auth/callback/google`.
