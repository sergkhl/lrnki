---
title: Pause Synthetic Topic Generation and Diagnose Source-backed Generation - Plan
type: implementation
date: 2026-08-24
execution: code
---

# Pause Synthetic Topic Generation and Diagnose Source-backed Generation

**Status:** Complete — U0–U7 closed; source-backed graph generation is repaired and learner-asset
generation remains `FIX_FIRST` behind an owner decision

**Decision state:** The owner decided on 2026-08-24 to pause fully anchor-less Synthetic Topic
Generation and to diagnose the existing curated-source generation path before choosing another
Grounding Generation Model Assignment. The pause is reversible and applies to production-shaped
entry points, not to the retained implementation or its deterministic tests. Existing ready
expeditions and curated-source Graph Enrichment / Study Item Bank generation remain available.

## Goal capsule

- **Objective:** Stop new anchor-less topic-generation work and spend, make that state honest on the
  learner surface, then run the smallest real curated-source generation gate and repair a
  reproducible defect when a conventional in-scope fix is available.
- **Deep boundary:** One application-owned `SyntheticTopicGenerationAvailability` value is the
  authority consumed by the worker, learner API, process supervisor, and Journal transport. The
  learner app renders the finished availability; it does not own another feature flag.
- **Preserved source-backed path:** Curated Source registration, Extraction, Concept
  Canonicalization, Graph-Version Build, Graph Enrichment over a published snapshot, Study Item
  Bank generation, and catalog adoption stay executable. Existing `ready` learner expeditions stay
  readable and usable.
- **Validation route:** Apply the
  [lrnki validation skill](../../.agents/skills/validate-lrnki/SKILL.md). Focused tests and
  typechecks prove the pause mechanics. A production-model run over a real curated fixture plus
  joined artifact inspection is required to say whether source-backed generation works.
- **Authority boundary:** This plan can diagnose and repair source-backed behavior. It cannot
  qualify the rejected same-call candidate, silently select a different model/provider, deploy,
  write production data, or claim browser/native/physical-device evidence.
- **Handback:** Close with either an inspected useful curated-source expedition, an inspected
  repaired expedition, or a concrete blocker naming the layer and next action that cannot be
  completed without the owner.

## Current repository facts

- Synthetic Topic Generation is the only pipeline arm that starts from a topic plus Declared Domain
  without a published source snapshot. Its learner entry points are `/expedition/start`,
  `/expedition/retry`, and the topic supervisor; the worker exposes `generate-synthetic-layer`.
- The learner Journal already separates shared ready candidates from owned generating rows. Shared
  candidates come from successful source-backed enrichments with Study Items and remain a complete
  alternative entry path while topic planning is paused.
- `SourceLessGroundingAdmission` is also used inside otherwise source-backed Graph Enrichment when
  it proposes missing prerequisites. Those `scaffolded_anchor` candidates are not the same operation
  as an `originating_topic` Synthetic Topic. Their admitted bundles remain model-generated evidence,
  not source quotes, and must be inspected separately from document-anchored nodes.
- Graph Enrichment skips rejected or held-out generated-prerequisite candidates instead of
  publishing them. Therefore a sound rejection is not by itself a source-backed pipeline failure;
  terminal settlement, learner usefulness, anchor evidence, and generated-node dispositions must
  be judged separately.
- The canonical Gate 1 curated fixtures are owned by [fixtures/README.md](../../fixtures/README.md).
  The exact source/run/version used by U3 will be selected only after re-reading current database
  state; no prior environment, route, account, or loaded-revision claim is trusted.
- The planning snapshot is clean revision `60de3f4`. This is repository evidence only.

## Locked design

### KTD1 — One explicit, code-owned pause policy

Add one application type with an `available | paused` discriminant and one current constant set to
`paused`. The paused arm carries learner-safe copy. All production-shaped Synthetic Topic entry
points consume that value:

