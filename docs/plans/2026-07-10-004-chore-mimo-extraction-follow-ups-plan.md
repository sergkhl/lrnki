---
title: MiMo Extraction Follow-Ups - Plan
type: chore
date: 2026-07-10
execution: code
---

# MiMo Extraction Follow-Ups - Plan

## Goal Capsule

- **Objective:** Resolve the MiMo cutover follow-ups with measurements, not guesses: decide whether
  lower discovery recall loses real learning structure across mixed domains, lock the known-fatal
  MiMo tool-schema shape behind a mechanical test, and restore honest per-journey cost attribution
  after OpenRouter Xiaomi BYOK made provider-reported response cost zero. Tuning happens only if
  measurement demands it.
- **Authority:** Follow `AGENTS.md` (rules 4, 13, 14, 17, 21), the language in
  [CONTEXT.md](../../CONTEXT.md),
  [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md),
  [ADR-0018](../adr/0018-deterministic-extraction-sampling.md),
  [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md),
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md),
  and [ADR-0034](../adr/0034-neural-stage-descriptors-dotprompt-config-hashes.md). This plan
  owns the accepted implementation scope until completed or abandoned.
- **Execution profile:** Measure-first. U1, U3, and U4 always execute; U2 executes only when U1's
  decision rule triggers it. The audit run itself is the rule-14 real-use gate.
- **Stop conditions:** Stop and revisit if the coverage audit cannot produce stable judgments
  at K=3 (raise K or the method is wrong), or if a tuning step would require a discovery
  prompt change (excluded — rule 17 territory).
- **Tail ownership:** The executor owns the audit run over all fixtures, human inspection of
  reported misses, the tune-or-accept decision, cost-attribution reconciliation, ADR amendments if
  behavior or durable policy changes, durable memory/TODO updates, and final `docs/plans/` cleanup.

---

## Product Contract

### Summary

A durable, repeatable discovery-coverage audit answers the question the cutover left open:
"does MiMo's admitted concept set preserve each source's principal learning structure?" A
deterministic descriptor-shape test prevents the one proven-fatal MiMo wire-schema shape
(trailing nullable property) from being reintroduced. The cache-pin benefit remains measured, while
the cost lens gains an explicit BYOK attribution repair without moving production to a backend that
violates forced named-tool behavior.

### Problem Frame

The 2026-07-10 cutover (evidence `tmp/2026-07-10-extraction-model-switch-mimo/evidence.md`)
accepted two caveats; resolving a later availability block with OpenRouter Xiaomi BYOK exposed a
third follow-up:

1. **Discovery recall variance.** MiMo surfaced 22 Candidates vs DeepSeek's 45 on the Rust
   fixture. The admitted core count was actually equal-or-higher (12 vs 11 on stored runs
   `be33d53c` vs `21f0399f`), suggesting the drop lives in the discard pile — but that is a
   single-fixture observation. DeepSeek is retired (deployments and key deleted; do not
   re-add), and the dev database retains DeepSeek-era runs **only for the Rust fixture**, so
   the primary measure must be absolute (judged against the source), not comparative.
2. **Decoder-quirk fix class.** The impostor failure isolated one fatal wire-schema shape —
   a trailing nullable property (0/8 usable) — plus an intermittent (~1/5) nested-array
   stringification that working schemas absorb via the retry budget. The "avoid nullables in
   new MiMo schemas" guidance currently lives only as memory prose.
3. **BYOK cost-attribution gap.** OpenRouter BYOK fixed Xiaomi's shared-credential
   `441 risk_control` while preserving reliable forced named-tool output, but LiteLLM now records
   MiMo response cost as zero. The ADR-0029 Cost & timings lens therefore under-attributes
   extraction even though token usage and cache reads remain observable. Native Xiaomi was measured
   and rejected for production because its forced `tool_choice` enforcement is non-deterministic.

