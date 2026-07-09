# Learner App Universal Expo Plan

Replace the web-only learner SPA with **one Expo universal app** — `apps/learner-app` (React
Native + React Native Web + Expo Router) — that renders both the installable mobile app and the
static web build from a single codebase, over the unchanged typed learner API and deployment
topology of [ADR-0035](../adr/0035-separate-learner-app-static-spa-typed-api.md).

Decisions taken with the user (2026-07-09):

- **Universal app over two renderers.** Of the learner client, ~1,280 lines are shareable pure TS
  versus ~4,320 web-only rendering lines, and learner iteration is UX-heavy (rule 22), so the
  rendering layer is written **once** in RN primitives for both platforms. ADR-0035's
  "rendering layer rewritten in RN primitives" sentence is amended to say this at cutover; its
  locked topology (typed API, opaque bearer token, TanStack Query data layer, static web on
  GitHub Pages) is unchanged.
- **`apps/learner-web` is deleted at cutover** (greenfield hard reset). Cutover requires the v1
  parity cut below **plus** the ADR-0032 feel gate; until then `learner-web` is frozen — no
  feature work lands there.
- **v1 parity cut = core loop + read-only leaderboard**: gate (login/register), expedition
  journal, plan-topic entry, generation progress, full study trail (lesson, option-select,
  matching, impostor, verdict skip/unmark), capstone, leaderboard board + division + chase
  banner. **Deleted with `learner-web` and re-ported in a follow-up pass**: Crystal Duel, the
  board/duel-unlock splashes, Crystal Vista, menu drawer, and growth/assembly animations. Their
  pure logic (`duelMachine`, seam classifier, `crystalVistaView`, geometry) moves into the new
  app with its tests now, so nothing is re-derived later.
- **Crystals render as static `react-native-svg` glyphs** from the same pure `crystalGeometry`,
  so a concept's crystal stays recognizably identical across platforms (ADR-0032 game identity);
  Reanimated growth/assembly comes in the follow-up pass.
- **`node:crypto` fix is root-cause**: a client-safe `@lrnki/application` subpath replaces the
  throwing Vite shim; no Metro alias hack is added (rules 18/21).
- **Styling via NativeWind** (Tailwind syntax on RN primitives). shadcn base-ui exits the learner
  surface; AGENTS **rule 15 rescopes to Admin Lab**, which keeps shadcn + Cytoscape.

## Scope

### U1 — client-safe `@lrnki/application` subpath

- Add an `"./projection"` export to `@lrnki/application` containing only pure, Node-builtin-free
  modules reachable by clients: today's four value imports (`layoutSphereGrid`,
  `isStaleOperation`, `NON_LLM_STAGES`, `DUEL_QUESTION_COUNT`) plus the client-consumed types.
  The `"."` barrel keeps everything for server consumers (learner-api, admin-lab, kg-worker).
- Point `learner-web` at the subpath and **delete `src/lib/nodeCryptoShim.ts` and its Vite
  alias** in the same change; the still-alive `vite build` proves the split immediately, and the
  later Expo web export enforces it permanently (a reachable `node:` import fails the bundle).

### U2 — Expo universal scaffold: `apps/learner-app`

- Latest Expo SDK, TypeScript, Expo Router, React Native Web, NativeWind, `react-native-svg`,
  `expo-secure-store`, AsyncStorage, TanStack Query, `hono/client` — pnpm workspace member.
- `metro.config` for the monorepo: workspace `watchFolders` + package-exports resolution so the
  TS-source workspace packages (`@lrnki/application/projection`, `@lrnki/learner-api/client`,
  `@lrnki/domain-core`, `@lrnki/ports`) compile in place. Keep pnpm's isolated linker unless
  Metro resolution forces hoisting; record the outcome in the ADR amendment.
- API base URL from `EXPO_PUBLIC_LEARNER_API_URL` (dev default `http://localhost:8787`).
- Platform seams via RN file extensions, same exported contract each:
  - `tokenStore.ts` (SecureStore) / `tokenStore.web.ts` (localStorage). SecureStore reads are
    async, so the store hydrates an in-memory mirror once at app boot and the `hc` headers
    callback stays synchronous; writes go through to storage.
  - `navMemory.ts` (AsyncStorage) / `navMemory.web.ts` (localStorage) for the `seenState`
    storage half; its pure seam classifier moves unchanged.
