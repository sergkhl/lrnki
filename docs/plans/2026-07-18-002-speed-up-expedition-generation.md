# Speed Up Topic Expedition Generation

Status: In progress (2026-07-19). U1–U4 complete; U5 timing/cost gate passed but real-use quality is
`FIX_FIRST` on a generated-grounding factual-conflation defect. Resume from the handoff and evidence
in [TODO](./TODO.md); do not begin the next plan. Interview-locked with the user. Prioritized FIRST
in the active plan order.

Topic Expedition generation (Synthetic Topic Generation + Study Item Bank) currently takes
**~8.6 minutes** request→ready for a ~15-node topic. This plan brings it to **~3 minutes** with
zero quality-policy changes: no K reductions, no stage removals, no prompt edits, no readiness-rule
changes. Every unit either re-hosts existing work (provider lock) or re-orders provably independent
work (parallelization).

Measured baseline (operation `9b67cd64`, 2026-07-18, 16 concepts → 15 nodes, from the ADR-0029
operation timeline):

| Phase | Stage | Wall clock |
| --- | --- | --- |
| enrichment (349s) | domain-inference + concept-set-synthesis | 7s |
| | knowledge-boundary-probe (16 × K=10, concept fan-out 4) | 55s |
| | grounding-generation (fan-out 4) | 26s |
| | **prerequisite-ordering (K=8 parallel gpt-oss-120b draws)** | **164s** |
| | **intrinsic-difficulty (K=5 parallel draws + contested pairs)** | **96s** |
| | persist | 1s |
| study_items (165s) | concept-lesson-generation (fan-out 4, + redundancy judge) | 70s |
| | study-item-blueprint | 9s |
| | option-select → matching → impostor (three sequential barriers) | 82s |
| | persists | 3s |

Root causes: (1) OpenRouter freely routes gpt-oss-120b to slow hosts — 164s is the slowest of 8
parallel draws, and the same model backs `kg-independent-judge` (difficulty, impostor-lie judge,
lesson-redundancy judge); (2) ordering and difficulty run sequentially despite difficulty taking no
DAG input; (3) the three item-type stages run as sequential barriers over the same node set at
fan-out 4.

Governing policy: [ADR-0019](../adr/0019-graph-enrichment-derived-layer.md) (derived-layer
identity), [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md) (stage timelines),
[ADR-0026](../adr/0026-typed-study-item-bank.md) / [ADR-0031](../adr/0031-concept-lesson-teaching-substrate.md)
(study assets), [ADR-0034](../adr/0034-neural-stage-descriptors-dotprompt-config-hashes.md)
(config-hash mechanics), [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md) /
[ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md)
(measurement), AGENTS rules 5 (LiteLLM aliases), 14 (real-use gate), 21 (root-cause first).

## Interview-locked decisions (do not re-ask)

- **KTD1 — Target: ~3 minutes full-ready now; progressive readiness deferred.** This plan
  optimizes time-to-ready for the existing readiness rule. "Learner can start / stay busy under
  ~1 minute" (progressive readiness, phase overlap, or a waiting surface) is recorded as an
  evidence-triggered follow-up in `TODO.md`, not designed here.
- **KTD2 — Provider lock is price-first: Groq or Baseten only.** The gpt-oss-120b deployment gets a
  measured two-candidate evaluation (no Cerebras — fastest but priciest). Prompt caching does NOT
  tip the choice: the K ordering/difficulty draws fire in parallel with identical prompts, so they
  all miss any prefix cache; warming would cost a full draw of latency to save cents of input on
  output-dominated calls. Decide on measured effective $/draw and draw latency. U1 evidence found
  Baseten's live endpoint rejects forced named `tool_choice` despite advertising it in endpoint
  metadata, so ADR-0006 narrows the production lock to Groq alone with no fallback; a false
  two-host chain is not retained.
- **KTD3 — Ordering ∥ difficulty.** `completeDerivedGraphLayer` runs the ordering chain and the
  difficulty stage concurrently. They are independent by construction (difficulty takes no DAG
  input; both read the same prepared node contexts; outputs are disjoint). Fail-closed-without-
  persistence is unchanged; a failure on one branch now wastes the other's in-flight spend —
  accepted.
