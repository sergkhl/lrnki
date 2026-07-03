# Architecture deepening review — candidates

Date: 2026-07-03. Produced by the `improve-codebase-architecture` skill: surface **deepening
opportunities** — refactors that put more behaviour behind smaller interfaces — using the
architecture vocabulary in `.agents/skills/improve-codebase-architecture/LANGUAGE.md` (module,
interface, depth, seam, adapter, leverage, locality) and the project language in `CONTEXT.md`.

Every remaining candidate below was verified against the current tree (branch
`feat/quest-subgraph-study`, after the legacy persisted-path retirement). No interfaces are proposed
yet; each candidate is a problem statement plus a plain-English direction. Candidates 1 and 2 were
accepted and implemented on 2026-07-03, so they no longer remain as open framing here. Findings from
the exploration pass that did not survive verification are recorded at the end so they are not
re-suggested.

---

## Candidate 3 — Forced-tool operation descriptors + mechanically derived config hash

**Recommendation strength: Worth exploring**

**Files**

- `packages/infrastructure-litellm/src/extractionAdapters.ts` (625 lines, 8 classes)
- `packages/infrastructure-litellm/src/enrichmentAdapters.ts` (231 lines, 3 classes)
- `packages/infrastructure-litellm/src/studyItemGenerationAdapters.ts`,
  `syntheticGenerationAdapters.ts`, plus the judge adapters (~20 adapter classes total)
- `packages/infrastructure-litellm/src/toolSchemas.ts` (456 lines)
- `apps/kg-worker/src/knowledgeGraphWorker.ts:71` (`PIPELINE_CONFIG_HASH = "definition-quality-judge-v38"`),
  `:240` (`STUDY_ITEM_BANK_CONFIG_HASH = "study-item-bank-v1"`)

**Problem**

Each LLM adapter class is the same shape: `constructor(client, model)` + one method that renders a
system prompt, renders a user prompt, calls `client.call({model, messages, toolName,
toolDescription, parameters, validator, tags})`, and maps the result. The deep behaviour (retry,
fail-closed validation, redacted failure trail, NUL stripping, spend tagging) already lives in one
deep module, `LiteLlmForcedToolClient`. What each adapter *adds* is knowledge — prompt, schema,
alias, stage tag — but that knowledge is scattered: schema in `toolSchemas.ts`, prompt in the
adapter, alias constant at the top of the adapter file, stage tag in `domain-core`, catalog entry
in `operationTimelineCatalog.ts`, wiring in the worker. Adding one neural stage today touches ~6
files.

Compounding it: the configuration identity that makes Extraction Runs attributable (ADR-0017) is a
hand-bumped string in the worker. Forgetting the bump after a prompt edit silently attributes new
runs to a stale configuration — a human-memory invariant guarding a provenance guarantee.

**Solution**

One descriptor module per LLM operation — `{alias, toolName, toolDescription, schema (or schema
builder), validator, stageTag, renderSystem, renderUser, mapResult}` — executed by one generic
forced-tool adapter. The existing per-judgment **ports stay** (they are the test surface and the
application-facing seam); only the adapter-class ceremony collapses. The pipeline config hash is
then derived mechanically by hashing the descriptor set + model aliases, so "bump on change"
becomes automatic (rule 18: the hash is currently a hand-maintained second representation of the
descriptor state).

**Benefits**

- **Locality**: everything that defines one neural stage lives in one descriptor file; a prompt
  edit, schema change, and its config-identity consequence happen in one place.
- **Leverage**: a new stage is one descriptor + one port + one catalog entry, not six touchpoints.
- **Correctness**: the silent stale-hash misattribution class disappears.

**Caveats / constraints**

- ADR-0006 fully preserved: schemas stay single-sourced from zod; `toForcedToolSchema` seam
  unchanged; fail-closed unchanged.
- Runtime-bounded schemas (`buildPrerequisiteOrderingSchema(n)`) mean the descriptor must accept
  schema *builders*, not just static schemas.
- Rule 17 (domain-neutral prompts) is orthogonal — prompts move, they don't change.
- Honest sizing: prompts dominate these files and cannot shrink; the win is knowledge
  consolidation and the mechanical hash, not line count.

**Before / after**

```
Before:  stage knowledge = adapter class + toolSchemas entry + alias const + STAGE_TAGS
         + catalog entry + worker wiring + hand-bumped config hash        (6–7 sites)
After:   stage knowledge = descriptor module (+ port + catalog entry)
         config hash = hash(descriptors)                                  (mechanical)
```

---

## Candidate 4 — Give `domain-core` and `ports` internal structure

**Recommendation strength: Worth exploring**

**Files**

- `packages/domain-core/src/index.ts` (1,658 lines, one file)
- `packages/ports/src/index.ts` (995 lines: 32 port interfaces + ~30 Inspection Read Model types)