- worker `generate-synthetic-layer` refuses before creating an operation or calling a model;
- learner `/expedition/start` and `/expedition/retry` return a typed conflict before expedition
  mutation or supervisor wake;
- topic supervisor `start`, `wake`, and one-shot execution do not claim work while paused;
- `/journal` returns the policy under one capability field.

The policy is source-controlled because this is an explicit product decision, not a machine- or
account-specific condition. Do not add an environment override, hidden bypass, database flag, or
second client constant.

### KTD2 — Honest learner state without deleting retained work

When the Journal reports `paused`, the learner app:

- replaces the Plan Expedition control with calm copy that points to ready source-backed
  expeditions in Explore;
- renders old generating/failed topic rows as paused and offers no retry;
- leaves ready owned expeditions, Continue, Explore, and Browse All unchanged.

Keep the retained topic-generation implementation and Plan Expedition component because the owner
paused rather than abandoned the capability. Backend refusal remains authoritative for stale
clients.

### KTD3 — Layer-qualified source-backed diagnostic

Use the smallest current real curated fixture that can exercise a published source snapshot. Prefer
an already successful current-code Extraction Run; create fresh development artifacts only when the
existing data cannot establish current behavior. The gate must inspect together:

1. the selected source, Extraction Run, canonicalization artifact, and published graph identity;
2. Graph Enrichment settlement, exact Model Assignments/routes, errors/fallbacks, calls, tokens,
   cost, and same-query positive controls;
3. anchor, rescued, proposed, admitted, held-out, rejected, and minted-node evidence;
4. generated lessons and Study Items beside each node's actual grounding provenance;
5. whether the resulting trail is coherent and useful for learning the source material.

The initial target is the Rust ownership Markdown fixture because it is small, source-backed, and
historically exercised missing-prerequisite minting. That historical result selects a fixture only;
it is not current evidence. If the current source state cannot exercise the intended path, choose
the next-smallest Gate 1 source and record why.

### KTD4 — Fix the established problem class, not the fixture

On a failure, stop downstream spending at the first invalid layer, name its established problem
class, and research recognized practice before editing behavior. Prefer the narrowest conventional
root-cause fix behind the owning interface. Preserve domain-neutral prompts and forced named-tool
schemas. Do not add fixture vocabulary, lexical hard vetoes, semantic retry-for-luck, a model or
provider reassignment, or a second representation of persisted facts.

A transport, schema, composition, projection, or evidence-selection defect may be repaired in this
plan. A material model-quality defect with no qualified current assignment becomes an owner blocker
after deterministic alternatives are exhausted; it is not hidden by falling back to anchor-only
output unless that output is independently useful and represented honestly.

## Implementation units

### U0 — Persist the owner decision and bounded design

1. Re-read active plan status, Open findings, blockers, the Journal/supervisor/worker entry points,
   curated fixture authority, and source-backed Graph Enrichment boundary.
2. Add this plan first in execution order; synchronize its README and TODO status and drain the stale
   owner blocker into this authorized diagnostic.
3. Validate documentation structure, caps, links, line limits, and whitespace; commit the planning
   batch without source or model calls.

### U1 — Enforce the pause at every production-shaped seam

1. Add the single policy type/constant and focused policy tests.
2. Guard worker, API mutation, supervisor start/wake/one-shot work, and expose the capability in the
   Journal response.
3. Render the paused state in the learner Journal and remove its topic retry affordance while
   preserving source-backed entry and ready expeditions.
4. Add focused application/API/worker/learner tests. Append evidence and commit one implementation
   batch.

### U2 — Deterministic repository handback for the pause

1. Run changed-package tests/typechecks, targeted lint, builds required by the affected dependency
   graph, DB-backed route coverage when the HTTP refusal needs an authenticated session, and diff
   checks.
2. Prove no Synthetic Topic operation is created or claimed through any production-shaped entry,
   and prove curated-source commands/candidate adoption remain reachable.
