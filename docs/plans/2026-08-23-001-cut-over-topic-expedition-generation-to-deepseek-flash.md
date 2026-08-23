---
title: Cut Over Topic Expedition Generation to DeepSeek Flash and Measure Stage Value - Plan
type: model-cutover
date: 2026-08-23
execution: code
---

# Cut Over Topic Expedition Generation to DeepSeek Flash and Measure Stage Value

**Status:** Ready — U0 next

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

The pinned generation Provider Route is the existing attributable
`deepinfra/fp8` primary → `parasail/fp8` LiteLLM fallback. OpenRouter internal fallback remains
disabled on both deployments. U1 rechecks current route metadata and prices; U2 exercises the exact
production body and every newly routed generator schema on both physical providers before accepting
the cutover.

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
| `kg-topic-expedition-generation` | all nine direct generators | DeepSeek V4 Flash 0731, FP8, reasoning off, temperature 0, seed 7 | `deepinfra/fp8` → `parasail/fp8` |
| `kg-topic-expedition-independent-judge` | difficulty banding/comparison, lesson redundancy, both key verifiers, matching assignment | Xiaomi MiMo v2.5, FP8, reasoning off, temperature 0, seed 7 | `xiaomi/fp8` only |
| `kg-topic-expedition-claim-verification-answerer` | draft-blind answers | same MiMo assignment | `xiaomi/fp8` only |
| `kg-topic-expedition-claim-factuality-judge` | primary factuality judgments | same MiMo assignment | `xiaomi/fp8` only |
| `kg-topic-expedition-claim-verification-planner` | verification questions | OpenAI `gpt-oss-120b`, FP4, reasoning effort `medium`, temperature 0, seed 7 | `coreweave/fp4` → `parasail/fp4` |
| `kg-topic-expedition-claim-factuality-challenger` | second-family factuality judgments | same GPT-OSS assignment | `coreweave/fp4` → `parasail/fp4` |
| `kg-topic-expedition-prerequisite-ordering` | whole-set ordering | same GPT-OSS assignment | `coreweave/fp4` → `parasail/fp4` |

The GPT-OSS choice follows the official
[`gpt-oss-120b` model contract](https://developers.openai.com/api/docs/models/gpt-oss-120b):
reasoning effort is explicit rather than provider-defaulted. The current DigitalOcean and Groq
routes report unknown quantization and therefore cannot qualify under the repository's Model
Assignment rules. CoreWeave and Parasail currently advertise FP4, forced tools, `tool_choice`, and
structured output. They are frozen candidates, not permission to substitute another provider: if
either fails U2, record `FIX_FIRST` and amend the plan before changing the route.

Those route claims are a dated snapshot of OpenRouter's endpoint catalogs for
[DeepSeek](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-flash-0731/endpoints),
[MiMo](https://openrouter.ai/api/v1/models/xiaomi/mimo-v2.5/endpoints), and
[GPT-OSS](https://openrouter.ai/api/v1/models/openai/gpt-oss-120b/endpoints); the served-call checks,
not catalog text, qualify the implementation.

Create a Topic-only MiMo deployment group with explicit FP8 quantization and the existing
reasoning-disabled Xiaomi pin. Do not alter the shared MiMo deployment merely to make the new judge
identity exact; doing so would broaden the config-identity change to unrelated consumers.

The Knowledge-Boundary Probe remains Meta Llama with its current Qwen fallback. The resulting
Grounding Admission has DeepSeek generation, MiMo answer/primary judgment, and GPT-OSS planning and
challenge. Tests resolve every reachable deployment—not just alias strings—and prove that the
generator, primary judge, and challenger are three distinct model families and that every fallback
preserves its alias's exact assignment.

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
2. Record the current Synthetic Topic Generation and Study Item Bank config hashes, the seven global
   aliases that the scoped routes replace inside Topic composition, and the unchanged 19-stage
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

1. Before reloading LiteLLM, send the complete deterministic-client request body and exact forced
   named-tool schema directly to every reachable provider for each newly routed descriptor. The
   bounded maximum is nine generator descriptors × two DeepSeek providers, eight MiMo judge
   descriptors × one Xiaomi provider, and three GPT descriptors × two GPT providers.
2. Fail on ignored sampling fields, reasoning leakage, malformed tool arguments, missing forced-tool
   calls, a provider/quantization mismatch, or an undeclared fallback. Do not replace a failed route
   ad hoc.
3. Only after every direct-provider preflight passes, add the seven aliases and the Topic-specific
   MiMo/GPT deployment groups and fallbacks to `litellm/config.yaml`; reuse the already exact
   DeepSeek FP8 groups. Atomically pass the one routing value from Topic production composition to
   the prepared factories and hashes. Add focused config tests for alias/fallback resolution, exact
   assignments, cross-family invariants, and non-Topic identity stability.
4. Activate the committed config only through the root README deployment/reload runbook. Shared
   Compose may run only from the deploy checkout on its host and detached; if that cannot be done,
   record the exact manual action in `BLOCKERS.md` instead of claiming live evidence.
5. Verify `/models`, then send uniquely tagged calls through every scoped public alias. Match
   `model_group`, loaded deployment id, base model, and physical provider in SpendLogs. Exercise each
   backup directly; one controlled fallback check per two-provider assignment is sufficient.
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

### Open findings

- U0–U4 remain open. No source or `litellm/config.yaml` cutover has occurred under this plan.
- CoreWeave/Parasail GPT FP4 and the Topic-only Xiaomi FP8 group remain candidate routes until their
  complete forced-tool preflights and served-call attribution pass.
- All prior usefulness evidence for the nine generators and eleven reassigned/re-routed supporting
  consumers becomes unqualified when U2 activates. U3 is the first current DeepSeek candidate
  evidence; final release evidence remains intentionally deferred until the pipeline shape settles.
