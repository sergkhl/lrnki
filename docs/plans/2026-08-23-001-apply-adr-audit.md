---
title: Apply the ADR Audit Without Changing ADR-0006 or Cross-Family Rules - Plan
type: architecture
date: 2026-08-23
execution: code
---

# Apply the ADR Audit Without Changing ADR-0006 or Cross-Family Rules

**Status:** In progress — U0–U4 complete; U5 next

**Decision state:** Locked. The accepted audit findings and fixed assumptions are implementation
inputs, not an invitation to reopen Concept Canonicalization, Operation Timeline ownership,
DeepSeek direction, ADR-0006, or any cross-family policy.

## Goal capsule

- **Objective:** Make Concept Canonicalization an explicit immutable operation whose inspected
  decisions can be replayed by an LLM-free Graph-Version Build; give operation-to-stage membership
  one application owner; and repair the audited documentation boundaries.
- **Problem class:** Publication currently mixes neural identity decisions with deterministic graph
  assembly, so the inspected decision set is not independently immutable or replayable. Separately,
  the application Operation Timeline catalog and infrastructure neural registry duplicate stage
  membership and can disagree.
- **Deep module:** One Concept Canonicalization use-case is the caller interface. Worker parsing,
  candidate mapping, semantic identity resolution, artifact JSON, model adapters, and PostgreSQL
  queries remain implementation knowledge behind that interface. Ports exist only at the real
  artifact-store and neural seams.
- **Authority:** Follow [AGENTS.md](../../AGENTS.md), [CONTEXT.md](../../CONTEXT.md), the current
  [ADR index](../adr/README.md), and the
  [lrnki validation skill](../../.agents/skills/validate-lrnki/SKILL.md). Source types own exact
  interfaces; the code-first Drizzle schema owns persisted shape; this plan owns implementation
  design and its consolidated Validation Log until completion.
- **Execution order:** This plan is first. The
  [Topic Expedition latency plan](./2026-08-22-001-repair-topic-expedition-generation-latency.md)
  stays blocked at U3 `FIX_FIRST`; this work does not resume its U4 or its model/pipeline follow-up.
- **Completion:** Close U0–U5 in order. Commit the detailed final Validation Log before moving
  durable results to their canonical owners. Then remove this plan from the index and delete it in
  a separate consolidation commit.

## Starting state and preservation boundary

- Starting revision: `ab15107` on local `main`, ten commits ahead of `origin/main`.
- Preserve all ten local commits.
- Preserve the pre-existing edited `.agents/skills/grilling/SKILL.md` and untracked
  `.agents/skills/wait-what/` directory; they are unrelated and must not enter this work's commits.
- Do not deploy, write production data, change shared Compose state, run a browser, run an emulator
  or simulator, or request a physical-device run.
- Do not change `litellm/config.yaml` or any Model Assignment in this work.

## Locked technical design

### KTD1 — One explicit Concept Canonicalization operation

Create one application use-case that accepts:

```ts
{
  baseGraphVersionId: string | null;
  runIds: readonly string[];
  mode: "semantic" | "exact_label_only";
}
```

The ordered Extraction Run selection is part of identity. The operation captures the published
Concept identities that can affect reuse or IRI allocation. Semantic mode alone calls the embedding
and identity-adjudication ports. Exact-label-only mode is an explicit attributable choice and
replaces `BUILD_DISABLE_IDENTITY_RESOLUTION`.

The completed operation persists exactly one immutable artifact:

```ts
type ConceptCanonicalizationArtifact = {
  mode: "semantic" | "exact_label_only";
  baseGraphVersionId: string | null;
  runIds: readonly string[];
  publishedConceptIdentities: readonly PublishedConceptIdentity[];
  decisions: readonly ConceptIdentityDecision[];
  unavailable: readonly ConceptCanonicalizationUnavailable[];
};
```

`ArtifactEnvelope` continues to own artifact ID, creation time, producer, and common configuration
identity. Remove per-decision `configHash`. Record merge, distinct, quarantine, and bounded
unavailable results. An unavailable adjudication is never a semantic `distinct` decision; exact-label
publication behavior still keeps those Concepts separate.

Replace the unused generic `ArtifactRepositoryPort` with:

