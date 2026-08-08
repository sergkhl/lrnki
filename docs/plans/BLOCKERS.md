# Blockers

- **Better Auth secrets (plan
  [2026-08-08-001](./2026-08-08-001-integrate-better-auth-plan.md), needed before its U4; can be
  done any time).** Two user-owned actions: (1) create a **web-type** Google OAuth client in Google
  Cloud Console with authorized redirect URI
  `https://api.lrnki.globesoul.com/auth/callback/google`, and put `GOOGLE_CLIENT_ID` /
  `GOOGLE_CLIENT_SECRET` into the repo-root `.env`; (2) mint `BETTER_AUTH_SECRET`
  (`openssl rand -base64 32`) into the same `.env`. One web-type client serves web and native (D5 —
  browser-redirect flow, no SHA-1 fingerprints).
