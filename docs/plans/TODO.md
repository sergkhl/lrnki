<!-- Hygiene and retention rules: AGENTS.md → Documentation workflow. -->

# TODO

## TODO

- **Generation model evaluation — shaping; no implementation plan is ready.** The
  [brainstorm](../brainstorms/2026-08-08-002-generation-model-evaluation.md) owns the dated evidence,
  candidate options, carried generation changes, and open decisions. Resume with a planning
  interview, one decision at a time, starting with change scope; judge ownership is required only if
  grounding generation moves.

## COMPLETED

- **Source-less Grounding Admission is shared and one-pass (2026-08-19–20).** Synthetic Topic
  Generation, model-grounded prerequisite minting, and generated Support Steps now cross one deep
  admission module. Generated Support Steps also require exhaustive positive-claim admission and
  key-hidden Answer-Key Verification before atomic publication. Grounding verification may drop
  rejected passages, but a draft with no surviving Definition Passage fails closed without
  regeneration under [ADR-0030](../adr/0030-confidence-gated-synthesis.md). Detailed implementation
  record: commits bac34bf, 67247b3, ab17bd6, and 24fc8a0.

- **The native flows navigate exactly at 320 dp (2026-08-10–12).** Support Path scrolls to, fully
  verifies, and taps its exact term action, while Crystal Guardian now does the same for every
  shuffled answer, outcome, and Continue action. One-tap fixture sign-in keeps the scenarios focused
  while the dedicated flow retains manual refusal/success coverage. Support Path's isolated
  dialog-collapse mutant failed 3/3 inside the body/footer block, so its ADOPTED automatic authority
  is unchanged; Guardian remains visual evidence without automatic authority. The
  [rig contract](../../apps/learner-app/e2e-native/README.md) owns the claims and mechanics. Support
  Path detailed record: commit 3bc24e9.

- **Guardian shield-loss correction is calm (2026-08-10).** The dead shake is removed: the keyed
  correction owns the miss response, then Continue restores the static server-owned shield or Last
  Stand state under [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

- **Learner web SPA hard loads deployed and verified (2026-08-09).** GitHub Pages deployed
  commit b0bd09e under the client-rendered single-shell policy in
  [ADR-0035](../adr/0035-separate-learner-app-static-spa-typed-api.md). The deployed dynamic-route and
  OAuth-refusal gate passed; evidence:
  [Pages run 31327027343](https://github.com/sergkhl/lrnki/actions/runs/31327027343).

- **Self-hosted Better Auth and Google return legs (2026-08-08–09).** The shared API and learner app
  use Better Auth, and the user confirmed real Google round trips on Android and web. Local
  real-backend journeys cover persistence and refusal paths. Durable policy:
  [ADR-0041](../adr/0041-own-learner-identity-with-self-hosted-better-auth.md); gate commits 03cdc32,
  d949177, and 3361bfc.

- **The shared judge deployment is live and exercised (2026-08-08).** Recreating LiteLLM made the
  configured independent judge effective, and the production real-use gate exercised it over the
  full study-item fixture. The reload and deployment-verification procedure lives in the root
  [README](../../README.md#deployment).

- **Matching item assignment quality shipped (2026-08-08).** The prompt contract, provable
  containment veto, shared learner-vocabulary rule, and cross-family assignment verification are
  deployed. One borderline residual remains an accepted neural-quality tail rather than a lexical
  gate under [ADR-0026](../adr/0026-typed-study-item-bank.md). Detailed record: commit 4ea7e64.

- **Study Item grounding and key verification shipped (2026-08-07).** Citation resolution and
  cross-family answer-key verification now share one grounding contract; production real-use
  inspection confirmed the repaired bank. Durable policy:
  [ADR-0026](../adr/0026-typed-study-item-bank.md). Detailed record: commit 7fb9a2d.

## VALIDATION

### Real-use quality evaluation — 2026-08-20

- Milestone: one-pass Source-less Grounding Admission and generated Support Step assurance.
- Fixture and source type: the curated Rust ownership Markdown fixture, using its capital-S `String`
  pointer, byte length, and byte capacity definitions through a persisted development enrichment and
  scaffolded anchor.
- Real model calls used: yes. Xiaomi MiMo v2.5 generated the outline, grounding, and content; Groq
  Llama 4 Scout probed the boundary; Qwen3 produced embeddings; DigitalOcean GPT-OSS-120B planned
  and challenged; Parasail DeepSeek V4 Flash 0731 answered, judged, checked congruence, and verified
  the answer key. No configured backup was needed.
- Result: PASS. Local Scaffold operation `62cb46f1-5fad-44a8-a5be-6750fe21234e` completed all 19
  stages under config identity `learner-scaffold-generation-7ab16c2fc80e`.
- Useful output observed: one complete generated `Length vs Capacity` step persisted with one
  nonblank Grounding Bundle definition and the exact anchor reference. Its lesson, question,
  explanation, key, and three false distractors consistently retain Rust `String` scope and byte
  units; the `"hi"` example correctly distinguishes two used bytes from capacity eight.
- Defects observed: the retired bounded replacement path could replace one rejected predicate with a
  different unsupported predicate while its intrinsic self-audit and both judge families accepted
  the substitution. No content or persistence defect was found in the final one-pass run.
- Changes made after inspection: Grounding Generation now runs exactly once per core candidate;
  factual rejection cannot re-enter generation and reaches each consumer's existing fail-closed
  outcome. The replacement prompt, schema, adapter, descriptor, evidence transcript, attempt knob,
  and stale tests were deleted.
- Remaining caveats: this is production-model local application-pipeline and persisted-development-DB
  evidence, not deployed, browser, native, or physical-device evidence. The cleanup query retained
  the operation and its 19 stage rows, with nine existing-user positive controls beside zero reserved
  user, detour, or step rows.
- Safe to continue downstream: yes.