Raw candidate count is the wrong recall metric: the pipeline is precision-first by design and
Concept Admission is supposed to discard most Candidates. Recall damage only materializes as
concepts absent from the **admitted** set, so that is the layer the audit judges.

### Requirements

- R1. A repeatable discovery-coverage audit runs the cross-family judge over a Structured
  Document plus its Extraction Run's admitted (core + optional) proposals and reports missed
  standalone learning objectives. The prompt is domain-neutral (rule 17): it judges against
  the source in hand, never against expected fixture concepts.
- R2. The audit is K-sampled (default K=3, ADR-0028); a miss counts only when it recurs
  across samples **and** survives human inspection against the source (ADR-0013).
- R3. The audit runs over fresh MiMo extractions of every distinct source registered by
  `fixtures/manifest.json` (5 sources, 5 Declared Domains, mixed formats: markdown, HTML,
  plaintext, PDF-derived markdown — rule 4).
- R4. Secondary comparative check, Rust fixture only: diff the fresh MiMo admitted labels
  against stored DeepSeek run `21f0399f-8bc7-4eb8-9710-ea08cac288d8`; feed asymmetries into
  the same human inspection.
- R5. **Decision rule (stated up front):** tuning (U2) triggers only if recurring,
  human-confirmed principal-concept misses appear on ≥2 Declared Domains. Otherwise the
  finding is recorded as accepted model variance and U2 is skipped — the plan still ships.
- R6. A deterministic test fails the build when any Neural Stage Descriptor routed to a MiMo
  deployment carries a wire schema in which any object's **final** property admits `null`.
  The MiMo-routed alias set is parsed from `litellm/config.yaml`
  (`router_settings.model_group_alias` + deployment entries), never restated in the test.
- R7. Cost & timings attributes a non-zero estimated MiMo cost to OpenRouter BYOK calls from retained
  token/cache usage and one versioned price authority, while preserving the production alias mapping
  and labeling the value as estimated rather than provider-billed spend. A reconciliation fixture
  proves cached and uncached calculations and prevents silent return to zero.

### Scope Boundaries

**In scope:** the audit descriptor/use-case/command, the audit run + decision, the
conditional sampling tune, the descriptor-shape test, BYOK cost attribution, ADR amendment if a
durable policy changes, and memory/TODO/README repairs.

**Out of scope (recorded decisions, do not re-open without new evidence):**

- **Extraction availability fallback (deferred U2 of plan 2026-07-10-002).** A cross-family
  fallback would silently change output profile mid-run; a loud stall is preferable. The pin
  is now *proven* profitable (see Recorded evidence), which further weights keeping it.
  Revisit on observed xiaomi-host instability.
- **`kg-independent-judge` truncated-JSON flake.** Pre-existing, not MiMo, absorbed by retry.
- **Stringified-JSON repair in the generic forced-tool executor** (tolerant-reader parse of a
  string-valued argument before zod). Conventional, but the ~1/5 quirk is currently absorbed
  by the retry budget at negligible cost; adding unmeasured resilience contradicts the
  measure-first posture. Revisit if retry burn grows measurably.
- **Discovery prompt changes.** Rule 17 constrains them and conventional sampling levers are
  unexplored; excluded from the tuning ladder entirely.
- **Blanket "no nullables / no nested arrays" schema assertions.** Mid-object nullables
  (`literalValue`, blueprint `facet`/`reason`) and nested arrays (CEP definitions/mentions)
  demonstrably work on MiMo; banning them would fail working schemas. Only the proven-fatal
  trailing-nullable shape is mechanically enforced; the softer "prefer flat in new MiMo
  schemas" guidance stays prose in
  the `reference-forced-tool-choice-models` memory.

### Recorded evidence — cache pin payoff and attribution regression

Before BYOK, live queries against `LiteLLM_SpendLogs` (dedicated `litellm` DB) measured:

- 749 calls, 1,244,756 prompt tokens, **736,576 cached tokens (59%)**, cache hits on 644/749
  calls — the single-host pin demonstrably warms the prefix cache (corroborated by
  OpenRouter's provider statistics).
- Per-row spend reconciliation: recorded `spend` matches the cache-discounted computation
  exactly (e.g. `gen-1783689704…`: recorded `0.0009761248` = discounted calc `0.00097612` vs
  full-price `0.00267960`), proving LiteLLM applied `cache_read_input_token_cost` correctly on the
  shared OpenRouter route. A warm admission call cost ~63% less than unpinned full price.
- MiMo v2.5 is served by 5 OpenRouter providers (all advertising `tool_choice`), so the pin
  is a real trade-off, not a no-op — and its benefit side is now measured.

OpenRouter Xiaomi BYOK subsequently resolved the provider's shared-credential risk control. The
same production-shaped forced-tool call now reports `is_byok: true` and succeeds under an eight-call
burst, but LiteLLM records response cost `0.0`; the historical spend conclusion is no longer true
for current production traffic. OpenRouter documents BYOK as provider-account billing with a
separate OpenRouter fee policy, so provider-billed spend and internal usage attribution are distinct
facts. The executor re-runs the cache and spend queries during the gate, reconciles U4 against token
usage, and stores both current and historical results in the evidence folder. OpenRouter's
[BYOK documentation](https://openrouter.ai/docs/guides/overview/auth/byok) is the external authority
for its provider-account billing and separate platform-fee behavior.

---

## Planning Contract

### Key Technical Decisions

- **KTD1 — Absolute, judge-based recall measure.** With no cross-domain DeepSeek baseline,
  the primary metric is the project's own Core Set Selection language turned into a judgment:
  does the admitted set preserve the source's principal learning structure? Judged by
  `kg-independent-judge` (gpt-oss-120b) — cross-family from the MiMo extractor, so the model
  under audit never grades its own recall.
- **KTD2 — Audit is a Neural Stage Descriptor.** ADR-0034 makes every forced-tool stage a
  descriptor, and descriptor stage tags are congruence-tested against
  `OPERATION_TIMELINE_CATALOG`. New stage tag `discovery-coverage-audit`, claimed under
  `extraction` in the catalog (measurement-mode: audit calls carry **no** `operation_id`, so
  they can never pollute an operation's cost report; the claim only satisfies catalog
  set-equality and names the owning pipeline arm).
- **KTD3 — Durable `kg-worker` command, not a throwaway script** (the
  `calibrate-boundary-probe` precedent): pure application use-case over ports, invoked by
  `kg-worker audit-discovery-coverage`, reports to gitignored `tmp/` via `--out` (rule 10).
  Every future extractor swap needs this same audit.
- **KTD4 — Cheapest-first conditional tuning ladder** (rule 21: recall shortfall in a
  fixed-model generation stage is an established problem class; conventional remedies are
  sampling-diversity adjustment and multi-sample union, the self-consistency family):
  1. **Discovery temperature sweep** {default, 0, 0.7, 1.0} on the affected fixtures through
     the same audit. ADR-0018's "default sampling for discovery" rationale was measured on
     the retired DeepSeek (greedy inflated generic candidates ~26→~40); that premise is stale
     for MiMo and may even invert. Adoption = one-line `neuralClients.ts` policy change +
     rationale comment + ADR-0018 context amendment in the same change (rule 18);
     `pipeline_config_hash` moves mechanically.
  2. **K-sample union discovery** (union Candidates across K draws, dedup by candidate key)
     only if no single temperature closes the gap. Precision-safe by construction (the
     admission gate absorbs junk) but multiplies admission spend — the known #1 cost stage —
     so its adoption criterion includes the measured cost delta, not just recall.
- **KTD5 — Config-derived shape test.** The trailing-nullable assertion resolves "which
  descriptors are MiMo-routed" by parsing `litellm/config.yaml` at test time (the declared
  source of truth per AGENTS rule 5), the same mechanical-congruence pattern as the ADR-0029
  catalog test. No second representation of the alias mapping.
- **KTD6 — Usage-based estimated cost for BYOK.** This is the established observability problem
  class of cost allocation when a proxy does not receive upstream billing. Follow the conventional
  FinOps split: retain provider-billed spend as reported, derive an explicitly labeled estimate from
  measured input/output/cache tokens and versioned model prices, and reconcile the estimate against
  known non-BYOK rows. First test whether LiteLLM deployment price overrides populate spend for the
  OpenRouter BYOK route; if they do not, calculate at the application read-model boundary from the
  same price authority. Do not switch production to native Xiaomi merely to obtain billing metadata:
  reliable forced named-tool behavior is the higher-order contract.

### Alternatives Considered

- Re-adding DeepSeek for a comparative baseline — rejected: retired by user decision, key
  deleted.
- Throwaway `tmp/` audit script — rejected: rewritten at every model swap; the
  boundary-probe precedent went durable.
- Counting raw candidates as the recall metric — rejected: vanity metric in a
  precision-first pipeline (see Problem Frame).
- Native Xiaomi as the production cost-reporting fix — rejected: it exposes real LiteLLM cost but
  violates ADR-0006 non-deterministically; observability does not override extraction correctness.

### Risk Analysis

- **Judge misses what the extractor missed (correlated blindness).** Mitigated by
  cross-family independence, K-sampling, the Rust DeepSeek diff as an anchor, and human
  inspection as the final arbiter (ADR-0013) — the audit surfaces candidates for human
  judgment; it does not auto-verdict.
- **Audit flags pedantic "misses."** The decision rule requires *principal* learning
  structure (Core Set Selection language), recurrence across K samples, and human
  confirmation on ≥2 domains before any tuning.
- **Fresh extraction cost/time.** 5 sources ≈ the proven per-fixture pipeline cost (Rust run:
  ~90 costed calls); acceptable, and the runs double as multi-domain real-use evidence.
- **Estimated cost drifts from provider pricing.** Keep one versioned price authority, label the
  figure as estimated, add exact cached/uncached fixtures, and reconcile it during the measured run.

---

## Implementation Units

### U1. Discovery coverage audit — descriptor, use-case, command, and the measured run

1. `discovery-coverage-audit.prompt` descriptor on the `kg-independent-judge` alias:
   input = Structured Document text + the run's admitted core/optional proposals (label +
   evidence gist); forced tool returns, per sample, a list of
   `{missedObjective, sourceGrounding, whyStandalone}` (empty list = full coverage).
   Domain-neutral wording (rule 17). Typed rim: zod schema, stage tag
   `discovery-coverage-audit`, fail-closed validation, K-sample orchestration in the
   use-case, not the transport.
