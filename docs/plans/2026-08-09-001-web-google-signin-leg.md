---
title: Fix the Learner Web Google Sign-In Return Leg - Plan
type: fix
date: 2026-08-09
execution: code
---

<!--
Plan hygiene — docs/plans/README.md owns these rules; this is a signpost, not a second definition.
  * The Validation Log is append-only within a unit and REWRITTEN to one entry when that unit closes.
  * Record one current metric value and its invariant, never the trajectory that produced it.
  * Open work goes in the single `Open findings` section, never in a per-entry "not done" list.
  * Durable mechanics belong in docs/adr/, AGENTS.md, CONTEXT.md, a rig README, or a skill — never
    here. This plan is deleted at completion.
  * Caps: Validation Log ~200 lines, this file ~600, the status header 15. Over a cap means
    consolidate BEFORE appending.
-->

# Fix the learner web Google sign-in return leg

**Status:** U1's code, tests and documentation are written and the local gates are green; **nothing
is committed, deployed, or checked on the deployed stack.** Carved out of
[2026-08-08-001](./2026-08-08-001-integrate-better-auth-plan.md), which is shipped and gated and
which this plan unblocks. **This plan owns the web leg** — the defect that lands a successful web
sign-in on an API 404, plus the same-site constraint that makes the `localhost` origins unusable.
Android (BLOCKERS leg 2) stays with 001. Next action: commit and push to `main`, which triggers the
Pages deploy, then run U1's gate.

**Decision state:** no new decisions. D1, D2 and D5 of 001 are load-bearing and unchanged; the
durable half lands in [ADR-0041](../adr/0041-own-learner-identity-with-self-hosted-better-auth.md).

**Closes when** U1's three deployed checks pass and a person reports BLOCKERS leg 1 into the
Validation Log below.

## Context

Closing the web half of BLOCKERS surfaced two separate problems.

**1. `state_mismatch` from `http://localhost:8881` — not a production bug, but undocumented.**
Better Auth binds the OAuth `state` twice: a row in the `verification` table *and* a signed,
host-only `__Secure-better-auth.state` cookie on the API origin (`state.mjs:109-126`). The server
log names the branch precisely — `state_security_mismatch`, *"State mismatch: State not persisted
correctly"* — which is the cookie check, not the DB row. `localhost` is a different **site** from
`globesoul.com`, so the browser silently discards the `SameSite=Lax` cookie the sign-in POST tries
to set, and every callback then fails. Measured with Playwright:

| document origin | cookie stored | callback |
| --- | --- | --- |
| `https://lrnki.globesoul.com` | YES | OK (`invalid_code` — state validated) |
| `http://localhost:8881` | NO | `state_mismatch` |
| `http://localhost:3000` | NO | `state_mismatch` |

The deployed origin passes in Chromium, Chromium with third-party cookies blocked, Firefox **and**
WebKit, so no code change can or should "fix" this — it is the same-site premise D2 already rests
on. It needs recording as an invariant, because two of the three configured web origins violate it.

**2. A real defect: `callbackURL: "/"` (`session.ts:90`).** Better Auth emits `callbackURL`
verbatim as the callback's `Location` (`callback.mjs:172-175`), so a relative path resolves against
the **API** host. `https://api.lrnki.globesoul.com/` returns 404 — user-confirmed: a successful
Google sign-in lands on that 404, and only by manually returning to the app does the learner appear
signed in. Native is unaffected: the Expo client rewrites a relative `callbackURL` into the
`lrnki://` return leg, which is why the emulator works end to end.

`errorCallbackURL` is also unset, so *failed* legs dead-end on the API's error page on another
domain with no route back — the page in the report.

**Outcome:** a successful web Google sign-in returns to the app; a failed one returns to the
sign-in gate with a message; the same-site constraint is written down where it is owned.

## Changes

### 1. `apps/learner-app/src/lib/authClient.ts` — own the return URL

Add one exported function beside `sessionTransport`, which already owns the platform split:

```ts
export function oauthReturnURL(): string {
  return IS_WEB ? `${window.location.origin}/` : "/";
}
```

Comment must carry the two non-obvious constraints: web needs an **absolute** origin because a
relative path resolves against the API host, and native must keep the **relative** form because the
Expo client rewrites it into `lrnki://` (an absolute https URL would send the device to the
website). Read `window` **lazily** — `app.config.ts` sets `web.output: "static"`, so this module is
evaluated in Node during the static render, where `window` does not exist.

### 2. `apps/learner-app/src/lib/session.ts` — use it, and consume the error param