3. Append qualified evidence, synchronize all three status altitudes, and commit the deterministic
   handback separately from U1 if the complete gate materially exceeds the focused implementation
   loop.

### U3 — Run and inspect the real curated-source generation gate

1. Reverify host safety, `.env` loading, development database identity, current source/run/version
   inventory, LiteLLM health, exact aliases/routes, and loaded-vs-current source where a process is
   used. Do not start Compose from an ineligible checkout or container.
2. Run the minimum missing immutable stages needed for the selected fixture, then Graph Enrichment
   and Study Item Bank generation. Use current committed production assignments only as a
   diagnostic; do not portray the rejected same-call candidate as qualified.
3. Retain generated reports only in ignored `tmp/`; write durable evidence and semantic findings in
   this Validation Log. Commit the U3 outcome and status.
4. If it passes, proceed to U5. If it exposes a reproducible in-scope defect, proceed to U4. If only
   the owner can clear it, record the exact action in `BLOCKERS.md` and proceed to U5.

### U4 — Repair one reproducible source-backed defect

1. Record the problem class and recognized practice, then implement the smallest root-cause repair.
2. Run focused deterministic checks and a fresh real-use draw over the same source-backed gate;
   compare output and grounding rather than only settlement.
3. Append evidence, unresolved findings, and exact next action; synchronize status and commit one
   repair batch. Do not expand into unrelated quality or latency work.

### U5 — Run the repaired learner-asset gate

1. Generate the Study Item Bank and Concept Lessons from the repaired immutable enrichment.
2. Inspect each generated learner payload beside the exact grounding passages it received. Stop at
   and record the first invalid learner layer rather than treating mechanical settlement as quality.
3. If the learner layer passes, proceed to U7. If it exposes a reproducible in-scope defect, proceed
   to U6. If only the owner can clear it, record the exact action in `BLOCKERS.md` and proceed to U7.

### U6 — Repair one grounded learner-claim defect

1. Record the problem class and recognized practice, then implement the smallest domain-neutral
   repair behind the existing generation and Answer-Key Verification interfaces.
2. Preserve forced named tools, key hiding, grounding provenance, model/provider assignments, and
   deterministic-veto boundaries. Do not add fixture terms or a heuristic lexical veto.
3. Run focused deterministic checks and a fresh real-use draw from the same repaired enrichment;
   inspect the learner payload beside its grounding and record any remaining invalid layer.

### U7 — Consolidate and close

1. Run the proportionate final repository gate and qualify every evidence layer exactly.
2. Re-home any durable decision, language, or runbook mechanics to its canonical owner. Consolidate
   README/TODO/blocker state in a commit after detailed evidence is committed.
3. Delete completed or abandoned plans only after their retained facts are discoverable elsewhere;
   each deletion is its own commit. Leave every remaining active entry on hold, blocked, or
   owner-gated with a concrete reason.

Implementation units are exclusive and run in order. This plan declares no parallel-safe unit.

## Out of scope and safety boundaries

- No deployment, production write, shared-host mutation, migration redesign, learner account
  action, browser, native, emulator/simulator, physical-device, or release claim.
- No model/provider/quantization/reasoning/sampling/fallback reassignment without a separate owner
  decision and qualification plan.
- No change to one-pass Source-less Grounding Admission, independent-verification quorum, atomic
  persistence, forced named-tool policy, or cross-family policy merely to make a run pass.
- No deletion of existing ready expeditions or generated artifacts. Development fixture writes are
  append-only where practical and are identified exactly; database reset is a last resort.
- Nothing machine-specific enters tracked files. Generated reports and raw model payloads stay in
  ignored `tmp/`, and tracked documentation never links to them.

## Validation Log

### U0 — owner decision and bounded design — 2026-08-24 — complete

- Clean revision `60de3f4` was re-read with the active README/TODO order, all four status headers,
  Plan 003's affected-consumer `FIX_FIRST`, the rejected same-call audit, and the owner-only blocker.
  The owner decision pauses the anchor-less operation and authorizes this source-backed diagnostic;
  it does not qualify a new Grounding Model Assignment.