- Move — not rewrite — the data layer (`api.ts`, `queries.ts`, `actions.ts`, `session.ts` minus
  the two seams) and every pure view-model module with its `node:test` tests (`trailView`,
  `crystalGeometry`, `crystalVistaView`, `duelMachine`, `division`, `expeditionJournalView`,
  `activityProgress`, `matchingProgress`, `generationProgress`, `resumeLabel`, `shuffle`,
  `stageCopy`, `vocabulary`, `advanceMemory`, `useShuffledLookup`); tests keep running under
  `tsx --test`.

### U3 — core loop screens in RN primitives

- Expo Router tree: gate as the unauthenticated guard; `/` journal (Continue → Your expeditions →
  Explore); plan-expedition modal with example chips; `expedition/[enrichmentId]` trail with
  sections, stops, and the activity surface as a bottom sheet/modal — lesson sections,
  one-tap option-select grading with explanations, two-column tap-pair matching (locked-final-pair
  rule via the moved `matchingProgress`), impostor, verdict skip/unmark, capstone.
- Learner copy and themed vocabulary move byte-identical (`vocabulary.ts`, ADR-0033).

### U4 — static crystals + leaderboard

- `CrystalGlyph` re-rendered as `react-native-svg` polygons from `crystalSpec`/`visibleShards`
  (locked/frontier/mastered/ghost states, no animation), plus static equivalents of
  `ConceptMarker`, `SectionCrystalStrip`, and the header tally.
- Read-only leaderboard screen (opened from a simple header menu with Board/Logout): 10-row
  cohort board with viewer highlight, division badge, chase banner. The seam-triggered splash is
  deferred with the other splashes.

### U5 — web export + Pages workflow

- `npx expo export --platform web` produces the static bundle; copy `index.html` → `404.html`
  for the GitHub Pages SPA fallback (same trick `learner-web` uses); verify
  `/expedition/:enrichmentId` deep links.
- Repoint the shipped Pages workflow (`.github/workflows/deploy-learner-web.yml`, see the
  [README Deployment section](../../README.md#deployment)) at the universal app's web export with
  `EXPO_PUBLIC_LEARNER_API_URL`, swapping its `learner-web` build step for `apps/learner-app`.

### U6 — cutover: delete `learner-web`, amend docs

- Only after the Verification gates pass: delete `apps/learner-web` entirely (components, shadcn
  ui kit, Tailwind/Vite config, tests) and its workspace references (rule 18).
- Amend [ADR-0035](../adr/0035-separate-learner-app-static-spa-typed-api.md) (one RN rendering
  layer for both platforms, app name, SecureStore now real); rescope AGENTS rule 15 to Admin
  Lab; repair Admin Lab's "open as learner" link target if the dev URL changes; update plan
  README/TODO references.

### Skipped deliberately (will not transfer or not needed now)

- Crystal Duel, splashes, Crystal Vista, menu drawer, and crystal animations — follow-up pass
  (pure logic already carried over by U2).
- No EAS build/submit or app-store distribution, no push notifications, no offline
  cache/persistence, no OTA update channel work — Expo Go / local dev builds suffice for v1.
- No learner-api change: the existing typed surface already serves everything v1 needs.

## Completion

Fold durable decisions into the ADR-0035 amendment and the rule-15 rescope, update `TODO.md`,
then delete this plan per the plans README.

## Verification

- Deterministic envelope: workspace `typecheck`/`test`/`lint` green with the moved view-model
  tests running in `apps/learner-app`; `expo export --platform web` succeeds; the native bundle
  compiles via `expo start`.
- Real-use gate (rule 14): on a **real device** (Expo Go or a dev build — requires the user's
  phone; goes to BLOCKERS when execution reaches it) against the real API: register through the
  gate, generate a REAL topic expedition end-to-end through production LiteLLM, study a lesson
  plus all three graded item types and a verdict, and read the leaderboard; the statically served
  web export exercised the same way in a browser, including an `/expedition/:id` deep link;
  `401` without a bearer token.
- ADR-0032 feel gate before U6 deletes `learner-web`: side-by-side screenshots showing the
  crystal identity and trail flow are recognizably the game on both platforms.