2. Register the stage tag in `STAGE_TAGS` and claim it under `extraction` in
   `OPERATION_TIMELINE_CATALOG` (KTD2); the existing congruence tests must stay green.
3. Pure application use-case `auditDiscoveryCoverage` (ports: source read, run/admission
   read, the new audit port): runs K samples, aggregates recurrence (a miss keyed by
   normalized objective label counting across samples), emits a typed report.
4. `kg-worker audit-discovery-coverage <runId> [--k <n>] [--out <dir>]` following the
   `calibrate-boundary-probe` command shape; report JSON + markdown summary to `tmp/`.
5. **The measured run (rule-14 gate):** fresh MiMo extraction of each distinct
   `fixtures/manifest.json` source (5 domains), audit each run at K=3, diff the Rust run
   against DeepSeek run `21f0399f` admitted labels, human-inspect every recurring miss
   against its source, and record the tune-or-accept decision per R5. Re-run and store the
   two cache-pin queries. Evidence: `tmp/2026-07-10-mimo-extraction-follow-ups/`.
6. Unit tests: recurrence aggregation, report shaping, descriptor golden/hash tests per the
   established descriptor pattern.

### U2. Conditional discovery-sampling tune (only if R5 triggers)

1. Temperature sweep per KTD4.1 through the same audit command on the affected fixtures;
   adopt the winning setting via `neuralClients.ts` + ADR-0018 amendment, or