- Source inspection identified all production-shaped Synthetic Topic seams: worker command, learner
  start/retry routes, process supervisor, and learner Journal controls. It also confirmed that ready
  catalog adoption is separate and that source-backed Graph Enrichment may independently exercise
  `scaffolded_anchor` Grounding Admission for generated prerequisites.
- The application-owned availability seam, learner projection, Rust-first curated gate, failure
  classification, validation route, and safety boundaries are now locked here. The codebase-design
  skill kept one policy behind the existing deep interfaces; the validation skill separated local
  mechanics from real-model usefulness evidence.
- Markdown structure, TODO/plan caps, relative link targets, line limits, and whitespace were checked.
  No source implementation, database, process, provider, model call, deployment, browser/native,
  physical-device, latency, or release action occurred. This is repository planning evidence only.

### U1 — production-shaped pause enforcement — 2026-08-24 — complete

- One application-owned `available | paused` policy now guards the worker before DB/neural context
  construction, both authenticated topic mutation routes before persistence/wake, and supervisor
  start, wake, and one-shot execution before queue access. The Journal transports that exact policy;
  the learner surface replaces planning/retry with paused copy while preserving ready rows, Explore,
  Browse All, and the latent policy-driven planning component.
- The full application suite, learner API suite (22 passed, four database-opt-in skips), seven focused
  learner component tests, and application/worker/API/learner-app typechecks passed. Targeted ESLint
  reported no error, and source plus untracked whitespace checks passed.
- A worker invocation with an explicitly unreachable `DATABASE_URL` refused
  `generate-synthetic-layer Tides oceanography` with the canonical paused message in 1.29 seconds and
  exit 1, rather than surfacing a database or provider error. This is execution-seam evidence, not a
  model-quality claim.
- No development/production database write, model call, provider route, deployment, browser/native,
  emulator/simulator, physical-device, or release action occurred. The authenticated no-write route
  test is present but remains unqualified until U2 runs it through `pnpm test:db`.

### U2 — authenticated no-write and repository handback — 2026-08-24 — complete

- `pnpm test:db` reset and targeted only `lrnki_test`. The signed-in pause case observed the Journal's
  `paused` capability, 409 from both start and retry, zero matching `learner_expeditions`, and zero
  injected supervisor wakes. All database-opt-in API cases, the migration state matrix, and the full
  workspace test graph then passed; the learner app contributed 57 suites / 320 tests.
- The first full run found test-only rate-limit interference: the new sign-up spent the anonymous
  default-IP bucket and a later independent naming test received 429. Assigning the new case its own
  RFC 5737 address (`192.0.2.41`) isolated the fixtures; the complete reset-and-test route passed on
  rerun. No production rate-limit policy changed.
- Eleven workspace package typechecks, 58-table Drizzle/schema parity, ESLint with zero errors and
  eleven existing warnings, Admin Lab production build, Learner App web export, tracked/untracked
  whitespace checks, and `git diff --check` passed. Playwright and native/device gates were not
  required for the policy/refusal contract and were not run.
- This is local automated and isolated-test-database evidence. It proves the pause mechanics and
  preserves compile/build reachability of source-backed commands; it does not prove current
  development data, provider reachability, model quality, deployment, browser behavior, native
  behavior, simulator/emulator behavior, or physical-device behavior.

### U3 — real curated-source gate — 2026-08-24 — `FIX_FIRST`

- The development environment was reverified without mutating Compose: database `lrnki` was the
  target, PostgreSQL and LiteLLM were healthy, the loaded aliases matched the committed production
  assignments, and the database initially contained no reusable Source. The canonical Rust Book
  fixture was registered as Source `8da70567-74c0-4ea4-a82d-3617317d3f6d`; Extraction Run
  `04482bbf-47db-4d4e-9c70-18b979b2b839` succeeded with 125 blocks, 29 candidates, nine core
  concepts, 25 complete CEPs, 59 definitions, 118 mentions, and 11 assertions. Exact-label-only
  canonicalization artifact `74f6abbe-908a-47b1-9052-0a9654a4b14b` published Graph Version
  `01225b12-cbf3-4be5-9e29-3fdcb2059eb1` with nine concepts and 76 CEP passages.