**Problem**

Both packages are single-file barrels commingling unrelated concerns: extraction types, enrichment
and Derived Graph Layer types, Learner State and study types, operation-timeline types, and the
`STAGE_TAGS` vocabulary all share one file. The interface (what a consumer imports) is fine-grained
and typed, but the *implementation surface for maintainers* is a 1,600-line scroll: every edit
navigates the whole domain. Precedent for structure already exists — `domain-core` ships subpath
modules (`@lrnki/domain-core/operation-tag-context`).

**Solution**

Split each package internally into concern-scoped files (extraction, graph version, enrichment /
derived layer, study assets, learner state, operation timeline) re-exported from the existing
barrel so all import specifiers stay unchanged. Pure file moves, no type changes.

**Benefits**

- **Locality** for maintainers and AI navigation: "the enrichment types" becomes a file, not a
  line range; diffs and reviews scope to a concern.
- Makes the concern clusters visible, which is groundwork if package-surface pruning ever extends
  to these packages.

This is navigability, not behaviour — hence not Strong. It is cheap and zero-risk.

---

## Candidate 5 — Group `runGraphEnrichment`'s port sprawl behind its sub-orchestrator seams

**Recommendation strength: Speculative**

**Files**

- `packages/application/src/runGraphEnrichment.ts:126-176` (input object: ~12 ports + config +
  summary callbacks)
- `packages/application/src/enrichmentNodeMinting.ts`, `deduplicateDerivedNodes.ts`

**Problem**

The use-case's interface exposes every inner dependency flat: rescue/minting durability judges,
missing-prerequisite proposal, grounding generation, embedding, merge adjudication, ordering,
difficulty, stores. Groups of these always travel together into the same sub-orchestrator
(`assembleEnrichmentNodes` takes the rescue/mint/proposal/grounding cluster;
`deduplicateDerivedNodes` takes embedding + adjudicator). A caller must understand 12 dependencies
to wire one operation.

**Solution**

Shape the input as aggregates mirroring the sub-orchestrations (e.g. a node-assembly group, a
dedup group), so the use-case interface states *what varies together* instead of a flat list.

**Why only Speculative**

Wiring happens exactly once, in the worker's composition root, and each port is genuinely
independent behaviour (several are opt-in for baselines). The sprawl is real but the leverage is
low; grouping adds a layer whose deletion test is uncertain. Revisit if a second composition root
(Learner App backend) appears — two adapters would make the grouping a real seam.

---

## Examined and rejected

Recorded so a future review doesn't re-surface them.

- **Unify the six judgment ports behind one "judgment orchestrator".** Rejected: each port has a
  distinct domain input shape and is the test surface for its application stage; the shared
  behaviour (retry, validation, redaction) is already deep in `LiteLlmForcedToolClient`. The
  claimed per-adapter retry duplication does not exist. Candidate 3 captures the real residue.
- **Postgres adapters "split by feature epoch, not seam".** Rejected: the store/read split follows
  ADR-0027 (write stores vs Inspection Read Model ports) and is principled. Only minor row-mapping
  repetition exists; not worth a candidate.
- **Stage-name strings duplicated across vocabulary/catalog/worker.** Refuted:
  `operationTimelineCatalog.ts` composes the `STAGE_TAGS` constants — one source of truth; the
  same-change registration rule is ADR-0029 by design. (Candidate 3's mechanical hash is the only
  real single-source gap found in this area.)
- **`LearnerStatePort` as a hypothetical seam (one adapter, mock-only).** True by the "one adapter
  = hypothetical seam" principle, but the deferral is a recorded decision (ADR-0024); the port is
  the deliberate placeholder for IRT/KT. Do not re-suggest.
- **Worker `buildContext` as pass-through wiring.** Rejected: it is the composition root;
  explicit, commented wiring is its job (ADR-0001 explicit ports).
- **Tests reaching past interfaces.** Refuted: 46 test files over 50 application modules, testing
  through module interfaces; `runProgressReporter`'s no-op/passthrough fakes are the seam working
  as intended.

## Already deep — keep as exemplars

- `LiteLlmForcedToolClient.call` — retry, fail-closed validation, redacted failure trail, NUL
  stripping, spend tagging behind one method (ADR-0006 made deep).
- `runInstrumentedOperation` + `bracketStage` — operation lifecycle and stage failure semantics in
  one place.
- `getStudySession` — five ports in, one pure composition out; the ADR-0027 projection pattern.
- Admin Lab `src/lib` — thin delegation to application use-cases and read ports; passes the
  deletion test the right way around (ADR-0011 held).

---

## Top open recommendation

**Candidate 3** is now the largest open win, but it needs a grilling pass over the descriptor
interface (schema builders, per-call `maxRetries`, model-alias overrides) before it is plannable.