2. K-union discovery per KTD4.2 if the sweep is insufficient, with measured admission-cost
   delta in the adoption decision.
3. Either adoption re-runs the audit on the affected fixtures as its own rule-14 evidence.
   If R5 does not trigger, record "accepted model variance, measured across 5 domains" in
   the evidence and TODO fold, and skip this unit.

### U3. Trailing-nullable descriptor-shape congruence test

1. Test in `packages/infrastructure-litellm`: parse `litellm/config.yaml`, resolve which
   aliases route to a `mimo` deployment, collect every descriptor whose `model:` frontmatter
   names one of those aliases, walk each wire JSON schema, and assert no object's final
   property admits `null` (union with null / `"null"` type entry).
2. The assertion message names the descriptor, the object path, and the offending property,
   and points at the decoder-quirk rationale (the MiMo deployment comment in
   `litellm/config.yaml`).
3. Verify it fails by mutation (temporarily re-adding a trailing nullable) and passes on the
   current tree; discard the mutation.

### U4. Restore OpenRouter BYOK cost attribution

1. Capture representative current BYOK rows proving token and cache usage remain populated while
   provider-reported response cost is zero; preserve them as sanitized deterministic fixtures.
2. Test the smallest conventional fix first: add versioned Xiaomi input/output/cache pricing to the
   existing OpenRouter deployment and verify whether LiteLLM records the expected estimated spend.
   If the proxy still emits zero, derive the estimate in the ADR-0029 cost read path from the same
   price authority; keep raw provider-billed spend and estimated internal cost distinguishable.
3. Add exact cached/uncached calculation tests plus a regression asserting a MiMo BYOK stage with
   non-zero tokens cannot silently render `$0` estimated cost.
4. Reconcile the result against the historical non-BYOK rows above and the current provider price,
   then inspect a real Processing Journey's Cost & timings surface. Record evidence beside U1.
5. Keep `router_settings.model_group_alias` on `openrouter/xiaomi/mimo-v2.5`; the experiments-only
   native deployment remains excluded from production aliases.

---

## Verification Contract

- Deterministic envelope: workspace `typecheck` exit 0, workspace `test` exit 0 (including
  the new congruence + audit unit tests), `lint` 0 errors.
- **Real-use gate (rule 14):** U1.5 *is* the gate — production LiteLLM calls throughout,
  human inspection per ADR-0013, evidence in `tmp/2026-07-10-mimo-extraction-follow-ups/`.
  `DATABASE_URL` loads from the repo-root `.env` (AGENTS rule 14).
- **Cost attribution gate:** cached and uncached fixtures reconcile exactly, a current MiMo BYOK
  Processing Journey reports non-zero estimated extraction cost, and raw provider spend is not
  misrepresented as that estimate.
- Gate cleanup: fresh gate extraction runs stay (they are real-source runs on registered
  fixtures); no learner state is created.

## Definition of Done

- Audit command durable and tested; audit run + decision recorded for all 5 domains; the
  tune adopted-with-ADR-0018-amendment **or** explicitly skipped per R5.
- Trailing-nullable test enforcing on the current tree.
- BYOK token usage produces a reconciled, explicitly estimated non-zero Cost & timings value without
  changing the production alias or weakening forced named-tool behavior.
- `TODO.md`: this plan's entry folded into COMPLETED (resolving the cutover's
  "worth watching across more domains" caveat), the difficulty follow-up untouched.
- Memories (`feedback-llm-model-selection`, `reference-forced-tool-choice-models`) updated
  with the audit outcome; `docs/plans/README.md` repaired; this plan deleted after folding.