- Graph Enrichment `a157ae39-71cb-405e-a9b2-ccfa6326aed3` succeeded under config
  `graph-enrichment-a0e6b35234de`. It persisted nine document anchors, 19 source-mentioned
  prerequisites, five LLM-grounded prerequisites, 41 edges, and 33 difficulties. The source-backed
  definitions for Ownership, Move, Variable Scope, and the other anchors were materially coherent;
  generated admission also rejected `Block Structure` and `Runtime Memory Management` for concrete
  overgeneralizations. This is positive control evidence that the source substrate and rejection
  path were both exercised, not a learner-quality pass.
- The enrichment made 250 successful and zero non-success LiteLLM calls across six exact Model
  Assignments, consuming 755,782 tokens. LiteLLM recorded USD 0.051229 provider spend; the worker's
  normalized stage report estimated USD 0.095817 because it prices zero-reported Xiaomi calls.
  Extraction separately made 77 successful and zero non-success calls, consumed 224,884 tokens,
  and recorded USD 0.003752. DeepSeek/DeepInfra generated Grounding; Xiaomi MiMo answered and served
  the primary judge; GPT-OSS/Novita planned and challenged. No fallback or undeclared route was
  observed.
- The gate found a learner-safety defect in admitted `Variable Binding`. Its passage says every Rust
  variable binding makes the variable owner of the bound value and transfers or duplicates that
  ownership on a function call. One GPT-OSS challenger sample correctly rejected the universal
  ownership claim with the concrete reference-binding counterexample `let r = &x`; the other panel
  sample and the bounded disagreement sample accepted after Xiaomi answers incorrectly treated
  references and borrows as outside variable binding. The current same-model replicated-rejection
  rule therefore reduced the valid counterexample to one outlier and admitted the whole original
  passage. Rust's Reference instead defines move, copy, and reference binding modes, and the Rust
  Book states that a reference parameter does not own the value it refers to. The accepted rationale
  conflates ownership of a reference value with ownership of its referent and cannot qualify the
  learner-facing passage.
- KTD4 stopped the gate at the first invalid layer: no Concept Lessons or Study Items were generated,
  and the same-query Study Item positive control is zero for this enrichment. The source-backed path
  is not transport- or substrate-broken, but its generated-prerequisite admission is `FIX_FIRST`;
  downstream usefulness remains unqualified. Raw provider payloads and the fixture manifest remain
  ignored under `tmp/`. No production write, deployment, browser/native, simulator/emulator,
  physical-device, or release action occurred.

### U4 — carrier/referent admission repair — 2026-08-24 — complete

