---
title: Unify Source-less Node Generation and Grounding on DeepSeek - Plan
type: model-cutover
date: 2026-08-23
execution: code
---

# Unify Source-less Node Generation and Grounding on DeepSeek

**Status:** On hold — U0–U3 and U5 complete; U4 repair delegated to plan 2026-08-24-001

**Decision state:** Locked by owner decision on 2026-08-23. DeepSeek V4 Flash 0731 owns Grounding
Generation for every Source-less Grounding Admission consumer. Preserving ADR-0023 makes the paired
topology part of that decision: DeepSeek also produces the source-less graph nodes, MiMo answers and
judges them, and GPT-OSS plans verification, challenges factuality, and orders prerequisites. This
replaces the Topic-only Grounding assignment and the preserved-assignment constraint in the
[context-and-correlation plan](./2026-08-23-002-deepen-source-less-grounding-and-answer-correlation.md).
The assignments remain frozen while the owner-authorized
[same-call audit experiment](./2026-08-24-001-test-grounding-identity-scope-audit.md) runs. A
material scope defect reopens Grounding Generation assignment; a pass returns this plan to U4.

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

### U0 — freeze the pre-cutover source and loaded-environment snapshot — 2026-08-23 — complete

- Clean revision `fddf171` and a single-worktree inventory froze the exclusive baseline. Thirteen
  focused route/hash tests passed: Graph `3cd73a12f2f2`, Scaffold `be49ba010024`, Synthetic
  `901788bb7bd4` / `9a8f4f1cb34b`, Study Banks `d574e02753f9` / `02d755d9fae1`, and nineteen stages.
- Authenticated loaded-router inventory exposed the nine retired aliases and none of the seven
  candidate aliases. No candidate process, provider draw, database write, deployment, or release
  action occurred; this was repository plus loaded-inventory evidence only.

### U1 — implement the primary-only operation-neutral topology — 2026-08-23 — complete

- The five admission prompts, DeepSeek producer alias, and MiMo generated-node judge now resolve
  operation-neutrally; Topic retains only learner-asset generation/judgment and prerequisite
  ordering. Worker wiring splits generated-layer merge judgment from unchanged Canonicalization;
  nine superseded aliases and four caller overrides have no active source/config references.
- Primary-only routes resolved to approved DeepInfra DeepSeek FP8, Xiaomi MiMo FP8, and Novita
  GPT-OSS FP4 with pairwise-independent families. Candidate hashes were Graph `b9e03231cc3a`,
  Scaffold `3d2fd6f627c7`, Synthetic `baaa3b539272` / `6184e63adc3e`; unaffected identities stayed exact.
- All 194 infrastructure tests, eight worker tests, focused learner composition, eleven workspace
  typechecks, targeted lint, non-leakage, and diff checks passed. No provider, activation, deployed,
  browser/native/device, or release evidence was claimed.

#### Real-use quality evaluation

- **Milestone / fixture:** primary-only source/config candidate; no fixture before U2 route proof.
- **Real model calls / result:** none; `BLOCKED` here by the ordered direct-route and activation gates.
- **Useful output / defects / changes:** none evaluated; structural, served-route, and consumer-
  usefulness authority remained unqualified.
- **Safe to continue downstream:** yes to U2 qualification only; no to activation or usefulness.

### U2 — qualify exact direct routes and freeze fallbacks — 2026-08-23 — complete

- Exact direct calls qualified DeepInfra DeepSeek, Xiaomi MiMo, and Novita/Parasail GPT-OSS. A
  transient Novita 429 exhaustion recovered. Parasail DeepSeek passed schemas but repeated all three
  scope defects, so DeepSeek remains primary-only; only planner and challenger gained GPT fallback.
- Final hashes are Graph `2af0ada6d7e6`, Scaffold `7930b34c0fdb`, default/Topic Synthetic
  `9f81ce84488e` / `d78aba900512`; unaffected hashes and nineteen stages are unchanged. Retained runs
  used 33,409 prompt, 9,187 completion, and 3,044 reasoning tokens; recorded/estimated costs were
  USD 0.00398383 / 0.0058543252.
- All 194 infrastructure tests, eleven typechecks, targeted lint, route/hash/non-leakage, and diff
  checks passed; this was direct-contract—not consumer-usefulness or deployed—evidence.

#### Real-use quality evaluation

- **Milestone / fixture:** final route candidate; production-shaped direct inputs, not a curated run.
- **Real model calls / result:** exact DeepSeek, MiMo, and GPT routes passed with the semantically
  failed DeepSeek fallback excluded; consumer usefulness remains `INCONCLUSIVE` until U4.
- **Useful output / defects / changes:** primary outputs fit their roles; three Parasail Grounding
  defects excluded that fallback, and the qualified GPT fallback was added.
- **Safe to continue downstream:** yes to U3 alias proof only; not yet to usefulness.

### U3 — activate the committed local composition and prove aliases — 2026-08-23 — complete

- Candidate `16ee119` was rebuilt/recreated detached. The healthy API contained byte-identical U1/U2
  sources; router SHA-256 was `d0c04b90d8adcbd9982b21fb97b5eb0ae355e59a0aa4f4b60f05590d0546ac47`.
  Authenticated inventory exposed all seven neutral and none of the nine retired aliases.
