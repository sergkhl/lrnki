---
title: Unify Source-less Node Generation and Grounding on DeepSeek - Plan
type: model-cutover
date: 2026-08-23
execution: code
---

# Unify Source-less Node Generation and Grounding on DeepSeek

**Status:** In progress — U0–U2 complete; U3 next

**Decision state:** Locked by owner decision on 2026-08-23. DeepSeek V4 Flash 0731 owns Grounding
Generation for every Source-less Grounding Admission consumer. Preserving ADR-0023 makes the paired
topology part of that decision: DeepSeek also produces the source-less graph nodes, MiMo answers and
judges them, and GPT-OSS plans verification, challenges factuality, and orders prerequisites. This
replaces the Topic-only Grounding assignment and the preserved-assignment constraint in the
[context-and-correlation plan](./2026-08-23-002-deepen-source-less-grounding-and-answer-correlation.md).

## Goal capsule

- **Objective:** Give Topic Expedition, Graph Enrichment, and generated Support Steps one
  operation-neutral Source-less Grounding model topology: DeepSeek generation, independently
  answered MiMo verification, and GPT-OSS planning/challenge. Align every source-less graph-node
  producer and judge to the same cross-family topology, then obtain exact attributable routes plus
  fresh usefulness evidence for every affected composition.
- **Deep module:** `SourceLessGroundingAdmission.forOperation(stage).admitBatch(candidates)` remains
  the sole application interface. Prompt-owned role aliases and LiteLLM adapters hide model routing;
  callers continue to supply only ports, policy, and candidate data and never select a model per
  admission call.
- **Frozen behavior:** Preserve the implemented identity context and exact-key answer object, one
  initial Grounding Bundle, no regeneration, exact claim projection, two independently planned
  verification packets, draft-blind answers, two judge families, replicated-rejection quorum,
  one-target judgments, stable ordering, failure drain, atomic persistence, and the nineteen-stage
  Topic Expedition profile.
- **Assignment:** Grounding Generation uses DeepSeek V4 Flash 0731, declared FP8, reasoning off,
  temperature 0, and seed 7; Concept Set Synthesis and missing-prerequisite proposal use the same
  assignment. Verification Answering, the primary factuality judge, minting durability,
  generated-layer merge adjudication, and intrinsic difficulty use Xiaomi MiMo v2.5, declared FP8
  and reasoning off. Verification Planning, the factuality challenger, and prerequisite ordering
  use GPT-OSS 120B, declared FP4, reasoning effort medium, temperature 0, and seed 7.
- **Authority:** Follow [AGENTS.md](../../AGENTS.md), [CONTEXT.md](../../CONTEXT.md),
  [ADR-0001](../adr/0001-adopt-greenfield-deep-module-architecture.md),
  [ADR-0006](../adr/0006-use-forced-named-tool-schemas.md),
  [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md),
  [ADR-0023](../adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md),
  [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md),
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md),
  [ADR-0030](../adr/0030-confidence-gated-synthesis.md), and
  [ADR-0034](../adr/0034-neural-stage-descriptors-dotprompt-config-hashes.md).
- **Validation route:** Apply the
  [lrnki validation skill](../../.agents/skills/validate-lrnki/SKILL.md). Source tests own alias,
  assignment, hashing, and invariant claims; exact served calls own provider contracts; local
  production-model runs plus direct artifact inspection own usefulness. None becomes deployed,
  browser, native, physical-device, latency, or release evidence.
- **Completion and handback:** Close U0–U5 in order. A passing U4 supplies the missing quality gate
  for the context-and-correlation plan and may unblock the separate latency plan. Consolidate the
  implemented U0–U1 outcome from the predecessor without copying this plan's Validation Log; delete
  each completed plan only after its durable outcome is committed.

## Approved model-role topology

The five admission roles plus the source-less node-producer and generated-node-judge roles are
operation-neutral. `litellm/config.yaml` remains the only alias-to-deployment authority.

| Role | New public alias | Model Assignment | Provider Route |
| --- | --- | --- | --- |
| Source-less Node Generation | `kg-source-less-node-generation` | DeepSeek V4 Flash 0731, FP8, reasoning off | DeepInfra FP8 primary; Parasail FP8 fallback only after both exact producer contracts pass there |
| Grounding Generation | `kg-grounding-generation` | DeepSeek V4 Flash 0731, FP8, reasoning off | DeepInfra FP8 primary; Parasail FP8 fallback only after the exact Grounding contract passes there |
| Verification Planning | `kg-grounding-verification-planner` | GPT-OSS 120B, FP4, reasoning medium | Novita FP4 primary; Parasail FP4 fallback |
| Verification Answering | `kg-grounding-verification-answerer` | Xiaomi MiMo v2.5, FP8, reasoning off | Xiaomi FP8 only |
| Primary Factuality Judgment | `kg-grounding-factuality-judge` | Xiaomi MiMo v2.5, FP8, reasoning off | Xiaomi FP8 only |
| Factuality Challenge | `kg-grounding-factuality-challenger` | GPT-OSS 120B, FP4, reasoning medium | Novita FP4 primary; Parasail FP4 fallback |
| Generated-node Judgment | `kg-generated-node-judge` | Xiaomi MiMo v2.5, FP8, reasoning off | Xiaomi FP8 only |