```ts
interface ConceptCanonicalizationStorePort {
  persist(artifact: ArtifactEnvelope<ConceptCanonicalizationArtifact>): Promise<void>;
  getById(
    artifactId: string
  ): Promise<ArtifactEnvelope<ConceptCanonicalizationArtifact> | undefined>;
}
```

The implementation validates artifact envelopes and payload invariants both before persistence and
after reading storage. It prints the artifact ID and a stable merge/distinct/quarantine/unavailable
summary for operator inspection.

### KTD2 — Deterministic Graph-Version Build consumes one selected artifact

`buildGraphVersion` requires a canonicalization artifact ID and the narrow store. It rejects:

- an unknown artifact, wrong artifact type, or malformed payload;
- a different explicit base graph version; or
- a different ordered Extraction Run list.

The build has no embedding or model dependency. It consumes the artifact's captured published
identities instead of treating mutable global identity state as its input. It retains published
Concept IDs and IRIs and derives every new Concept ID deterministically from the final Concept IRI.

Replay is allowed only when current registry state is exactly the captured identities or the exact
deterministic output of an earlier replay. Missing or changed captured identities and unrelated or
conflicting later identities fail closed. The selected artifact becomes a mechanically generated
Static Graph Refinement decision; copied identity decisions carry the artifact ID and common config
identity. Quarantine continues to block publication.

The worker surface becomes:

```text
worker:kg canonicalize-concepts [--exact-label-only] [--base <graphVersionId>] <runId>...
worker:kg inspect-concept-canonicalization <artifactId> [--json]
worker:kg build-graph-version --canonicalization <artifactId> [--base <graphVersionId>] <runId>...
```

The root README owns operator syntax and behavior.

### KTD3 — One owner for Operation Timeline membership

The application `OPERATION_TIMELINE_CATALOG` is the sole operation-to-stage membership map. Add
`canonicalization` before `minting` to the source-owned `OperationType` union and give it the
embedding and identity-adjudication stages.

Pass the catalog-derived allowed neural stages through the ambient operation context. The timeline
reporter, forced-tool client, and embedding client reject an attempted stage that the current
operation does not own before a timeline row or model request. Measurement calls remain valid with
no ambient operation and do not acquire Operation Timeline membership.

Remove `timelineType` and `claimedTimelineType` from the infrastructure neural registry and delete
cross-layer set-equality tests. Infrastructure continues to own Neural Stage Descriptor membership
and mechanical configuration hashes only. The Operation Timeline neural-stage inventory is derived
from the application catalog, not every `STAGE_TAGS` value.

Remove measurement-only Discovery Coverage Audit from Extraction. Retain Scaffold Content
Congruence in Scaffold. The narrower Topic Expedition stage profile continues to own its flow,
conditionality, repetition, and overlap groups, but not general operation membership.

Add one complete Concept Canonicalization configuration hash. It includes semantic thresholds,
evidence bounds, embedding Model Assignment, and adjudicator Model Assignment; it excludes
execution-only concurrency. Store the same hash in the artifact envelope and canonicalization
Operation Timeline row.

### KTD4 — Persistence and Processing Journey lineage

The only persisted-shape change is the `canonicalization` Operation Timeline type and its required
configuration hash. The Concept Canonicalization payload stays in `artifact_versions.payload`
JSONB. Edit only the internal Drizzle schema, then regenerate the `0000` SQL, snapshot, and journal
together with `pnpm db:generate`; never hand-edit or manually apply generated artifacts.

Processing Journey lineage, timing, and cost reports include Extraction Runs, Concept
Canonicalization, Graph-Version Build (`minting`), Graph Enrichment, and Study Item Bank in order.
The lineage record carries the selected canonicalization operation ID.

### KTD5 — Correct durable-document boundaries in place

Amend current ADRs without creating duplicate definitions:

- ADR-0001: require ports only at real external or replaceable seams; keep internal and test-only
  seams private.
- ADR-0011: retain read-only Admin Lab now and add a non-authorizing review trigger for a future
  authenticated, audited operator action.
- ADR-0012: keep embeddings non-authoritative while permitting measured proposal-only prerequisite
  assistance when all nodes remain available, recall is evaluated, and failure cannot remove, gate,
  order, or create an edge.
- ADR-0013: retain representative Curated Source inspection as authority; permit durable named-
  consumer evaluation code and versioned human judgments without creating a canned semantic oracle;
  generated evaluation artifacts remain in `tmp/`.
