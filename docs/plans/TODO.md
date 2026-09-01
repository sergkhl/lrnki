# TODO

## TODO

- **Re-author all five Expeditions from online research — complete; final record ready for lifecycle
  closure.** Unit 1 established the final schema-v2 contract. Critical Thinking revision
  `dc27a643…e55b43`, Probability and
  Statistics revision `9be3bb79…7978d1`, Personal Finance revision `767d26bc…7452f9a`, Machine
  Learning revision `60366ccf…0e4e82`, and Neuroscience revision `07bd08f8…40feca3` now hold complete
  learner/private-source `PASS` and are the exact tracked catalog at revision
  `1c29d8c2…d78e9ff`. The no-primer content/runtime/UI/ADR/documentation cutover and focused local
  proof are complete under the
  [priority-1 plan](./2026-09-01-research-authored-three-leg-expeditions.md). Every required final
  evidence class and the exit test pass. Commit this final record, then archive it in the required
  separate lifecycle-closure commit.

## COMPLETED

- **Five researched three-Leg Expeditions replaced the primer-constrained catalog (2026-09-01).**
  The same five human-readable keys and order now resolve to twelve-Stop authored documents with
  explicit online source credits, learner-visible Lesson references, and post-answer explanation
  references. Every exact revision passed an independent learner-first/private-source review; the
  old primers, exact-anchor contract, duplicate candidate trees, and Matching identity leak are
  gone. Durable policy remains in [ADR-0042](../adr/0042-author-expeditions-directly-without-runtime-models.md),
  authoring mechanics in [content/AUTHORING.md](../../content/AUTHORING.md), validation boundaries in
  [validate-lrnki](../../.agents/skills/validate-lrnki/SKILL.md), and native authority in the
  [rig README](../../apps/learner-app/e2e-native/README.md). The atomic cutover and final evidence
  are retained in commits `28f325f`, `e10515d`, and `eba37f5`.

## VALIDATION

### Reviewed three-Leg authored catalog — 2026-09-01

- `pnpm content:check` accepted only the five independently passed revisions at catalog revision
  `1c29d8c2…d78e9ff`. Direct inspection covered all 180 Lesson sections, 118 Activities, 30 Support
  Paths, both Guardian scopes, every answer/explanation, and all 93 exact online credits after every
  `FIX_FIRST` was repaired.
- `pnpm check` passed exact schema/content qualification, all workspace typechecks/tests/lint/builds,
  26 Expo suites/151 tests, and 20/20 intercepted phone/desktop scenarios. `pnpm test:db` passed the
  nine-case migration matrix, 18 live `lrnki_test` infrastructure cases, and downstream suites.
- Direct HTTP completed all five authenticated journeys. Production-format phone UI completed all
  twelve Critical Thinking Stops and four Guardians; desktop UI completed frozen full Legs and Leg
  Guardians for Probability Leg 1, Finance Leg 2, and Machine Learning Leg 3. Three reserved
  learners were deleted exactly; Neuroscience has no real-backend UI Leg claim.
- A fresh Android API-36 emulator passed sign-in, source/Support/three-Leg presentation, and both
  Guardian scopes against APK SHA-256 `6051a79d…9e9d83`. A separately identified iOS 26.5 Debug
  simulator passed the keyed authored-runtime flow against binary SHA-256 `319c7ceb…997ae`.
- The guarded `lrnki` reset removed one pre-existing local-development user, account, session, and
  journey (zero verifications); final cleanup left every identity/journey table empty except the one
  migration row. Those removed records are recoverable only by recreation.
- Evidence is local automated, owned development/test Postgres, intercepted and real-backend web,
  Android emulator, and separately identified iOS Debug-simulator evidence. It is not deployed,
  distributable, physical-device, production, release, external-fact-generality, or arbitrary-source
  evidence.