`signInWithGoogle` passes the value as both `callbackURL` and `errorCallbackURL`.

Add `consumeOAuthError(): SessionError | null`, guarded by `Platform.OS === "web"`:
reads `?error=` (Better Auth appends it via `redirectOnError`, `oauth2/errors.mjs`), strips `error`
and `error_description` with `history.replaceState` so a reload cannot re-accuse, and returns
`"unavailable"`. Every OAuth code maps there deliberately — none is a credential the learner can
correct, and `sessionErrorMessage` already has the copy, so no new `learnerTerm` is needed
(ADR-0033). It lives here, not in `authClient.ts`, because `SessionError` is defined here and the
dependency only points one way.

The answer is **memoized in module scope**, which turns a destructive read into an idempotent one
and is what lets change 3 call it from a render. It must not be cleared: on web a second failed leg
is a full page navigation, so the module is fresh anyway.

### 3. `apps/learner-app/src/components/SignInGate.tsx` — surface it

`useState<SessionError | null>(consumeOAuthError)`. Reuses the existing `error` state and
`sessionErrorMessage`, so it clears the same ways; no new UI.

An effect that called `setError` was the first shape here, on the reasoning that StrictMode
double-invokes a `useState` initializer and the second call would find the param already stripped.
`react-hooks/set-state-in-effect` rejects it, and it is right to: the answer is known before the
first render, so the effect only buys a cascading render. Memoizing the consume per page load
(change 2) removes the reason for it — a repeated call returns the same answer, which is precisely
the property StrictMode's double-invoke exists to check.

### 4. Tests

- `authClient.test.ts` — generalize the existing `loadTransport(os)` helper (`jest.isolateModules` +
  `jest.doMock("react-native", …)`) to load any export, then assert `oauthReturnURL()` returns the
  absolute origin on web and `"/"` on android. The runner is `jest-environment-node`, so the web
  case stubs `globalThis.window = { location: { origin: … } }` rather than pulling in jsdom.
- `session.test.ts` — add `oauthReturnURL` to the existing `@/lib/authClient` mock; assert
  `signInWithGoogle` passes it as **both** `callbackURL` and `errorCallbackURL` (`signIn.social` is
  already mocked but never asserted on today); cover `consumeOAuthError` for web (returns
  `"unavailable"` and strips the param) and native (returns `null`).
- `SignInGate.test.tsx` **and** `IndexRoute.test.tsx` — both mock `@/lib/session` with an explicit
  object literal, so both must gain `consumeOAuthError: jest.fn(() => null)` or the new effect calls
  `undefined`. Add one `SignInGate` case proving a returned `?error=` renders the refusal.

### 5. Documentation, same change as the code (AGENTS rule 18)

- **[ADR-0041](../adr/0041-own-learner-identity-with-self-hosted-better-auth.md)** — record the
  invariant as a consequence of D2: the learner web origin must be same-site *and same-scheme* with
  `BETTER_AUTH_URL`, because the OAuth state is bound to a `SameSite=Lax` host-only cookie on the
  API origin; and `callbackURL`/`errorCallbackURL` must be absolute on web. This is a code
  invariant, so the ADR owns it and this plan does not.
- **`README.md`, `## Commands`** — one dev-loop line: Google sign-in does not work from
  `localhost:8881` against the deployed API. Use email + password locally (what the rigs drive, D1),
  or run the API locally on `:8787` with a matching `BETTER_AUTH_URL` and register
  `http://localhost:8787/auth/callback/google` in Google Cloud Console.
- **[BLOCKERS](./BLOCKERS.md)** — repoint leg 1 (web) at this plan and leave leg 2 (Android) with
  001. The web leg is now partly evidenced: consent and callback succeed from the deployed origin,
  and what remains is confirming the learner lands in the app. Replace the `redirect_uri_mismatch`
  hint with the real trap for the web leg: `state_mismatch` means a cross-site web origin, not a bad
  redirect URI — the registered URI is correct and verified.
- **[2026-08-08-001](./2026-08-08-001-integrate-better-auth-plan.md)** — one line in its Validation
  Log pointing here for the web leg, not a second copy of this record; 001 then closes on BLOCKERS
  leg 2 alone. Both its log and its file are near the caps in [README](./README.md), so if that line
  crosses one, consolidate U1–U3 in a separate commit as the README requires.
- **[TODO](./TODO.md)** — the Better Auth item's status and next action, and an item for this plan.

## Implementation units

### U1 — web return leg

Changes 1–5 in one commit; the ADR, README, BLOCKERS and TODO edits ship with the code. Local gates
first, because the Pages workflow runs both and a failure burns a deploy:

```
pnpm --filter @lrnki/learner-app typecheck
pnpm --filter @lrnki/learner-app test
```

Then commit to `main` and push, which triggers `.github/workflows/deploy-learner-web.yml`
(typecheck → test → `expo export` → `deploy-pages`, ~3–5 min).

Gate, on the deployed stack. Three checks need **no** Google consent and so run directly:

1. **The bundle no longer sends a relative callback.** Fetch
   `https://lrnki.globesoul.com/_expo/static/js/web/entry-*.js` and confirm `callbackURL:"/"` is
   gone and `errorCallbackURL` is present.
2. **The server stores the absolute return URL.** Drive a sign-in POST from the deployed origin,
   then read that state's row on the host —
   `docker exec lrnki-postgres psql -U lrnki -d lrnki -Atc "select value from verification …"` — and
   confirm `callbackURL` is `https://lrnki.globesoul.com/`, not `/`.
3. **The error leg returns to the app.** Drive the callback from a browser context that never ran
   the sign-in POST, so the host-only state cookie is absent and Better Auth takes the
   `state_security_mismatch` branch. Before the fix it lands on
   `api.lrnki.globesoul.com/auth/error?error=…`; after, it must land on
   `https://lrnki.globesoul.com/?error=state_mismatch` with the gate showing the refusal. Pair it
   with the cookie-present run as the positive control, so a "pass" cannot come from an inert probe.

The fourth needs a person and is BLOCKERS leg 1: the real Google round trip on
`https://lrnki.globesoul.com` — sign in, name the explorer, one graded answer, sign out. That is
this plan's rule-14 real-use gate, so its entry uses the note format owned by
`.agents/skills/real-use-quality-evaluation/SKILL.md`.

## Acceptance

- `pnpm --filter @lrnki/learner-app typecheck` and `test` green; the Pages deploy succeeds.
- All three deployed checks pass, including check 3's positive control.
- BLOCKERS leg 1 is reported into the Validation Log; leg 2 remains open against 001.
- No relative `callbackURL` survives on the web path, and `errorCallbackURL` is set wherever
  `callbackURL` is.
- The same-site invariant is stated once, in ADR-0041, and referenced — not restated — elsewhere.

## Validation Log

One entry per closed implementation unit; see the hygiene comment at the top of this file.

### U1 — web return leg (2026-08-09, uncommitted working tree)

**Proved locally.** `oauthReturnURL()` answers absolute on web and `/` on native; `signInWithGoogle`
sends it as both `callbackURL` and `errorCallbackURL`; a returned `?error=` is classified once,
stripped surgically (an unrelated param survives), and rendered by the gate it returns to.
`pnpm --filter @lrnki/learner-app typecheck` and `lint` clean, 57 suites / 312 tests green.

**Each new assertion was checked against a reverted fix**, since a green test over a fix that is
already correct proves nothing: reverting the web branch to `/`, dropping `errorCallbackURL`,
dropping the initializer, and dropping the memo each failed exactly one test and no others, and
removing `consumeOAuthError` from `IndexRoute.test.tsx`'s mock reproduces the predicted
`TypeError: consumeOAuthError is not a function`.

**Invariant a re-run must not break:** the consume stays memoized per page load. It is called from a
`useState` initializer, so a non-idempotent version shows the refusal in production and hides it
under StrictMode — the failure that lint's `set-state-in-effect` rule pushed the design toward.

**Gate checks 2 and 3, evidenced early from a `localhost:8881` origin** against the deployed API, by
a real Google round trip the user ran on the dev server. The shared `verification` rows carry
`"callbackURL":"http://localhost:8881/"` and `"errorURL":"http://localhost:8881/"` — absolute, and
`errorURL` present at all, neither of which the old code could produce. The API log then shows
`state_security_mismatch` **with `errorURL` honored**, and the gate rendered the refusal at the web
origin instead of stranding the learner on `api.…/auth/error`. Re-run both on the deployed origin
after the deploy: this pass cannot show the *success* exit, which is the half that was 404ing.

**Not run:** check 1, both checks from the deployed origin, and BLOCKERS leg 1. Nothing is committed
or deployed.

### Open findings

None open.

## Notes

- The e2e rigs are unaffected — they drive email + password only (D1), so `oauthReturnURL()` is
  never called under `export:web:e2e`.
- Native gains a small improvement for free: an error return to `lrnki:///?error=…` closes the
  in-app browser instead of stranding the learner on the API error page. The message itself stays
  web-only, since there is no URL to read on native.