- ADR-0016: retain `defines` as the only current typed CEP evidence and add the accepted review
  trigger for a measured, consumed, grounded new evidence form.
- ADR-0017: define Extraction Run, Concept Canonicalization artifact, and Graph-Version Build as
  separate records and make build inputs explicit.
- ADR-0023: let source own the current `GroundingOrigin` union and keep retrieval deferred without
  presenting `web_grounded` as implemented.
- ADR-0026: retain Study Item identity, server-owned answer keys, provenance, and separate Answer-Key
  and Matching Assignment Verification; exact attempts and unavailable outcomes stay in source.
- ADR-0027: retain the Inspection Read Model and learner projection seams but remove exact package
  placement.
- ADR-0029/0034: assign timeline membership to the application catalog and descriptors/config hashes
  to infrastructure; describe one ambient fail-closed check without another stage map.
- ADR-0030: retain the Knowledge-Boundary Probe, independent factual verification, abstention,
  no-source-masquerade, and no verifier-authored replacement learner text. Exact attempts, claim
  projection, sampling, quorum, settlement, retry, and failure policy stay in source. Permit a future
  bounded retry only through a fresh complete Grounding Bundle and admission from the start; do not
  change the current one-pass behavior.
- ADR-0032: retain mastery-aligned Game UX, move its implementation checklist to `AGENTS.md`, and add
  the review trigger for proposed acquisition-mastery evidence.

Add the accepted ADR-governance rule to `AGENTS.md`: accepted ADRs bind shipped behavior; numbers do
not imply precedence; conflicts cannot be silently ignored; agents may report contradictions, run
authorized non-production experiments, or propose amendments/replacements; replacements name the
changed invariant and repair references; reversible algorithms, limits, exact interfaces, and exact
persisted shapes stay in source or an active plan unless they pass the ADR retention test.

Keep `CONTEXT.md` glossary-only. Concept Canonicalization names its immutable artifact output, and
Graph-Version Build names the explicitly selected artifact input.

### KTD6 — Record the decided DeepSeek follow-up without starting it

Rewrite the existing Generation Model Evaluation brainstorm and TODO item so the move to the latest
official DeepSeek Flash release is a decided direction, not a model-selection hypothesis. At this
repository date, the official release is
[`DeepSeek-V4-Flash-0731`](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731), which DeepSeek
states supersedes the preview; the repository already registers it for judge roles.

A later ready plan must recheck the latest official Flash release and pin one exact Model Assignment,
never a moving alias. Its interview decides which expedition generation stages to remove/combine and
which remaining independent judge satisfies unchanged ADRs. Its release gate qualifies assignment,
route, affected consumers, latency, cost, and learner quality; earlier defects remain gate inputs but
do not reopen model choice.

Remove the resolved manual scope blocker. Keep latency U3 at `FIX_FIRST`, and replace the blocker
reference with the DeepSeek cutover/pipeline-simplification follow-up. Update the plan index and TODO
without implementing that follow-up.

## Implementation units and commit boundaries

### U0 — Ready plan and source baseline

1. Link this plan first in execution order and add its current TODO entry.
2. Record the starting revision, ahead count, dirty preservation boundary, fixed exclusions, and
   validation route.
3. Commit only the plan, index, and TODO before source implementation.

### U1 — Concept Canonicalization interface and deterministic build

1. Add source-owned artifact/unavailable types and the narrow store port; remove the generic port and
   per-decision config hash.
2. Deepen candidate mapping and semantic identity resolution behind one canonicalization use-case.
3. Validate immutable artifacts, ordered selection, bounded unavailable outcomes, decision
   invariants, and complete configuration identity.
4. Make Graph-Version Build consume the artifact, enforce compatibility, deterministically derive
   new Concept IDs, and persist artifact provenance without neural dependencies.
5. Add the three worker commands and interface-level tests. Run focused domain, ports, application,
   worker, PostgreSQL, and LiteLLM checks; append one consolidated U1 entry and commit.

### U2 — Operation ownership, lineage, and persisted type

1. Add `canonicalization` to `OperationType`, the application catalog, ambient context, reporting,
   journey lineage, timing, and cost projections.
2. Fail closed at the reporter and both neural clients for an ambient wrong-stage pair. Preserve
   ambient-free measurement calls.
3. Remove infrastructure timeline ownership and cross-layer equality tests; correct extraction and
   scaffold membership.
