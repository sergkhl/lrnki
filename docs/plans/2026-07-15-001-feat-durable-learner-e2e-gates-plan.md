---
title: Durable Learner E2E Gates - Plan
type: feat
date: 2026-07-15
deepened: 2026-07-15
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Durable Learner E2E Gates - Plan

## Goal Capsule

- **Objective:** Turn the proven real-backend learner web driver into one durable opt-in command, then establish with measured evidence whether a portable Maestro Android-emulator flow can narrow the recurring physical-device gate.
- **Authority:** Follow [CONTEXT.md](../../CONTEXT.md), [ADR-0001](../adr/0001-adopt-greenfield-deep-module-architecture.md), [ADR-0003](../adr/0003-use-postgres-json-table-artifact-store.md), [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md), [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md), [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md), [ADR-0035](../adr/0035-separate-learner-app-static-spa-typed-api.md), and [ADR-0036](../adr/0036-run-single-shared-learner-environment-during-testing.md).
- **Execution profile:** Preserve three separate test layers: intercepted production-web acceptance, an opt-in real-backend web integration spine, and a native APK/emulator interaction gate. Consolidate test infrastructure instead of adding parallel servers, cleanup paths, or fixture definitions.
- **Stop conditions:** Stop and re-plan before adding live generation to the routine web suite, adding it to `pnpm check`, provisioning hosted CI/database infrastructure, changing a production API or schema solely for tests, committing credentials, paying for an EAS hosted run, or downgrading the physical-phone gate without negative-control and physical correlation evidence.
- **Tail ownership:** Finish the automatic real-backend gate and the bounded Maestro experiment, apply the real-use quality skill, record an adopt/defer/reject decision in an ADR, and leave the existing user-owned Android blocker intact unless the user supplies the required physical result.

---

## Product Contract

### Summary

The intercepted Playwright suite already proves deterministic client behavior in a production Expo web export and belongs in `pnpm check`. The checked-in `e2e-realuse` scaffold proved that the same app can be driven against the real learner API and Postgres, but it still requires manual service startup, pre-seeded credentials, duplicated serving logic, and a shell cleanup path.

This work makes that second layer repeatable without folding neural generation into it. It also evaluates the native gap with a runner-portable Maestro flow over a real standalone APK and Android emulator. The native flow uses a deterministic API fixture because its purpose is Yoga layout, touch scrolling, and dialog reachability; the real-backend web layer separately owns API/Postgres integration.

### Problem Frame

The U6 browser gate found harness defects that a one-off checklist could tolerate but a durable suite cannot: exact CORS-origin mismatch, reused learner names, incomplete FK cleanup, manual process ordering, and credential-bearing configuration. The current real-use spec also duplicates responsive and fault-state cases already owned by the intercepted suite while never completing a persisted learner action.