- **KTD4 — Phases stay sequential; no operation-boundary overlap.** Study Item Bank generation
  keeps reading the persisted layer. Overlapping it with the enrichment back half would degrade
  every lesson's neighborhood (`selectLessonNeighborhood` / `selectSiblingContext` read
  `layer.prerequisiteEdges` for parents/children/sibling ranking) and needs an in-memory handoff
  seam across the operation boundary plus deferred persistence (FKs order the persists). The
  arithmetic hits ~3 min without it; overlap belongs to the deferred KTD1 follow-up.
- **KTD5 — Phase-2 concurrency shape.** Option-select ∥ matching ∥ impostor run as three
  concurrent stage brackets after blueprint (sum→max), each keeping per-node fan-out 4 (12
  concurrent MiMo calls against the single pinned xiaomi host — deliberately modest; no fallback
  exists there). Lessons and blueprint raise fan-out 4→8. Probe `conceptConcurrency` raises 4→8
  (Groq has the qwen fallback). The rule-14 run measures 429/fallback fallout before any further
  raise.
- **KTD6 — Execution knobs leave the synthetic config hash.** `syntheticGenerationConfigHash`
  stops hashing `conceptConcurrency` and `probe.probeConcurrency`. Concurrency is execution
  policy, not derived-layer behavioral identity (ADR-0019); hashing it makes every future tuning
  falsely re-identify layers. One-time hash change, greenfield-fine.
- **KTD7 — Zero stage removals; no "fast mode"; supervisor unchanged.** Every LLM stage was
  interrogated and kept: redundancy judge, blueprint, layer purpose, probe K=10 (calibrated
  floor), ordering K=8 / difficulty K=5 (calibrated consensus), impostor-lie judge. All slow
  judge-backed stages get their speedup from KTD2 for free. No skip-steps mode (second code path
  per stage for savings the target no longer needs). Topic supervisor wake-on-create and
  `MAX_CONCURRENT_GENERATIONS = 2` stay as they are.

## Requirements

- **R1** A ~15-node Topic Expedition generates request→ready in ≤ 3.5 min (hard gate), ~3 min
  expected, measured on the live learner-api supervisor path via the ADR-0029 timeline.
- **R2** No quality-policy change: prompts, K values, thresholds, guards, judges, readiness rule,
  and persisted artifact shapes are byte-identical. Only host routing, stage scheduling, fan-out
  widths, and the hash-input set change.
- **R3** The gpt-oss-120b lock is empirical per the standing forced-tool policy: forced
  `tool_choice` verified against each candidate provider before locking (never trust provider
  metadata — the Vertex 400 incident), plus a real ordering-draw latency and spend-log cost
  measurement for every candidate that passes that prerequisite, recorded in `tmp/`. A provider
  that fails the capability probe is disqualified before representative neural spend.
- **R4** Deterministic outputs stay deterministic: persisted item/rejected/lesson order is
  unchanged from the sequential path (per-stage results merge in canonical stage order after the
  concurrent brackets complete — never interleaved by completion time).
- **R5** Stage timeline fidelity survives concurrency: every stage keeps its own bracket row with
  correct wall-clock and cost attribution; overlapping brackets are acceptable
  (`operation_runs.current_stage` becomes last-writer-wins — cosmetic, accepted).
- **R6** Cost is quantified, not assumed: the gate reports measured $/expedition before vs after
  (expected ≈ +$0.03–0.05 from the pricier fast host; accepted as the price of not trading
  quality via K-reduction).
- **R7** The deployment's `input_cost_per_token`/`output_cost_per_token` estimate fields are
  updated to the locked provider's prices in the same change (they feed the ADR-0029 BYOK spend
  estimates).

## Design

### U1 — gpt-oss-120b provider lock (`litellm/config.yaml`)

On the `openrouter/openai/gpt-oss-120b` deployment: add the empirically valid provider lock with
`allow_fallbacks: false`, keeping `require_parameters: true` and the Google deny-list. Candidates:
Groq (~476 tok/s) and Baseten (lowest TTFT). If both candidates pass the forced-name probe, order
winner then runner-up so a 429 storm degrades to the other fast host, never a slow surprise host;
if only one passes, lock that host alone because forced-tool compatibility is a hard prerequisite.
A locked-host outage surfaces as a transient failure the existing supervisor retry path already
owns. Restart `lrnki-litellm` after the edit. Update the deployment cost fields (R7) and record the
measurement in the deployment comment in the existing config style. Side beneficiaries: intrinsic
difficulty, impostor-lie judge, lesson-redundancy judge, node-merge adjudication — everything on
`kg-independent-judge`.