- The established problem class is reference-versus-referent (carrier-versus-referent) role
  conflation, with a non-monotonic counterexample lost by replicated-rejection aggregation. The
  [Rust Reference](https://doc.rust-lang.org/stable/reference/patterns.html) confirms that identifier
  patterns can bind by move, copy, or reference, while the
  [Rust Book](https://doc.rust-lang.org/stable/book/ch04-02-references-and-borrowing.html) separates a
  reference parameter from ownership of its referent. The conventional repair follows independent
  verification in [Chain-of-Verification](https://arxiv.org/abs/2309.11495): ask a draft-blind
  question that makes the two roles explicit before judging the draft, instead of adding a lexical
  veto or weakening the admission quorum.
- Grounding generation, verification planning/answering, and both factuality judges now carry one
  domain-neutral carrier/referent invariant. The planner composition adds one code-owned
  carrier-and-referent question per positive claim target under the existing six-question cap,
  displacing one model-planned question rather than expanding the call budget. Forced named-tool
  schemas, the one-pass admission contract, three-sample panel, same-model 2-of-3 rejection quorum,
  Model Assignments, provider policy, and execution widths are unchanged. Operation identities
  moved to `graph-enrichment-928893987225`, `learner-scaffold-generation-19af7c93091f`, and
  `synthetic-topic-generation-3286a5adf7a3` as required by the changed shared prompt contract.
- Fresh immutable Graph Enrichment `ef5f3a7b-cb71-45f5-aec6-9abe7b4221cb` over the same Graph Version
  `01225b12-cbf3-4be5-9e29-3fdcb2059eb1` succeeded with nine document anchors, 19 source-mentioned
  prerequisites, six admitted LLM-grounded prerequisites, 37 edges, and 34 difficulties. The exact
  reproduced `Ownership and Functions` draft again claimed that passing any bound variable moves or
  copies its value. This time its persisted admission disposition rejected the mention after two of
  three GPT-OSS challenger samples independently named reference binding as the counterexample; the
  candidate's definition was also rejected, so duplicate resolution did not merely conceal it.
- Joined inspection found the six surviving generated bundles — Assignment Semantics, Memory
  Address, Runtime Memory, Scope (Lexical), Trait (Rust), and Variable Binding — each with one
  materially safe learner-facing definition and no optional mention. The surviving Variable Binding
  definition limits ownership to owned values and does not repeat the unsafe function-call claim.
  Its terse operator rationale ambiguously says reference bindings sit outside the defining
  condition; that text is not treated as factual evidence. Source inspection confirms Study Item
  generation selects only admitted definition/mention passages and never supplies bundle rationale
  to learner generation, so U5 may proceed while judging the actual learner payload beside those
  passages.
- LiteLLM recorded 323 successful and zero non-success calls, 1,028,020 tokens, no cache hits, and
  USD 0.066385 provider spend; the normalized stage report estimated USD 0.132413 after pricing
  zero-reported Xiaomi calls. Every reached route was declared: five planner/challenger calls used
  the config-owned qualified GPT-OSS Parasail FP4 fallback and eight boundary-probe calls used its
  declared Qwen fallback; DeepSeek Grounding stayed on its primary-only assignment. No undeclared
  route or schema fallback appeared.
- The full infrastructure-litellm suite passed 195 tests and the full application suite passed 807;
  both package typechecks, targeted ESLint, prompt/config identity assertions, and `git diff --check`
  passed. These are local automated plus local production-model and joined-development-database
  evidence. No learner asset, deployment, production write, browser/native, simulator/emulator,
  physical-device, or release claim has yet been made.

### U5 — repaired learner-asset gate — 2026-08-24 — `FIX_FIRST`

- Study Item operation run `ac3e9068-2dc1-48f5-ba98-2c81344b42dd` completed over repaired enrichment
  `ef5f3a7b-cb71-45f5-aec6-9abe7b4221cb` in 709 seconds. It atomically persisted 33 Concept Lessons,
  one lesson-absent node, 86 Study Items across 33 nodes, and 16 explicit item rejections. This is a
  mechanical positive control only; settlement did not establish learner usefulness.
- Joined inspection stopped at the first invalid learner layer. The admitted Variable Binding
  grounding and its Concept Lesson both say that a binding makes the name the owner **for owned
  values**. The option-select explanation retains that condition, but its keyed answer broadens the
  claim to “It associates a name with a value and makes that name the owner of the value.” The
  persisted citation points to the correctly qualified generated passage, so the learner payload is
  not entailed by its own grounding and reintroduces the reference/referent defect U4 removed.
- The exact Answer-Key Verification call returned `claim_true`. Its reason quoted the grounding's
  missing “for owned values” condition while silently inserting that condition into the candidate
  it judged. This localizes the established problem class to scope/qualifier loss during grounded
  question generation plus verifier-side premise repair, rather than Graph Grounding, lesson
  transport, key correlation, citation identity, or persistence.
- Recognized practice treats factual consistency as directional source-to-output alignment rather
  than approximate topical agreement. [FENICE](https://aclanthology.org/2024.findings-acl.841/)
  decomposes generated text into claims and aligns them to source context with natural-language
  inference; [AlignScore](https://arxiv.org/abs/2305.16739) likewise evaluates information alignment
  between generated and source text. The repair should require each candidate's literal scope to
  stand on its own and forbid a verdict rationale from supplying a missing condition, while
  retaining the existing domain-truth check for unsupported distractors.
- The operation made 290 successful and zero non-success LiteLLM calls, consumed 633,117 tokens,
  and recorded USD 0.018284 provider spend; normalized stage pricing estimated USD 0.064726. Four
  independent-judge calls used the declared DeepSeek Parasail FP8 fallback and all other calls used
  declared routes. No further learner model calls ran after the invalid payload was identified.
  Raw outputs remain in their database artifact/SpendLog owners; no tracked file contains them.
- This is local production-model, joined-development-database, and manual semantic-inspection
  evidence. It does not qualify any of the other 85 items, learner usefulness, deployed behavior,
  production data, browser/native, simulator/emulator, physical-device, or release behavior.

### U6 — non-lossy keyed-answer projection and fresh learner-asset gate — 2026-08-24 — complete,
bank remains `FIX_FIRST`

- The established defect class was lossy abstraction across generated learner layers plus
  verifier-side premise repair. Directional factual-consistency work such as
  [FENICE](https://aclanthology.org/2024.findings-acl.841/) and
  [AlignScore](https://arxiv.org/abs/2305.16739) supports testing the candidate claim against its
  evidence rather than accepting topical overlap. A prompt-only scope audit did not supply that
  guarantee: DeepSeek named the omitted owned-value condition and a reference-binding
  counterexample but still accepted the broadened answer; a split directional-entailment field and
  the same schema on GPT-OSS also accepted it.
- GLM 5.3 was tested as the requested lower-cost alternative without changing a tracked Model
  Assignment. Its current Z.AI route rejected forced named `tool_choice` with “Tool choice must be
  auto.” A direct `json_schema` response-format request returned HTTP success but did not follow the
  supplied schema and still accepted the unsafe claim. JSON Schema therefore neither preserves
  ADR-0006's current contract nor repairs the semantic failure; no GLM, GPT-OSS, or DeepSeek
  reassignment was made.
- Two deterministic alternatives were exhausted before selecting the repair. Stronger generator
  instructions produced one safe direct draw but a fresh full bank reproduced the unqualified
  Variable Binding answer. Copying the complete grounding passage made 30/30 keyed answers and
  explanations exact to their citations, but exposed source fragments and Markdown as learner copy
  (`returns a _pointer_`, a lower-case fragment, and a link-comment token), so that candidate was
  discarded rather than misrepresented as usable.
- The implemented deep seam now selects one substantive, learner-visible Concept Lesson teaching
  unit in the application and passes its exact text plus already-derived citation to the
  option-select port. The forced-tool schema permits the model to return only three distractors;
  the adapter owns the generic question and copies the selected text unchanged into both the key
  and explanation. This proves non-lossy lesson-to-option projection without a lexical semantic
  veto and moves the default/Topic Study Item identities to `study-item-bank-30876e730c8a` and
  `study-item-bank-a841a9e54fd7`.
- Application-level tests prove the exact lesson-unit/citation input; adapter and closed-schema
  tests prove model output cannot rewrite the key. The full application suite passed 810 tests,
  infrastructure-litellm passed 194, the worker passed eight, all four affected typechecks passed,
  targeted ESLint had zero errors and one pre-existing warning, and `git diff --check` passed.
- A direct production-route Variable Binding kill gate returned a correct option and explanation
  byte-for-byte equal to the qualified lesson text, including “for owned values”; the model supplied
  only distractors. The first unauthenticated scratch invocation used the client's placeholder key
  and received 401 before inference; the `.env`-loaded rerun is the qualifying call.
- The final fresh bank over enrichment `ef5f3a7b-cb71-45f5-aec6-9abe7b4221cb` succeeded under the
  new config in 351.038 seconds. It made 268 successful and zero non-success calls, used 554,153
  tokens, recorded USD 0.015762 provider spend, and made no transport retry: 170 generation calls
  used the configured Xiaomi route and 98 verification calls used DeepSeek on DeepInfra. It
  persisted 33 current lessons, one lesson absence, 89 current items (31 option-select, 26 matching,
  32 impostor), and 13 current rejections.
- A same-query positive-control join proved all 31 current option-select keys, explanations,
  question templates, citations, provenance labels, and config hashes exactly match their selected
  lesson teaching unit. Variable Binding retained its full owned-value condition throughout. This
  establishes only the repaired projection invariant, not semantic correctness of every lesson or
  distractor.
- Full payload inspection found the next invalid layer in behavior untouched by this unit. The
  Pointer impostor calls “the identifier of a specific location” false even though address and
  identifier are equivalent here; DeepSeek accepted that invented distinction. Variable Binding's
  matching prompt again deletes “for owned values,” and its assignment verifier calls the shortened
  claim an exact match. The option verifier calls String capacity's standard “maximum before
  reallocation” formulation false merely because it differs from the supplied wording; for `drop`,
  it explicitly acknowledges that reassignment is supported by the passage and then labels it false
  as a “special case.” The Move lesson also generalizes a context-local source statement into an
  unconditional move rule despite Copy semantics. These independent counterexamples show a
  systemic lesson/item semantic-verification limit, not a remaining JSON/tool transport defect.
- The exact keyed-answer drift is repaired, but the current learner bank is still `FIX_FIRST` and
  must not be qualified or adopted as useful. Under KTD4, the failed DeepSeek/GPT-OSS/GLM probes and
  unusable deterministic extractive candidate make the next policy/design choice owner-gated. This
  is local automated, local production-model, and joined-development-database evidence only; it is
  not deployment, production-data, browser/native, simulator/emulator, physical-device, or release
  evidence.

### U7 — consolidation and owner-gated handback — 2026-08-24 — complete

- Post-commit reruns passed 38 focused application tests and 34 focused infrastructure/config tests;
  the committed diff has no whitespace error. The broader U6 gate already passed 810 application,
  194 infrastructure-litellm, and eight worker tests, four affected typechecks, targeted ESLint with
  zero errors, documentation links/caps, and the exact prompt/config identity assertions.
- The reversible pause policy remains source-owned in
  `packages/application/src/syntheticTopicGenerationAvailability.ts`; the exact lesson-to-key
  projection remains source-owned behind the Study Item generation port. Neither exact interface
  warrants a new ADR. Current outcome and qualified evidence moved to TODO, while the unresolved
  learner-visible scope/spend choice moved to BLOCKERS with an explicit drain criterion.
- The live execution index now contains only four later plans. The same-call candidate and latency
  plan are blocked; both Source-less Grounding plans are on hold pending an owner-selected successor.
  Repeating any of their failed calls cannot add evidence, so none is actionable in this session.
- This plan closes on the handback allowed by its goal capsule: anchor-less generation is paused,
  the curated-source graph path is repaired and inspected, one exact learner-layer projection defect
  is repaired, and the newly exposed systemic learner-asset limitation is recorded rather than
  hidden. Plan deletion follows in its own commit after this retained-state consolidation.

### Open findings

- The owner decision in [BLOCKERS.md](./BLOCKERS.md) is the sole remaining finding. Do not qualify or
  adopt the current learner bank, spend more calls on the same verifier/model combinations, replace
  forced tools with JSON Schema, or silently publish extractive fragments. Resume only through the
  bounded successor selected by that blocker.