4. Edit the code-first schema and regenerate the full baseline with `pnpm db:generate`.
5. Run focused ownership, lineage, adapter, config-hash, schema, and database tests; append one
   consolidated U2 entry and commit.

### U3 — ADR, workflow, glossary, runbook, and follow-up correction

1. Amend the listed ADRs in place and repair the ADR index and affected links.
2. Add ADR governance and the Game UX planning checklist to `AGENTS.md`; keep `CONTEXT.md` concise.
3. Document the worker commands in the root README.
4. Rewrite the DeepSeek brainstorm/TODO direction, clear the resolved manual blocker, and repair the
   latency-plan/index handoff without starting follow-up implementation.
5. Check documentation links and boundaries; append one consolidated U3 entry and commit.

### U4 — Automated, database, and real-use gates

1. Run focused package tests/typechecks, `pnpm db:check`, and `pnpm test:db` against only
   `lrnki_test`. Inspect append/read immutability, new constraint/hash enforcement, and atomic graph
   publication.
2. Load the validation skill's real-use route. Use successful inspected Extraction Runs from both
   mixed-format machine-learning-systems Curated Sources and one other Declared Domain.
3. Run semantic Concept Canonicalization through production embedding/adjudicator assignments and
   inspect every merge, distinct, quarantine, and unavailable result beside Candidate definitions.
4. Require no cross-domain or unsupported same-domain merge. Build two local graph versions from the
   same artifact and compare identity, IRI, CEP, and refinement content after excluding graph-version
   ID and timestamps.
5. Positively confirm canonicalization SpendLogs and zero build model calls. Record `PASS`,
   `FIX_FIRST`, `EXPERIMENT_ONLY`, or `BLOCKED`; never publish a quality claim from tests alone.
6. Commit the detailed U4 evidence before consolidation.

### U5 — Repository gate and consolidation

1. Run `pnpm check`, `git diff --check`, link checks, and final-diff inspection.
2. Diff ADR-0006 against `ab15107` and confirm its exact forced named-tool method did not change.
3. Search and diff cross-family clauses/enforcement against `ab15107`; confirm no rule changed and
   no definition of “cross-family” was added.
4. Move durable result/status to canonical owners, remove this plan from the index, and delete it in
   a separate consolidation commit.

## Deterministic acceptance matrix

- Semantic and exact-label-only modes persist immutable artifacts with ordered run IDs.
- Unknown, wrong-type, malformed, base-mismatched, and order/run-mismatched artifacts fail closed.
- Embedding/adjudication failure yields bounded unavailable records and never false `distinct`.
- Read validation enforces merge, distinct, quarantine, published-identity, and envelope invariants.
- Graph-Version Build has no model/embedding dependency and replay preserves Concept IDs, IRIs,
  evidence, and refinement decisions.
- Exact prior replay output is compatible; missing, changed, unrelated, or conflicting registry state
  is rejected; quarantine blocks publication.
- Every catalog-owned stage is accepted, every wrong operation-stage pair fails before persistence or
  request, shared stages work for all owning operations, and ambient-free measurement remains valid.
- Canonicalization timeline, artifact, and SpendLogs share one operation/config identity.
- Processing Journey reports the five operation groups in order.
- Generated schema artifacts match the internal Drizzle schema and database tests target only
  `lrnki_test`.
- Real-use inspection qualifies semantic identity quality and replay; automated evidence remains a
  separate deterministic claim.
- ADR-0006, all cross-family rules/enforcement, current one-pass admission behavior, learner/HTTP/
  Study Item/response interfaces, and Model Assignments are unchanged.

## Validation Log

### U0 — Ready plan and source baseline — complete; planning evidence only

- Repository state: local `main` at `ab15107`, ten commits ahead of `origin/main`; the edited grilling
  skill and untracked wait-what skill directory predate this work and are excluded from every commit.
- Scope: the accepted audit was translated into KTD1–KTD6, U0–U5, deterministic acceptance checks,
  evidence boundaries, and explicit non-goals. The Topic Expedition latency plan remains blocked at
  U3 `FIX_FIRST` and moves to second in execution order.
- Evidence boundary: this entry proves only a ready, repository-grounded implementation design and
  preservation boundary. It proves no source behavior, schema compatibility, semantic quality,
  deployment, browser, native, or physical-device behavior.

