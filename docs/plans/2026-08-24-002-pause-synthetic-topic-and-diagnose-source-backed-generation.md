---
title: Pause Synthetic Topic Generation and Diagnose Source-backed Generation - Plan
type: implementation
date: 2026-08-24
execution: code
---

# Pause Synthetic Topic Generation and Diagnose Source-backed Generation

**Status:** In progress — U0 complete; U1 is next

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

### U5 — Consolidate and close

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

### Open findings

- U1 is next: implement the single pause policy and its API/supervisor/worker/learner consumers.
- U3 must reverify the current development environment and source inventory before choosing exact
  run/version identities; prior Rust quality evidence is fixture-selection context only.