The Knowledge-Boundary Probe and node embedding remain on their current assignments. Topic-only
Declared Domain inference, learner-asset generation, learner-asset judgment, and prerequisite
ordering retain their existing aliases and assignments. Topic and worker compositions now share
DeepSeek node production/Grounding plus MiMo generated-node judgment; Topic's existing MiMo
independent-judge alias remains only for its learner-asset judges. Source extraction remains on MiMo
under AGENTS rule 5. Grounding and missing-prerequisite proposal leave the overloaded
`kg-claim-extraction` alias, and Concept Set Synthesis leaves `kg-concept-synthesis`.

## Problem class and recognized practice

### Split role topology and correlated self-evaluation

The repository currently has two Source-less Grounding topologies behind one application module.
Topic Expedition overrides Grounding to DeepSeek and moves answering/primary judgment to MiMo, while
Graph Enrichment and generated Support Steps inherit MiMo Grounding and DeepSeek answering/judgment.
That split makes the same module's trust topology depend on caller wiring.

[ADR-0023](../adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md) treats
independence as a property of the generator/judge pair: moving either role requires moving its
counterpart in the same change. The established correction is therefore not a one-alias swap. The
entire five-role admission topology becomes operation-neutral so DeepSeek never evaluates its own
Grounding inside admission. A Grounding-only swap would still leave MiMo's primary judge able to
veto a MiMo-proposed Graph/default-Synthetic node, while DeepSeek merge/difficulty stages grade
DeepSeek Grounding. The established Topic topology avoids both correlations: DeepSeek produces the
node and Grounding; MiMo answers and judges; GPT-OSS plans, challenges, and orders. This plan makes
that complete topology operation-neutral instead of adding a fourth model or weakening the veto
policy.

