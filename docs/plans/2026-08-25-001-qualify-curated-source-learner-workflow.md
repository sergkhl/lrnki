---
title: Qualify the Curated-Source Learner Workflow - Plan
type: implementation
date: 2026-08-25
execution: code
---

# Qualify the Curated-Source Learner Workflow

**Status:** In progress — U0–U5 complete; U6 exact-reference Support Path next

**NEXT:** Implement U6 through the existing reference Support Step seam: reuse only an exact node,
qualified lesson, and qualified option from a ready Source Expedition; refuse before any generation
write or wake when that tuple is unavailable. Prove pinning, grading identity, isolation, restore,
and source ownership before continuing to U7.

**Decision state:** Accepted by the owner on 2026-08-25. The current product starts with registered
Curated Sources and automatically admits only source-backed learner assets. Anchor-less Synthetic
Topic Generation remains paused. Its implementation, model-grounded prerequisite implementation,
generated Support Step implementation, matching items, and impostor items are retained for later
qualification rather than deleted. Future search, source curation APIs, and smart-model document
generation must hand documents to the existing Source Registration boundary; they are not part of
this plan.

## Goal capsule

- **Objective:** Make the path from supplied Curated Sources to a playable learner expedition work
  end to end with a precision-first, automatic, fail-closed readiness contract.
- **Learner-visible goal:** A learner may begin a Source Expedition only when every visible stop can
  teach one evidence-supported lesson and offer at least one automatically qualified activity. The
  trail remains completable; missing or uncertain assets are explicit absence, never silent mastery.
- **Mastery relationship:** This plan does not change acquisition mastery, grading, rewards, Recall
  Challenges, or Support Path evidence isolation. It makes the existing lesson-before-activity
  experience available only over a complete source-backed trail under
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).
- **Starting boundary:** One or more Curated Sources have already crossed Source Registration with
  their Declared Domain and provenance. Acquisition, retrieval, ranking, web search, and generated
  source documents are upstream callers of that same boundary and remain out of scope.
- **Deep module boundary:** One application module owns Source Expedition candidate qualification
  and adoption. Callers provide learner identity plus `enrichmentId`; the module resolves
  authoritative graph and current asset facts, returns a discriminated adopted-or-unavailable
  outcome, and never accepts presentation facts from a client.
- **Precision policy:** Coverage may be sparse. A node, item family, Support Step, or whole
  enrichment stays inspectable but unavailable when evidence is insufficient. False absence is
  preferable to a learner-visible unsupported claim in this iteration.
- **Runtime policy:** No human approval, moderation queue, or operator click participates in normal
  readiness. Automated evidence checks settle availability. Real-use inspection remains an
  implementation quality gate, not a production workflow step.
- **Validation route:** Apply the
  [lrnki validation skill](../../.agents/skills/validate-lrnki/SKILL.md). Automated tests establish
  deterministic envelopes only. Local real-model runs plus direct persisted-artifact inspection
  establish source-backed usefulness. No evidence is upgraded to deployed, browser, native,
  emulator/simulator, physical-device, or release authority.

## Established problem classes and recognized practice

### Material-qualifier loss during evidence projection