### U1 — Concept Canonicalization interface and deterministic build — complete; local automated evidence

- Interface and persistence: `canonicalizeConcepts` is the one caller use-case. It owns ordered
  Extraction Run/base loading, candidate reduction, semantic or exact-label-only execution, bounded
  unavailable results, artifact validation, stable summary, timeline lifecycle, and append-only
  persistence through the narrow `ConceptCanonicalizationStorePort`. The unused generic artifact
  repository and worker-owned mapping were deleted; internal resolver tests were replaced with
  interface tests.
- Semantic behavior: semantic mode alone invokes the embedding proposer and independent adjudicator.
  Embedding failures create a bounded domain unavailable record; adjudicator failures create a
  bounded pair unavailable record and no false semantic `distinct`. Exact-label-only mode invokes
  neither port. Artifact read validation enforces envelope/type, ordered unique runs, captured
  registry uniqueness, merge survivor, two-member distinct, two-published quarantine, cosine, and
  unavailable-versus-distinct invariants.
- Deterministic publication: Graph-Version Build now requires the selected artifact and store, has
  no neural dependency, reuses only captured published identities, and derives new UUIDv5 Concept
  IDs from final IRIs. It accepts unchanged captured state or the exact full deterministic output of
  a prior replay and rejects missing, changed, unrelated, conflicting, or partial registry state.
  The selected artifact and copied decisions persist with the artifact/config identity; quarantine
  still blocks publication.
- Worker/config surface: parsing covers the three locked commands, ordered selection, explicit base,
  required artifact, exact-label mode, and JSON inspection. The canonicalization hash includes mode,
  similarity threshold, pair/evidence bounds, embedding assignment, and adjudicator descriptor/
  assignment while excluding adjudication concurrency.
- Automated evidence: the focused canonicalization/build interface set passed 30/30 and worker
  parsing passed 8/8. Full affected local suites passed: application 801/801, infrastructure-LiteLLM
  177/177, and worker 8/8. The PostgreSQL package's local-only portion passed 14/14 while 90 DB cases
  correctly remained skipped outside `pnpm test:db`. Domain, ports, application,
  infrastructure-LiteLLM, infrastructure-PostgreSQL, and worker typechecks passed; `git diff --check`
  passed.
- Evidence boundary: this proves source interfaces, deterministic identity/replay behavior,
  validation, config derivation, worker parsing, and local buildability. It does not yet prove the
  generated schema, PostgreSQL append/read behavior, ambient wrong-stage rejection, Processing
  Journey lineage, real-model usefulness, or local database publication; U2 and U4 own those gates.

### U2 — Operation ownership, lineage, and persisted type — complete; local automated and isolated-database evidence

- Single ownership: `OPERATION_TIMELINE_CATALOG` now derives each operation's allowed timeline and
  neural-stage sets plus the LiteLLM spend-stage inventory. The ambient scope carries operation ID,
  type, and those allowed sets. The stage bracket and PostgreSQL reporter reject an unowned timeline
  stage before issuing a write; forced-tool and embedding clients reject an unowned neural tag before
  entering transport retry or dispatch. Discovery Coverage Audit no longer belongs to Extraction,
  while Scaffold Content Congruence remains owned by Scaffold because generation invokes it.
- Infrastructure boundary: the neural registry now owns descriptor membership and mechanical
  configuration identities only. `timelineType`, `claimedTimelineType`, embedding-stage membership,
  and both cross-layer set-equality tests were deleted. Ambient-free measurement calls still
  dispatch with their measurement tag and no operation ID. Shared neural stages dispatched under
  every operation the application catalog owns.
- Lineage/reporting: `JourneyLineage` carries the selected canonicalization operation ID derived
  from the graph version's mechanically generated canonicalization-selection refinement decision.
  Processing Journey and cost/timing reports now order Extraction Runs, Concept Canonicalization,
  Graph-Version Build, Graph Enrichment, and Study Item Bank; canonicalization SpendLogs join by the
  same operation ID.
- Persisted shape: the code-first operation schema admits `canonicalization` and requires
  `config_hash` for both canonicalization and scaffold rows. `pnpm db:generate` regenerated the
  `0000` SQL, snapshot, and journal together; `pnpm db:check` confirmed source/baseline parity.