Independent draft-blind answering remains separate from planning and judgment as already justified
by the [context-and-correlation plan's research](./2026-08-23-002-deepen-source-less-grounding-and-answer-correlation.md#problem-classes-and-recognized-practice).
The approved assignment reuses the exact three-family topology already exercised by Topic
Expedition instead of introducing a bespoke verifier or post-hoc repair.

### Alias overload and false ownership

`grounding-generation.prompt` currently names `kg-claim-extraction`, an alias also used by source
CEP extraction, missing-prerequisite proposal, Layer Purpose, Concept Lesson, Study Item, and
Scaffold generators. Repointing that alias would silently reassign unrelated consumers. A dedicated
Grounding alias is the conventional role-specific configuration seam: prompt frontmatter owns the
requested role, LiteLLM owns its deployment, and each operation hash resolves the same effective
descriptor it executes.

The failed Xiaomi call at revision `61da45e` proves only that the first qualifying observation
returned invalid JSON. It does not prove that MiMo can never serve Grounding or that identity context
caused the miss. The owner decision retires that route for Grounding on product-topology grounds;
the new plan must not rewrite the observation as a model incapability claim.

## Current repository facts

- Topic production composition passes `routing.generation` to Grounding Generation, so
  `kg-topic-expedition-generation` currently resolves that stage to DeepSeek. Its answerer and
  primary judge are MiMo; its planner and challenger are GPT-OSS.
- Graph Enrichment and Scaffold composition construct the five Grounding Admission ports without
  overrides. Prompt frontmatter therefore resolves Grounding to MiMo, answering/primary judgment to
  DeepSeek, and planning/challenge to GPT-OSS.
- `TopicExpeditionModelRouting` currently mixes three genuinely Topic-wide roles with four
  Source-less Grounding roles. Effective descriptor builders override all seven, while the default
  registry drives Graph Enrichment and Scaffold hashes from prompt frontmatter.
- The worker currently shares one DeepSeek `nodeMergeAdjudicator` between Concept Canonicalization
  and Graph Enrichment, and one DeepSeek intrinsic-difficulty port between Graph Enrichment and its
  default Synthetic command. A global merge-alias change would unnecessarily reassign Concept
  Canonicalization, while leaving either generated-layer port on DeepSeek after this cutover would
  violate ADR-0023. Runtime construction and effective descriptors must split at that seam.
- Graph missing-prerequisite proposal and default Concept Set Synthesis currently use MiMo, while
  Topic already overrides Concept Set Synthesis to DeepSeek. Moving only Grounding would make MiMo
  both a node producer and a veto-capable primary judge. Moving both source-less producers to
  DeepSeek preserves the qualified Topic pairing and lets all generated-node judgments use MiMo.
- Graph minting durability currently judges MiMo prerequisite proposals on DeepSeek before
  Grounding. The complete cutover reverses that pair: DeepSeek proposes, MiMo judges durability.
  Rescue durability and rescued-node labeling remain source-mentioned judgments and retain their
  current DeepSeek alias.
- The DeepSeek DeepInfra and Parasail groups, Xiaomi FP8 group, and GPT-OSS Novita/Parasail groups
  already exist. Parasail has not yet passed both node-producer descriptors or the changed
  context-bearing Grounding contract; it is not a reachable fallback for either new DeepSeek alias
  until U2 qualifies it.
- The predecessor implemented identity context in commit `d59856f` and exact answer correlation in
  `61da45e`. Its deterministic evidence is retained. Its U2 assignment-preservation design and the
  single failed shared-MiMo observation do not qualify this new topology.
- Reassigning shared Grounding, source-less node production, and their judging pairs changes prior
  usefulness authority for Topic Expedition, Graph Enrichment, the worker's default Synthetic
  composition, and generated Support Steps under ADR-0013. Study Item Bank has none of those
  descriptors and should remain byte-identical unless an unintended route leak is found.
- The local source/config snapshot is committed at `14db5bd`; no loaded-process, deployment, or
  release claim follows from this planning snapshot.

## Locked technical design

### KTD1 — Make the five admission roles operation-neutral

Change the five prompt frontmatter model names to the aliases in the approved topology table:

- `grounding-generation.prompt`;
- `claim-verification-question-planning.prompt`;
- `claim-verification-answering.prompt`;
- `claim-factuality-judgment.prompt`; and
- `claim-factuality-challenge.prompt`.

The existing adapter factories continue to read those defaults. Their optional `modelOverride`
mechanism remains available for bounded experiments but production composition must not override
any of the five Source-less Grounding roles. Do not add per-operation environment variables, a
generic strategy registry, duplicate prompts, or a caller-visible routing parameter to
`SourceLessGroundingAdmission`.

Delete every superseded public alias and fallback entry used only by these five roles in the same
change: the four shared `kg-claim-verification-*` / `kg-claim-factuality-*` aliases and the four
Topic-specific claim aliases. Retain `kg-claim-extraction` for its remaining source and learner-asset
consumers, but Grounding Generation must no longer request it.

### KTD2 — Make source-less node production operation-neutral

Change `concept-set-synthesis.prompt` and `missing-prerequisite-proposal.prompt` to
`kg-source-less-node-generation`. Both produce the identity of an `llm_grounded` graph node and must
therefore move with Grounding rather than remain on the MiMo family that can veto admission. Delete
the now-unused `kg-concept-synthesis` public alias in the same change; retain `kg-claim-extraction`
for source CEP extraction and learner-asset generation.

Shrink `TopicExpeditionModelRouting` to roles the combined Topic composition still owns:

```ts
type TopicExpeditionModelRouting = Readonly<{
  generation: string;
  independentJudge: string;
  prerequisiteOrdering: string;
}>;
```

`effectiveSyntheticTopicGenerationDescriptors` overrides only Declared Domain Inference and
prerequisite ordering. It leaves Concept Set Synthesis, the Knowledge-Boundary Probe, all five
Source-less Grounding descriptors, and intrinsic difficulty on prompt-owned defaults.
`effectiveStudyItemBankDescriptors` retains its current generation and independent-judge overrides,
so `generation` and `independentJudge` remain required by the combined Topic composition.

Topic production composition constructs Concept Set Synthesis, Grounding Generation, Verification
Planning, Verification Answering, both factuality judges, intrinsic difficulty, and their hashes
from those same defaults. Graph Enrichment and Scaffold already use defaults. Tests cross adapter
factories and effective descriptor builders; they do not assert private helper state.

### KTD3 — Preserve cross-family judgment after admission

Add `kg-generated-node-judge` as the operation-neutral judge for nodes produced and grounded by
DeepSeek. It reuses the exact Xiaomi MiMo FP8 deployment in the topology table; it is not a new
model or a duplicate deployment.

Apply the alias at the narrowest source-owned seams:

- `minting-durability.prompt` and both intrinsic-difficulty prompt frontmatters request it. Minting
  decides whether a DeepSeek proposal may become a DeepSeek-grounded node, and difficulty judges the
  completed generated layer;
- `createNodeMergeAdjudicationPort` accepts the existing descriptor-override mechanism, and the
  worker constructs separate Concept-Canonicalization and generated-layer adjudicators. Only the
  Graph Enrichment instance requests the new alias;
- Graph Enrichment's effective descriptor registry hashes that same override, while Concept
  Canonicalization retains the base `kg-independent-judge` descriptor and byte-identical identity;
  and
- the worker's shared Graph/default-Synthetic intrinsic-difficulty port and Topic composition follow
  the prompt-owned default. Topic's `independentJudge` override remains confined to learner assets.

Prerequisite ordering already resolves to GPT-OSS and remains unchanged. Rescue durability,
rescued-node labeling, rescue Definition-Passage quality, extraction/canonicalization judgments,
and learner-asset judgments do not evaluate DeepSeek-grounded generated nodes at these seams and
retain their current aliases. Do not route dynamically by node pair or Grounding Origin, duplicate
prompts, or expose this topology through an application port.

Tests prove the runtime ports and their effective hash descriptors resolve identically; that the
generated-node judge differs from both source-less node production and Grounding Generation by
resolved Model Assignment, not alias spelling; and that Concept Canonicalization, Extraction, and
Study Item identities remain unchanged.

### KTD4 — Reuse exact deployments without hidden assignment changes

Map the seven neutral aliases to the existing exact deployment groups. Do not duplicate an identical
deployment under a new group merely to improve its name. Group names are internal routing
identifiers; the new public aliases own the durable operation-neutral role language.

Add alias-keyed DeepSeek fallbacks only after Parasail FP8 passes both source-less node-producer
descriptors and the complete changed Grounding descriptor for all three scope-defect inputs. Primary
and fallback must resolve to the same versioned model, FP8 quantization, reasoning-disabled
behavior, and sampling policy. OpenRouter fallback stays disabled inside each deployment so LiteLLM
alone owns attributable failover.

The MiMo aliases, including the generated-node judge, resolve only to the current declared-FP8
Xiaomi deployment. The GPT aliases resolve to the current declared-FP4 Novita primary and Parasail
fallback with reasoning effort medium. No DigitalOcean/Groq unknown-quantization route, moving model
id, alternate quantization, provider load-balancing, or model-family fallback is admitted.

Tests resolve full routes through `readLitellmProxyConfig`, `modelRoutingBehaviorIdentity`, and
`modelAssignmentIdentity`. Different alias strings are not accepted as proof of cross-family
independence.

### KTD5 — Bind every affected operation identity to the executed topology

The default Graph Enrichment and Scaffold descriptor registries pick up the new prompt-owned
admission roles. Graph Enrichment additionally owns the generated-layer merge override and
prompt-owned generated-node judgments; default Synthetic Topic Generation owns the prompt-owned
node-production and generated-node difficulty assignments; and the Topic effective descriptor set
drops its Concept Set Synthesis, four admission, and intrinsic-difficulty overrides. Recompute and
freeze exact hashes only after source and config agree.

Expected identity effects:

- Graph Enrichment changes;
- generated Scaffold changes;
- default Synthetic Topic Generation changes;
- Topic-routed Synthetic Generation changes; and
- default and Topic-routed Study Item Bank, Concept Canonicalization, and Extraction remain
  byte-identical.

Tests prove that removing any admission descriptor, changing either source-less node-production or
Grounding assignment, changing any of the four verification assignments, or changing the
generated-node judgment assignment perturbs every affected hash and no unaffected hash.
Execution-only concurrency remains excluded. No persisted schema,
migration, operation type, stage tag, HTTP contract, artifact shape, or learner projection changes.

### KTD6 — Qualify the production retry envelope, not a lucky draw

Exact served-contract qualification uses the unchanged production envelope: one initial call plus
at most two corrective attempts. Every attempt is retained and attributed. A malformed first
attempt is evidence about structural reliability but is not silently retried until a pass; the
fixed matrix runs once per declared case. Terminal exhaustion, wrong model/provider/quantization,
reasoning leakage, a missing or wrong forced tool, schema-invalid final output, or an undeclared
fallback is `FIX_FIRST`.

Before changing a loaded process, run complete rendered prompts and strict tools through:

1. DeepSeek Concept Set Synthesis and missing-prerequisite proposal on DeepInfra and proposed
   Parasail, plus Grounding on both routes for Pyruvate Oxidation, Transaction Isolation, and Labor
   Productivity with the implemented identity context;
2. MiMo Verification Answering with one-, three-, and six-key exact objects, primary factuality
   judgment with production-shaped one-target inputs, minting durability, node-merge adjudication,
   and both intrinsic-difficulty descriptors on Xiaomi FP8; and
3. GPT-OSS Verification Planning and factuality challenge on Novita and Parasail with the exact
   current schemas.

Do not repair JSON, increase retries, widen a route, substitute a model, or treat direct semantic
inspection as end-to-end usefulness. If an exact input/output cannot be retained, state the limit.

### KTD7 — Activate once, then requalify every affected composition

After direct routes pass, rebuild and activate the exact committed local production composition
through the root runbook and host boundary. Verify source/config identity and health, then send
unique tagged public-alias calls and match alias, deployment, model, quantization, provider,
attempts, forced tool, and key coverage in SpendLogs.

Reset only the development application database and run serially:

1. Topic Expeditions for Cellular Respiration, Database Transaction Isolation Levels, Comparative
   Advantage in Classical Economics, and one Cellular repeat;
2. one worker-composed default Synthetic run, using one of those topics, to exercise DeepSeek node
   synthesis/Grounding and MiMo generated-node judgment without Topic overrides;
3. the smallest real curated-source Graph Enrichment fixture that actually proposes, durability-
   judges, generates, and admits a prerequisite, plus a real dedup candidate. Use a second smallest
   curated Graph run only if the prerequisite run cannot naturally exercise merge adjudication; and
4. one generated Support Step that crosses Grounding Generation and Verification Answering.

Use the existing operation timeline, artifacts, prompt renderer, and
`LiteLlmSpendLogsReadAdapter`. Every zero-error, zero-fallback, or zero-asset claim carries a
same-query positive control. Inspect every affected Grounding Bundle and admission result, every
changed generated-node judgment, the full generated prerequisite and consuming graph, the Support
Step beside its admitted grounding, and all Topic learner assets required by the predecessor's
gate. Recorded spend and usage-derived BYOK estimates remain separate.

## Implementation units and commit boundaries

### U0 — Commit the ready design and freeze the source snapshot

1. Re-read current aliases, deployments, fallbacks, prompt frontmatter, operation hashes, and loaded
   environment. Record only repository-portable facts in the Planning Validation Log.
2. Confirm no other worktree has claimed this exclusive model-topology unit.
3. Commit this plan, its execution-order entry, predecessor handoff, accepted brainstorm update, and
   U0 evidence together before source/config work. This is the single U0 batch commit.

### U1 — Implement the operation-neutral topology without activation

1. Apply KTD1–KTD5 in prompt frontmatter, primary-only LiteLLM aliases, effective descriptor
   builders, worker/Topic composition, and focused tests. Delete superseded aliases and route fields
   in the same change. Do not add the proposed DeepSeek or GPT alias fallbacks yet.
2. Prove the three Source-less Grounding operations request the same five admission aliases. Prove
   Graph proposal plus default/Topic Concept Set Synthesis request the source-less node-generation
   alias, all generated-layer judgments request the generated-node alias, and every resolved
   generator/judge pair satisfies ADR-0023.
3. Re-baseline only the expected primary-route operation hashes; prove Study Item Bank, Concept
   Canonicalization, Extraction, rescue, scaffold-content, and learner contracts unchanged.
4. Run changed-package tests/typechecks and targeted lint. Do not reload LiteLLM or rebuild the API.
   Append U1 evidence and commit.

### U2 — Run the exact direct-route matrix

1. Reverify current endpoint model ids, quantization, supported parameters, and provider tags; catalog
   data is preflight metadata, never served-call evidence.
2. Execute KTD6 once per fixed case through the unchanged production retry envelope. Stop on terminal
   exhaustion or any assignment/route mismatch; do not continue later cases past `FIX_FIRST`.
3. Inspect producer outputs for domain/role fit, Grounding semantics for the three known defects,
   generated-node judgments for task adherence, and exact answer-key coverage. Direct calls qualify
   contracts only, not learner usefulness.
4. Only after each fallback route passes its complete descriptor set, add its alias-keyed fallback
   to source config, re-run route/hash/non-leakage checks, and freeze the final candidate hashes. A
   failed DeepSeek fallback leaves source-less node production and Grounding DeepInfra-only; a
   failed GPT fallback leaves planning/challenge Novita-only rather than substituting a provider.
5. Append exact attempts, providers, model ids, tokens, cost class, exclusions, final hashes, and
   verdict; commit U2 status separately.

### U3 — Activate the committed local composition and prove aliases

1. Only after U2 passes, rebuild/recreate the exact candidate through the root detached Compose
   runbook from the valid host checkout. Verify container image/source/config identity and health.
2. Verify `/models`, then send uniquely tagged calls through all seven neutral aliases. Prove the
   primary mappings through public aliases; retain U2's direct-deployment evidence for fallbacks
   rather than injecting a failure solely to force routing. Match calls to SpendLogs and error
   records.
3. Confirm the old eight public claim-role aliases plus `kg-concept-synthesis` are absent and no
   running process serves the old mapping. Append the activation evidence and commit U3.

### U4 — Run affected-consumer real-use qualification

1. Execute KTD7 through the production-composed local API and worker commands using current
   production Model Assignments.
2. Build one disposable joined report in gitignored `tmp/`; inspect every required model output,
   persisted artifact, retry, error, and fallback.
3. Assign `PASS`, `FIX_FIRST`, `INCONCLUSIVE`, or the narrower supported verdict per consumer. A
   rejection is valid evidence but does not qualify a Topic operation as ready.
4. Append operation ids, hashes, authority, quality findings, latency, calls, tokens, recorded and
   estimated cost, positive controls, and cleanup. Commit detailed U4 evidence.

### U5 — Repository gate, consolidation, and handback

1. Run the focused dependency-graph gate plus production builds; run broader checks only where the
   changed graph requires them. Record any intentionally excluded browser/native layer.
2. If U4 passes, mark the predecessor's U0–U1 outcome validated by this successor without copying
   this Validation Log, and make the latency plan ready for its remaining 420-second/soak gates. If
   U4 does not pass, preserve the exact blocker and leave latency blocked.
3. Move durable route mechanics to `litellm/config.yaml`, source tests, and the root README only if
   the implementation introduces a reusable operator step. Do not create an ADR for reversible
   alias names or exact provider pins.
4. Commit detailed U5 evidence; then commit TODO/brainstorm/index consolidation separately. Delete
   the completed predecessor and this plan in separate later commits under AGENTS.md.

## Deterministic acceptance matrix

- All three Source-less Grounding operations request the same five operation-neutral admission
  aliases. Graph proposal plus default/Topic Concept Set Synthesis request
  `kg-source-less-node-generation`; every generated-layer judgment requests
  `kg-generated-node-judge`.
- Source-less Node Generation and Grounding Generation resolve only to DeepSeek V4 Flash 0731, FP8,
  reasoning off; every reachable fallback has that same Model Assignment.
- Verification Answering, primary factuality judgment, and generated-node judgment resolve only to
  MiMo v2.5 FP8; planning and challenge resolve only to GPT-OSS 120B FP4 with medium reasoning.
- Resolved generator, primary judge, and challenger families are pairwise distinct. Callers cannot
  override the production admission topology through `TopicExpeditionModelRouting`.
- Minting durability, Graph node-merge adjudication, and intrinsic difficulty resolve to MiMo,
  independent from DeepSeek proposal/synthesis/Grounding. Prerequisite ordering remains GPT-OSS.
  Concept Canonicalization and source-mentioned rescue judgments remain on their prior assignments.
- Grounding and missing-prerequisite proposal no longer request `kg-claim-extraction`; Concept Set
  Synthesis no longer requests `kg-concept-synthesis`. That alias and the old shared/Topic-specific
  claim-role aliases and fallbacks have no source/config references.
- Graph Enrichment, Scaffold, default Synthetic Topic Generation, and Topic Synthetic Generation
  hashes change. Both Study Item Bank hashes, Concept Canonicalization, Extraction, and every other
  unaffected descriptor identity remain exact.
- Topic Expedition stays exactly nineteen conceptual stages. No port result, Grounding Bundle,
  persisted artifact, HTTP payload, learner projection, scheduling policy, retry budget, admission
  sample/quorum, one-draft rule, or atomic settlement behavior changes.

## Evidence and decision gates

The candidate passes only when:

1. Every neutral alias and reachable fallback resolves to the exact approved Model Assignment and
   passes its complete production forced-tool contract within the unchanged retry envelope.
2. Every direct Grounding output handles the three established scope defects without relying on a
   later sentence to repair an earlier false definition.
3. Answering covers every exact key with no terminal forced-tool exhaustion; all attempts, provider
   fallbacks, and errors are attributable.
4. All four Topic operations become atomically `ready`, collectively exercise all nineteen stages,
   and pass direct learner-asset inspection.
5. The default worker Synthetic run, generated prerequisite, real merge adjudication, and generated
   Support Step exercise every changed composition and pass inspection beside their Grounding,
   judgments, and consuming artifacts.
6. Every zero-row assertion has a same-query positive control, and recorded versus estimated spend
   remain distinct.
7. Focused automation proves complete config identity, no alias leakage, cross-family independence,
   and unchanged deterministic behavior outside the approved assignment change.

Any terminal route, schema, assignment, or consumer-quality failure is `FIX_FIRST`. A green suite,
direct preflight, successful retry, or HTTP 200 does not substitute for real-use usefulness.

## Out of scope and safety boundaries

- No reassignment of source extraction, Topic Declared Domain or learner-asset generators, Topic
  learner-asset judgment, Study Item generation/judgment, prerequisite ordering,
  Knowledge-Boundary Probe, embeddings, source-mentioned rescue judgments, Concept Canonicalization,
  or scaffold outline/content/congruence roles. The named source-less node producers and
  generated-node judgments are explicitly in scope.
- No prompt-content rewrite, tool schema change, parser repair, retry increase, quantization widening,
  model-family fallback, admission-policy change, regenerated Grounding, lower quorum, lexical veto,
  stage combine/remove, retrieval, or learner UX mechanic.
- No persisted schema, migration, HTTP contract, new observer, callback, table, Admin Lab surface,
  or tracked evaluation report.
- No production write, deployment, browser, emulator/simulator, physical-device, or release action.
  Shared Compose remains host-only, detached, and root-runbook governed.
- Preserve unrelated dirty work and reverify routes, environment, fixtures, queue state, and loaded
  revision before trusting this planning snapshot.

## Validation Log

### Planning and owner decision — 2026-08-23 — complete

- Current source inspection confirmed that Topic Grounding already uses DeepSeek while Graph
  Enrichment and generated Support Steps use MiMo through `kg-claim-extraction`. Their answering and
  primary-judgment roles are inverted, so repointing Grounding alone would violate ADR-0023.
- The accepted design moves the complete five-role admission topology to operation-neutral prompt
  aliases. Because either factuality family can veto after replicated evidence, the design also
  moves Concept Set Synthesis and missing-prerequisite proposal to an operation-neutral DeepSeek
  alias. Topic-only routing then retains Declared Domain/learner-asset generation, learner-asset
  judgment, and prerequisite ordering without changing the application admission interface.
- A second coupling audit found that the worker's DeepSeek merge adjudicator and intrinsic-difficulty
  port consume generated Grounding, while the same merge port also serves Concept Canonicalization.
  The plan therefore splits only the production composition and effective descriptors: MiMo owns
  generated-layer judgment, while Canonicalization and source-mentioned judgments keep their
  existing DeepSeek assignment.
- The current DeepSeek, MiMo, and GPT deployment groups can be reused; the proposed DeepSeek Parasail
  fallbacks remain unreachable until both node-producer descriptors and the changed Grounding
  descriptor pass there. Config and operation-hash tests already expose the required route and
  assignment identities.
- Revision `61da45e` supplied one valid Xiaomi route observation with malformed tool JSON. It failed
  that candidate's old gate but did not establish a persistent MiMo incapability. The owner-approved
  DeepSeek assignment supersedes that route for Grounding rather than claiming to repair it.
- This is repository planning and local source/config inspection only. No implementation, served
  contract, loaded composition, real-use, deployed, browser, native, physical-device, latency, or
  release evidence exists for this plan.

### U0 — freeze the pre-cutover source and loaded-environment snapshot — 2026-08-23 — complete

- The pre-cutover snapshot was clean at `fddf171`; `git worktree list --porcelain` reported only the
  main checkout, so no second worktree had claimed the exclusive model-topology unit. Direct source
  inspection confirmed the shared and Topic-specific claim-role aliases, `kg-concept-synthesis`,
  and caller-owned Topic admission overrides were still present before U1.
- The focused configuration baseline passed all 13 tests:
  `pnpm --filter @lrnki/infrastructure-litellm exec tsx --test
  src/topicExpeditionRouting.test.ts src/configHashes.test.ts`. It froze default Graph Enrichment
  `3cd73a12f2f2`, Scaffold `be49ba010024`, default Synthetic `901788bb7bd4`, Topic Synthetic
  `9a8f4f1cb34b`, default Study Item Bank `d574e02753f9`, Topic Study Item Bank `02d755d9fae1`, and
  the nineteen-stage Topic profile under the old topology.
- The host-local LiteLLM `/models` inventory, authenticated from the root environment, still exposed
  the eight old shared/Topic claim-role aliases plus `kg-concept-synthesis` and exposed none of the
  seven neutral aliases. The existing application and router containers were healthy, but no
  candidate source/config was loaded or exercised. No provider draw, Compose lifecycle action,
  process reload, database write, deployment, or release action occurred.
- This is repository/source and loaded-router inventory evidence only. It proves the reviewable U1
  baseline and absence of an already-active candidate; it is not a served-contract, Model
  Assignment, real-use, deployed, browser, native, physical-device, latency, or release result.

### U1 — implement the primary-only operation-neutral topology — 2026-08-23 — complete

- The five Grounding Admission prompts now request operation-neutral aliases. Concept Set Synthesis
  and missing-prerequisite proposal share `kg-source-less-node-generation`; minting durability and
  both intrinsic-difficulty descriptors use `kg-generated-node-judge`. Graph Enrichment overrides
  only its generated-layer merge descriptor to that judge, while Concept Canonicalization keeps the
  base source-family judge. The worker constructs those two merge adapters separately.
- `TopicExpeditionModelRouting` now owns only learner-asset generation, learner-asset judgment, and
  prerequisite ordering. Topic and worker Source-less Grounding compositions use prompt defaults,
  so Graph Enrichment, default/Topic Synthetic, and Scaffold resolve the same five admission roles.
  The nine superseded public aliases/fallback entries and four caller routing fields have no active
  source/config references; the regression test retains their names only to prove absence.
- Route tests resolve the seven candidate aliases to DeepInfra DeepSeek FP8 with reasoning off,
  Xiaomi MiMo FP8 with reasoning off, or Novita GPT-OSS FP4 with medium reasoning as approved. Each
  alias is primary-only for U1, every generator/judge family pairing is distinct by resolved Model
  Assignment, and no deployment group was duplicated.
- Exact candidate hashes are Graph Enrichment `b9e03231cc3a`, Scaffold `3d2fd6f627c7`, default
  Synthetic `baaa3b539272`, and Topic Synthetic `6184e63adc3e`. Default/Topic Study Item Bank remain
  `d574e02753f9` / `02d755d9fae1`; Extraction remains `114ec9e8ddf5`; semantic Concept
  Canonicalization remains `ce3969a22bea`; Topic remains nineteen conceptual stages.
- Local automated checks passed: all 194 `@lrnki/infrastructure-litellm` tests, all eight worker
  tests, the focused learner composition test, all eleven workspace typechecks, targeted ESLint,
  retired runtime-reference searches, and `git diff --check`. The falsification runs exposed only
  intentionally stale operation baselines and renamed model expectations; those were re-frozen and
  the complete package suite then passed.
- No provider request, database write, Compose lifecycle action, LiteLLM reload, API rebuild,
  deployment, browser, native, physical-device, or release action occurred. The currently loaded
  router still serves the pre-U1 topology; source and loaded-process evidence remain distinct.

#### Real-use quality evaluation

- **Milestone / fixture:** primary-only source/config candidate; no fixture before U2 route proof.
- **Real model calls / result:** none; `BLOCKED` here by the ordered direct-route and activation gates.
- **Useful output / defects / changes:** none evaluated; structural, served-route, and consumer-
  usefulness authority remained unqualified.
- **Safe to continue downstream:** yes to U2 qualification only; no to activation or usefulness.

### U2 — qualify exact direct routes and freeze fallbacks — 2026-08-23 — complete

- The live catalog exposed DeepInfra/Parasail DeepSeek FP8, Xiaomi MiMo FP8, and Novita/Parasail
  GPT-OSS FP4 with the required provider tags and forced-tool parameters. This was metadata only;
  served calls carried the exact pin, reasoning, sampling, strict tool, tag, and disabled fallback.
- Attempt 1 retained all 24 HTTP attempts: 19 cases passed; MiMo's three-key answer consumed both
  corrective attempts after two wrong-key objects; then Novita's challenger exhausted on three
  attributable shared-pool HTTP 429s and the matrix stopped. A separately retained recovery draw
  later passed that challenger and both previously unrun GPT-OSS Parasail cases on one attempt each.
- DeepInfra passed both producer contracts and all three Grounding cases in one attempt each. Its
  definitions avoided the established mitochondrial-only, hidden-until-commit, and time-only scope
  defects. Parasail passed the same strict schemas, but manual inspection found exactly those three
  defects in its Grounding text, so both DeepSeek aliases remain DeepInfra-only.
- Xiaomi passed exact answer coverage, primary factuality, minting durability, generated-layer
  merge, and both difficulty contracts. Its judgments rejected the false definition, kept MVCC as
  durable, merged its spelling variants, and used supplied evidence. Both GPT routes planned checks
  and rejected the false universal definition. No successful call mismatched model/provider or
  leaked reasoning on a reasoning-disabled assignment.
- Only `kg-grounding-verification-planner` and `kg-grounding-factuality-challenger` now fall back to
  the qualified GPT Parasail group. Final hashes are Graph `2af0ada6d7e6`, Scaffold `7930b34c0fdb`,
  default Synthetic `9f81ce84488e`, and Topic Synthetic `d78aba900512`; both Study hashes,
  Canonicalization `ce3969a22bea`, Extraction `114ec9e8ddf5`, and nineteen stages remain unchanged.
- The two retained runs total 33,409 prompt, 9,187 completion, and 3,044 reasoning tokens; response
  cost was USD 0.00398383 and the catalog estimate USD 0.0058543252. All 194 infrastructure tests,
  all eleven workspace typechecks, targeted ESLint, route/hash/non-leakage checks, and diff check
  passed. No process reload, database write, deployment, device, or release action occurred.

#### Real-use quality evaluation

- **Milestone / fixture:** final route candidate; production-shaped direct inputs, not a curated run.
- **Real model calls / result:** exact DeepSeek, MiMo, and GPT routes passed with the semantically
  failed DeepSeek fallback excluded; consumer usefulness remains `INCONCLUSIVE` until U4.
- **Useful output / defects / changes:** primary outputs fit their roles; three Parasail Grounding
  defects excluded that fallback, and the qualified GPT fallback was added.
- **Safe to continue downstream:** yes to U3 alias proof only; not yet to usefulness.

### Open findings

- **NEXT:** execute U3 only: rebuild/recreate the exact committed local candidate through the root
  detached host runbook, verify image/source/config identity and health, call all seven public aliases
  with unique tags, reconcile SpendLogs, and prove retired aliases absent before any consumer run.
- The latency plan remains blocked until U4 produces one successful, fully inspected quality
  baseline. This plan does not claim or tune the 420-second target.
