<!-- Hygiene and retention rules: AGENTS.md → Documentation workflow. -->

# TODO

## TODO

- **Topic Expedition generation latency — blocked; U3 remains `FIX_FIRST`.** Follow
  [the active plan](./2026-08-22-001-repair-topic-expedition-generation-latency.md) in U0–U4 order.
  The bounded admission pipeline and honest 19-stage Journal profile are complete, but equal widths
  8, 12, and 16 all exceeded seven minutes during enrichment and every settled attempt rejected
  over-broad Grounding Bundles. Production-model prompt/schema and pre-draft trials did not clear
  the unchanged admission contract and were discarded. Keep width four and U4 gated pending the
  owner-gated Grounding Generation scope decision in [BLOCKERS](./BLOCKERS.md).

- **Generation model evaluation — shaping; no implementation plan is ready.** The
  [brainstorm](../brainstorms/2026-08-08-002-generation-model-evaluation.md) owns the dated evidence,
  candidate options, carried generation changes, and open decisions. Resume with a planning
  interview, one decision at a time, starting with change scope; judge ownership is required only if
  grounding generation moves.

- **DeepSeek Baidu Provider Route cutover — rolled back; diagnose the live primary failure before
  retry.** Exact direct-provider probes pass, but the deployed LiteLLM route attributed all three
  production aliases to the DeepInfra backup instead of Baidu. Keep the restored route live until
  the Baidu primary succeeds through LiteLLM and every alias passes exact SpendLogs attribution.

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

### DeepSeek Provider Route restoration retry and rollback — 2026-08-23

- Source identity: bounded candidate `4f8f3838a0e034d5e8c8b84e3e03aad6153a028a` restored the
  Baidu-primary/shared-DeepInfra route without the six unpublished local commits. Normal revert
  `a4e20725506fc038a4604c6f19ee9a8580d4b228` is the verified rollback revision in both
  `origin/main` and the VPS checkout history.
- Local automated evidence: the candidate LiteLLM typecheck and all 176 tests passed, including one
  shared Model Assignment, exact route topology, fail-closed quantization, and mechanically derived
  operation hashes. Root `pnpm check` passed schema parity, all workspace checks, lint with zero
  errors, both production builds, and 70 intercepted-web cases. `git diff --check` passed. The
  restored config then passed its typecheck and all 175 LiteLLM tests before the revert was pushed.
- Direct provider preflight: at 2026-08-23 00:39 Bishkek, all six Baidu/DeepInfra × Answer-Key
  Verification, Claim Verification Answering, and Claim Factuality Judgment calls returned HTTP 200
  from the exact requested provider and base model, emitted one forced call, and passed the
  production validator. The matrix completed in about 26 seconds; sanitized artifacts remain
  gitignored.
- Candidate deployment: healthy container
  `a895052f1241d5ca1f8dd489c422ea6476d80dbe10e86ac9b035ba1dd9293ec5` loaded exactly the shared
  primary and shared DeepInfra backup groups. The public learner API remained healthy.
- Production-client smoke: over a bounded tunnel, the real deterministic client used temperature
  0, seed 7, and the normal 600-second timeout. Tag prefix
  `deepseek-provider-restore-1787424337621` produced four schema-valid results in 16.276 seconds:
  all three aliases plus the direct DeepInfra backup. A local-key `/models` 401 was excluded before
  any completion request; the repaired harness used the VPS virtual key in-process without printing
  or persisting it.
- SpendLogs positive control: exactly four of 78,126 rows matched the prefix; every row was
  `success`, used base model `openrouter/deepseek/deepseek-v4-flash-0731`, and recorded zero
  attempted retries. All three alias rows nevertheless resolved to model group
  `openrouter/deepseek/deepseek-v4-flash-0731-deepinfra-backup` and provider `DeepInfra`; the
  direct-backup row did the same. The required three Baidu rows were therefore absent, so the
  acceptance gate failed without a client retry.
- Rollback evidence: healthy container
  `1c14e5ab8e0a0ee40629d9b416021836c735d7b60aeef3be9a4c13838ef9da30` again loads only the base,
  `-claim`, and `-claim-deepinfra-backup` groups. The parser confirms the independent
  BaseTen/Parasail route and both claim aliases' Parasail→DeepInfra route. LiteLLM and the public
  learner API are healthy, and the VPS checkout is clean at the revert.
- Quality policy: prior consumer quality evidence remains qualified because every attempted and
  restored route kept the same DeepSeek V4 Flash 0731 FP8 Model Assignment with reasoning disabled,
  and the failed Provider Route is no longer live.

#### Real-use quality evaluation

- Milestone: Baidu-primary/shared-DeepInfra Provider Route restoration retry.
- Fixture and source type: production-contract sentinels; no curated learner source.
- Real model calls used: yes.
- Result: `FIX_FIRST`.
- Useful output observed: all four contracts returned schema-valid forced-tool arguments.
- Defects observed: every production alias used the fallback instead of the required Baidu primary.
- Changes made after inspection: reverted the candidate and recreated only LiteLLM.
- Remaining caveats: direct Baidu works, but its deployed LiteLLM primary path remains unexplained.
- Safe to continue downstream: yes on the restored route; no on the candidate route.

- Evidence boundary: source contracts, direct OpenRouter provider compatibility, deployed LiteLLM
  inventory/health, production-client contract validity, SpendLogs attribution, and rollback only;
  not a new curated-source usefulness gate, learner journey, native run, or physical-device result.
