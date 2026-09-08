# TODO

## TODO

_None._

## COMPLETED

- **Focused learning and main-journey UX (2026-09-08).** Theory, questions and Support now progress
  one card at a time with compact source dialogs, retained feedback, device resume, readable Trail
  navigation, keyboard-safe forms and reliable pending/failure actions. Android E2E defaults to
  the connected device through the [native rig](../../apps/learner-app/e2e-native/README.md).

- **Contabo web/API deployment (2026-09-08).** Release `39305b1` serves the Expo website and API
  over HTTPS. The authorized application-schema reset, matched-image deployment, desktop/phone
  browser smoke, and exact temporary-learner cleanup passed. Routine deployments preserve the
  shared PostgreSQL container; commands and hosting policy live in the [runbook](../../README.md#deployment).
- **Documentation hygiene (2026-09-05).** Consolidated ADRs and linked workflow documentation into
  canonical owners, preserving project constraints and repairing stale references.
- **Researched Expedition catalog (2026-09-01).** Catalog cutover and learner-first/source review
  evidence remain in commits `28f325f`, `e10515d`, and `eba37f5`. The preceding full validation
  record is preserved in `7b88a36`.


## VALIDATION

### Focused learning cards and connected Android E2E — 2026-09-08

- **Source and scope.** Implementation and the detailed plan log are preserved in `9ec3568`.
  The private controller shares ordered presentation and device cursors between Expedition and
  Support; Guardian commands remain separate. Sources belong to the visible teaching or revealed
  explanation. Public DTOs, commands, content, database shapes, mastery and rewards are unchanged.
- **Local automated.** Repository `pnpm typecheck` and `pnpm lint` passed. Learner-app Jest passed
  28 suites / 161 tests. `pnpm content:check` qualified all five unchanged Expeditions. The cursor,
  command and source tests cover identity/revision isolation, reload reconciliation, ordered writes,
  duplicate-tap prevention, refusal/retry, and deduplicated disclosure. `git diff --check` passed.
- **Intercepted web.** A fresh Expo export passed 38 phone/desktop journeys. Coverage includes one
  instructional unit, explicit Lesson-read timing, immediate grading and held feedback, Back/review,
  wrong-answer retry, Support return and reload, pending dismissal and hide failures, Guardian
  partial matching/final feedback and failed lifecycle actions. Explanation sources remain hidden
  before grading; closing their dialog restores web focus and reading position.
- **Visual checks.** Actual authored theory and the longest selection/matching prompts were checked
  at 320 by 568 and 1280 by 800, normal/200% text, and reduced motion. Assertions and inspected
  screenshots cover reachable footers, no horizontal overflow, pair editing/reset and authentication
  reflow. Native screenshots separately cover software keyboards, source dialogs, question feedback,
  full-screen Support, Guardian hierarchy and scrolling to the third Trail Leg.
- **Local real backend.** `REALUSE_WEB_PORT=8093 pnpm e2e:web:realuse` passed as run
  `mtsyc0dmef0c597f`, using the verified local Docker Postgres endpoint and owned API/web processes.
  Authenticated HTTP exercised all five Expeditions; the real phone browser completed Critical
  Thinking through the summit, and desktop completed the three frozen secondary Leg scopes owned
  by [the real-backend rig](../../apps/learner-app/e2e-realuse/README.md). Both browser tests passed
  (28.4 s phone / 31.1 s desktop). Cleanup removed all three exact reserved learners. An earlier
  interrupted run removed its two created learners; the test now awaits the known board celebration
  before reload instead of racing navigation-memory loading.
- **Connected Android.** The default `pnpm e2e:native:maestro` selected and pinned the connected
  Galaxy S9+ SM-G965F, Android 10/API 29. All three flows passed: signup/sign-in keyboard and recovery
  (1 m 16 s), focused learning/Support/Trail/board (1 m 46 s), and Guardian screenshots (19 s).
  Fresh standalone fixture APK SHA-256:
  `cc3c6836be4905a063c4070c91e3719ba08d165aef16d9c79bbd66848bf687cb`.
  Existing 720 by 1480 display override, 280 dpi and 1.1 font scale were preserved. The pinned serial,
  APK and endpoint metadata were recorded by the runner. Owned fixture/reverse cleanup passed and
  the pre-existing ADB mapping remained intact. This uses in-memory runtime fixtures, not Postgres.
- **iOS Debug simulator.** A fresh Debug client with current Metro presentation source passed the
  full iPhone 17 Pro / iOS 26.5 scenario in 1 m 35 s: keyboard-backed authentication, learning,
  source disclosure, third-Leg scrolling, Support return, both Guardian scopes, board and a no-reset
  session restart. The sole build warning was the existing Expo Dev Launcher script dependency
  analysis warning. The fixture, owned Metro process and owned simulator were stopped after use.
- **Regression found by native validation.** iOS drawer scrolling was blocked by ancestor responder
  claims. Dismissible overlays now use a sibling backdrop, leaving drags to their ScrollView. The
  focused probe and full journey passed; preserve the invariant and scenario boundaries in
  [the native rig](../../apps/learner-app/e2e-native/README.md). Native Sources also restore accessibility
  focus on close. Automatic visual authority still requires the rig's separate physical correlation.
- **Evidence limits.** Intercepted, local Better Auth/Hono/Postgres, connected Android fixture and
  iOS Debug simulator results are separate layers. Deployment, shared-data writes/resets, store
  builds and user-recorded physical acceptance were outside this implementation. No content
  re-authoring, schema migration or learner progress reset was required.
