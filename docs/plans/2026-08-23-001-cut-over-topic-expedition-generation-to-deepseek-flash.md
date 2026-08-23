---
title: Cut Over Topic Expedition Generation to DeepSeek Flash and Measure Stage Value - Plan
type: model-cutover
date: 2026-08-23
execution: code
---

# Cut Over Topic Expedition Generation to DeepSeek Flash and Measure Stage Value

**Status:** In progress — U3 complete (`FIX_FIRST`); U4 stage matrix next

**Decision state:** Locked. The accepted direction, dated comparison, and known quality defects
remain in the
[DeepSeek Flash generation brainstorm](../brainstorms/2026-08-08-002-generation-model-evaluation.md).
This plan owns the first implementation shape: make one scoped Topic Expedition cutover, preserve
the current pipeline, inspect its real outputs, and use those observations to decide the later
simplification. It does not reopen the DeepSeek choice.

## Goal capsule

- **Objective:** Move every direct Topic Expedition generator to one exact DeepSeek Flash Model
  Assignment, preserve independent judging, and collect the smallest useful per-stage latency,
  cost, route, and learner-quality dataset for a later `KEEP / DEEPEN / COMBINE / REMOVE` decision.
- **Initial topology:** Preserve the application-owned 19-stage Topic Expedition profile unchanged,
  including standalone Study Item Blueprint and the three separate Study Item generators and
  verifiers. No stage is removed or combined before fresh DeepSeek evidence exists.
- **Evidence depth:** This is a development-candidate qualification, not final release
  qualification. Use focused deterministic checks, exact forced-tool route preflights, three
  mixed-domain Topic Expeditions, and one repeated topic for variance. Do not duplicate the later
  final-topology release campaign here.
- **Authority:** Follow [AGENTS.md](../../AGENTS.md), [CONTEXT.md](../../CONTEXT.md),
  [ADR-0001](../adr/0001-adopt-greenfield-deep-module-architecture.md),
  [ADR-0006](../adr/0006-use-forced-named-tool-schemas.md),
  [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md),
  [ADR-0023](../adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md),
  [ADR-0026](../adr/0026-typed-study-item-bank.md),
  [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md),
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md),
  [ADR-0030](../adr/0030-confidence-gated-synthesis.md), and
  [ADR-0034](../adr/0034-neural-stage-descriptors-dotprompt-config-hashes.md).
- **Validation route:** Apply the
  [lrnki validation skill](../../.agents/skills/validate-lrnki/SKILL.md). Automated evidence proves
  routing, identity, hashing, and unchanged structural behavior. Existing artifacts plus LiteLLM
  prompt/response and SpendLogs records support real-use inspection. Each claim retains the layer
  that actually produced it.
- **Completion:** Close U0–U4 in order and record the stage-disposition matrix in this plan. If any
  `COMBINE`, `REMOVE`, or learner-visible `DEEPEN` recommendation survives the evidence gate, create
  a separate ready topology plan before making that change. Final release qualification belongs to
  that final-topology plan, or to a small qualification follow-up if every stage remains `KEEP`.

## Planning research snapshot

### Exact selected Flash release