- Seven uniquely tagged public-alias forced-tool calls passed first-attempt on two DeepInfra, two
  Novita, and three Xiaomi primaries. Their joined positive control found seven SpendLogs, 11,332
  prompt plus 3,692 completion tokens, USD 0.000732492 recorded spend, and zero matched errors.

#### Real-use quality evaluation

- **Milestone / fixture:** exact committed local activation; one descriptor sentinel per public alias.
- **Real model calls / result:** seven public-alias contracts `PASS`; consumer usefulness remains
  `INCONCLUSIVE` until U4 because these calls did not settle an affected operation.
- **Useful output / defects / changes:** strict outputs mapped successfully; no route, retry, schema,
  loaded-identity, retired-alias, SpendLog, or matched-error defect remained.
- **Safe to continue downstream:** yes to U4 affected-consumer qualification only.

### U4 — affected-consumer real-use qualification — 2026-08-23 — `FIX_FIRST`

- After an authorized development-app reset and exact API recreation, Cellular Respiration failed
  atomically in enrichment. Expedition `da12672b-9109-4237-ad23-81a75ccd128b`, operation
  `cf71e497-5a28-466e-b89b-33da72a5e9d3`, and run `eb394b75-30a7-4d7a-9a8c-bfe1d2bb82f8`
  settled after 765,982 / 766,000 ms. Enrichment timelines permit `config_hash = null`; committed
  Topic Synthetic identity is `d78aba900512`, and no enrichment artifact existed before failure.
- DeepSeek made mitochondrial location and aerobic context part of Pyruvate Oxidation's identity,
  excluding valid bacterial cytoplasmic and anaerobic variants. Draft-blind MiMo answers surfaced
  both counterexamples; three retained MiMo primary judgments and three GPT challenger judgments
  rejected the definition (with one separate challenger acceptance). The replicated primary veto
  correctly failed admission; no node, edge, lesson, Study Item, rejection, or enrichment leaked.
- Settled attribution contains 367 successful calls, 896,144 prompt plus 312,263 completion tokens,
  USD 0.06135924 raw recorded spend, and USD 0.15405394 usage-derived reported cost including BYOK
  estimates. Same-query controls found all 367 SpendLogs and zero non-success/error-information or
  joined ErrorLog rows. One GPT and three probe fallbacks were used; eleven malformed retained tool
  attempts—six planner, four answerer, one challenger—corrected inside the retry envelope.
- The run proves the admission module's verification architecture caught a producer scope defect.
  It does not qualify the producer or Topic usefulness: the existing domain-neutral prompt already
  forbids turning a common case into a universal identity, while the U2 direct draw passed. This is
  context-sensitive neural nondeterminism, not route/schema/transport failure; retrying for luck
  would violate the gate.
- The remaining three Topic fixtures, worker-default Synthetic run, Graph generated-prerequisite /
  merge case, and generated Support Step were not run; their usefulness remains `INCONCLUSIVE`.
  Exact cleanup removed the one created learner and left zero reserved users or expeditions.

#### Real-use quality evaluation

- **Milestone / fixture:** exact local production composition; Cellular Respiration Topic fixture.
- **Real model calls / result:** one operation `FIX_FIRST`; transport/attribution passed, but
  independent verification rejected DeepSeek's context-narrowed identity.
- **Useful output / defects / changes:** atomic failure was useful; no learner-ready output exists.
  [Chain-of-Verification](https://arxiv.org/abs/2309.11495) matches the draft-blind detection path;
  [Self-Refine](https://arxiv.org/abs/2303.17651) conflicts with the frozen one-draft contract.
- **Safe to continue downstream:** yes to U5 repository handback only; no to more U4 spending,
  consolidation, latency work, deployment, browser/native/device claims, or release.

### U5 — repository gate and failed handback — 2026-08-23 — complete

- Focused automation passed: 194 infrastructure, eight worker, and 21/24 learner-API tests; three
  database-opt-in cases skipped as designed. Eleven workspace typechecks, 58-table Drizzle parity,
  ESLint with zero errors / eleven warnings, and the unchanged API health endpoint passed.
- Both production builds passed: Next.js Admin Lab and Expo learner-web export. `git diff --check`
  passed. Root `pnpm check` was decomposed because Playwright, native/device, deployment,
  production-data, and release execution were outside this plan's authority.
- U4 did not pass, so no predecessor validation upgrade, consolidation, plan deletion, or latency
  unblock occurred. This repository health evidence does not supersede the real-use `FIX_FIRST`.

### Open findings

- **NEXT:** execute the
  [same-call audit experiment](./2026-08-24-001-test-grounding-identity-scope-audit.md) at README
  order 1. No unit here is actionable until its direct matrix and first Topic operation pass.
- On a pass, count the successor's Topic evidence as the first U4 fixture and resume the remaining
  Topic, worker, Graph, and Support Step cases. Do not repeat it merely to move evidence.
- One material scope defect reopens Grounding Generation assignment and keeps this plan on hold; do
  not tune or rerun that candidate for luck.
- Latency remains blocked until a repaired candidate has one fully inspected successful baseline;
  this plan does not claim or tune 420 seconds.