### U2 — parallel back half (`packages/application/src/completeDerivedGraphLayer.ts`)

Restructure the sequential `ordering → reduction → endpoint-validation → difficulty` into
`Promise.all([orderingChain, difficultyStage])` where the ordering chain keeps its internal order
(consensus draws → symbolic-disposal bracket → endpoint validation → `onOrderingSummary`).
Difficulty-coverage proofs and artifact assembly stay after the join; persist stays last and
atomic.

### U3 — concurrent item stages (`packages/application/src/generateStudyItemBank.ts`)

Stages 3–5 (option-select, matching, impostor) become three concurrent `studyStage` brackets via
`Promise.all`, launched after the blueprint stage. Each stage's `mapWithConcurrency` already
returns input-ordered results; the merge into `studyItems`/`rejectedByNodeType` moves after the
join and applies canonical stage order (option_select, matching, impostor) so persisted order is
identical to today's sequential path (R4). Split the shared fan-out constant:
`DEFAULT_LESSON_CONCURRENCY = 8` (lesson + blueprint stages), `DEFAULT_STUDY_ITEM_CONCURRENCY = 4`
(each item stage).

### U4 — synthetic fan-out + hash-input trim

`DEFAULT_SYNTHETIC_GENERATION_CONFIG.conceptConcurrency: 4 → 8` (probe stage ~55s → ~30s at 40
in-flight Groq draws; grounding ~26s → ~15s). In
`packages/infrastructure-litellm/src/configHashes.ts`, `syntheticGenerationConfigHash` hashes the
config minus `conceptConcurrency` and `probe.probeConcurrency` (behavioral probe knobs
`sampleCount`/`agreementThreshold` stay hashed), with the existing hash tests updated in the same
change. Graph Enrichment's hash wrapper is untouched (out of scope).

### Projected timeline after U1–U4

7s synthesis + ~30s probe + ~15s grounding + ~40s max(ordering, difficulty) + ~35s lessons + ~5s
blueprint + ~40s max(item stages) + ~5s persists ≈ **~2.9 min** — headroom inside the 3.5-min
hard gate without touching any quality knob.

## Implementation units (execution order)

- **U1** Provider-lock experiment + config lock: forced-tool probe, real 15-node ordering-draw
  latency, spend-log $/draw per candidate → lock winner; evidence in
  `tmp/2026-07-18-gptoss-provider-lock/`. Independent of U2–U4; do first — it derisks every
  projection above.
- **U2** Parallel back half + unit tests (stage brackets overlap; both-fail and one-fails paths
  still persist nothing).
- **U3** Concurrent item stages + deterministic-merge unit tests.
- **U4** Synthetic fan-out raise + hash-input trim + hash tests.
- **U5** Rule-14 real-use gate (below), evidence in `tmp/2026-07-18-expedition-speedup/`.

## Validation contract

- **Automated:** `pnpm test:db` plus updated unit tests for U2/U3/U4. Deterministic envelope
  green.
- **Real-use gate (U5):** regenerate a real Topic Expedition through the live learner-api
  supervisor with the SAME topic as baseline `9b67cd64`; capture the per-stage timeline table
  before/after. PASS = R1 timing, every stage `ok: true`, no 429-driven stall (fallback hops are
  acceptable if the run completes inside the gate), measured $/expedition delta reported (R6).
- **Quality inspection (ADR-0013 — a green suite is not quality evidence):** compare the locked
  provider's ordering DAG edges against the baseline layer for sanity (same weights, possibly
  different quantization); spot-check ~3 lessons plus one item of each type; confirm probe
  dispositions still split plausibly core/boundary.

## Out of scope

- Progressive readiness / keep-the-learner-busy under 1 minute (deferred to the `TODO.md`
  evidence-triggered follow-up; owns phase overlap and any readiness-rule change).
- Graph Enrichment (source-grounded arm) scheduling and its config-hash input set — it shares
  `completeDerivedGraphLayer`, so U2 speeds it up incidentally, but its own front half and hash
  wrapper are untouched.
- Model swaps, K/threshold changes, prompt edits, stage removals, supervisor changes (KTD7).
- Cerebras or any provider outside the Groq/Baseten pair (KTD2).