- Automated evidence: application passed 804/804, infrastructure-LiteLLM passed 179/179, and the
  PostgreSQL local-only run passed 15/15 with DB cases correctly skipped there. All affected
  package typechecks and `git diff --check` passed. The focused ownership set proved every catalog
  stage accepted, wrong pairs rejected before reporter/HTTP side effects, shared ownership, and
  ambient-free measurement.
- Isolated database evidence: `pnpm test:db` targeted and reset only `lrnki_test`, passed the 9/9
  migration-state matrix and the repository's DB-enabled workspace suites. The new cases proved
  canonicalization/scaffold hash rejection, canonicalization hash/stage readback, selected-artifact
  lineage, artifact append/read immutability, and atomic graph publication against PostgreSQL.
- Evidence boundary: this proves local source behavior, generated-schema parity, and isolated
  PostgreSQL behavior. It does not qualify production-model Concept Canonicalization usefulness,
  live LiteLLM SpendLogs, deployed behavior, browser behavior, or any native/device layer.

### U3 — ADR, workflow, glossary, runbook, and follow-up correction — complete; documentation evidence

- ADR boundaries: the audited ADRs now retain durable decisions and review triggers while source
  types, source policy, and active plans own reversible algorithms, exact limits, interfaces,
  package placement, and persisted shapes. Extraction Run, immutable Concept Canonicalization
  artifact, and deterministic Graph-Version Build are three explicit records. The application
  catalog owns operation-stage membership; infrastructure owns Neural Stage Descriptors and
  mechanical configuration hashes; ambient checks enforce the application-owned relation without
  introducing another map.
- Governance and language: `AGENTS.md` now states that accepted ADRs bind shipped behavior, numbers
  do not create precedence, contradictions cannot be silently ignored, replacements must state the
  changed invariant and repair references, and reversible detail stays in source or an active plan.
  The Game UX implementation checklist moved there. `CONTEXT.md` names the immutable
  canonicalization artifact and its explicit selection by Graph-Version Build without duplicating
  implementation detail.
- Operator surface: the root README documents canonicalize, inspect, and artifact-selected build
  commands, including exact-label mode, matching selection requirements, LLM-free build behavior,
  and fail-closed replay compatibility.
- Follow-up direction: the generation brainstorm and TODO now record the DeepSeek Flash cutover as
  decided rather than hypothetical. The dated official model card identifies
  `DeepSeek-V4-Flash-0731` as superseding the preview release, while repository configuration
  already assigns it to judge roles. A future ready plan must recheck the official release, pin one
  exact Model Assignment, and interview only expedition stage simplification and the remaining
  independent judge. The resolved manual scope decision was removed from `BLOCKERS.md`; the Topic
  Expedition latency plan remains `FIX_FIRST` behind that follow-up.
- Documentation checks: every local target in the 23 in-scope changed Markdown files resolved,
  file-size policies remained within their limits, and `git diff --check` passed. Diffs from
  starting revision `ab15107` are empty for ADR-0006 and `litellm/config.yaml`. A zero-context audit
  found no added or deleted cross-family policy content and no new definition of “cross-family.”
- Evidence boundary: this proves repository documentation ownership, links, and protected-diff
  invariants. It does not qualify production-model semantics, live SpendLogs, local real-use graph
  publication, deployment, browser behavior, or any native/device layer.

### U4 — Automated, database, and real-use gates — complete; local real-use `PASS`

- Database preparation: the local `lrnki` schema had the superseded operation constraint and was
  reset through `pnpm db:reset` after a recoverable dump to
  `tmp/2026-08-23-adr-audit-pre-reset-lrnki.dump`; the LiteLLM database and other schemas were not
  touched. All six manifest sources were registered on the new baseline. The gitignored PDF was
  restored from the exact declared arXiv v2 source and parsed through a temporary container built
  from the repository's pinned Docling image and `docling==2.102.1`; the container and temporary
  image tag were removed after registration.
- Inspected Extraction Runs: the ordered inputs were Docling PDF
  `f5f124b8-1357-49dd-bf57-b2deb1bb9141` (40 Candidates, 8 core, 38 CEPs), native Markdown
  `914e9bb0-033b-4aa4-bc15-e17e2280dd2e` (51 Candidates, 4 core, 48 CEPs), both in machine learning
  systems, then OpenStax HTML `71ff6358-c29c-46c0-bc4e-7e80628105ad` (10 Candidates, 3 core, 8
  CEPs) in molecular biology. All three runs succeeded without degradation; every one of their 15
  core Candidate CEPs was complete and was inspected with its Definition Passages.