The official [DeepSeek model catalog](https://huggingface.co/deepseek-ai/models) was rechecked on
2026-08-23. The latest official release in the **Flash** family is
[`deepseek-ai/DeepSeek-V4-Flash-0731`](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731),
whose model card says it supersedes the Flash preview. The later `DeepSeek-V4-Pro-0813` is a Pro
release, not a later Flash revision. The selected upstream snapshot is
[`7872f01b1d1fe23eabc4c98b48bffcef5a386062`](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731/tree/7872f01b1d1fe23eabc4c98b48bffcef5a386062).

The pinned generation Model Assignment is:

| Identity field | Frozen value |
| --- | --- |
| Upstream model | `deepseek-ai/DeepSeek-V4-Flash-0731` |
| LiteLLM/OpenRouter model | `openrouter/deepseek/deepseek-v4-flash-0731` |
| Quantization | declared `fp8` only |
| Reasoning | disabled |
| Sampling | deterministic client: temperature `0`, seed `7` |
| Mode/context | chat, 1,048,576 input tokens |

The immutable Hugging Face revision identifies the selected release; it is not evidence that a
hosted provider serves byte-identical weights. The versioned OpenRouter model id, declared
quantization, inference settings, and provider attribution together are the runtime evidence. No
moving `latest`, preview, Pro, alternate quantization, or unknown-quantization fallback is allowed.

The pinned generation Provider Route is the attributable `deepinfra/fp8` deployment only.
OpenRouter and LiteLLM fallback are both disabled for the scoped alias; U2's complete served-call
matrix, not endpoint catalog text, qualifies all nine generator schemas on that route.

### Re-derived consumer set

Prompt frontmatter, the operation descriptor registry, and
[`litellm/config.yaml`](../../litellm/config.yaml) show that a global alias swap would be wrong.
The three incumbent aliases used by direct Topic generation reach 13 prompt files across Synthetic
Topic Generation, Graph Enrichment, source extraction, Study Item Bank, and Scaffold Generation:

- `kg-domain-inference` reaches Declared Domain Inference;
- `kg-concept-synthesis` reaches Concept Set Synthesis; and
- `kg-claim-extraction` reaches CEP Extraction, Grounding Generation, missing-prerequisite
  proposal, layer-purpose generation, Concept Lesson generation, Study Item Blueprint, all three
  Study Item generators, and both Scaffold generators.

The complete prompt-backed MiMo assignment is wider still: 16 prompt files after Concept Discovery
and the two Concept Admission prompts are included. No source use of `default-model` was found.
Those broader sets are not affected consumers of this scoped cutover.

The exact Topic Expedition consumers whose Model Assignment or Provider Route changes are:

| Operation area | Neural consumers | Count | Change |
| --- | --- | ---: | --- |
| Direct generation | Declared Domain Inference; Concept Set Synthesis; Grounding Generation | 3 | MiMo → DeepSeek |
| Study asset generation | Layer Purpose; Concept Lesson; Study Item Blueprint; option-select, matching, and impostor generation | 6 | MiMo → DeepSeek |
| Grounding Admission | question planner; draft-blind answerer; primary factuality judge; factuality challenger | 4 | GPT route pinned; DeepSeek roles → MiMo; GPT route pinned |
| Derived graph completion | prerequisite ordering; intrinsic-difficulty banding; intrinsic-difficulty comparison | 3 | GPT route pinned; DeepSeek roles → MiMo |
| Study asset judgment | lesson-redundancy judge; option-select key verifier; impostor key verifier; matching-assignment verifier | 4 | DeepSeek → MiMo |

That is nine direct generators and eleven supporting planner/judge consumers. The Knowledge-Boundary
Probe, its Qwen fallback, node embedding, all non-Topic operation instances, and every learner read
path remain on their current assignments. The conceptual progress profile remains 19 stages because
some stages contain multiple descriptor calls or two judge families.

The development application database had no current Topic Expedition or Study Item artifacts at
planning time, so it cannot supply a trustworthy pre-cutover output baseline. The dated brainstorm
evidence remains historical context only; U3 creates fresh candidate evidence.

## Locked technical design

### KTD1 — Preserve the complete pipeline for the first cutover

Keep the existing
[`TOPIC_EXPEDITION_STAGE_PROFILE`](../../packages/application/src/topicExpeditionStageProfile.ts)
and every production branch unchanged. In particular:

- Study Item Blueprint remains a standalone neural planning state. Under
  [ADR-0026](../adr/0026-typed-study-item-bank.md), it may select a sparse suitable family set and
  assign distinct facets before the three generators run; the passage-count fallback is not a
  semantic substitute for that work.
- The three activity families and their existing verification boundaries remain separate.
- Source-less Grounding Admission keeps one draft, its current samples and quorum, draft-blind
  answering, two judge families, and atomic admission. The generator never judges its own output.
- Prerequisite and intrinsic-difficulty stages remain separate, and the current stage profile,
  Journal projection, retry behavior, and atomic `ready` transition remain unchanged.

Do not add difficulty to the Blueprint during this cutover. Its current port receives a lesson and
sibling context, but no intrinsic-difficulty value; whether a bounded challenge-intent input would
deepen the planner is one question for the evidence matrix, not an assumption to bake into the
model comparison.

### KTD2 — Add one Topic-scoped routing seam

Do not repoint `kg-claim-extraction`, `kg-independent-judge`, or any other shared alias. The latter
also judges MiMo-generated extraction, canonicalization, enrichment, and Scaffold output, so a
global move to MiMo would create self-judgment outside Topic Expedition.

Instead:

1. Define one small Topic Expedition routing value at the learner API composition boundary. It owns
   only the seven scoped public aliases listed in KTD3.
2. Let the existing adapter factories accept an optional `modelOverride` and clone their existing
   Neural Stage Descriptor through one shared helper. Do not duplicate prompts, schemas, result
   mappers, ports, or stage tags.
3. Build the Synthetic Topic Generation and Study Item Bank operation hashes from the same effective
   overridden descriptors used to construct their ports. The existing default descriptor registry
   remains the authority for non-Topic operations.
4. Keep `modelOverride` inside `stageConfigHash`, then resolve each override through
   `modelRoutingBehaviorIdentity` so aliases, deployments, fallbacks, reasoning, and provider pins
   remain part of the persisted operation identity.

This is the only source seam added for the experiment. Do not add a second Topic pipeline,
per-stage environment variables, prompt copies, an evaluation-only production interface, or a
generic routing framework.

### KTD3 — Pin the scoped model and judge topology

Add these public aliases; their names are part of attribution and must not silently resolve through
the corresponding global alias:

| Scoped alias | Consumers | Exact Model Assignment | Provider Route |
| --- | --- | --- | --- |
| `kg-topic-expedition-generation` | all nine direct generators | DeepSeek V4 Flash 0731, FP8, reasoning off, temperature 0, seed 7 | `deepinfra/fp8` only |
| `kg-topic-expedition-independent-judge` | difficulty banding/comparison, lesson redundancy, both key verifiers, matching assignment | Xiaomi MiMo v2.5, FP8, reasoning off, temperature 0, best-effort seed 7 | `xiaomi/fp8` only |
| `kg-topic-expedition-claim-verification-answerer` | draft-blind answers | same MiMo assignment | `xiaomi/fp8` only |
| `kg-topic-expedition-claim-factuality-judge` | primary factuality judgments | same MiMo assignment | `xiaomi/fp8` only |
| `kg-topic-expedition-claim-verification-planner` | verification questions | OpenAI `gpt-oss-120b`, FP4, reasoning effort `medium`, temperature 0, seed 7 | `novita/fp4` primary; `parasail/fp4` fallback |
| `kg-topic-expedition-claim-factuality-challenger` | second-family factuality judgments | same GPT-OSS assignment | same primary and fallback |
| `kg-topic-expedition-prerequisite-ordering` | whole-set ordering | same GPT-OSS assignment | same primary and fallback |

The GPT-OSS choice follows the official
[`gpt-oss-120b` model contract](https://developers.openai.com/api/docs/models/gpt-oss-120b):
reasoning effort is explicit rather than provider-defaulted. The current DigitalOcean and Groq
routes report unknown quantization and therefore cannot qualify under the repository's Model
Assignment rules.

The first two U2 matrices proved the complete descriptor contract on DeepInfra for all nine
DeepSeek roles and Novita for all three GPT-OSS roles; their failed Mancer and Nebius backups are
removed. Owner authorization on 2026-08-23 also permits empirical MiMo qualification without
OpenRouter's `require_parameters` catalog prefilter. The direct request still sends temperature 0,
seed 7, reasoning disabled, the exact strict forced named tool and schema, `quantizations: ["fp8"]`,
one exact `only`/`order` provider pin, and `allow_fallbacks: false`. Seed remains the owning client's
documented best-effort input, not a reproducibility guarantee.

The bounded MiMo selection froze `xiaomi/fp8`, the first provider in the approved order, after all
eight descriptors passed. Parasail passed only the answerer screen and was not expanded after Xiaomi
qualified; Novita's answerer returned schema-valid arguments but leaked reasoning and is
disqualified. No retry was needed. The selected endpoint price at qualification time was
$0.14/$0.28 per million input/output tokens.

Those route claims are a dated snapshot of OpenRouter's endpoint catalogs for
[DeepSeek](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-flash-0731/endpoints),
[MiMo](https://openrouter.ai/api/v1/models/xiaomi/mimo-v2.5/endpoints), and
[GPT-OSS](https://openrouter.ai/api/v1/models/openai/gpt-oss-120b/endpoints); the served-call checks,
not catalog text, qualify the implementation.

Create one Topic-only MiMo deployment group with explicit FP8 quantization, reasoning disabled, the
qualified provider pin, and no `require_parameters` prefilter. Do not alter the shared MiMo
deployment merely to make the new judge identity exact; doing so would broaden the config-identity
change to unrelated consumers. OpenRouter fallback remains disabled for every scoped deployment.

U3 amended only the GPT Provider Route after Novita's shared upstream pool exhausted the production
retry budget. Parasail's catalog prefilter rejected all three descriptors with
`require_parameters`, but the repository-authorized empirical matrix passed all three exact served
calls when only that filter was omitted. LiteLLM therefore owns one alias-keyed Parasail FP4 backup
for each GPT role. Primary and fallback share the exact model, quantization, reasoning policy, and
sampling inputs; their separate groups keep physical-provider attribution explicit.

The Knowledge-Boundary Probe remains Meta Llama with its current Qwen fallback. The resulting
Grounding Admission has DeepSeek generation, MiMo answer/primary judgment, and GPT-OSS planning and
challenge. Tests resolve every reachable deployment—not just alias strings—and prove that the
generator, primary judge, and challenger are three distinct model families and each single-provider
deployment preserves its alias's exact assignment.

### KTD4 — Inspect existing evidence instead of adding instrumentation

Do not add a table, artifact field, read port, admin surface, or long-lived evaluation module for
this bounded decision. Existing authorities already expose almost every stage output:

- operation stages provide timing and error detail;
- Derived Graph Layer artifacts provide inferred domain, concepts, admitted grounding,
  prerequisites, and intrinsic difficulty;
- Layer Purpose, Concept Lesson, and Study Item artifacts provide learner-facing assets and
  rejections; and
- LiteLLM has `store_prompts_in_spend_logs: true`, request stage/operation tags, response tool
  arguments, tokens, spend, deployment id, and physical provider attribution.

Use read-only SQL and a disposable report under gitignored `tmp/` to align those records. Study Item
Blueprint is the one non-persisted intermediate: inspect its tagged prompt/tool responses directly,
compare nodes with lessons to valid blueprint responses, and mark missing, duplicate-type, or
fallback-equivalent plans in the matrix. Do not change its prompt, schema, normalizer, or catch
fallback merely to improve this experiment's observability.

The plan's Validation Log retains only the consolidated evidence and stage-disposition matrix; it
must not link to `tmp/`.

### KTD5 — Use a bounded, decision-oriented quality sample

After the exact cutover is active, hard-reset only the local development database and run one clean
Topic Expedition for each of:

1. **Cellular Respiration** — life science and the existing latency/grounding regression topic;
2. **Database Transaction Isolation Levels** — software systems and prerequisite-ordering stress;
3. **Comparative Advantage in Classical Economics** — social science and prose/relationship stress.

Repeat Cellular Respiration once as the minimum variance sample required by ADR-0028. Do not run a
six-attempt soak or re-extract PDF/Markdown/HTML fixtures: Topic Expedition is source-less, and the
scoped composition leaves source-format consumers unaffected. Mechanical non-leakage tests are the
appropriate evidence for those consumers.

If a `COMBINE` or `REMOVE` recommendation would rest on one anomalous observation, repeat only the
topic and stage path that triggered it. Stop when the disposition can honestly remain `KEEP` or
`DEEPEN`; do not accumulate a release-sized corpus.

For every run, inspect one output from every executed neural descriptor, every error or fallback,
and all persisted learner assets. Review foundation, middle, and summit nodes plus every rejected or
held-out node. Measure:

- end-to-end and per-stage wall time, call count, tokens, cost, and share of the critical path;
- requested alias, loaded deployment, physical provider, fallback, retry, and error attribution;
- Declared Domain fit, concept coverage/focus, Grounding Bundle atomicity and scope, prerequisite
  usefulness, and intrinsic-difficulty coherence;
- Blueprint family selection, facet distinctness, collapse avoidance, and whether the downstream
  family actually uses the planned facet;
- lesson usefulness and redundancy; and
- option-select, matching, and impostor correctness, answer-key/assignment validity, label cues,
  false matches, off-node focus, over-broad text, and learner-facing length.

Length and lexical patterns are observations, not deterministic vetoes. A successful HTTP response,
schema pass, or artifact count is never upgraded to learner-quality evidence.

### KTD6 — Produce a stage-disposition matrix, not simplification code

Record one row for each of the 19 conceptual stages with:

- its distinct input and output;
- downstream consumers and whether that output is otherwise available;
- latency, token, and cost contribution across the bounded sample;
- observed quality contribution, defects, and variance;
- independence or admission invariant that constrains it; and
- `KEEP`, `DEEPEN`, `COMBINE`, or `REMOVE`, with confidence and the smallest next experiment.

Apply these meanings consistently:

- `KEEP`: the stage contributes distinct learner or trust value, or evidence is insufficient to
  change it.
- `DEEPEN`: the seam is valuable but its inputs/output need a focused contract improvement. This is
  the likely home for any future Blueprint challenge-intent work; it is not permission to call
  neural output calibrated item difficulty.
- `COMBINE`: two adjacent stages duplicate semantic work and a named combined boundary can preserve
  attribution, failure behavior, and every required independent judge.
- `REMOVE`: the output is unused or counterproductive and a bypass preserves all downstream
  contracts and learner quality.

`COMBINE` or `REMOVE` requires repeated supporting evidence and an explicit deletion test. Neither
classification authorizes source changes in this plan. The matrix may not use lower quorum,
regenerated grounding, weaker admission, a lexical veto, or a model substitution to make a stage
appear redundant.

## Implementation units and commit boundaries

### U0 — Freeze identities and the pre-change baseline

1. Commit this ready plan before source or `litellm/config.yaml` changes.
2. Record the current Synthetic Topic Generation and Study Item Bank config hashes, the nine global
   aliases mapped to the seven scoped routes inside Topic composition, and the unchanged 19-stage
   profile.
3. Recheck the official Flash catalog and the OpenRouter endpoint records for DeepSeek, MiMo, and
   GPT-OSS. Record timestamped model id, quantization, supported forced-tool parameters, provider
   tag, and price without treating provider catalog metadata as a successful call.
4. Confirm the development queue is idle. Keep any scratch inventory in `tmp/`; append only the
   consolidated facts below and commit U0.

### U1 — Add the scoped routing seam

1. Add the one descriptor-override helper, optional adapter-factory overrides, and effective
   descriptor builders for both operation hashes. Do not activate them in production composition.
2. Leave `learnerGeneration.ts`, `litellm/config.yaml`, prompt frontmatter, shared aliases, global
   worker composition, neural policy, pipeline stages, schemas, persistence, HTTP contracts, and
   learner projections unchanged.
3. Add only focused tests for effective port models, Topic hash sensitivity, non-Topic hash
   stability, and unchanged stage count. Run the changed-package tests and typechecks; do not run
   DB, browser, native, build, or full-workspace suites. Append one U1 entry and commit.

### U2 — Preflight and activate the exact routes

1. Retain the nine complete DeepInfra and three Novita GPT-OSS passes. Qualify MiMo with the bounded
   selection procedure in KTD3: omit only `require_parameters`, probe all three candidates with the
   answerer contract, and complete the remaining seven descriptors in order until one provider
   passes all eight. Stop after the first full pass; never exceed 24 calls plus one retry for an
   excluded transport or rate-limit attempt.
2. Fail on reasoning leakage, malformed tool arguments, missing forced-tool calls, a provider or
   quantization mismatch, or an undeclared fallback. Keep seed 7 in every request but do not claim
   reproducibility or provider enforcement beyond the client's documented best-effort contract.
3. Only after the direct-provider preflight passes, add the seven aliases and single-provider
   Topic-specific DeepSeek, MiMo, and GPT deployment groups to `litellm/config.yaml`; reuse the
   already exact DeepInfra deployment where possible. Atomically pass the one routing value from
   Topic production composition to the prepared factories and hashes. Add focused config tests for
   alias/deployment resolution, exact assignments, cross-family invariants, and non-Topic identity
   stability.
4. Activate the committed config only through the root README deployment/reload runbook. Shared
   Compose may run only from the deploy checkout on its host and detached; if that cannot be done,
   record the exact manual action in `BLOCKERS.md` instead of claiming live evidence.
5. Verify `/models`, then send uniquely tagged calls through every scoped public alias. Match
   `model_group`, loaded deployment id, base model, and physical provider in SpendLogs. Confirm that
   every alias has exactly one reachable deployment and no hidden fallback.
6. Append one U2 entry with the exact identity/route verdict and commit.

### U3 — Run the bounded real-use sample

1. Load the repo-root environment, hard-reset only the local development application database, and
   verify the Topic Expedition queue is empty. Never use the development database for automated
   tests.
2. Run the three topics and one Cellular Respiration repeat from KTD5 through the production-composed
   learner API. Do not add parallel traffic or a contention soak.
3. Build the disposable joined report from operation stages, LiteLLM prompt/response and SpendLogs,
   and current artifacts. Every zero-error/fallback assertion includes a positive-control call over
   the same operation ids.
4. Perform the KTD5 inspection. Record `PASS`, `FIX_FIRST`, `INCONCLUSIVE`, or a narrower finding per
   quality area; the DeepSeek choice itself is not a verdict option.
5. Append one U3 entry containing the exact operation ids, evidence authority, aggregate latency,
   tokens/cost, route attribution, and learner-quality findings; commit the evidence separately.

### U4 — Decide stage dispositions and hand off

1. Complete the 19-row matrix under KTD6. Run only a targeted repeat required to support a proposed
   `COMBINE` or `REMOVE`; otherwise stop.
2. Present the evidence-backed recommendations and resolve material stage changes with the user one
   question at a time. `KEEP` is the default under insufficient evidence; do not turn a matrix
   recommendation into implementation scope until the user freezes it.
3. Keep this repository state explicitly unqualified for release because the final pipeline shape
   is not yet settled and every affected consumer's earlier usefulness evidence is invalidated.
4. If simplification/deepening is accepted, create one ready follow-up plan whose scope is only
   the accepted rows and final release qualification. If all rows remain `KEEP`, create the smallest
   final DeepSeek qualification follow-up instead.
5. Link that successor ahead of the blocked latency plan as appropriate, append the final U4 entry,
   and commit before consolidating this completed plan under the documentation workflow.

## Focused deterministic acceptance matrix

- Topic composition requests exactly the seven scoped aliases; worker, extraction, Graph
  Enrichment, Scaffold, and source-backed Study Item composition continue to request their previous
  aliases.
- All nine direct generator descriptors resolve to the frozen DeepSeek assignment through primary
  and fallback routes; no route has moving model id, different quantization, or reasoning enabled.
- MiMo Topic judge aliases resolve only to the declared-FP8 Xiaomi deployment. GPT Topic aliases
  resolve only to the declared-FP4 CoreWeave and Parasail deployments with reasoning effort medium.
- Resolved generator, primary judge, and challenger families are pairwise distinct; aliases being
  different is not accepted as proof.
- Effective Topic descriptor changes alter the Synthetic Topic Generation and Study Item Bank
  hashes. Default operation hashes and all non-Topic model assignments remain byte-identical.
- The Topic profile remains exactly 19 conceptual stages and retains Study Item Blueprint, all three
  family generators, and all three family verification stages.
- Existing Grounding Admission sample count, quorum, single-draft/no-regeneration rule, target
  isolation, failure behavior, and atomic settlement remain unchanged.

## Evidence and decision gates

The cutover is useful for the next design decision only when:

1. Every scoped alias and reachable fallback has an exact, attributable Model Assignment and passes
   its required forced-tool preflight.
2. At least one run exercises every conditional conceptual stage; the four planned runs either
   complete or yield a named defect with enough persisted/logged output to diagnose.
3. Each executed descriptor has an inspected input/output example and per-stage timing, token, cost,
   model, and provider evidence.
4. Grounding Bundles and their judges remain cross-family, one-pass, and atomic; no generator judges
   its own output.
5. The matrix explicitly accounts for earlier off-node facets, label-cued matching, false matches,
   over-broad Grounding Bundles, and long outputs alongside any new defects.
6. Any `COMBINE` or `REMOVE` recommendation survives a targeted repeated observation and names the
   invariant-preserving replacement or deletion test.

A catastrophic route or pipeline failure is `FIX_FIRST` because it prevents collection of the
decision data. A learner-quality defect is retained as evidence and may produce `DEEPEN`; it is not
hidden by prompt tuning, regeneration, lower quorum, lexical rejection, or an unqualified route.

## Out of scope and safety boundaries

- No pipeline stage removal, combination, prompt rewrite, schema change, admission-policy change,
  difficulty-contract change, retrieval, or learner UX mechanic is implemented here.
- No new persistence field/table, migration, Admin Lab surface, evaluation service, or permanent
  reporting module. Reuse current artifacts and logs; disposable joins remain in `tmp/`.
- No global alias repoint, source extraction reassignment, Graph Enrichment reassignment, Scaffold
  reassignment, or source-format quality rerun.
- No full repository gate, DB test suite, browser test, emulator/simulator, physical-device run,
  deployed learner validation, production-data write, or final release claim.
- A local application-database hard reset is authorized. Shared database reset, deployment, and
  shared LiteLLM reload remain governed by the root README and AGENTS.md host boundary.
- Preserve unrelated dirty work. A route or model outside the frozen table requires a plan amendment,
  not an opportunistic fallback.

## Validation Log

### Planning research and interview — 2026-08-23 — complete

- Official-model evidence: DeepSeek's current official Flash model card identifies V4 Flash 0731
  as the release superseding the preview; the official catalog has no later Flash release. The
  immutable upstream snapshot and exact runtime Model Assignment are frozen above.
- Repository evidence: prompt frontmatter plus the current alias map produce nine direct Topic
  generators, eleven supporting planner/judge consumers whose assignment or route must change, and
  a broader 13-prompt collateral set that a global swap would wrongly move. The production
  composition currently has no scoped override except the boundary-probe factory's optional model.
- Blueprint evidence: ADR-0026 and current source make the planner the neural sparse-family/facet
  decision. Its fallback is passage-count-only and its input does not contain intrinsic difficulty,
  so deleting it or claiming it already plans calibrated difficulty is unsupported.
- Current-data evidence: the local application database contains no current expedition/enrichment/
  Study Item artifact suitable as a baseline. LiteLLM has historical stage timing and spend, but a
  new Model Assignment invalidates its learner-usefulness conclusions.
- Frozen answers: preserve the full initial pipeline; DeepSeek generates; MiMo is the Topic primary
  independent family; GPT-OSS remains the planner/challenger/ordering family on an exact FP4 route;
  the boundary probe remains unchanged. Evidence precedes any simplification.
- Scope refinement: validation is deliberately bounded to data needed for the next topology
  decision. This is planning and provider-catalog evidence only—not implemented, local real-use,
  release, deployed, browser, native, or physical-device evidence.

### U0 — frozen identities and pre-change baseline — 2026-08-23 — complete

- Source baseline at `7360475`: Synthetic Topic Generation config hash
  `synthetic-topic-generation-7b8549a3e0cc`, Study Item Bank config hash
  `study-item-bank-d574e02753f9`, and 19 conceptual stages (nine enrichment plus ten Study Item
  Bank). The exact ordered profile remains source-owned by `TOPIC_EXPEDITION_STAGE_PROFILE`.
- Current-to-scoped alias map: `kg-domain-inference`, `kg-concept-synthesis`, and
  `kg-claim-extraction` map to `kg-topic-expedition-generation`; `kg-independent-judge`,
  `kg-claim-verification-answerer`, `kg-claim-factuality-judge`,
  `kg-claim-verification-planner`, `kg-claim-factuality-challenger`, and
  `kg-prerequisite-ordering` each map to their corresponding Topic-scoped alias in KTD3. The
  Knowledge-Boundary Probe remains outside the override.
- Catalog refresh at `2026-08-23T10:40:00Z`: the official Flash release and immutable snapshot remain
  `deepseek-ai/DeepSeek-V4-Flash-0731@7872f01b1d1fe23eabc4c98b48bffcef5a386062`. OpenRouter still
  reports `deepinfra/fp8` at $0.08/$0.18 and `parasail/fp8` at $0.14/$0.28 per million input/output
  tokens for DeepSeek; both advertise forced tools, temperature, and seed. Xiaomi MiMo remains
  `xiaomi/fp8` at $0.14/$0.28 and advertises forced tools and temperature, but not seed. GPT-OSS
  remains `coreweave/fp4` at $0.03/$0.17 and `parasail/fp4` at $0.10/$0.75; both advertise forced
  tools, temperature, seed, and reasoning effort. Prices exclude cache-read charges.
- Development queue query against `lrnki`: six historical operation rows were the same-query
  positive control; zero operations were running and zero running rows belonged to enrichment or
  Study Item Bank. `learner_expeditions` was empty. No provider call, config reload, source change,
  or learner-quality claim occurred in U0; catalog fields remain candidates for U2 served-call
  qualification.

### U1 — inactive Topic-scoped routing seam — 2026-08-23 — complete

- One `withModelOverride` helper now clones a Neural Stage Descriptor without changing its prompt,
  schema, mapper, stage tag, or default identity. The existing Topic adapter factories accept one
  optional override, and effective Synthetic Topic Generation and Study Item Bank descriptor
  builders remain the single registry-owned membership source for both default and scoped hashes.
- Effective Grounding Generation propagates the selected model into both the forced-tool call and
  Generated Grounding Bundle provenance. Topic hash tests cover all seven routing roles; default
  Synthetic Topic Generation, Study Item Bank, Graph Enrichment, and Scaffold hashes remain the U0
  values, and the application-owned profile remains 19 stages.
- Local automated evidence: the focused override/provenance/routing tests passed, all 184
  `@lrnki/infrastructure-litellm` tests passed, its typecheck passed, targeted lint passed, and
  `git diff --check` passed. Production composition, prompt frontmatter, `litellm/config.yaml`,
  persistence, HTTP contracts, and runtime routes are unchanged. This proves only the inactive
  source seam and deterministic identities—not provider compatibility, activation, real use,
  deployed behavior, browser, native, or physical-device behavior.

### U2 — exact scoped routes active and attributable — 2026-08-23 — complete

- Direct-provider qualification used the complete effective prompt, temperature 0, seed 7, exact
  strict named-tool schema, reasoning policy, quantization, one physical-provider pin, and no
  fallback. The final matrices passed DeepInfra FP8 for all nine generators, Xiaomi FP8 for all
  eight MiMo roles, and Novita FP4 for all three GPT-OSS roles. Every accepted result had exact
  model/provider attribution and validator-accepted tool arguments; reasoning was absent where
  disabled, while seed remains best-effort rather than a reproducibility guarantee.
- Discarded routes did not qualify: Parasail DeepSeek remained throttled on Matching Generation;
  Mancer DeepSeek and Nebius GPT were catalog-filtered; CoreWeave GPT failed two complex schemas;
  and the original MiMo candidates were catalog-filtered under `require_parameters`. Owner-authorized
  empirical MiMo screening without that prefilter passed Xiaomi 8/8, stopped before an unnecessary
  full Parasail matrix, and rejected Novita for reasoning leakage. This evidence is direct
  OpenRouter/provider contract only—not loaded-alias, persistence, or learner-usefulness evidence.
- Local activation candidate: Topic production composition now owns one seven-alias routing value
  and passes it to every affected port plus both operation hashes. The canonical LiteLLM config
  resolves those aliases to one DeepInfra DeepSeek deployment, one exact Xiaomi FP8 MiMo deployment,
  and one Novita FP4 GPT-OSS deployment with medium reasoning; none has a fallback. Shared aliases
  and non-Topic composition remain unchanged. Candidate hashes are
  `synthetic-topic-generation-299166f6ba7c` and `study-item-bank-02d755d9fae1`.
- Local automated evidence: focused production-constant and resolved-route tests passed; the full
  infrastructure-LiteLLM and learner-API suites passed, both package typechecks passed, targeted
  lint passed, and `git diff --check` passed. One root `tsx -e` hash print was excluded because that
  eval context cannot resolve workspace aliases; the package-scoped rerun produced the hashes above.
  This proves the committed source/config candidate only, not a loaded LiteLLM process or served
  alias.
- Local shared-runtime activation: the sole host worktree was clean at committed candidate
  `3d418a3`, Docker used that checkout, and LiteLLM's read-only bind resolved to its canonical config.
  The old process was the negative control—37 loaded models and no Topic group. A detached recreate
  produced a new container; its initial bounded health wait was excluded while Prisma migration was
  still running, then the same container became healthy with 45 models and all three exact groups.
- Served-alias attribution: proof tag `topic-u2-3d418a3-proof-a1` had zero rows before seven
  zero-retry production-client calls. All seven returned validator-accepted forced tools. SpendLogs
  then contained exactly seven successful rows and seven aliases: one DeepInfra DeepSeek, three
  Xiaomi MiMo, and three Novita GPT-OSS. `/model/info` resolved their three deployment ids to the
  expected base models; no fallback row appeared. Two malformed read-only `jq` projections were
  excluded and corrected without another model call.
- Production-composition freshness: host and learner-API container hashes for
  `learnerGeneration.ts` matched, the watcher-started process was healthy, and its internal `/health`
  returned 200. This is local shared-runtime source, loaded-route, provider-attribution, and forced-
  tool evidence—not a complete Topic Expedition, persistence, learner usefulness, browser, native,
  physical-device, deployed, or final-release evidence.

### U3 — bounded real-use sample — 2026-08-23 — complete (`FIX_FIRST`)

- The four qualifying operations were Cellular Respiration `ce077719-5ef1-42c1-9334-e8fb0f16a5d5`
  (879 seconds), Database Transaction Isolation Levels `da249653-5bc3-4c40-aa7f-1fe5a7897b77`
  (1,059 seconds), Comparative Advantage `989edc35-4be5-4726-9891-cd5327221362` (587 seconds),
  and Cellular repeat `b41ff2d5-0559-4b15-8b80-d3f2e7d21bc2` (785 seconds). All four were one-
  attempt terminal failures before persistence; the four retained expedition rows are same-query
  positive controls for zero enrichments, nodes, edges, lessons, Study Items, and rejections.
- Settled SpendLogs contained 1,296 successful calls, 2,619,560 prompt plus 1,007,488 completion
  tokens, $0.25040813645 spend, and 61 naturally selected Parasail-backup calls. The terminal gate
  snapshots had 1,291 rows; the joined report waited for five delayed logs before aggregating. The
  earlier three-attempt Database run is excluded route-recovery evidence: nine Novita shared-pool
  429s led to the qualified same-assignment fallback, which then served cleanly under real load.
- Declared Domain fit passed for Cell Biology, Database Systems, and International Economics;
  concept coverage was broad enough to expose foundation and boundary claims. Grounding atomicity
  and scope are `FIX_FIRST`: admission correctly rejected universalized mitochondrial Pyruvate
  Oxidation, hidden-until-commit transaction isolation, and time-only labor productivity. The two
  Cellular generations repeated the same narrow mitochondrial definitions, so this is the known
  cross-domain decontextualization/non-atomic factual-scope class, not one anomalous observation.
- The Cellular repeat independently failed because Xiaomi MiMo emitted schema-invalid answerer
  arguments through all three corrective attempts; 38 successful same-operation answer calls are
  the positive control. Operation-stage error detail, not the zero-error successful SpendLogs set,
  owns that `FIX_FIRST` forced-tool verdict. No downstream graph-completion or Study Item stage ran,
  so learner assets and those twelve stage-quality areas remain `INCONCLUSIVE`, never implicitly
  passed.
- One source-owned prompt and retained tool output per executed descriptor, all generated Grounding
  Bundles, both Cellular variants, every stage error, and all provider legs were inspected. All
  1,296 same-operation rows stored empty `messages` despite `store_prompts_in_spend_logs`; source
  prompt files plus response arguments supplied the bounded inspection, and the observability gap
  remains explicit. Evidence authority is local production composition, development Postgres, and
  production LLM routes—not deployed, browser, native, physical-device, or release qualification.

### Open findings

- **NEXT:** complete U4's 19-row disposition matrix. Keep all twelve unexecuted stages under
  insufficient evidence, deepen only the observed Grounding/answerer seams, and do not run another
  topic unless a proposed `COMBINE` or `REMOVE` requires it. Create the smallest successor that owns
  the accepted deepening and final qualification before consolidating this plan.
- Restore prompt-message observability in that successor or amend the inspection workflow to its
  actual storage boundary; do not claim rendered-prompt evidence from empty SpendLogs rows.
