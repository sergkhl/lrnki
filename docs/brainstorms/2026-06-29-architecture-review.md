# Architecture Review — 2026-06-29

Surfaced by `improve-codebase-architecture`. Each candidate is a **deepening**: turn a shallow
module into a deep one for **locality** and **leverage**.

Architecture terms use the skill vocabulary: **module**, **interface**, **implementation**,
**depth**, **deep**, **shallow**, **seam**, **adapter**, **leverage**, **locality**.
Domain terms use [CONTEXT.md](../../CONTEXT.md): **Graph Enrichment**, **Graph-Version Build**,
**CEP**, **Derived Graph Layer**, **Study Item Bank**, **Concept Lesson**, **Learner State**.

Legend: solid box = module · dashed line = seam · red edge = leakage · dark box = deep module.

## Candidate 1 — Extract the Graph Enrichment consensus-ordering module

`Strong` · `in-process`

**Files**

- `packages/application/src/runGraphEnrichment.ts`
- `packages/application/src/prerequisiteDag.ts`
- `packages/ports/src/index.ts`

**Problem** — Graph Enrichment is shallow here: the operation interface also owns the whole
consensus-ordering implementation.

**Solution** — Deepen the ordering policy into one module that turns ordered draws into committed,
uncertain, weak-cut, and trace records.

**Before**

```mermaid
flowchart TB
  O["runGraphEnrichment<br/>large operation interface"]
  O --> A["prepare evidenced nodes"]
  O --> B["K draws per Declared Domain"]
  O --> C["map numbers to derived ids"]
  O --> D["inline Tally type"]
  O --> E["direction contest policy"]
  O --> F["weak-cut + cycle-route loop"]
  F -. red leakage .-> P["prerequisiteDag<br/>leaf primitives"]
  classDef leak stroke:#dc2626,stroke-width:2px;
  class B,C,D,E,F leak;
```

**After**

```mermaid
flowchart TB
  O["runGraphEnrichment<br/>sequence operation"]
  O --> D["deriveConsensusOrdering<br/>draws to tally to routing"]
  D --> P["prerequisiteDag<br/>symbolic primitives"]
  D --> T["ordering trace<br/>certain + uncertain + weak"]
  classDef deep fill:#0f172a,color:#fff,stroke:#0f172a,stroke-width:3px;
  class D deep;
```

**Benefits**

- locality: one ordering policy
- leverage: one replay surface
- orchestrator stops tallying
- tests hit one interface

## Candidate 2 — Extract the Graph-Version publication assembly module

`Strong` · `in-process`

**Files**

- `packages/application/src/buildGraphVersion.ts`
- `packages/application/src/resolveConceptIdentity.ts`
- `packages/infrastructure-postgres/src/PostgresStores.ts`

**Problem** — Graph-Version Build mixes orchestration with publication assembly, so the pure policy
has poor locality.

**Solution** — Deepen publication assembly behind one pure module; the use-case loads, calls it, then
persists.

**Before**

```mermaid
flowchart TB
  B["buildGraphVersion"]
  B --> L["load selected runs and base graph"]
  B --> Q["quarantine gates"]
  B --> I["identity remap and clusters"]
  B --> H["homograph flags and IRI minting"]
  B --> C["CEP evidence union"]
  B --> T["trust-tier finalization"]
  B --> A["artifact and persistence handoff"]
  classDef leak stroke:#dc2626,stroke-width:2px;
  class I,H,C,T,A leak;
```

**After**

```mermaid
flowchart TB
  B["buildGraphVersion<br/>loads inputs"]
  B -. seam .-> S["assemblePublishedGraphSnapshot<br/>identity remap + CEP union + trust tiers + IRI minting"]
  S -. seam .-> P["GraphVersionStore adapter<br/>atomic publish"]
  classDef deep fill:#0f172a,color:#fff,stroke:#0f172a,stroke-width:3px;
  class S deep;
```

**Benefits**

- locality: publication policy
- leverage: pure replay tests
- CEP union isolated
- IRI minting contained

## Candidate 3 — Single-source bounded concurrent fan-out

`Worth exploring` · `local-substitutable`

**Files**

- `packages/application/src/mapWithConcurrency.ts`
- `packages/application/src/executeExtractionRun.ts`
- `packages/application/src/applyAdmissionLabelJudge.ts`
- `packages/application/src/applyAssertionEntailmentJudge.ts`
- `packages/application/src/applyDefinitionPassageQualityJudge.ts`
- `packages/application/src/applyRescuedDefinitionQualityJudge.ts`
- `packages/application/src/applyRescueDurabilityJudge.ts`

**Problem** — Seven bounded-map implementations carry nearly the same interface, but their edge
behavior can drift.

**Solution** — Use one tested fan-out module and keep each caller's fail-open or fail-closed policy
beside the domain transform.

**Before**