- Defect found and fixed: the first public inspection correctly failed closed because postgres.js
  hydrated `artifact_versions.created_at` as a `Date` while the narrow store claimed a string. The
  adapter now validates and normalizes either runtime representation to ISO before returning the
  envelope. A database regression proves the complete envelope round-trip and that a second write
  cannot replace the first artifact; the focused regression passed 1/1 and the same persisted
  real-use artifact then inspected successfully.
- Semantic artifact: `bc33525e-77ce-455a-8e6f-72022192daaa`, config
  `concept-canonicalization-ce3969a22bea`, captured the exact three-run order and empty published
  registry. It recorded no merge, quarantine, or unavailable result. Both proposed pairs were
  correctly distinct beside their definitions: abstract AI Research Agents versus the concrete
  AIRA-dojo framework (cosine 0.725129), and the semi-conservative replication mechanism versus a
  template strand component (cosine 0.710828). No decision crossed a Declared Domain and there was
  no unsupported same-domain merge.
- Replay: graph versions `227f8bab-7697-44f7-8321-5789335b5f28` and
  `9efc7a9e-89c2-40b9-9d73-294e534907d1` each published 14 Concepts, 14 CEPs / 106 passages, and 13
  typed assertions. Their graph-version-free snapshots were identical (`78146147a1360e06f1b2e68bf00065db`),
  with identical identity/IRI (`697b624f4bafb72475d23b57becd432c`) and CEP
  (`5efe8940f6c3b648a85bab8697d84f85`) hashes. Their four-record refinement sets were identical
  (`dca0198443dfe4046a645cb27c6d4ac6`): the artifact selection, both copied semantic decisions, and
  the deterministic exact-label union of Generalization Gap evidence from both parser sources.
- Attribution: the artifact and canonicalization timeline row carry the same config identity.
  Canonicalization joined four live SpendLogs through its operation ID: two
  `openrouter/qwen/qwen3-embedding-8b` calls and two
  `openrouter/deepseek/deepseek-v4-flash-0731` adjudications, 2,663 tokens and $0.00030886 recorded
  spend. In the same positive-control query, each Graph-Version Build operation had zero model
  logs and zero tokens.
- Automated/database evidence: `pnpm db:check` confirmed the sole generated baseline. After the
  read-adapter fix, `pnpm test:db` reset only `lrnki_test`, passed the 9-test migration matrix, and
  completed every DB-enabled workspace suite; the focused ISO/immutability regression also passed
  alone. Infrastructure-PostgreSQL typecheck, local tests, and `git diff --check` passed.

#### Real-use quality evaluation

- Milestone: immutable semantic Concept Canonicalization and deterministic LLM-free publication.
- Fixture and source type: one paper through Docling PDF and native Markdown in machine learning
  systems, plus OpenStax HTML in molecular biology.
- Real model calls used: yes — the production embedding and independent adjudicator assignments.
- Result: `PASS` after the persisted-envelope read defect was fixed.
- Useful output observed: both high-similarity pairs were kept distinct for the correct semantic
  reason; exact-label evidence unioned across parser variants; both publications replayed exactly.
- Defects observed: PostgreSQL timestamp hydration initially made the new inspection command reject
  its valid artifact. No semantic merge, quarantine, unavailable result, or cross-domain proposal
  was defective.
- Changes made after inspection: normalize the narrow store's timestamp at the database boundary
  and cover immutable round-trip with a live PostgreSQL regression.
- Remaining caveats: this gate covers 15 core Concepts and two semantic proposals with no existing
  published registry; non-deterministic quality evidence remains scoped to these exact Model
  Assignments and the Concept Canonicalization consumer. Automated tests own the broader registry,
  malformed-artifact, unavailable, quarantine, and base-version cases.
- Safe to continue downstream: yes.
- Evidence boundary: this is local real-use, production-model, live-LiteLLM, and local-PostgreSQL
  evidence. It is not deployed, production-data, browser, emulator/simulator, or physical-device
  evidence.

### Open findings

- U5 must run the full repository/protected-diff gates, consolidate durable status, and delete this
  completed plan only after the detailed validation record is committed.