The reproduced defects are source-attribution and decontextualization failures: a generated lesson,
matching prompt, distractor verdict, or impostor can omit a material condition, transfer a property
between carrier and referent, or turn a context-specific statement into a universal one even though
the source passage contains the distinction. The conventional repair is to expose atomic material
claims and retain the context required to interpret them. This follows the atomic-fact discipline in
[FActScore](https://aclanthology.org/2023.emnlp-main.741/) and the explicit-context practice in
[Decontextualization](https://aclanthology.org/2021.tacl-1.27/). It does not add fixture-specific
words to prompts or a lexical veto.

### Unsupported claim and answer-key admission

Source entailment, distractor invalidity, answer-key uniqueness, matching-board unique assignment,
and impostor falsity are different harm classes. One blended `quality` verdict cannot establish all
of them. Existing dedicated ports remain separate, and each verifier receives only the evidence and
candidate fields needed for its named question. A verifier may reject or abstain but may not write a
replacement claim or patch a candidate.

Small factual-consistency models are a recognized cost-reduction candidate, not an assumed source of
truth. [MiniCheck](https://aclanthology.org/2024.emnlp-main.499/) evaluates sentence-level claims
against grounding documents with a specialized sub-billion-parameter model; [AlignScore](https://arxiv.org/abs/2305.16739)
learns a general alignment function. Their benchmark results do not qualify lrnki's domains,
negative options, unique assignments, or production threshold. U4 therefore treats a local model as
an explicit measured module with a kill gate, not as a drop-in oracle.

### Transport authority leaking into application policy

The learner API currently accepts client-echoed title and Declared Domain, writes `kind: "topic"`
and `status: "ready"`, and wakes supervisors from route code. The established deep-module repair is
to keep authentication and transport mapping in Hono, application transitions in one use-case, and
atomic persistence in the store. This accepts Candidate 3 from the retained
[architecture review](../brainstorms/2026-08-19-001-architecture-deepening-review.md#candidate-3--move-topic-expedition-commands-out-of-the-hono-adapter)
for the source-backed adoption path without reopening Synthetic Topic Generation.

## Current repository facts

- `LearnerExpeditionKind` is currently only `"topic"`, while
  [CONTEXT.md](../../CONTEXT.md#learner-experience) defines Topic Expedition as source-less.
  Successful source-backed enrichments are nevertheless exposed as candidates and adopted as
  `"topic"` rows.
- `getExpeditionCatalog` filters to succeeded enrichments with at least one Study Item and merely
  ranks fully item-covered trails above partial trails. It does not require one current lesson and
  one qualified item for every learner-visible node.
- `POST /expedition/choose` trusts client title/domain and marks the requested enrichment ready
  without re-resolving the candidate or asset completeness. `GET /expedition/:enrichmentId` can
  project an enrichment without proving learner ownership or Source Expedition readiness.
- Current lesson and Study Item store reads select only non-superseded generations. Their immutable
  artifacts and config identities are available for a readiness contract; legacy banks must not be
  grandfathered merely because rows exist.
- Graph Enrichment may contain `document_anchored`, `source_mentioned`, and `llm_grounded` nodes.
  Source-mentioned passages already fail closed on verbatim source verification. LLM-grounded nodes
  carry no source citation and remain outside the trusted learner layer in this plan.
- Concept Lesson assembly protects citation honesty, and option-select now projects its keyed claim
  exactly from the lesson. The latest source-backed inspection still found unsupported lesson
  context, defensible distractors, a qualifier-dropping matching prompt, and a true impostor that
  existing judges accepted. Row existence is therefore not qualification evidence.
- Reference Support Steps already pin an exact current neutral Concept Lesson and option-select item.
  Generated Support Steps use a separate learner-scoped identity and cannot affect neutral mastery,
  but their content quality is unqualified.
- `fixtures/diagnostic-manifest.json` now registers four project-authored, mixed-format diagnostic
  Curated Sources. They pressure carrier/referent identity, expiring authority, context-scoped
  quantities, stale measurements, exceptions, ordered state changes, byte/scalar distinctions, and
  a prerequisite defined only by a second source.

Environment, model route, account, loaded revision, database, and rig facts from an earlier session
are not carried forward. Each implementation unit re-verifies the facts it uses.

## Locked product and module design

### KTD1 — Keep Topic Expedition and Source Expedition distinct

Add `Source Expedition` to the project language and extend the source-owned expedition kind rather
than calling a source-backed enrichment a Topic Expedition. Topic start/retry remain governed by the
existing paused availability result. Source adoption never wakes the synthetic supervisor and never
creates a generating row.

Do not delete source-less generation, model-grounded prerequisite, or generated Support Step code.
Their unavailable state is one application policy consumed by every production composition and
learner entry point. Tests prove held-out paths make no model call or learner-visible write.

### KTD2 — Give readiness and adoption one deep application owner

Expose one small use-case shaped like:

```text
adoptSourceExpedition(learnerStateRef, enrichmentId)
  -> adopted(learnerExpeditionId)
   | unavailable(reason codes)
```

The module hides candidate resolution, trail derivation, source-origin filtering, current lesson and
item reads, qualification identity, race detection, title/domain derivation, idempotent adoption, and
activation. Hono validates only identifiers/authentication and maps the outcome. The client sends no
title, Declared Domain, kind, status, or readiness claim.

Persistence keeps atomic active switching and learner ownership. Adoption must fail if the current
asset generation changes between qualification and write; a stale qualified snapshot cannot become
ready. The final source-owned interface may use an opaque asset-set identity or an atomic
compare-and-adopt operation, but transport and UI types must not learn its mechanics.

Catalog and Journal projections consume the same finished candidate qualification. Direct Study
Session access must prove an active or otherwise learner-owned ready Source Expedition; Admin Lab
inspection remains independent and can inspect held-out enrichments.

### KTD3 — Define the trusted source trail before counting assets

A learner-visible Source Expedition trail may include:

- `document_anchored` nodes backed by admitted Curated Source evidence; and
- `source_mentioned` prerequisite nodes only when their source passages passed the existing
  verbatim floor and their lesson/item qualification passes this plan.

It may not include an `llm_grounded` node. A required LLM-grounded prerequisite is not silently
removed, bypassed, or treated as mastered: the whole candidate is unavailable until a Curated Source
supplies evidence through normal registration and a new source-backed enrichment qualifies. Trail
derivation must retain prerequisite closure and the existing difficulty floor without creating an
unwinnable or falsely unlocked path.

### KTD4 — Make learner-asset qualification explicit and current

One current learner-asset qualification contract identity is folded into the relevant artifact/config
identity. Existing assets produced without it remain inspectable but do not satisfy Source Expedition
readiness. Qualification is attached to the current non-superseded asset set; regeneration invalidates
the prior readiness snapshot.

A node has a qualifying Concept Lesson only when:

1. exactly one current lesson exists for the enrichment and node;
2. it contains at least one substantive `definition`, `examples`, or `formulas` section supported by
   admitted `source_cep` or `source_mentioned` evidence;
3. every material learner-visible claim projected from all retained sections is supported by its
   supplied source evidence with material conditions, quantities, roles, and scope preserved; and
4. uncertain or unsupported optional prose is omitted, while failure to retain a sufficient lesson
   produces the existing explicit lesson-absent outcome.

Citation honesty remains independent: supported paraphrase must not masquerade as a verbatim quote,
and a verifier decision never manufactures a source identifier.

A node has a qualifying Study Item when at least one current item has passed the current contract for
its own family. The first learner-ready family is `option_select` because exact-reference Support
Steps already depend on it and its keyed positive claim now projects losslessly from the lesson. Its
complete acceptance requires source support for the stem/key/explanation, individual rejection of
each distractor as an answer to that exact question, and key uniqueness with the server key hidden
from the verifier.

Matching and impostor implementations and artifacts remain inspectable but do not satisfy readiness
or render in a Source Expedition until their separate unique-assignment and false-statement gates
pass representative real-source qualification. Sparse one-family banks are valid under ADR-0026.

### KTD5 — Keep exact-reference Support Steps; hold out generated content

The Support Path stays available only when the requested Explorable Term resolves to an existing,
qualified source-trail node with the exact current Concept Lesson and qualified option-select item.
That branch persists the existing reference identity and retains neutral grading semantics.

If no exact reference exists, the request returns a plain unavailable outcome without calling the
outline, Source-less Grounding, content, congruence, or answer-key models. Generated-detour code and
stored historical artifacts remain intact, but no new generated Support Step becomes learner-visible
under this plan. No human review fallback is introduced.

### KTD6 — Qualify a local verifier only through a bounded measured experiment

U4 may test one small open-weight NLI/factual-consistency candidate after a metadata-only preflight
records its exact revision, license, size, inference contract, and required runtime. Do not download
multiple candidates or activate a large service speculatively. The first candidate should target
claim-versus-source support; a binary entailment score is not evidence of distractor invalidity,
matching uniqueness, or impostor falsity.

Production adoption requires all of the following:

- a narrow model port and an attributable LiteLLM-owned route rather than application coupling to a
  Python library, Ollama CLI, or Hugging Face cache;
- no free-form JSON or JSON-Schema exception to
  [ADR-0006](../adr/0006-use-forced-named-tool-schemas.md); structured generative output must still
  use the owning forced named-tool schema, while a native classifier scalar stays a classifier
  result rather than a fabricated tool call;
- an exact immutable revision and declared inference precision/quantization in operation identity;
- domain-neutral claim/evidence inputs and no diagnostic-fixture terms in prompts or thresholds;
- a fixed pre-activation matrix containing supported claims, contradictions, omitted material
  qualifiers, carrier/referent swaps, context-bound quantities, and held-out real-source cases;
- no material false acceptance and an explicitly bounded false-rejection rate for the named harm
  class; and
- a cheaper operational envelope than the API judge it would replace or precede.

If LiteLLM cannot own the route, the classifier cannot express the needed harm class, or the first
kill gate fails, record the result and continue with fail-closed absence. Do not switch to JSON mode,
weaken a gate, or treat benchmark claims as local qualification. A successful candidate is still a
heuristic measured module under AGENTS rule 16 and is removed from authority if real-source false
negatives appear.

### KTD7 — Keep diagnostic sources diagnostic and real sources authoritative

The project-authored fixtures are stable regression inputs for parsing, provenance, qualifier
retention, multi-source completion, and bounded kill gates. They are not a frozen expected neural
graph. Deterministic tests may assert source bytes, blocks, locators, and mechanical projection; they
may not assert that one model-authored semantic graph is eternally correct.

Every important behavior milestone then runs the smallest real-use route: inspect generated payloads
beside admitted grounding and qualification outcomes. Final usefulness requires at least one real
external Curated Source, then a second domain/format when the changed harm class could be
format- or domain-sensitive. Model calls stop at the first material defect.

### KTD8 — Preserve the future source-acquisition seam

No source-backed learner module knows whether a Curated Source came from a checked-in fixture, an
operator upload, a future search API, or a future smart-model document generator. All such sources
must carry the normal Source Registration provenance and content bytes. No future caller may inject
text directly into Graph Enrichment, Concept Lesson generation, Study Item generation, or a verifier.

## Implementation units

Units are exclusive and run in order. This plan declares no parallel-safe implementation unit.

### U0 — Accepted contract and diagnostic Curated Sources — complete

1. Freeze the accepted precision, availability, support, future-acquisition, and no-human-runtime
   decisions in this plan and the Source Expedition glossary term.
2. Add the separate diagnostic manifest and short mixed-format source set without changing the
   canonical real-source manifest or default seeding cost.
3. Prove each registered fixture resolves through the native parser registry into unique,
   non-empty, located blocks, and prove the harbor prerequisite is mentioned in one source and
   defined in another.
4. Update plan/README/TODO status and clear the resolved owner blocker. Commit once.

### U1 — One availability policy for trusted learner knowledge

1. Replace composition-local booleans with one application-owned, source-typed availability result
   for Synthetic Topic Generation, `llm_grounded` learner nodes, generated Support Steps, Source
   Expedition adoption, `source_mentioned` nodes, and exact-reference Support Steps.
2. Route every API, worker, supervisor, and learner projection through it. Held-out paths return
   stable reason codes before model calls or writes; Admin Lab inspection remains available.
3. Prove all production-shaped entry points agree, exact-reference/source-backed paths remain open,
   and no implementation or persisted historical work is deleted. Run focused automated checks and
   the required real-use route if learner-visible behavior changes.
4. Update all three status altitudes, Validation Log, and Open findings; commit once.

### U2 — Deep Source Expedition qualification and adoption

1. Add the source-owned expedition kind and finished qualification/adoption outcomes. Implement one
   application module over narrow read/write dependencies; keep Hono and the learner client thin.
2. Derive authoritative title/domain and the trusted prerequisite-closed trail. Exclude any
   candidate with an LLM-grounded required node, incomplete current asset set, legacy qualification
   identity, or changed asset snapshot.
3. Make catalog, Journal, adoption, activation, direct Study Session entry, and supervisor wake
   behavior agree. Source adoption is idempotent and wakes no generator.
4. Add application tests plus `pnpm test:db` coverage for ownership, active switching, concurrent
   change refusal, current/superseded assets, and no partial write. Run the real-use route only after
   the behavior milestone is complete; commit once.

### U3 — Domain-neutral material-claim projection and evaluation harness — complete

1. Define one source-owned material-claim projection for Concept Lesson sections and option-select
   stem/key/explanation/distractors. Preserve exact qualifiers and evidence references; do not put
   fixture concepts in code or prompts.
2. Give source support, distractor invalidity, and key uniqueness separate outcomes and failure
   reasons. Reuse the existing answer-key port for its named question rather than creating a blended
   quality port.
3. Build a gitignored evaluation report that joins candidate payloads, admitted passages, decisions,
   operation identity, calls, tokens, cost, and positive controls. Stable evaluation mechanics live
   in source; generated reports stay in `tmp/`.
4. Validate deterministic projection/non-leakage and inspect a no-activation diagnostic sample;
   update statuses/log/findings and commit once.

### U4 — Bounded local factual-consistency verifier experiment — complete

1. Research current official model artifacts and select at most one bounded candidate whose native
   contract can answer claim-versus-source support. Record exact revision/license/size/runtime before
   download; reject account-gated, moving, unattributable, or architecture-incompatible candidates.
2. Qualify the transport/port contract without activation, then run the fixed diagnostic and
   held-out real-source kill matrix. Retain complete local evidence in `tmp/` and only consolidated
   findings in this log.
3. On pass, activate it only for the exact qualified harm class and fold identity into config hashes;
   on failure, delete disposable runtime state, record the blocker/fallback to absence, and make no
   model reassignment.
4. Run affected automated and real-use gates, update statuses/log/findings, and commit once. A
   rejected experiment does not stop later units that can remain safely fail-closed.

### U5 — Source-backed lesson and option-select admission

1. Apply the material-claim contract to Concept Lesson assembly/generation. Omit unsupported optional
   prose and settle an insufficient lesson as absent; never patch model output in a verifier.
2. Apply exact keyed-claim, distractor-invalidity, and key-uniqueness admission to option-select.
   Persist only items that pass every named gate; rejected nodes/types remain explicit.
3. Keep matching and impostor generation inspectable but filter those families from Source
   Expedition readiness/rendering until separately qualified. Do not delete their code, types,
   schema, artifacts, or Admin Lab inspection.
4. Run diagnostic kill gates, then at least one fresh real external Curated Source operation with
   payload-versus-evidence inspection. Stop at the first material false acceptance. Update and commit
   one coherent behavior batch at a time if lesson and item changes prove too coupled for one batch.

### U6 — Exact-reference-only Support Path

1. Resolve an Explorable Term against the ready Source Expedition's qualified neutral assets.
   Publish the existing reference Support Step only for an exact eligible node/lesson/option item.
2. Return unavailable without creating/waking a generation attempt when no exact reuse exists. Keep
   generated Support Step workers and historical artifacts intact but unreachable from new learner
   requests under the availability policy.
3. Prove reference pinning, grading identity, mastery/progress isolation, no-model-call refusal,
   restore/hide behavior, and source-expedition ownership. Run focused real-use inspection and commit
   once.

### U7 — End-to-end readiness qualification

1. Starting only from `diagnostic-manifest.json`, register, extract, publish, enrich, generate assets,
   qualify, adopt, and read a Source Expedition through production application composition. Run the
   harbor core alone first, then add its supplement through Source Registration and observe the
   prerequisite move from unavailable evidence to a source-backed candidate without prompt injection.
2. Inspect every visible node, lesson material claim, option-select key/explanation/distractor,
   qualification outcome, and exact-reference Support Step beside admitted evidence. Assert zero
   LLM-grounded visible nodes and zero generated Support Steps.
3. Repeat the smallest representative path on a real external Curated Source. Record model route,
   exact assignment/quantization, operation identities, calls/tokens/cost, fallbacks/errors, positive
   controls, absences, and usefulness. Any material false acceptance is `FIX_FIRST`.
4. Prove automatic adoption needs no human action and incomplete enrichments remain inspectable but
   absent from learner entry. Update and commit once.

### U8 — Repository gate and plan closure

1. Run the smallest complete dependency-graph gate, including `pnpm test:db`, affected production
   builds, link/cap checks, lint/typecheck/tests, and whitespace checks. Keep unexercised evidence
   classes explicit.
2. Move durable terminology, interfaces, workflow, and current status to their canonical owners.
   Add or amend an ADR only if implementation discovers a hard-to-reverse trade-off; do not retain
   this walkthrough as an ADR.
3. Commit detailed final evidence, then consolidate separately, then delete this completed plan in
   its own commit under AGENTS.md.

## Acceptance contract

The plan is complete only when all of the following are true:

1. A caller can start with registered Curated Sources and automatically reach a playable Source
   Expedition without a human approval step.
2. Every learner-visible trail node is document-anchored or source-mentioned, remains in a valid
   prerequisite closure, has exactly one current qualified source-backed Concept Lesson, and has at
   least one current qualified option-select item.
3. Every visible lesson material claim and option-select positive claim retains its material source
   scope; every visible distractor is invalid for the exact question; the key is unique and hidden
   from the verifier.
4. Incomplete, uncertain, legacy, changed, or LLM-grounded asset sets are inspectable but cannot be
   cataloged, adopted, opened directly, graded, or used by Support Path as ready source content.
5. Exact-reference Support Steps work; generated Support Steps and Synthetic Topic Generation remain
   unavailable with no model calls or learner-visible partial writes.
6. Diagnostic and real external source inspection both pass for the exact Model Assignments and
   consumers used. Green automation alone cannot satisfy this item.
7. Future source acquisition can enter through Source Registration without any downstream interface
   or trust-policy change.

## Out of scope and safety boundaries

- No web search, retrieval/ranking system, curated-source API integration, smart-model document
  generation, source licensing automation, or direct text injection around Source Registration.
- No reactivation or redesign of Synthetic Topic Generation, Source-less Grounding Admission,
  `llm_grounded` learner nodes, or generated Support Step content.
- No matching/impostor quality repair unless a U5 finding proves it inseparable from safely
  filtering those families; retaining and holding out is the default.
- No weaker admission, lexical semantic veto, fixture-specific prompt/schema term, standing neural
  oracle, verifier-authored repair, lucky rerun, or JSON/free-form structured-output exception.
- No human approval queue, manual learner-asset moderation, or runtime curator decision.
- No production write, deployment, browser, native, emulator/simulator, physical-device, release, or
  latency objective. Shared Compose remains host-only, detached, and root-runbook governed.
- Preserve unrelated dirty work and reverify every environment, route, model, account, database,
  fixture, and loaded-revision claim immediately before relying on it.

## Validation Log

### U0 — accepted contract and diagnostic Curated Sources — 2026-08-25 — complete

- Accepted supplied Curated Sources as the current entry, future acquisition through Source
  Registration, no human runtime, source-mentioned prerequisites, and exact-reference Support
  Steps. LLM-grounded prerequisites, generated Support Steps, and Synthetic Topic Generation remain
  implemented but held out.
- Added four project-authored Markdown/HTML/text diagnostic sources and a separate manifest; the
  harbor pair exercises later source-supplied prerequisite completion without defining a neural
  graph oracle or replacing the real-source matrix.
- Ingestion typecheck, 12 fixture tests, manifest parsing, and whitespace passed after two excluded
  test-harness corrections. No model call, database/source write, or learner/deployed evidence was
  claimed.

### U1 — one availability policy for trusted learner knowledge — 2026-08-25 — complete

- One source-typed application policy now governs all six learner-knowledge capabilities across API,
  worker, supervisors, Journal/catalog/Study Session, Support Path, and Scaffold Generation. Held-
  out entry points refuse before a write or wake; every producer, artifact, and historical row
  remains.
- Source Expedition adoption, verified source-mentioned prerequisites, and exact pinned references
  remain reachable. LLM-grounded graphs, Synthetic Topic requests, and generated Support Steps return
  stable unavailable reasons; generated artifacts remain inspectable but unprojected.
- The reset-backed repository gate, 820 application tests, eight worker tests, 26 database API tests,
  57 learner-app suites / 320 tests, four typechecks, lint, and no-call/no-write controls passed. This
  proves local availability mechanics only, not content usefulness or deployed/device behavior.

### U2 — deep Source Expedition qualification and adoption — 2026-08-25 — complete

- One source-owned module derives authoritative presentation, the prerequisite-closed source trail,
  current qualified assets, and opaque snapshot identity; identifier-only adoption is idempotent,
  atomic, generation-free, and wakes no Topic supervisor.
- The versioned wrapper rejects legacy/changed/missing assets, incomplete trails, LLM-grounded nodes,
  and unverified source-mentioned nodes. Catalog, Journal, Study Session, activation, learner writes,
  Recall, and exact-reference Support Path share that authority. Matching/impostor remain stored but
  neither render nor grade.
- Seven module tests, `pnpm db:check`, the reset-backed repository gate, 111 Postgres tests, 26 API
  tests, 57 learner-app suites / 320 tests, all 11 typechecks, lint, and whitespace passed after two
  excluded fixture/runner corrections.
- A read-only production-composition inspection found two exact two-stop/two-lesson/two-option
  project-authored positive controls. It proves qualification composition and race identity only;
  no model call or real-external/deployed usefulness claim was made.

### U3 — domain-neutral material-claim projection and evaluation harness — 2026-08-25 — complete

- One versioned source-owned projection covers every lesson material field and option-select
  question/key, explanation, and distractor. Compile-time owner maps preserve exact qualifiers;
  typed direct evidence keeps generated aids from posing as quotations.
- Exact immutable block reads feed separate source-support, distractor-invalidity, and key-uniqueness
  decisions. The reused one-call answer-key verifier receives text-ordered candidates without key,
  option, node, or generator-position leakage; missing/unresolved evidence and every unavailable
  state remain distinct.
- The read-only, gitignored-output report joins raw payloads, evidence, decisions, asset/model/config
  identity, operation timing/spend, and positive controls. The 833 application tests, reset-backed
  repository gate, all 11 typechecks, lint, and whitespace passed after one excluded CLI-separator
  failure and repair.

#### Real-use quality evaluation

- **Milestone/fixture:** U3 mechanics over a project-authored two-stop text-source candidate in the
  disposable test database; **real model calls:** no; **result:** PASS for report mechanics only.
- The report joined two lessons, two options, 12 exact claims, one resolved block, all three decision
  families, exact identities, and zero evaluator calls. Missing timeline/spend remained `null`.
- This cannot establish semantic support, distractor quality, model fitness, or external-source
  usefulness. Only the CLI separator was repaired; continuation was limited to U4.

### U4 — bounded local factual-consistency verifier experiment — 2026-08-25 — complete

- The sole candidate was public MIT
  [`lytang/MiniCheck-DeBERTa-v3-Large` revision
  `60c4e0825ae044a6193ba811c5712c37548636a0`](https://huggingface.co/lytang/MiniCheck-DeBERTa-v3-Large/tree/60c4e0825ae044a6193ba811c5712c37548636a0):
  a 1,740,304,440-byte two-label DeBERTa artifact whose safetensors SHA-256 matched
  `8528d6a1399182054c3d2918f58bb67785de50ffde97f5ecdb215eabfb73297d`.
- TEI 1.9.3/Candle/float32/no truncation reproduced both official `/predict` controls; `/rerank`
  correctly refused the classifier. LiteLLM 1.88.1 transported it with call identity but crashed its
  asynchronous success logger on every HTTP 200, so attribution/spend was not qualified.
- The fixed 43-case diagnostic plus held-out Rust/OpenStax matrix had three false rejections
  (15.789%) and one forbidden carrier/referent false acceptance (0.8887313 supported probability),
  failing the zero-false-acceptance kill gate.
- Nothing was activated or reassigned. Services and disposable model state were removed; complete
  local output remains gitignored. This is measured local rejection evidence only.

### U5 — source-backed lesson and option-select admission — 2026-08-26 — complete

- One application evaluator now resolves exact evidence, rejects every unavailable/abstaining
  decision, and requires three unanimous source-support draws. Source lesson fields additionally
  must be formatting-normalized substrings of an admitted block; unsupported fields are omitted and
  a lesson without a substantive survivor is explicit absence. Raw candidates remain immutable and
  inspectable under the base identity; only settled assets receive the version-2 qualification
  identity.
- Source options now use one code-owned exact-reference contract. The keyed option must equal the
  application-selected learner-visible lesson unit byte for byte, the explanation must equal that
  key, and all four normalized option texts must be unique. Those facts settle key uniqueness and
  distractor invalidity deterministically with no answer-key call; source support for the exact
  question/key and explanation remains mandatory. Matching and impostor remain stored and
  inspectable but excluded from Source Expedition identity and readiness.
- Both production compositions activate the dedicated `kg-source-material-support-verifier` port.
  Its assignment is DeepSeek V4 Flash 0731 with medium reasoning over an attributable FP8 provider
  route (DeepInfra primary, separately qualified Io Net fallback), temperature 0, seed 7, a flat
  forced tool, bounded 429 retry handling, and operation/config identity. The tracked 46-case matrix
  passed 138/138 draws through that complete route before activation.
- Two earlier fresh OpenStax candidates were correctly unavailable but inspection found material
  false acceptance in generated lesson prose and then ambiguity in a semantic option question.
  Both were `FIX_FIRST`: extractive lesson admission and the exact-reference option contract replaced
  the unsafe behavior. Neither candidate was adopted or reused as passing evidence.
- Current automated evidence: 850 application and 202 infrastructure-LiteLLM tests, eight worker and
  22 passing/four skipped learner-API tests, 13 ingestion tests, affected typechecks, and whitespace
  checks pass. Report schema 4 and Study Item Bank hash `study-item-bank-43d67784c2ba` bind the final
  policies and prompt identity.

#### Real-use quality evaluation

- **Milestone/source/model:** fresh production-composition enrichment and Study Item Bank over the
  published, successful, non-degraded OpenStax Biology 2e §14.3 HTML Curated Source (CC BY 4.0), with
  the activated DeepSeek FP8/medium source-support assignment.
- **Result:** PASS for U5 admission precision and safe incompleteness. The fresh graph contained 11
  source-trail nodes, 12 certain/one uncertain edge, and zero LLM-grounded nodes. It admitted eight
  extractive lessons and eight exact-reference options, recorded three lesson absences and 25 typed
  rejections, and kept the expedition unavailable with `lesson_missing`.
- **Payload/evidence inspection:** all six referenced blocks resolved; every one of eight lesson
  fields mechanically matched an admitted block; all 24 projected support claims passed 3/3 draws;
  and all eight keys plus 24 distractors passed the exact-reference contract with zero answer-key
  calls. The independent replay repeated all 72 support draws successfully.
- **Route/cost evidence:** the operation's 93 source-support calls and replay's 72 calls were all
  successful on DeepInfra with zero retries: 244,195 tokens and $0.010548184 total. The full source
  journey through the Study Item Bank recorded 210 calls, 368,059 tokens, and $0.0358067234, with
  estimates explicitly retained where the provider did not report spend.
- **Defects and changes:** the two pre-final material defects above caused the extractive and
  exact-reference root fixes. The final candidate had no material false acceptance. This is local
  external-source evidence, not deployed/browser/native/device evidence, and it does not prove a
  complete expedition; U7 owns that end-to-end gate. **Safe to continue:** yes, to U6.

### Open findings

- U4's local verifier remains rejected for one material false acceptance and broken LiteLLM success
  logging; do not rerun it or pick a second local candidate. The activated remote assignment is
  qualified only for source material support, not general generation or source-less grounding.
- The final external U5 candidate remained unavailable because three nodes had no admitted lesson.
  This proves safe refusal, not complete readiness; run U6 against ready diagnostic source assets,
  then use U7's harbor-plus-supplement path to prove a complete automatic expedition before the
  representative external-source repetition.
- Matching and impostor remain preserved but unqualified. They do not satisfy readiness in this plan;
  Source Expedition snapshots now exclude them structurally. A future plan may qualify them
  independently after the option-select Source Expedition works.