Native component and browser tests did not certify Android touch-responder, ScrollView, or measured-dialog behavior. That has repeatedly left a physical Android pass in [BLOCKERS.md](./BLOCKERS.md). Maestro can perform accessibility-driven gestures against a standalone React Native build without app instrumentation, and its `scrollUntilVisible` command issues device swipes rather than programmatic scrolling ([React Native support](https://docs.maestro.dev/platform-support/react-native), [scrollUntilVisible](https://docs.maestro.dev/reference/commands-available/scrolluntilvisible)). The unresolved question is evidentiary: can an emulator flow distinguish a known-broken overlay implementation from the current one?

Expo's hosted Maestro job is not the first implementation target. The job is currently alpha, requires an EAS `build_id`, and therefore does not directly consume the APK produced by this repository's `eas build --local` GitHub workflow ([EAS pre-packaged jobs](https://docs.expo.dev/eas/workflows/pre-packaged-jobs/), [workflow syntax](https://docs.expo.dev/eas/workflows/syntax/)). Adopting it now would replace the current no-build-credit path with paid hosted build/workflow usage before Maestro's value has been demonstrated.

### Requirements

**Layer ownership**

- R1. Keep the intercepted web suite, real-backend web suite, and native APK suite distinct in configuration, commands, evidence, and claims; none substitutes for another.
- R2. Keep the intercepted suite in `pnpm check` unchanged in responsibility: deterministic client states, responsive behavior, accessibility, and injected transport failures at phone and desktop viewports.
- R3. Keep the real-backend and native suites explicitly opt-in; neither joins the default repository check or a hosted workflow in this plan.

**Durable real-backend web suite**

- R4. One root command loads the repository `.env` into its orchestration process, verifies pinned Chromium, starts a supervisor-free working-tree learner API over the configured real Postgres database, exports the production web bundle against that API, serves it, runs Playwright, and tears down processes and test data on success or failure. Each child receives an explicit minimum environment rather than the entire `.env`.
- R5. The web origin and API CORS allowlist use the same exact `http://localhost:<port>` value. Ports are explicit, occupied ports fail rather than silently reusing an unknown API, and health/preflight failures name the corrective action.
- R6. The routine suite discovers an existing ready enrichment through the authenticated `/catalog` contract. It never starts, retries, or falls back to topic or Scaffold generation and therefore makes no LiteLLM request or model-spend claim.
- R7. Preflight chooses a domain-neutral candidate by capability rather than title: a ready expedition with a renderable Study Session and at least one one-tap auto-graded activity. An empty or unsuitable catalog fails clearly and does not trigger generation.
- R8. Every Playwright project receives its own run-unique disposable learner and random PIN. Setup uses public learner routes; direct Postgres access is limited to guarded test teardown because no production deletion route is warranted.
- R9. Cleanup resolves only the probe/phone/desktop learner names generated for the current run, removes every learner-owned FK child introduced by the current initial migration, then removes those learners while preserving shared enrichments and unrelated learners. It never performs a prefix or wildcard delete. Normal assertion, browser, export, or server failure still reaches cleanup; the runner prints its non-secret run ID and, only when cleanup fails, an exact `--cleanup-run=<id>` retry command.
- R10. The phone journey starts with a stale bearer, observes the real `/me` 401 clearing it, attempts an invalid `Enter`, registers the disposable learner, and continues without reload. Desktop registers directly. Both then choose the preflight-selected shared expedition, open the real Study Session, submit one auto-graded selection, return to the Journal, reload, and observe the expedition in persisted started progress.
- R11. The happy integration spine runs in Pixel 7 and desktop Chromium projects. Only the phone project performs stale-token and failed-entry recovery; route-error, catalog-state, and scrim matrices remain in the intercepted suite.
- R12. Assertions use roles, accessibility names, and a minimal set of app-owned semantic test IDs. They may consume the selected enrichment ID/title discovered at runtime but never assert fixture-specific concepts, generated prose, answer correctness, or source-domain vocabulary.
- R13. Unexpected page errors, console errors, CORS failures, and non-allowlisted response failures fail the suite. Screenshots and sanitized method/path/status diagnostics may land in gitignored `tmp/`; Playwright tracing is disabled because it captures bearer headers.
- R14. Replace U6-prefixed configuration with durable `REALUSE_*` names, remove manual seeded-credential requirements, and delete the redundant real-use static server and shell cleanup after their shared replacements work.

**Native Maestro evaluation**

- R15. Drive a standalone Android APK against a deterministic HTTP fixture server reachable from the emulator through Android's `10.0.2.2` host-loopback alias ([Android emulator networking](https://developer.android.com/studio/run/emulator-networking-address)). Do not point the native interaction gate at production or the real-use database.
- R16. Reuse one checked-in learner API scenario definition across the intercepted Playwright adapter and native HTTP adapter. The native scenario supplies a long Theory activity and every Support Path dialog state needed by the flow; it does not introduce a production route or runtime fixture flag.
- R17. The Maestro flow enters through the real registry UI with runner-generated fixture-only login values, opens a real expedition/activity surface, performs an actual swipe-based long-Theory traversal, keeps header/footer controls reachable, opens the contextual Support Path dialog, and proves its title, body, close/footer action, and return-to-Theory path are reachable on the emulator.
- R18. Stable native selectors use existing accessibility labels or minimal app-owned `testID` values. Do not select generated learner prose, coordinates, or styling classes when a semantic control boundary exists; Maestro recommends `testID` for React Native stability. Pass the ephemeral fixture login through Maestro CLI parameters rather than committing it to flow YAML ([Maestro React Native guide](https://docs.maestro.dev/platform-support/react-native), [Maestro parameters](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/parameters-and-constants)).
- R19. For each Theory-scroll or Support Path assertion proposed for automatic authority, prove sensitivity with its own targeted behavior-only mutation in a disposable worktree while retaining the same current harness, fixture, selectors, and emulator. The Theory mutation reverses only the bounded full-screen/responder fix; the dialog mutation reverses only the measured-cap/shrink fix. Each retained assertion must fail at its intended checkpoint on its matching negative-control APK and pass on the current APK in repeated runs.
- R20. Record screen and failure screenshots under `tmp/2026-07-15-durable-learner-e2e-gates/`. An emulator pass proves Android framework layout, accessibility, and gesture dispatch for the selected system image; it does not prove OEM behavior, physical touch feel, haptics, thermals, or all safe-area variants.
- R21. Defer EAS Workflows in this plan: do not add `.eas/workflows`, request an EAS hosted build, or spend workflow/build credits. Keep the Maestro flow runner-portable so that the decision can be revisited when the hosted job is stable and either accepts the existing artifact or hosted cost is explicitly approved.
- R22. Do not clear or weaken the current physical Android blocker automatically. After the negative-control/current emulator comparison succeeds and the user records one correlated physical pass, only the Theory-scroll and Support Path dialog scenarios covered by Maestro may move to automatic authority. Uncovered native primitives, interactions, and device-specific qualities retain their existing physical gate until independently automated and correlated.
- R23. iOS simulator/device automation, Maestro Cloud, hosted Android device farms, fresh content generation, Crystal Guardian flow expansion, and visual-regression baselines are outside this plan.
- R24. Because Android 9+ blocks cleartext traffic by default, permit `http://10.0.2.2` only in the disposable e2e APK through an explicit build-profile-controlled Expo/Android manifest setting. Preview and production-capable builds retain the secure default, and the e2e APK is never distributed or uploaded as a release artifact ([Android network security configuration](https://developer.android.com/privacy-and-security/security-config), [Expo build properties](https://docs.expo.dev/versions/latest/sdk/build-properties/)).

### Acceptance Examples

- AE1. Given live Postgres services and at least one suitable ready catalog enrichment, running the single real-use command from the repository root starts no manual terminal prerequisites and completes both browser projects before stopping its child processes.
- AE2. Given a stale token on the phone project, the real API returns 401, the token disappears, invalid `Enter` remains recoverable, and `Set out` reaches the Journal with the run-unique learner.
- AE3. Given the selected shared enrichment, phone and desktop each choose it through the Catalog UI, submit one persisted selection, reload, and see that expedition in `Continue` without asserting whether the arbitrary selection was correct.
- AE4. Given no suitable catalog candidate, preflight fails with an actionable message, performs no generation request, leaves no learner row, and never starts the browser journey.
- AE5. Given an assertion failure after signup, the runner still deletes that run's learner rows, stops its API/static-server children, emits no PIN/token/header, and retains only safe local failure evidence.
- AE6. Given each targeted negative-control APK, its matching Maestro scenario fails at the intended Theory-scroll or dialog-reachability assertion; given the current APK and identical fixture/emulator, every retained scenario passes repeatedly with a screen recording.
- AE7. Given a current native pass, a drag beginning over ordinary Theory content reaches the final content while the activity header/footer remain usable; opening and closing `Preparing support` leaves the learner in the same Theory activity.
- AE8. Given Expo's current hosted contract, the ADR records EAS Workflows as `defer` with explicit revisit triggers and no EAS Workflow file or hosted-build dependency. Portable Maestro flows and the local e2e profile remain only when U6's sensitivity result is `adopt`.
- AE9. Given only emulator evidence, [BLOCKERS.md](./BLOCKERS.md) still requires the user-owned physical pass and the current runtime-reliability plan remains active.
- AE10. Given an e2e APK and a preview APK, manifest inspection permits cleartext only in the e2e artifact; the e2e app reaches the loopback fixture while preview retains the Android secure default.

### Scope Boundaries

- **In scope:** real-use Playwright lifecycle, preflight, one integration journey, Postgres test cleanup, shared static serving, semantic selector seams, a deterministic native fixture adapter, an Android e2e build profile, portable Maestro flow/runner, negative-control evaluation, local evidence, and canonical decision documentation.
- **Out of scope:** production authentication/API/schema changes, content-generation changes, automatic database provisioning, hosted web CI, EAS Workflows execution, Maestro Cloud, iOS, a full native regression suite, pixel-diff infrastructure, and clearing a manual blocker without user evidence.
- **Deletion:** Remove `apps/learner-app/e2e-realuse/serve.mjs`, `cleanup-learner.sh`, seeded `U6_*` credential configuration, and real-backend copies of intercepted route-error/scrim cases once replacements pass. Delete unsupported native scenarios, or the whole native experiment when neither targeted negative control demonstrates sensitivity.
- **Data posture:** Shared enrichment rows are read-only. Only three exactly named run-owned learners and their owned state are created, and cleanup uses the source migration's FK graph without a wildcard. No migration or compatibility path is needed.

---

## Planning Contract

### High-Level Technical Design

This ownership sketch is a lifecycle constraint, not prescribed implementation code:

```text
opt-in web command
  └─ real-use runner (run ID + ephemeral secrets + final cleanup owner)
       ├─ supervisor-free learner API ── real Postgres
       │                                  ├─ read shared enrichment
       │                                  └─ write run-owned learner state
       ├─ shared static server ── production Expo export
       ├─ public-API capability preflight
       ├─ Playwright ── phone + desktop browser journeys
       └─ Postgres test support ── transactional exact-learner teardown

opt-in native evaluation
  └─ native runner
       ├─ deterministic fixture server ← shared response builders → intercepted web adapter
       ├─ local e2e APK → Android emulator ← Maestro flow
       └─ same flow + same emulator + same fixture
            ├─ isolated Theory behavior mutation (matching scenario must fail)
            ├─ isolated dialog behavior mutation (matching scenario must fail)
            └─ current APK (must pass repeatedly)
                 └─ measured adopt / defer / reject decision
```

The web runner owns generated secrets, API/static child processes, readiness, Playwright execution, and the final cleanup attempt. The API test entrypoint owns a dedicated database client and closes both HTTP and database resources on normal exit or termination. Cleanup opens a separate short-lived client after Playwright exits, then the runner terminates and joins both servers; no database secret needs to enter the Playwright process.

The native runner owns fixture-only login values, fixture-server lifetime, APK installation, Maestro process, and evidence paths. It passes those ephemeral values to both the server and Maestro CLI without writing them into flow YAML. The fixture binds only to host loopback and the Android emulator reaches it through `10.0.2.2`. Each negative control changes only one known overlay behavior while preserving the current app, fixture, accessibility tree, and matching assertions; otherwise a navigation or selector difference would invalidate the comparison.

### Resolved During Planning

| Decision | Resolution |
|---|---|
| Routine content source | Reuse a suitable ready enrichment from `/catalog`; fresh production generation remains a separate explicit real-use activity. |
| Real-backend responsibility | Own one thin authenticated read/write/persist integration spine, not a mirror of intercepted UI cases. |
| Execution location | Provide a CI-ready local command only; do not provision hosted web CI or a remote e2e database. |
| Browser matrix | Run the happy path at phone and desktop sizes; perform real authentication recovery only on phone. |
| Real recovery case | Keep stale-token → failed `Enter` → successful `Set out`; delete redundant real-backend scrim and artificial 404/500 route cases. |
| Service boundary | Use the production Hono app and Postgres adapters in a supervisor-free test entrypoint so unrelated queued generation cannot cause model calls. |
| Native data boundary | Use a deterministic HTTP fixture behind the real APK; the separate web suite owns real backend integration. |
| Native runner | Keep Maestro flow files portable and run them locally against an Android emulator before choosing any hosted runner. |
| EAS Workflows | Defer: current Maestro job is alpha, consumes an EAS build ID rather than the existing local APK, and introduces hosted usage/cost. |
| Physical authority | Preserve the current blocker; after sensitivity and physical correlation, narrow only the exact Theory/Support scenarios automated by Maestro. |

### Problem Classes and Recognized Practice

- **Test-layer conflation.** A mock-transport browser suite, real integration suite, and native black-box suite answer different questions. The conventional solution is explicit layer ownership and the smallest useful scenario at expensive layers, not repeating the same matrix everywhere.
- **Nondeterministic test-data provisioning.** Neural generation inside routine e2e makes duration, spend, and meaning vary together. The conventional solution is deterministic admission to a known-capability fixture and a separate quality evaluation for neural output, consistent with ADR-0028.
- **Shared-database test pollution.** Reused credentials and partial FK cleanup create order-dependent failures. The conventional solution is run-unique, exactly tracked entities, cleanup in a `finally` boundary, and database cleanup derived from the actual schema.
- **Flaky end-to-end selectors.** Generated prose and coordinates are unstable contracts. Playwright recommends user-visible/accessible locators, while Maestro recommends React Native accessibility and `testID`; this plan adds semantic IDs only where dynamic content otherwise prevents a stable control boundary ([Playwright locators](https://playwright.dev/docs/locators), [Maestro React Native guide](https://docs.maestro.dev/platform-support/react-native)).
- **Untested test sensitivity.** A green native flow does not prove it would catch the escaped defect. The conventional negative-control/mutation approach intentionally restores the known fault in an isolated worktree and requires the gate to fail for the expected reason.
- **Cloud-runner lock-in before value proof.** Expo's example couples a `type: build` job to a `type: maestro` job through `build_id` ([EAS end-to-end example](https://docs.expo.dev/eas/workflows/examples/e2e-tests/)). Keeping flows portable and validating them locally preserves an easy later move without prematurely replacing the existing build pipeline.

### Established Facts and Active Hypotheses

- **Established — intercepted coverage is already durable:** `apps/learner-app/playwright.config.ts` runs the production static export with full API interception at phone and desktop viewports and root `pnpm check` invokes it.
- **Established — the real-use scaffold is manual:** `apps/learner-app/e2e-realuse/README.md` requires a separately started API/export/server and a pre-seeded explorer/PIN; `serve.mjs` duplicates the intercepted static server.
- **Established — public routes are sufficient:** `/session`, `/catalog`, `/expedition/choose`, the Study Session read, and `/study/*` grading can perform the target journey; selection grading uses persisted answer keys and does not call an LLM.
- **Established — cleanup has drifted:** `packages/infrastructure-postgres/src/testSupport.ts` omits `recall_challenges`, while `cleanup-learner.sh` carries a second FK list. The initial migration is the data-shape authority.
- **Established — API startup normally starts schedulers:** `apps/learner-api/src/index.ts` starts topic and Scaffold supervisors. A suite that must make no model call needs a thin server entrypoint that instantiates the same Hono app without those unrelated background consumers.
- **Established — current Android artifact path is local:** `.github/workflows/build-learner-android.yml` calls `eas build --local` and uploads the APK without EAS build credits.
- **Established — emulator host access is standard:** Android reserves `10.0.2.2` as the alias for the host loopback, enabling a local fixture server without embedding a production URL.
- **H1 — capability-based shared catalog selection is stable enough:** A ready enrichment with a one-tap graded item will let the integration spine avoid content-specific assertions across mixed domains. Prove by running against multiple available candidates when practical.
- **H2 — current Android emulator behavior correlates with the physical defect classes:** The Theory and Support Path scenarios will each fail under their matching behavior-only mutation and pass on the current build. U6 must falsify or support each scenario independently before policy changes.
- **H3 — a shared deterministic API scenario stays simpler than two fixture sets:** The same response builders can serve Playwright route interception and a Node HTTP server without leaking adapter concerns into production code. Reject the extraction if it makes the existing intercepted suite harder to read or control.

### Key Technical Decisions

- **KTD1 — Three suites, three claims.** *(session-settled: user-approved; rejected: merging real-backend or native checks into the intercepted `pnpm check` suite.)* Intercepted web owns deterministic client behavior, real-backend web owns an integration spine, and Maestro owns native interaction mechanics.
- **KTD2 — Reuse catalog content.** *(session-settled: user-approved; rejected: fresh generation or automatic generation fallback.)* The routine real-backend command selects an eligible ready enrichment and fails closed with an actionable message when none exists.
- **KTD3 — Local opt-in before hosted CI.** *(session-settled: user-approved; rejected: provisioning a persistent remote e2e database or scheduled generation.)* Make the command process-safe and CI-shaped, but keep it local until a deliberate hosted data environment exists.
- **KTD4 — Thin responsive integration spine.** *(session-settled: user-approved; rejected: either phone-only coverage or duplicating every real case across both projects.)* Run the end-to-end happy path on phone and desktop and fold real auth recovery into the phone path only.
- **KTD5 — Keep only genuine real-boundary recovery.** *(session-settled: user-approved; rejected: retaining artificial real 404/500 and scrim tests.)* A real `/me` 401 and failed session attempt exercise transport/auth behavior that matters; other states stay intercepted.
- **KTD6 — Runner owns lifecycle; schema-derived test support owns deletion.** *(session-settled: user-approved; rejected: manual terminals, reusable seeded credentials, a production delete route, wildcard cleanup, or another shell FK list.)* A TypeScript runner and explicit test-support export provide one exact-learner cleanup authority and a guaranteed `finally` path.
- **KTD7 — Native gate uses a deterministic local API.** *(session-settled: user-approved; rejected: coupling native layout evidence to live Postgres, LiteLLM, or production credentials.)* The APK and UI are real; only the upstream data service is deterministic.
- **KTD8 — Adopt portable Maestro only where it proves sensitivity.** *(session-settled: user-approved; rejected: treating one green current-build run or one mutant as evidence for every native scenario.)* Retain authority only for scenarios whose targeted negative control fails at the intended native assertion and whose current APK passes repeatedly.
- **KTD9 — Defer EAS Workflows now.** *(session-settled: user-approved; rejected: adding a paid alpha hosted build/test pipeline before the local flow proves value.)* Revisit when the job is stable and artifact/cost constraints change or the user explicitly approves hosted usage.
- **KTD10 — Physical testing narrows only after scenario-level correlation.** *(session-settled: user-approved; rejected: clearing the current blocker or unrelated native surfaces from emulator evidence alone.)* The current phone pass remains user-owned; after sensitivity and physical correlation, automatic authority extends only to the Theory/Support interactions the flow actually drives.

### System-Wide Impact

- **Data:** No schema change. Test cleanup is corrected to the current migration, validates the three exact reserved run names, uses equality lookups, and deletes each learner transactionally so a partial FK sequence can be retried safely.
- **API:** No route or response contract change. A loopback-only test entrypoint composes the existing app factory without generation supervisors, owns its database client, and closes HTTP/DB resources on shutdown.
- **Frontend:** Visible UX remains unchanged. Only minimal semantic test IDs may be added to stable app-owned controls.
- **Failure behavior:** Missing services, browser, catalog capability, emulator, Maestro CLI, or APK fail early with a direct setup message. Assertion failures still clean owned state and processes.
- **Security:** Runner-generated, format-validated ephemeral credentials are held in process memory, never accepted as arbitrary cleanup scope, never printed, and invalidated by learner deletion. The orchestrator gives the real API only `DATABASE_URL` plus required port/CORS fields, export/static only public Expo/port fields, and Playwright only public origins/selected metadata plus its ephemeral run names and PIN. LiteLLM/provider/Expo tokens are not inherited by any web-suite child. Real-backend tracing is off, diagnostics exclude request headers/bodies, and test HTTP listeners bind to loopback only. Cleartext is enabled only in the disposable e2e APK manifest.
- **Performance and spend:** One production web export is shared by two serial browser projects. No model generation occurs. Native builds remain explicit and local.
- **Documentation:** The plan owns implementation design while active. The final measured runner decision moves into an ADR; TODO/README keep only links/status/validation.

---

## Implementation Units

### U1. Consolidate shared serving and Postgres test cleanup

- **Goal:** Remove the two duplicated harness utilities and make learner teardown correct for the current schema before relying on it from a durable runner.
- **Requirements:** R8-R9, R14; AE4-AE5.
- **Dependencies:** None.
- **Files:** `packages/infrastructure-postgres/src/testSupport.ts`, `packages/infrastructure-postgres/src/testSupport.test.ts`, `packages/infrastructure-postgres/package.json`, `apps/learner-app/e2e/static-server.mjs`, and `apps/learner-app/e2e-realuse/serve.mjs` (delete after migration).
- **Approach:** Extend the existing test-support deep module rather than creating a second cleanup list. Add `recall_challenges` in the FK-safe order, retain cascaded child behavior, and expose an explicit `./test-support` package subpath rather than mixing test helpers into the production root export. Add an exact-name cleanup operation that accepts only the runner-generated probe/phone/desktop names, resolves learner refs with equality queries, and transactionally delegates to `deleteLearner`; reject empty, duplicate, malformed, or non-reserved names. Parameterize the intercepted static server's output directory, port, host-facing URL, and baked API origin so both web suites share its export/SPA/MIME/path-traversal behavior. Preserve intercepted defaults. Follow the repository's existing DB-test convention: the new integration test skips when `DATABASE_URL` is absent from the default hermetic suite, while the explicit Verification Contract command loads `.env` and must execute it.
- **Patterns to follow:** Treat the initial migration as the deletion graph authority. Keep static-file path normalization and Expo route HTML fallback in one module.
- **Test scenarios:**
  1. Seed a learner with expedition, response, lesson-read, calibration, award, Scaffold, session, and Recall Challenge state; cleanup succeeds and removes every owned row.
  2. Seed the three exact run learners plus an unrelated learner and shared enrichment; cleanup removes only the named learners and leaves shared/unrelated rows byte-count unchanged.
  3. Reject an empty list, duplicate name, malformed name, non-reserved name, and wildcard-shaped value before issuing SQL.
  4. Start the shared server against intercepted and real-use output directories; both serve route HTML, SPA fallback, correct MIME types, and no path outside their configured root.
- **Verification:** DB-backed test-support tests pass with `.env` loaded; repository search finds one learner FK deletion order and one static Expo server implementation.

### U2. Make the real-backend lifecycle one command

- **Goal:** Replace the manual U6 standup with a process-safe root command and actionable preflight.
- **Requirements:** R3-R9, R13-R14; AE1, AE4-AE5.
- **Dependencies:** U1.
- **Files:** Add `apps/learner-api/src/realuseServer.ts`, `apps/learner-app/e2e-realuse/run.ts`, and `apps/learner-app/e2e-realuse/preflight.ts`; update `apps/learner-api/package.json`, `apps/learner-app/e2e-realuse/realuse.config.ts`, `apps/learner-app/package.json`, root `package.json`, and `pnpm-lock.yaml`; delete `apps/learner-app/e2e-realuse/cleanup-learner.sh` after replacement.
- **Approach:** Add a thin loopback-only test entrypoint that creates and owns one Postgres client, passes it to `createLearnerApp`, and never imports or starts topic/Scaffold supervisors. It handles normal termination by closing the HTTP listener and its database client. Add `@lrnki/infrastructure-postgres` as an explicit learner-app test-only dependency and import cleanup only through its `./test-support` subpath; production app modules never import it. The root `e2e:web:realuse` runner loads `.env`, validates or generates the reserved run ID and random PIN in memory, prints that safe run ID, constructs child-specific environment allowlists, starts the API and shared static/export server itself, waits for both, runs preflight, then launches Playwright without `DATABASE_URL`. Preflight uses public HTTP routes to create the exactly named disposable probe session, checks `/health`, `/catalog`, and candidate Study Sessions, selects the first capability-compatible enrichment deterministically, and exposes only non-secret selected metadata to test workers. The runner passes one exact localhost origin to the browser, export, and API CORS allowlist, invokes exact-name cleanup from a separate client in `finally`, terminates both children, and waits for their exit. Its validated `--cleanup-run=<id>` mode derives only the three exact reserved names and performs no other lifecycle step; a failed cleanup prints this retry command. It fails before journeys when Postgres/migrations/catalog are unavailable.
- **Patterns to follow:** Match the intercepted suite's pinned-browser probe and production Expo export. Keep child lifecycle in the runner and behavior assertions in Playwright.
- **Test scenarios:**
  1. Run with the API port occupied by an unknown process; fail before tests and do not reuse it.
  2. Run with `localhost` aligned across bundle, base URL, and CORS; preflight passes. Deliberately mismatch it in a focused harness test and surface a named CORS/origin error.
  3. Run with no database, stale migration, empty catalog, and no suitable activity in turn; each fails with one corrective message, makes no generation request, and cleans the probe learner where created.
  4. Force Playwright failure and interrupt its child normally; `finally` removes the exact probe/phone/desktop learners and stops API/static-server processes.
  5. Capture child environments, stdout/stderr, and artifacts; browser/export/static processes receive no database or provider secret, the API receives no LiteLLM/provider/Expo secret, and no PIN, token, Authorization header, or request body appears.
  6. Force cleanup failure, then run the printed `--cleanup-run=<id>` command; it removes only that run's exact reserved names and rejects malformed or wildcard-shaped IDs.
- **Verification:** `pnpm e2e:web:realuse` is the only required invocation after Postgres/catalog setup; no manual server/export/credential step remains in the README.

### U3. Replace the U6 matrix with one real integration journey

- **Goal:** Prove the real browser/API/Postgres read-write loop with minimal non-duplicated UX coverage.
- **Requirements:** R10-R13; AE2-AE3, AE5.
- **Dependencies:** U2.
- **Files:** `apps/learner-app/e2e-realuse/realuse.spec.ts`, `apps/learner-app/e2e-realuse/realuse.config.ts`, `apps/learner-app/src/components/ExpeditionEntry.tsx`, `apps/learner-app/src/components/CheckpointCircle.tsx`, `apps/learner-app/src/components/ActivitySheet.tsx`, and focused component tests only where a semantic selector seam is added.
- **Approach:** Replace the four U6 scenario tests with one project-parameterized journey. Phone seeds a stale local token, observes real rejection, attempts invalid entry, then signs up; desktop signs up directly. Both search/select the runtime-discovered candidate through Catalog, open the trail, target the first one-tap graded checkpoint by semantic identity, select one visible option without assuming correctness, return to Journal, reload, and confirm the selected expedition is now in `Continue`. Keep one serial worker so shared database ordering stays obvious, but use a distinct learner per project. Fail on unexpected runtime/console/network errors and retain only failure screenshots plus header-free status diagnostics.
- **Patterns to follow:** Use accessible controls first and add IDs to stable product concepts such as candidate, checkpoint kind, and activity kind only where dynamic generated text prevents selection. Do not add e2e branches to production behavior.
- **Test scenarios:**
  1. Phone covers stale `/me` 401, invalid `Enter`, successful signup, and the complete persisted expedition journey without reload between recovery and Journal.
  2. Desktop covers direct signup and the same persisted journey at 1280x800.
  3. Choose an incorrect option; persistence still moves the expedition to started/`Continue`, proving the assertion does not depend on answer correctness.
  4. Use a catalog enrichment from a different domain/title; the journey passes without code or assertion changes.
  5. Confirm the deleted real-use route-error and scrim cases remain covered by `apps/learner-app/e2e/learner-runtime.spec.ts` in both intercepted projects.
- **Verification:** Both projects pass against the real working-tree API and Postgres; the run creates no generation operation and leaves no test learner afterward.

### U4. Apply the real-use quality gate to the durable web suite

- **Goal:** Judge the command and actual selected learner journey as a developer and learner experience, not merely as green automation.
- **Requirements:** R1-R14; AE1-AE5.
- **Dependencies:** U3.
- **Files:** `apps/learner-app/e2e-realuse/README.md`, root `README.md`, and evidence under `tmp/2026-07-15-durable-learner-e2e-gates/web/`.
- **Approach:** Apply `.agents/skills/real-use-quality-evaluation/SKILL.md`. Run the suite against multiple suitable existing ready enrichments when available, inspect phone/desktop screenshots and terminal failure ergonomics, and record concrete defects/caveats. Verify that the generic selection policy admits a useful real Study Session without encoding any inspected concept in the harness. Stop native work if the foundational command is leaky, nondeterministic, or leaves data behind.
- **Patterns to follow:** Load `.env` explicitly for every DB command, keep evidence in `tmp/`, and distinguish the routine integration gate from a fresh production-LLM quality experiment.
- **Test scenarios:**
  1. Complete a normal run and inspect the selected real content, responsive layout, progress persistence, duration, cleanup, and developer output.
  2. Exercise one preflight failure and one mid-test failure; both are understandable without reading harness source and retain no credentials/data.
  3. Confirm a second eligible catalog enrichment can replace the first without test edits.
- **Verification:** The evaluation record states whether the suite is genuinely one-command, useful, domain-neutral, clean, and safe; foundational defects are fixed before U5.

### U5. Build a portable deterministic Maestro Android flow

- **Goal:** Exercise the escaped Android interaction class in a real standalone APK without coupling it to live backend state.
- **Requirements:** R15-R18, R20-R21, R23-R24; AE7-AE8, AE10.
- **Dependencies:** U4.
- **Files:** Add `apps/learner-app/e2e/support/learnerApiScenarios.ts`, `apps/learner-app/e2e-native/server.ts`, `apps/learner-app/e2e-native/run.ts`, `apps/learner-app/e2e-native/README.md`, `apps/learner-app/.maestro/flows/android-runtime-reliability.yaml`, and `apps/learner-app/app.config.ts`; update `apps/learner-app/e2e/fixtures.ts`, `apps/learner-app/eas.json`, `apps/learner-app/package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, root `package.json`, `scripts/build-learner-android.sh`, and only the app-owned components/tests that need semantic selector IDs; delete `apps/learner-app/app.json` after the dynamic config reproduces it.
- **Approach:** Extract response-data builders, not Playwright adapter behavior, from the intercepted fixture so a small loopback-only Node HTTP adapter can serve the same learner scenario. Replace the static Expo config with one dynamic canonical config that reproduces every existing value and uses an Expo-SDK-compatible catalog entry for `expo-build-properties` to set Android `usesCleartextTraffic`. Set `LRNKI_E2E_BUILD=0` explicitly in the development and preview profiles and `1` only in the e2e profile; config resolution maps only `1` to cleartext and otherwise emits `false`. The e2e profile also bakes `EXPO_PUBLIC_LEARNER_API_URL=http://10.0.2.2:<fixture-port>` and continues to use `eas build --local` ([EAS build-profile environment](https://docs.expo.dev/build/eas-json/)). The runner checks JDK/ADB/emulator/Maestro/APK prerequisites, generates non-persisted fixture login values, gives them only to the loopback server and Maestro's `-e` parameters, installs the APK, runs the flow, and tears down the server. The flow enters via the registry, opens the prepared expedition, swipes through deliberately long Theory using `scrollUntilVisible`, asserts persistent header/footer reachability, opens `Preparing support`, asserts its fixed controls and scrollable body, closes it, and confirms the same Theory surface remains. Record screen and failure screenshots in `tmp/`; never upload or distribute the cleartext-enabled artifact.
- **Patterns to follow:** Keep flow YAML independent of local versus future hosted runners. Use the final React Native primitives and accessibility tree; only the backend data is mocked.
- **Test scenarios:**
  1. Missing Maestro, Android SDK/emulator, fixture port, or APK fails before UI execution with an exact setup command.
  2. The intercepted Playwright suite still consumes the extracted scenario with identical responses and passes `pnpm e2e:web`.
  3. The standalone APK reaches the fixture through `10.0.2.2`, signs in, navigates by semantic controls, and performs real swipes rather than script-side scroll injection.
  4. Long Theory keeps its header and Continue action reachable; Support Path available, preparing, failed, and ready content can be rendered by deterministic scenario variants without new production flags.
  5. Inspect e2e and preview APK manifests: only e2e permits cleartext, and no `.eas/workflows` file, Maestro Cloud key, real/persistent learner credential, database secret, or production URL is introduced.
- **Verification:** The portable flow passes on the current APK twice on the pinned emulator system image and produces a readable recording with no coordinate- or generated-copy-based selector.

### U6. Prove native-gate sensitivity and decide physical-gate scope

- **Goal:** Determine whether Maestro detects the actual native regression class rather than merely driving a green build.
- **Requirements:** R19-R22, R24; AE6-AE10.
- **Dependencies:** U5.
- **Files:** No tracked production files for the negative control; use a disposable worktree and evidence under `tmp/2026-07-15-durable-learner-e2e-gates/native/`. Update the native README with the measured result.
- **Approach:** Create an isolated temporary worktree from the current revision. In separate build/run cycles, apply (1) the minimal full-screen flex/responder mutation derived from `ddc0ec9` for the Theory scenario and (2) the minimal measured-cap/shrink mutation derived from `0b1c9d3` for the Support Path scenario, always preserving current test IDs, fixture code, navigation, and accessibility labels. Reset only the temporary mutation between cycles; do not wholesale-revert either commit because they also changed tests, sheets, blockers, and TODO state. Build/install each negative-control APK with the same e2e profile and emulator image. Require each focused scenario to fail at its target assertion, not setup/navigation, then restore the current APK and require two clean passes of both scenarios. Classify each scenario as **adopt** when its mutant fails as intended and current is stable, **defer** when environment/tooling prevents a fair comparison, or **reject** when mutant/current behave alike or the scenario is intrinsically flaky. Retain only adopted scenarios in the automatic gate and scope its documented authority to that set; if none is adopted, delete U5's native experiment code. Delete the temporary worktree and APKs afterward.
- **Patterns to follow:** This is a test-sensitivity experiment, not a backward-compatibility requirement. Never alter the main worktree or commit a fault-injection runtime flag.
- **Test scenarios:**
  1. The responder-only negative control reaches the long Theory activity but cannot satisfy the final swipe/reachability assertion, with video showing the intended failure.
  2. The dialog-only negative control reaches `Preparing support` and fails a fixed-control/body reachability assertion without an unrelated Theory mutation present.
  3. Current APK passes both scenarios twice under identical device/server state.
  4. A forced fixture/server failure is distinguishable from a native assertion failure and cannot count as sensitivity evidence.
  5. Remove any scenario that lacks sensitivity evidence; if no scenario is adopted, remove the native harness code added in U5 rather than retaining an untrusted gate.
- **Verification:** Evidence supports an explicit adopt/defer/reject verdict for each proposed scenario and one overall runner decision. Emulator evidence alone does not edit or clear `docs/plans/BLOCKERS.md`.

### U7. Record the runner decision and consolidate planning authority

- **Goal:** Leave one durable policy, accurate task ledgers, and no abandoned experiment.
- **Requirements:** R1-R3, R21-R24; AE8-AE10.
- **Dependencies:** U4, U6.
- **Files:** Add the next ADR under `docs/adr/` and update `docs/adr/README.md`; update `README.md`, `docs/plans/TODO.md`, `docs/plans/README.md`, and—only after a user-recorded physical result—`docs/plans/BLOCKERS.md`; delete this plan after all completion evidence is folded.
- **Approach:** Record the scenario-level Maestro verdicts, overall runner decision, and fixed EAS Workflows `defer` decision, including the alpha/build-ID/hosted-cost constraints and revisit triggers. If Maestro is adopted for either scenario, retain the portable flow/local command and document that automatic authority covers only the sensitivity-proven, physically correlated Theory-scroll and/or Support Path dialog scenario; release checks, uncovered native interactions, and new native primitives retain physical ownership until separately automated and correlated. Delete any unproven scenario and its unused fixture/selector support. If no scenario is adopted, remove every U5 profile/server/flow/script/dependency/catalog/config change, delete `app.config.ts`, restore the canonical static `app.json`, and keep the existing physical hard gate. Update TODO with outcome and latest validation, keep the still-active runtime-reliability plan/blocker linked as applicable, and remove this completed plan from the active list.
- **Patterns to follow:** ADR owns durable rationale, README owns operator commands, TODO owns status/validation, and BLOCKERS owns only unresolved user action.
- **Test scenarios:**
  1. ADR states exactly what was measured, what was adopted/deferred/rejected, which evidence would trigger reconsideration, and what emulator evidence cannot claim.
  2. An adopted command is documented from a clean checkout with prerequisites and artifact paths; a rejected experiment leaves no package script, profile, fixture adapter, flow, or dependency behind.
  3. EAS Workflow search finds no committed workflow while the ADR links the official hosted contract and revisit criteria.
  4. Existing physical blocker remains byte-for-byte unless the user has supplied its required result.
- **Verification:** Canonical documents contain one definition each, active-plan links are accurate, no superseded TODO design remains, and repository search finds no abandoned U6 naming or duplicate harness module.

---

## Verification Contract

| Gate | Command or evidence | Proves | Units |
|---|---|---|---|
| Postgres test-support integration | `pnpm exec tsx --env-file=.env --test packages/infrastructure-postgres/src/testSupport.test.ts` | Current-schema FK cleanup removes only guarded run-owned learners and preserves shared data. | U1-U2 |
| Learner unit/type safety | `pnpm --filter @lrnki/learner-app test && pnpm --filter @lrnki/learner-app typecheck` | Fixture extraction and semantic selectors preserve app behavior and typed boundaries. | U3, U5 |
| Intercepted web regression | `pnpm e2e:web` | Deterministic client/responsive/fault-state coverage remains intact after fixture/server consolidation. | U1, U3, U5 |
| Real-backend web gate | `pnpm e2e:web:realuse` | One-command real browser/API/Postgres auth, catalog, grading, persistence, cleanup, and phone/desktop behavior pass without generation. | U2-U4 |
| Repository regression | `pnpm check` | Default typecheck, tests, lint, builds, and intercepted production-web gate remain green; opt-in suites did not leak into the default gate. | U1-U7 |
| Real-use quality evaluation | `.agents/skills/real-use-quality-evaluation/SKILL.md` with evidence under `tmp/2026-07-15-durable-learner-e2e-gates/web/` | The real-backend journey and harness are useful, domain-neutral, safe, and clean in actual use. | U4 |
| Current native flow | Local e2e APK plus the documented `e2e:native:maestro` command, two passes, recording retained under `tmp/` | Real Android emulator accessibility, swipe dispatch, Theory reachability, and Support Path dialog interaction pass on the current build. | U5-U6 |
| Native sensitivity controls | Each focused flow/device/fixture against its matching isolated behavior-only negative-control APK | Every retained scenario fails for its known native regression class rather than only proving navigation. | U6 |
| Android network-security split | Manifest inspection of locally built e2e and preview APKs | Cleartext fixture access exists only in the disposable e2e artifact; preview retains the secure default. | U5-U6 |
| Manual physical correlation | Existing user-owned preview-APK evidence in `tmp/2026-07-14-learner-runtime-reliability/` | A real phone agrees with the current emulator result before physical policy narrows. This remains outside this plan's automatic completion gate. | U6-U7 |
| Documentation audit | ADR/TODO/README/plan links plus repository searches for `U6_`, duplicate server/cleanup paths, `.eas/workflows`, and abandoned native files | One source of truth remains and the measured runner decision is durable. | U7 |

The real-backend command requires a configured Postgres database containing a suitable existing ready enrichment. That environmental precondition is intentional; this plan does not create a second persisted enrichment fixture or silently spend model calls to manufacture one.

The new plan can complete with the pre-existing physical Android blocker still open. Only the runtime-reliability plan remains blocked on that user-owned gate.

---

## Risks and Dependencies

- **Shared catalog drift:** A developer database may have no suitable ready enrichment. Mitigation: capability preflight fails clearly, never generates, and the real-use skill samples more than one candidate where available.
- **Background model spend:** Starting the normal API entrypoint could claim unrelated queued jobs. Mitigation: the suite serves the same Hono app through a supervisor-free test entrypoint and never invokes generation routes.
- **Cleanup drift:** New learner-owned tables could make deletion fail later. Mitigation: one test-support deep module is schema-backed and its integration test populates every current learner FK family.
- **Credential capture:** Playwright traces and request dumps can retain bearer headers. Mitigation: disable traces for real-backend tests, generate ephemeral secrets in memory, log only safe method/path/status fields, and delete the learner after every run.
- **Dynamic real content:** Generated titles, prose, item ordering, and correct choices vary. Mitigation: select by typed capability, use semantic IDs/roles, accept any graded outcome, and assert persisted lifecycle state rather than content.
- **Process interruption:** `SIGKILL` cannot execute `finally`. Mitigation: the runner knows the three exact generated names, an explicit orphan-cleanup invocation requires that run ID and those exact suffixes, normal failures/signals are handled, and hard-reset remains allowed for disposable development state.
- **Fixture extraction overreach:** A universal test server abstraction could obscure the readable intercepted suite. Mitigation: share only response builders; keep Playwright and HTTP adapters separate and abandon the extraction if it increases coupling.
- **Emulator false confidence:** Emulator hardware, touch input, and system image differ from a physical phone. Mitigation: require negative-control sensitivity and keep the current physical correlation pass; document claims narrowly.
- **E2E cleartext exposure:** A release-like APK normally rejects HTTP, while the loopback fixture needs it. Mitigation: enable cleartext only under the e2e build flag, bind the fixture to loopback, inspect e2e/preview manifests, and never distribute the e2e artifact.
- **Negative-control invalidity:** Reversing too much or combining mutations could fail navigation or mask the second target behavior. Mitigation: apply one overlay mutation at a time in an isolated worktree, keep current harness/data/selectors, and accept only the matching target-assertion failure.
- **Maestro/EAS churn:** Commands and EAS alpha contracts may change. Mitigation: pin/document the tested Maestro version, keep flow YAML portable, and defer the hosted workflow until explicit revisit criteria hold.
- **Native setup cost:** Android SDK, JDK 17, emulator image, Maestro CLI, and local APK build are substantial. Mitigation: separate expensive build from repeatable flow execution, fail preflight early, and keep the native suite opt-in.
- **Concurrent working-tree changes:** The runtime-reliability plan and physical blocker remain active. Mitigation: this plan modifies test infrastructure and minimal selector seams only; do not edit their implementation or blocker evidence except through U7's explicit consolidation rule.

---

## Definition of Done

- One root `e2e:web:realuse` command loads `.env`, starts the supervisor-free real API and production web export/server, runs phone and desktop, and cleans every run-owned learner/process on normal success or failure.
- The real-backend suite reuses a capability-compatible ready catalog enrichment, performs no generation or LiteLLM call, covers stale auth only on phone, and completes one persisted graded journey on both viewports.
- The real-backend suite contains no duplicated scrim/route-error matrix, seeded shared credential, U6-prefixed configuration, bearer-bearing trace, manual server step, duplicate static server, shell FK cleanup, or leaked learner.
- Postgres test support matches every learner FK in the current initial migration, deletes only exact run-generated learners, and proves unrelated learners/shared enrichment remain untouched.
- The intercepted web suite stays in `pnpm check`, retains its existing responsibility, and passes after shared fixture/server extraction.
- The real-use quality evaluation judges actual eligible catalog content and records safe evidence under `tmp/`; any foundational usability or cleanup defect is resolved.
- A portable Maestro Android gate retains only sensitivity-proven Theory-swipe and/or Support-dialog scenarios against one deterministic shared API fixture, with cleartext enabled only in that disposable profile; if neither scenario proves sensitivity, all native experiment/config code is deleted.
- Each retained native scenario has a matching negative-control/current comparison and an evidence-backed adopt verdict; unproven scenarios are removed, and a green current APK alone is insufficient.
- EAS Workflows is recorded as deferred with official-contract, cost, and revisit rationale; no hosted workflow, build-ID dependency, or paid run is introduced.
- The existing user-owned physical Android blocker remains unless its own required result is supplied; even after correlation, emulator authority is limited to covered Theory/Support scenarios and never silently clears unrelated physical checks.
- An ADR owns the final native-runner/physical-gate policy, README owns retained commands, TODO owns outcome/validation, and no completed/superseded plan or abandoned module remains.
- Targeted DB tests, learner tests/typecheck, intercepted browser acceptance, the real-backend gate, native evidence where adopted, and `pnpm check` all satisfy the Verification Contract with zero unexpected runtime errors or committed credentials.