```mermaid
flowchart TB
  S["shared mapWithConcurrency<br/>tested"]
  A["admission label local copy"]
  B["assertion entailment local copy"]
  C["definition quality local copy"]
  D["rescued definition local copy"]
  E["rescue durability local copy"]
  F["extraction CEP local copy"]
  A -. drift .-> S
  B -. drift .-> S
  C -. drift .-> S
  D -. drift .-> S
  E -. drift .-> S
  F -. drift .-> S
  classDef leak stroke:#dc2626,stroke-width:2px;
  class A,B,C,D,E,F leak;
```

**After**

```mermaid
flowchart TB
  M["boundedFanOut module<br/>ordering + limit + errors"]
  A["admission label policy"] --> M
  B["assertion entailment policy"] --> M
  C["definition quality policy"] --> M
  D["rescue durability policy"] --> M
  E["extraction CEP policy"] --> M
  classDef deep fill:#0f172a,color:#fff,stroke:#0f172a,stroke-width:3px;
  class M deep;
```

**Benefits**

- locality: concurrency semantics
- leverage: one test surface
- removes deferred copies
- failure ordering explicit

## Candidate 4 — Slice package barrels by project concepts

`Worth exploring` · `in-process`

**Files**

- `packages/domain-core/src/index.ts`
- `packages/ports/src/index.ts`
- `packages/application/src/index.ts`

**Problem** — The package entrypoints are shallow: their interface exposes almost every project
concept at once.

**Solution** — Move source, extraction, publication, enrichment, study, lesson, and operation facts
into concept-owned modules.

**Before**

```mermaid
flowchart TB
  I["domain-core / ports / application entrypoints"]
  I --> S["source docs"]
  I --> D["Candidate Discovery"]
  I --> A["Concept Admission"]
  I --> C["CEP"]
  I --> G["Graph-Version Build"]
  I --> E["Graph Enrichment"]
  I --> B["Study Item Bank"]
  I --> L["Concept Lesson"]
  I --> R["Learner State"]
  I --> O["operation stages"]
  classDef leak stroke:#dc2626,stroke-width:2px;
  class I leak;
```

**After**

```mermaid
flowchart TB
  X["small package entrypoint"]
  X --> S["source normalization module"]
  X --> D["Extraction Run module"]
  X --> G["Graph-Version Build module"]
  X --> E["Graph Enrichment module"]
  X --> B["Study Item Bank module"]
  X --> L["Concept Lesson module"]
  classDef deep fill:#0f172a,color:#fff,stroke:#0f172a,stroke-width:3px;
  class X deep;
```

**Benefits**

- locality: concept facts
- leverage: smaller imports
- AI navigation improves
- barrels stop leaking

## Candidate 5 — Deepen forced-tool adapter execution

`Speculative` · `ports & adapters`

**Files**

- `packages/infrastructure-litellm/src/extractionAdapters.ts`
- `packages/infrastructure-litellm/src/enrichmentAdapters.ts`
- `packages/infrastructure-litellm/src/dedupAdapters.ts`
- `packages/infrastructure-litellm/src/groundingGenerationAdapters.ts`
- `packages/infrastructure-litellm/src/studyItemGenerationAdapters.ts`
- `packages/infrastructure-litellm/src/conceptLessonGenerationAdapters.ts`
- `packages/infrastructure-litellm/src/intrinsicDifficultyAdapters.ts`

**Problem** — The forced-tool adapters repeat execution scaffolding, while the valuable
implementation is the prompt and mapping.

**Solution** — Deepen the repeated execution path and leave each adapter to own only its prompt,
schema choice, and result mapping.

**Before**

```mermaid
flowchart TB
  A["adapter A<br/>prompt + envelope + tag + map"]
  B["adapter B<br/>prompt + envelope + tag + map"]
  C["adapter C<br/>prompt + envelope + tag + map"]
  D["adapter ..."]
  A --> L["LiteLlmForcedToolClient"]
  B --> L
  C --> L
  D --> L
  classDef leak stroke:#dc2626,stroke-width:2px;
  class A,B,C,D leak;
```

**After**

```mermaid
flowchart TB
  E["forcedToolExecution module<br/>model + tool + schema + tag"]
  A["adapter A<br/>prompt + mapping"] --> E
  B["adapter B<br/>prompt + mapping"] --> E
  C["adapter C<br/>prompt + mapping"] --> E
  E --> L["LiteLlmForcedToolClient"]
  classDef deep fill:#0f172a,color:#fff,stroke:#0f172a,stroke-width:3px;
  class E deep;
```

**Benefits**

- leverage: one caller path
- locality: tag semantics
- prompts remain visible
- less adapter boilerplate

## Top Recommendation

Start with **Candidate 1 — Extract the Graph Enrichment consensus-ordering module**.

It is the highest-leverage deepening: real policy is already concentrated in one dense block, tests
would gain one replayable interface, and the operation module would stop owning the consensus
implementation.
