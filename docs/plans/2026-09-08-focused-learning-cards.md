# Focused learning cards and main-journey UX

Status: Complete. The user-approved focused-card behavior and scoped validation gates passed.
NEXT: Preserve this validation record in Git, then retire the plan and promote the outcome to TODO.

## Accepted behavior

- One theory section, question with held feedback, or completion card at a time, in authored order.
- Explicit final-section action records reading; instant selections and Guardian pairs remain.
- Incorrect answers stay on the question with retry and theory review. Back never submits an answer.
- One compact Sources control opens a dialog; explanation references remain private before grading.
- An on-demand Trail groups Stops by Leg and keeps calibration and Guardians accessible.
- Support uses the same presentation with independent device navigation memory and a preserved parent.
- Device pointers are scoped by learner, Expedition, revision and Support path; progress stays server-owned.
- Guardian feedback precedes advancement and victory; failed lifecycle actions stay in place.
- Smaller Guardian chrome, clear matching associations, keyboard-safe authentication, and plain copy.

The [game UX decision](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md),
[client boundary](../adr/0035-separate-learner-app-static-spa-typed-api.md),
[Support policy](../adr/0037-persist-learner-scoped-scaffold-detours.md), and
[source contract](../../content/AUTHORING.md#source-credits-and-disclosures) retain authority.
No public DTO, database, content or reward changes are intended.

The established problem classes are excessive simultaneous disclosure, asynchronous feedback losing
its submitted-question context, and fixed-height form overflow. The implementation follows
[GOV.UK question-page progression](https://design-system.service.gov.uk/patterns/question-pages/)
and the [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): a focused
unit with explicit navigation and an accessible, dismissible source dialog. No bespoke game rule is
needed; the existing server commands remain authoritative.

## Implementation order

1. Shared presentation, cursor storage, sources and question feedback.
2. Expedition, Support, Guardian, catalog and authentication integration.
3. Unit and intercepted phone/desktop regressions and visual inspection.
4. Real-backend journey and fresh Android/iOS Debug integration; update rig procedures and claims.

## Validation Log

- Baseline review: fresh Expo export and 14 intercepted phone/desktop journey tests passed. Direct
  inspection reproduced repeated sources, a 1,366 px first Stop at a 390 px phone width, Guardian
  feedback under the next question, missing final feedback, and a clipped signup at 320 by 568.
  This is presentation evidence; no backend, deployed or native behavior was established.
- Local automated: learner-app Jest passed 28 suites / 161 tests; repository `pnpm typecheck` and
  `pnpm lint` passed. `pnpm content:check` qualified all five unchanged Expeditions.
- Intercepted web: a fresh Expo export passed 38 phone/desktop journeys, including 320 by 568 forms,
  200% text reflow at reduced height, one instructional unit, source focus restoration, grading
  privacy, retry/review/Back, cursor reload (including an open Support question), Support pending
  answer/hide failures, and Guardian final feedback.
  Mocked DTO evidence proves client behavior only. Software keyboards require the native gate.
- Real-backend preflight refused an occupied web port 8091 before creating a learner. The owned
  runner confirmed zero deletions for run `mtswd4k2cc4114b3`; the rerun uses isolated port 8093 and
  the verified local Docker Postgres endpoint `localhost:5433/lrnki`, with exact reserved identities.
- Authored layout inspection: the first Critical Thinking section and the longest selection and
  matching prompts in the public qualified catalog were exercised at 320 by 568 and 1280 by 800,
  with normal/200% text and reduced motion. A failing header/footer reflow check caught oversized
  fixed chrome; moving the Stop title into scrolling content and keeping spacing compact resolved
  it. Final checks proved reachable footers, no horizontal page overflow, matching edit/reset, and
  source close preserving scroll and focus. Screenshots were inspected separately from assertions.
- Real-backend harness corrections: source selectors now ignore retained hidden routes, check the
  open dialog rather than its accessibility-hidden trigger, and explicitly retry the question whose
  calibration feedback was already revealed. Runs `mtswf1il69b74c0b`, `mtswkr1lf2aaa64b`, and
  `mtswu5ddd1ca6e26` each cleaned their three exact reserved learners after stopping.
- Real-backend accepted run `mtsx80klaafd8b52`: `REALUSE_WEB_PORT=8093 pnpm e2e:web:realuse` passed
  the authenticated HTTP journey over all five Expeditions and both actual Expo browser journeys.
  Phone completed Critical Thinking through the summit; desktop completed the three frozen
  secondary Leg scopes. The runner confirmed deletion of all three exact reserved learners and
  stopped its children. This proves local Better Auth/Hono/Postgres integration, not deployment.
- User steering selects the connected Android device for Android E2E and makes that the project
  default. AGENTS, validation routing, and the native runner/runbook now use a pinned physical
  serial and fixture loopback through ADB reverse. Existing device display settings are preserved;
  automated fixture evidence remains separate from user-recorded physical acceptance.
- Connected Android preliminary run passed all three Maestro scenarios on Galaxy S9+ SM-G965F,
  Android 10/API 29, with its pinned serial recorded in the run artifact. Existing 720 by 1480 display override, 280 dpi and
  1.1 font scale were preserved. Source dialog, held question feedback and full-screen Support
  screenshots were inspected. A final fresh APK/run incorporates the last Support cursor correction.
- The Support correction stores the next navigation pointer after an applied correct answer while
  retaining feedback in memory. Reload resumes the completion card without another answer command;
  the two new intercepted cases passed. No grade, correctness or reward data is persisted locally.
- Fresh iOS Debug build succeeded for iPhone 17 Pro / iOS 26.5 simulator. Its single warning concerns
  the existing Expo Dev Launcher build script's dependency analysis.
- iOS refinement: an explicit enabled-trigger/open-drawer assertion separated an early navigation
  miss from a reproducible inability to scroll to the third Leg. The latter was native responder
  contention: a pressable ancestor and Content's responder claim prevented the ScrollView from
  receiving drags. Sibling backdrops now own dismissal; content owns scrolling. A focused iOS
  probe reached the third Leg with the drawer still open. The native rig documents the invariant.
  Sources also explicitly restore native accessibility focus to the compact trigger on close.
- Real-backend run `mtsy0ki872d4cf03` was interrupted after its completed flagship journey waited
  behind the expected board celebration. The old optional immediate visibility check had raced
  asynchronous navigation-memory loading. The test now waits for and dismisses that known
  celebration before reload. Cleanup removed its two created reserved learners.
- Final learning-runtime rerun `mtsyc0dmef0c597f` passed the full authenticated HTTP journey over
  all five Expeditions and both real Expo browser scopes (28.4 s phone, 31.1 s desktop). Cleanup
  removed all three exact reserved learners. This remains local integration evidence.
- Final iOS Debug simulator run passed the complete shared learning flow, keyboard-backed signup
  inspection/sign-in recovery, third-Leg drawer scrolling, Support return, both Guardian scopes,
  board, and no-reset session restart in 1 m 35 s. Source, keyboard, learning and Trail screenshots
  were inspected. Current Metro served the final presentation source to the fresh Debug client.
  This is fixture-backed iOS simulator integration, not physical or distributable acceptance.
- Final overlay/source regression checks: repository typecheck and lint passed; learner-app Jest
  passed 28 suites / 161 tests; fresh intercepted phone/desktop export passed 38 tests in 11.4 s.
- Final connected Android run passed all three scenarios: sign-in/signup keyboard inspection and
  recovery (1 m 16 s), focused learning/Support/Trail/board (1 m 46 s), and Guardian screenshots
  (19 s). The default command selected and pinned the connected Galaxy S9+ without an emulator.
  Fresh APK SHA-256: `cc3c6836be4905a063c4070c91e3719ba08d165aef16d9c79bbd66848bf687cb`.
  Model/OS and existing display settings matched the preliminary run. Final source, learning,
  Guardian and keyboard screenshots were inspected; fixture and owned ADB reverse cleanup passed.
- Evidence boundaries: no content re-authoring, public DTO/command/schema changes, migration or
  learner progress reset. Deployment, shared-data writes/resets, store builds, and user-recorded
  physical acceptance remain outside this implementation. The temporary local real-backend test
  identities were cleaned exactly; native fixtures use in-memory state only.

## Open findings

_None._
