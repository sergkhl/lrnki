<!--
Plan hygiene: keep this plan under about 800 lines and its Validation Log under about 200. Append
within the active unit, consolidate each closed unit to one entry, re-home every durable fact before
closure, keep exactly one Open findings section, and never link tracked documentation to tmp/.
-->

# Re-author three-Leg Expeditions from online research

- **Status:** Complete; Units 1–9 and the exit test pass.
- **Priority:** 1; this is the only active implementation plan.
- **Execution:** One sequential, exclusive implementation lane in catalog order.
- **Review:** Every Expedition requires a fresh-context reviewer who did not author it.
- **Scope:** Replace all five current routes and the primer/anchor contract atomically.
- **Owner gates:** None active; physical-device, deployed, production, migration, and release work
  remain out.
- **Completed:** Unit 1 established the final schema-v2 contract. Unit 2 Critical Thinking revision
  `dc27a6435197ed6923243fcec3c02bbcb99e195a6adbb529b24f224c56e55b43`, Unit 3 Probability and
  Statistics revision `9be3bb797b672f3f577daf63b4eab5a8d54aacfa9a1bd84d465cacca977978d1`,
  Unit 4 Personal Finance revision `767d26bc0794a061f447147af5614fbba945aad06d7253693f493893c7452f9a`,
  Unit 5 Machine Learning revision `60366ccf1de0448021bce06437bb642cdf3e2f81abd779834d561b4d140e4e82`,
  and Unit 6 Neuroscience revision `07bd08f859242913a8f1d01bfc2f022482755c240e5e01af223df285340feca3`
  passed complete learner/private-source review after every finding was repaired. Unit 7 cut over
  the five exact documents atomically; Unit 8 passed every required final evidence class; Unit 9
  reconciled their retained status and evidence.
- **NEXT:** Archive this committed final record by deleting it and its ordered-index entry in a
  separate lifecycle-closure commit.
- **Exit:** Passed. All five reviewed documents, the atomic cutover, and the required evidence pass
  with `Open findings: _None._`; every durable rule is in its canonical home.

## Problem

The catalog is structurally valid but not acceptable as the intended Learner experience. At the
planning baseline, `pnpm content:check` accepts catalog revision
`80a6483fefded4030b69f6c699e44a5f19071aef0b0e559f70de3f72b009a87b`: five Expeditions, one Leg and
three Stops each, 18 Lesson sections, and 26 Activities. That proves the current schema, keys,
references, exact primer excerpts, and learner-safe projection. It does not prove that Lessons teach
before grading, distractors diagnose mastery, Support repairs confusion, Guardians protect the
claimed objective, or the route has enough breadth and pacing.

A fresh direct inspection found `FIX_FIRST` material in every current Expedition while also
confirming that the answer keys are materially correct, matching boards are bijections, impostor
boards have one false statement, and the small routes are technically completable:

| Expedition | Current shape | Representative learner-quality failures |
|---|---:|---|
| Critical Thinking | 1 Leg, 3 Stops, 6 Lesson sections, 6 Activities | Causal reasoning is graded before its Lesson; source excerpts under-support combined claims; the final nominally harder Stop has one near-copy question. |
| Probability and Statistics | 1 Leg, 3 Stops, 3 Lesson sections, 5 Activities | `statistic`, independence, and mutual exclusivity are graded before teaching; one Support destination does not repair conditional-denominator confusion; linear prerequisites are not necessary. |
| Personal Finance | 1 Leg, 3 Stops, 3 Lesson sections, 5 Activities | One Support destination rehearses liquidity rather than cash-flow meaning; combined diversification/product teaching is not covered by its Activity or Guardian; source excerpts are too narrow. |
| Machine Learning | 1 Leg, 3 Stops, 3 Lesson sections, 5 Activities | Prediction-unit and horizon meanings are graded after being named but not taught; dense sections combine framing, evaluation, policy, and monitoring claims under narrow evidence. |
| Neuroscience of Memory and Attention | 1 Leg, 3 Stops, 3 Lesson sections, 5 Activities | All eight exact excerpts resolve but are too narrow for the nearby claims; obvious extreme distractors permit test-taking shortcuts; large parts of memory formation and retrieval are absent. |

The current architecture already has the right runtime boundary: Codex CLI is an offline author and
the server consumes the exact tracked `expedition.json`. There is no build-time or runtime model
generation to retire. The remaining defect is the content authority and authoring method:

- a single project-written `source.md` primer constrains and duplicates the subject basis;
- byte-exact excerpt existence is easy to qualify but has repeatedly been mistaken for semantic
  support;
- three-Stop routes compress broad domains into dense recognition exercises;
- the author has been able to accept its own work without a learner-blind review pass; and
- source disclosure is catalog-level only, so a Learner cannot inspect which sources support a
  Lesson or post-answer explanation.

## Intended outcome

The catalog still contains the same five Expedition keys in the same order, but every Expedition is
re-authored as a coherent adult-learning journey from fresh online research. Each one owns exactly
three Legs; each Leg owns four to seven Stops, producing 12–21 Stops per Expedition without a second
ten-Stop rule. Routes, Activities, Support Paths, difficulty, and Guardian pools are designed from
mastery objectives rather than preserved from the current three-Stop skeleton.

Each final `expedition.json` is self-contained. It owns one keyed collection of learner-visible
online source credits and explicit source-credit references from every Lesson section and every
answer explanation. `source.md`, exact source excerpts, primer-byte identity, and the source-file
loader disappear. Codex may browse while authoring or reviewing, but the repository contains no
model client, model port, prompt, generator, compiler, source fetcher, or build/runtime network
dependency.

Every Expedition goes through its own authoring pilot and a fresh-context reviewer-as-Learner
simulation. The reviewer first experiences only learner-safe material, then inspects private grading
and the online evidence. It reports `FIX_FIRST` findings, the author repairs them, and the reviewer
must re-pass the exact candidate. General lessons are consolidated into concise rules in
`content/AUTHORING.md` before the next Expedition is authored; a later rule is also re-applied to
already reviewed candidates before the atomic cutover.

Learners retain an Expedition-level bibliography and gain compact source expanders on each Lesson
section and each post-answer explanation. Citation affordances remain out of pre-answer Activity
content and do not expose answer keys, pair maps, impostor truth kinds, private explanations, or
server content objects.

## Requirements and boundaries

### In scope

- Preserve catalog order and the five stable Expedition keys: Critical Thinking, Probability and
  Statistics, Personal Finance, Machine Learning, and Neuroscience of Memory and Attention.
- Re-author every Leg, Stop, Lesson, Activity, prerequisite, difficulty band, Support Path, and
  Guardian pool. An existing asset may survive only if it independently passes the new review; the
  plan does not protect current internal keys or route shape.
- Enforce exactly three Legs per Expedition and four to seven Stops per Leg in the one production
  schema and qualifier, with intended-behavior negative controls.
- Replace primer/excerpt provenance with keyed online source credits embedded in the exact runtime
  document and referenced by every Lesson section and answer explanation.
- Preserve one all-or-nothing content qualifier for authoring, CI, tests, and learner-api startup.
- Extend learner-safe DTOs and Expo presentation with accessible, compact source disclosure at the
  Expedition, Lesson-section, and post-answer explanation levels.
- Amend current ADRs in place, delete obsolete decisions and definitions, and repair every inbound
  reference. Git history is the archive; no superseding ADR or deprecated stub is created.
- Use guarded resets only for owned local development and test databases before fresh real-backend
  validation.
- Validate the final reviewed content through direct source/teaching inspection, local automated
  checks, intercepted web, real-backend web, Android emulator, and iOS Debug simulator evidence.

### Out of scope

- New catalog subjects, reordered catalog membership, arbitrary user-supplied sources, or a general
  ingestion/publication system.
- A model SDK, Codex API client, prompt file, model port, runtime flag, background author, build-time
  generation, or compatibility shim.
- A tracked research packet, copied web pages, quote archive, `source.md` replacement file, compiled
  content package, database content representation, or any second tracked Expedition authority.
- Deterministic claims about semantic truth, teaching sufficiency, source authority, distractor
  plausibility, or enjoyment.
- New mastery, grading, reward, leaderboard, calibration, recovery, or Guardian mechanics except
  changes required to present and traverse the re-authored three-Leg content correctly.
- Learner-progress migration, compatibility reads, shared/deployed/production resets, deployment,
  release, distributable artifacts, or physical-device acceptance.

## Design

### 1. One self-contained researched Expedition document

`content/catalog.json` continues to own membership and order. Each
`content/expeditions/<expedition-key>/expedition.json` becomes the only tracked authority for that
Expedition's runtime content and source disclosure. The breaking authored-document schema advances
once; there is no reader for the old shape.

Keep the existing `sourceCredits` concept and deepen it rather than creating a parallel bibliography
model. Each credit has:

- a human-readable authored `key`;
- a learner-readable `title`;
- one canonical, publicly reachable HTTPS `url` or durable-identifier URL;
- `author` and/or `publisher` sufficient to identify the authority;
- `publishedAt` and/or `version` when the source exposes one;
- an authored `accessedAt` date for the exact review pass;
- optional `license` only when the source declares one; and
- an optional concise `note` for scope, uncertainty, or a learner-facing disclosure.

Every Lesson section and Activity explanation owns a non-empty ordered `sourceCreditKeys` array.
The qualifier proves keys are unique, resolve inside that Expedition, use the exact final shape, and
are learner-safe. It rejects an unreferenced source credit so the list cannot become an unaudited
dump. It does not fetch a URL, compare page text, or declare that a source supports a claim.

Prefer open, stable, original or official sources and authoritative syntheses. Primary research is
not automatically more teachable or more reliable than a current systematic review, consensus
statement, official standard, regulator explanation, or openly licensed textbook. Source choice is
a judgment against the exact claim. Personal Finance needs current regulator, central-bank,
consumer-protection, or comparably authoritative material and must remain general education rather
than personal advice. Neuroscience needs current peer-reviewed evidence or responsible synthesis and
must not turn mechanism into clinical advice. If the best technical source is paywalled, provide an
accessible authoritative source that lets a Learner inspect the material distinction.

Do not copy source passages into the JSON. Authored teaching remains original prose. A link being
reachable during review is evidence for that review date, not a promise that the web page can never
move. Link availability is never a learner-api startup dependency.

Canonical Content Revision hashes the semantic Expedition document, including source-credit
metadata and every reference assignment. It changes when teaching, answers, order, route,
difficulty, Support, Guardian pools, credits, or their use changes; it still ignores JSON property
order and formatting. Primer bytes no longer participate because no primer exists.

### 2. Three Legs with four to seven Stops each

Every Expedition has exactly three learner-visible Legs. Every Leg has four to seven Stops, so an
Expedition has 12–21 Stops. The schema hard-refuses two or four Legs and three or eight Stops in a
Leg. No separate total-Stop minimum or target is needed.

The three Legs are meaningful mastery arcs, not equal-sized storage buckets. Each has a distinct
learner-visible goal, a plausible challenge curve, and a Guardian pool that represents the mastery
that Leg claims. The final Guardian continues to require first wins over all three winnable Leg
Guardians. A prerequisite is authored only when the later Stop genuinely depends on the earlier
objective; array order supplies instructional order without forcing a decorative linear chain.

Every Stop still teaches before it grades, includes at least one option-select Activity, and uses
matching or impostor play where it adds diagnostic value. Each Leg includes matching or impostor
play available to its Guardian, and the Expedition Guardian exercises all three families. One
Activity per Stop is a schema floor, not an acceptance argument. A Lesson ordinarily needs separate
sections for the core idea, a worked recognition/application contrast, the likely misconception,
and the decision consequence, but section or word counts never substitute for direct judgment.

Distractors must be plausible under a named misconception and comparable enough in length, tone,
and qualification that a Learner cannot win by rejecting absolutes or selecting the longest answer.
Matching boards test a meaningful relationship rather than glossary elimination. An impostor reveal
explains why the false statement fails and why the truths remain bounded. Guardian pools prefer
transfer and retrieval over immediate repetition of the easiest acquisition prompt.

Support is authored after likely local confusions are known. An Explorable Term is precise enough to
name a confusion, and its referenced option-select Activity must repair that confusion rather than
merely share vocabulary or provide convenient reuse.

### 3. Sequential online authoring and independent learner simulation

Author in catalog order. Each Expedition is a complete pilot, not a bulk-generated installment:

1. The author researches the declared domain online, selects and records source credits, maps three
   mastery Legs, and authors the exact final document directly.
2. The author performs a private self-check for source fit, key correctness, teach-before-grade,
   route closure, Support usefulness, Guardian coverage, and learner-safe projection. Self-check
   cannot issue the final semantic `PASS`.
3. A fresh-context reviewer who did not author the candidate receives the learner-safe projection
   first. It reads Lessons in playable order, records an answer and rationale before reveal, notices
   whether cues or prior knowledge replace teaching, follows plausible wrong-to-correct paths,
   opens Support at real confusions, and evaluates pacing and Guardian repetition as a Learner.
4. The reviewer then receives the private document and opens every cited online source. It inspects
   every learner-visible material claim, answer, distractor, explanation, matching pair, impostor
   truth/reveal, prerequisite, Support destination, difficulty step, Leg pool, and Expedition pool.
5. The reviewer records `PASS` or concrete `FIX_FIRST` findings in this plan; it does not create a
   parallel report. The author repairs every finding, and the same review boundary re-runs on the
   exact repaired candidate.
6. Generalizable findings become concise, deduplicated instructions in `content/AUTHORING.md`
   before the next Expedition begins. Case-specific defects stay in the plan until repaired. A new
   rule discovered later triggers a focused re-audit of every earlier candidate it can affect.

Candidate JSON and transient review material may live in gitignored scratch while the breaking
catalog is assembled, but they are the exact future document rather than a new format. No tracked
document may link to scratch, and no candidate tree, review report, or source cache survives the
atomic cutover. Do not land a mixed old/new catalog or a dual-version compatibility reader.

### 4. Learner-visible source disclosure without answer leakage

Retain the Catalog's accessible `Sources` entry point and render the expanded source-credit metadata
as normal learner copy with descriptive external-link labels. Add a compact `Sources` expander to
each Lesson section. Add the same affordance to an Activity explanation only after grading has
revealed that explanation.

The learner-safe projection may expose public credit metadata and source-credit references; it must
not expose internal lookup objects, answer keys, impostor truth kinds, matching pair maps, or an
unrevealed explanation. The app resolves authored keys through the typed learner-api DTO rather than
importing learner-runtime or content documents. Source links open only on explicit Learner action;
rendering a Lesson or answer never fetches the source.

The source UI must remain readable at compact phone widths, keyboard/screen-reader operable on web,
semantically labeled on native, and equivalent under reduced motion. Citation detail must not crowd
the primary Continue/answer/recovery action or become a parallel game objective.

### 5. In-place durable policy update and atomic retirement

Do not add a superseding ADR. Amend the still-current decisions in place and rely on Git history for
their old text:

- [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md) changes from exact local-primer
  inspection to direct inspection of online evidence and the authored teaching/answer relationship.
- [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md)
  clarifies that three Legs and four-to-seven Stops are structural product constraints, not semantic
  quality proxies.
- [ADR-0031](../adr/0031-concept-lesson-teaching-substrate.md) retains teach-before-grade while
  replacing exact excerpt anchors with source-credit references and independent judgment.
- [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md) owns the durable
  exactly-three-Leg, four-to-seven-Stop pacing decision and independent reviewer-as-Learner loop.
- [ADR-0042](../adr/0042-author-expeditions-directly-without-runtime-models.md) retains Codex CLI as
  an offline author while removing the primer, source-byte revision, and source-file authority.

Update the ADR index labels if titles change. No current ADR becomes wholly obsolete on the known
design; if implementation proves otherwise, delete that ADR, repair inbound links in the same
change, and retain its history only in Git.

Update `AGENTS.md`, `CONTEXT.md`, the root `README.md`, `content/AUTHORING.md`, the authored-quality
validation reference, runtime source comments/types, UI copy, tests, and coordination status. Remove
operative definitions of `source.md`, project-owned primer, byte-exact source anchor, primer-byte
Content Revision, one-to-three-Stop playtest catalog, and author self-acceptance. Historical facts in
Git are not copied into current documentation.

### 6. Revision and reset boundary

The full rewrite changes every Content Revision. Preserve fail-closed mismatch behavior and do not
map old Stops, attempts, calibration, Support state, Guardians, awards, or receipts into the new
routes. Before database-backed real use, resolve the exact owned endpoint and counts and use only the
guarded local/test reset commands already owned by the repository. A shared, deployed, or production
reset is not authorized by this plan.

No Drizzle schema or migration is expected. If implementation discovers a persisted-shape change,
record it as an Open finding and stop that expansion rather than silently broadening this plan.

## Rejected alternatives

- **Keep `source.md` only for audit:** rejected because it remains a second subject authority and
  preserves the same primer/excerpt failure under a different claim about generation.
- **Rely on Codex memory with no evidence:** rejected because authorship mechanism is not factual or
  teaching-quality evidence, especially for financial, statistical, machine-learning, and
  neuroscience claims.
- **Store copied web pages or exact quotes:** rejected because it recreates a source packet, adds
  licensing/staleness costs, and makes excerpt existence look like semantic approval again.
- **Exactly ten Stops or two five-Stop Legs:** rejected in favor of exactly three meaningful Legs
  with four to seven Stops each, yielding 12–21 Stops without padding to one uniform count.
- **Mechanically expand the current routes:** rejected because every current Expedition contains
  `FIX_FIRST` material and overloaded boundaries; old internal assets earn reuse only by passing the
  new review.
- **Let the author accept its own Expedition:** rejected because the current catalog passed that
  loop while retaining teach-before-grade, evidence, Support, challenge, and breadth defects.
- **Encode semantic heuristics as deterministic truth:** rejected; counts enforce only exact product
  structure, while source support, teaching, distractors, pacing, and enjoyment remain direct
  judgments.
- **Migrate old learner progress:** rejected because this is a greenfield total rewrite and guarded
  owned resets are cheaper and safer than false equivalence between different mastery routes.
- **Require all five complete UI journeys or a physical-device gate:** rejected as disproportionate
  after every asset has independent learner simulation and deterministic coverage. Bounded web and
  native evidence remains required and explicitly qualified.
- **Create a superseding ADR chain:** rejected by the requested current-policy model; obsolete text
  disappears from current ADRs and remains retrievable through Git.

## Ordered implementation units

Units are sequential and exclusive. Units 1–6 prepare one atomic breaking catalog cutover; they must
not be exposed as a mixed live authority. After every bounded batch, synchronize this plan's status,
the ordered index, and `TODO.md`, and keep findings only in the one section at the end.

### Unit 1 — Build the final contract in the isolated implementation lane

Implement the single final authored-document schema, source-credit/reference qualification,
canonical revision identity, loader input, learner-safe projection, and focused negative controls.
Remove rather than adapt any candidate design that would require a v1/v2 compatibility reader,
source fetcher, or second tracked representation. Use an exact candidate fixture to exercise the
new pure seam while the full catalog is being authored; do not treat the current root catalog as
green until Unit 7.

Acceptance criteria:

- Focused tests accept exactly three Legs with four-to-seven Stops and refuse 2/4 Legs and 3/8
  Stops with intended diagnostic codes.
- Focused tests accept valid keyed online credits and refuse malformed/non-HTTPS URLs, missing or
  duplicate keys, dangling references, unreferenced credits, and an empty reference list.
- Revision tests prove every semantic content, source-credit, and reference-assignment class changes
  identity while JSON formatting/property order does not.
- Projection tests prove Lesson citations are public, explanation citations appear only with a
  revealed explanation, and pre-answer correctness data remains absent.
- No build/runtime network call, model port/client, prompt, source-file loader, compatibility flag,
  or database content path is introduced.

### Unit 2 — Author and independently review Critical Thinking

Research a current, inspectable basis for argument structure, deductive and inductive reasoning,
evidence/source judgment, causal reasoning, recurring reasoning failures, calibration, and decisions.
Author three coherent Legs with four-to-seven Stops each. Treat the baseline cause-before-teaching,
obvious-distractor, narrow-final-challenge, and evidence-overcompression findings as known failure
classes rather than assets to preserve.

Run the full reviewer-as-Learner and private evidence pass. Repair every `FIX_FIRST`. Consolidate the
first generalizable review lessons into concise authoring rules before Probability and Statistics
begins.

Acceptance criteria:

- The exact candidate has three learner-visible mastery Legs, each with four-to-seven Stops, real
  prerequisite reasons, a plausible difficulty curve, useful Support, and representative Guardians.
- Every learner-visible material claim, answer, alternative, explanation, pair, impostor reveal, and
  pool is supported by its cited online evidence and passes the fresh reviewer.
- The learner-blind pass can reason from each Lesson without private keys and cannot win material
  Activities from option length, absolutist wording, or source disclosure.
- Critical-specific findings are repaired; reusable findings are concise rules ready for later
  candidates rather than a retained review report.

### Unit 3 — Author and independently review Probability and Statistics

Apply the accumulated rules, then research and author a route broad enough to teach data production
and description, probability and conditioning, random quantities/expectation, sampling variability
and inference, error/effect decisions, prediction, association, and causation without overloading one
Stop. Do not preserve the baseline untaught-statistic/independence boards, irrelevant linear gates,
or conditional-denominator Support defect.

Acceptance criteria:

- The exact candidate satisfies the same three-Leg, source, teaching, route, Support, challenge, and
  learner-safe review gates as Unit 2.
- Worked quantitative reasoning identifies the reference group, units, assumptions, and scope; a
  Learner is not graded on a named-but-untaught term or unexplained formula.
- The fresh reviewer issues `PASS` only after all findings are repaired.
- New general rules update the authoring instructions and trigger any necessary Critical Thinking
  re-audit before Personal Finance begins.

### Unit 4 — Author and independently review Personal Finance

Apply the accumulated rules, then research and author a general-education route covering the whole
financial position, goals/budgets, liquidity and time, inflation/compounding, borrowing/full cost,
risk and insurance, investing/diversification, and product/claim comparison with current authoritative
sources. Do not provide individualized advice or preserve the baseline cash-flow Support mismatch
and diversification Guardian undercoverage.

Acceptance criteria:

- The exact candidate satisfies the common three-Leg and independent review gates.
- Scenarios state the relevant horizon, assumptions, uncertainty, and jurisdiction/provider limits;
  no answer presents a universal product, reserve, debt, insurance, or investment prescription.
- Support and Guardians exercise the financial distinction they claim rather than vocabulary or a
  neighboring liquidity concept.
- New general rules are consolidated and retroactively applied before Machine Learning begins.

### Unit 5 — Author and independently review Machine Learning

Apply the accumulated rules, then research and author an applied supervised-learning route covering
decision/availability contracts, deployment-aligned evaluation and leakage, fitted preprocessing,
objectives/optimization, generalization/model selection, representative model families, metrics and
calibration, decision policy, subgroup behavior, shift, monitoring, and lifecycle response. Teach
technical terms and worked distinctions before grading them.

Acceptance criteria:

- The exact candidate satisfies the common three-Leg and independent review gates.
- Activities require operational reasoning across regression/classification, evaluation, model
  choice, and deployment rather than recognition of one obviously responsible policy.
- Claims name the source version/context where tool or practice guidance can drift; runtime content
  does not depend on those sources remaining online.
- New general rules are consolidated and retroactively applied before Neuroscience begins.

### Unit 6 — Author and independently review Neuroscience of Memory and Attention

Apply the accumulated rules, then research and author a cautious route covering evidence levels,
plasticity, attention and working-memory control, encoding and hippocampal organization,
consolidation/sleep, retrieval/reconsolidation, interference/forgetting, and responsible learning
design. Keep neural measurement, mechanism, cognitive operation, behavior, and educational design
distinct; do not make clinical claims.

Acceptance criteria:

- The exact candidate satisfies the common three-Leg and independent review gates.
- Sources and prose preserve uncertainty and level of explanation; a region, signal, or association
  is never presented as a sole cause or direct prescription without support.
- Activities use close, plausible mechanism-level alternatives rather than extreme overclaims.
- The final reviewer rules are consolidated; every earlier candidate is re-audited against any rule
  discovered in this last pilot, and all five exact candidates hold `PASS` together.

### Unit 7 — Land the atomic content, runtime, UI, ADR, and documentation cutover

Move the five reviewed exact documents into their canonical paths, update the catalog schema and
runtime seam, add the source expanders and typed DTOs, and delete every `source.md`, `sourceAnchor`,
source-byte loader/revision path, obsolete test fixture, and superseded current definition in the
same cutover. Amend the listed ADRs in place and update all canonical documentation. Do not retain
candidate or review artifacts.

Acceptance criteria:

- `pnpm content:check` accepts exactly five reviewed Expeditions, each with exactly three Legs and
  four-to-seven Stops per Leg, and prints one new catalog revision.
- Focused runtime/API/Expo tests pass the final tracked bytes, source presentation, private-grading,
  revision, route, Support, and Guardian contracts.
- Positive controls find the five canonical `expedition.json` files and the new credit/reference
  seam; absence checks find no operative `source.md`, primer, exact source-anchor, source-byte
  revision, old Leg-size rule, model/generation path, or second content representation.
- `AGENTS.md`, `CONTEXT.md`, ADRs/index, README, authoring guide, validation reference, source types,
  fixtures, and UI copy point to one current authority without restating one another.
- The worktree contains no tracked candidate tree, review report, source cache, generated package,
  content migration, database schema change, or unrelated file.

### Unit 8 — Validate reviewed content through the required evidence classes

Apply the authored-content quality route before every claim. Run direct evidence inspection on the
final tracked bytes, then deterministic, database, intercepted-web, real-backend-web, and focused
native validation. Preserve the first causal failure, repair it, and rerun only the affected and
downstream gates. Record what each class proves and does not prove.

Real-backend UI coverage is intentionally bounded after all five independent learner simulations:

- complete Critical Thinking end to end through all three Legs and the Expedition Guardian,
  including auth/profile, Lessons, every required Activity, wrong-to-correct behavior, Support,
  calibration/restoration, all Guardians, recovery/rematch/rewards, leaderboard, refresh/sign-in
  persistence, citations, and a second learner's isolation;
- before UI execution, freeze three of the other four reviewed Expeditions whose selected Legs
  jointly maximize distinct Activity-family, Support, citation, prerequisite, and Guardian shapes;
  complete one whole Leg through its Guardian in each; and
- qualify the fifth Expedition through its full reviewer simulation, direct private/source audit,
  structural/runtime execution, and intercepted presentation without pretending it received a
  real-backend UI Leg pass.

Required gates include:

- `pnpm content:check` and source/reference positive and negative controls;
- focused learner-runtime, learner-api, and learner-app tests while iterating;
- `pnpm check` and `pnpm test:db` on the final cutover;
- guarded owned local reset/preflight followed by `pnpm e2e:web:realuse` or a route-scoped extension
  that records the frozen flagship and three selected Leg scopes;
- intercepted phone and desktop proof for the Sources dialog, Lesson expanders, post-answer
  expanders, pre-answer privacy, three-Leg presentation, and compact navigation;
- a fresh Android emulator run and a separately identified iOS Debug simulator run focused on
  compact source presentation, three-Leg navigation, Support, and Guardian progression; and
- `git diff --check`, documentation/index invariants, plan/TODO size checks, and a final clean owned
  diff/status refresh.

Android emulator and iOS simulator results remain platform-specific Debug evidence. Do not add a
new automatic native authority claim without its owning negative-control and physical-pass contract.
Physical device, deployed routes, production, distributable artifacts, release, external-fact
generality, and arbitrary-source support remain explicitly unproved and unrequired.

### Unit 9 — Reconcile status and close by the plan exit test

Consolidate each completed unit's Validation Log to one retained entry. Move every durable rule to
its owning ADR, authoring guide, validation reference, runbook, source type, or self-explaining guard.
Resolve or re-home every Open finding. Update this header, the ordered index, and `TODO.md` at the same
altitude after each batch.

Acceptance criteria:

- Every unit is complete; all five exact documents retain independent `PASS`; required evidence is
  current for the final revisions; and `Open findings` is `_None._`.
- The plan, index, and TODO agree; `BLOCKERS.md` remains `_None._`; no `RELEASE.md` is created.
- The current completed outcome replaces the obsolete rolling three-Stop/primer validation summary
  without claiming deployment, production, physical-device, or arbitrary-source evidence.
- Once every durable fact is re-homed, close the plan under `plan-lifecycle`: commit the final plan
  record first, then delete it and its index entry in a separate plan-closure commit. Git history is
  the archive.

## Validation Log

### 2026-09-01 — Unit 1: final authored-document contract

- **Result:** Schema v2 requires exactly three Legs of four-to-seven Stops, keyed learner-visible
  HTTPS credits, non-empty Lesson/explanation references, document-only revisions, and no primer
  loader. Fourteen focused qualifier/runtime tests covered valid 4/7-Stop bounds, invalid route and
  credit shapes, semantic revision mutations, filesystem loading, learner-safe projection, graded
  citation reveal, and receipt replay; typecheck, focused lint, positive/absence controls, and
  `git diff --check` passed. This was local deterministic contract evidence only.

### 2026-09-01 — Unit 2: Critical Thinking independently passed

- **Result:** Revision `dc27a643…e55b43` owns three four-Stop Legs, 36 Lesson sections, 22
  Activities across all families, six Support Paths, and nine credits. A fresh-context reviewer
  solved all 22 Activities from the learner-safe projection before reconciling every private key,
  route, Guardian membership, explanation, and exact source; unsupported rules, cueing,
  prerequisites, transfer cases, and source fit were repaired before exact-candidate `PASS`.
  Focused qualification/runtime checks passed; no rendered, backend, native, or external claim was
  made by this unit.

### 2026-09-01 — Unit 3: Probability and Statistics independently passed

- **Result:** Revision `9be3bb79…7978d1` owns three four-Stop Legs, 36 Lesson sections, 24
  Activities, six Support Paths, and 17 credits. A fresh-context reviewer solved and explained all
  24 Activities before private access, then inspected every grading shape, route, Guardian pool, and
  exact official endpoint. Worked-example copies, arithmetic and wording cues, one decorative
  prerequisite, and narrow survey/risk/test/regression support were repaired before exact-candidate
  `PASS`; all 15 focused qualifier/runtime tests passed.

### 2026-09-01 — Unit 4: Personal Finance independently passed

- **Result:** Revision `767d26bc…7452f9a` owns three four-Stop Legs, 36 Lesson sections, 24
  Activities, six Support Paths, and 19 credits. A fresh-context reviewer completed the learner-first
  and full private/source inspections, then re-passed the exact candidate after repairs to impostor
  cues, goal pacing, financial-ability language, insurance Support, CFPB claim scope, metadata, and
  SEC fee taxonomy. All 15 focused qualifier/runtime tests passed; the evidence remained isolated
  authored-quality and local deterministic proof.

### 2026-09-01 — Unit 5: Machine Learning independently passed

- **Result:** Revision `60366ccf…0e4e82` owns three four-Stop Legs, 36 Lesson sections, 24
  Activities, six Support Paths, and 24 credits. Its fresh-context reviewer completed all public
  answers before reconciling every private/source seam and exact endpoint. Operational transfer
  cases replaced near copies; categorical cues, decorative prerequisites, citation assignments,
  prediction target/entity/horizon teaching, and NIST metadata were repaired before exact-candidate
  `PASS`; all 15 focused tests and all 24 final endpoint checks passed.

### 2026-09-01 — Unit 6: Neuroscience independently passed

- **Result:** Revision `07bd08f8…40feca3` owns three four-Stop Legs, 36 Lesson sections, 24
  Activities, six Support Paths, and 24 credits. A fresh-context reviewer completed the learner-first
  pass and full private/source audit; after a source-scope repair, the exact candidate passed its
  public regression and private/source rerun with no `FIX_FIRST`. Neutral identifiers, balanced
  cueing, matching transforms, transfer cases, one unique impostor, and claim boundaries were
  repaired. The production scratch catalog then qualified all five exact candidates together at
  `1c29d8c2…d78e9ff`.

### 2026-09-01 — Unit 7: exact reviewed catalog cut over atomically

- **Result:** The five passed documents moved atomically to their canonical paths at catalog revision
  `1c29d8c2…d78e9ff`; every `source.md` and candidate copy was deleted. Final-content execution
  exposed and repaired Matching identity drift through one shared public-key derivation. All 29
  learner-runtime tests, five learner-api suites, 26 Expo suites/151 tests, and 14 focused
  production-format intercepted scenarios passed. Current ADRs, authoring/validation guidance,
  typed DTOs, fixtures, and UI now point to one credit-resolution and direct online-evidence
  authority.

### 2026-09-01 — Unit 8: final evidence-class gates passed

- **Result:** `pnpm check` passed the exact catalog, workspace typechecks/tests/lint/builds, and
  20/20 intercepted scenarios; `pnpm test:db` passed nine migration cases, 18 live `lrnki_test`
  cases, and downstream suites. Direct HTTP completed all five journeys. Production-format UI
  completed all twelve Critical Thinking Stops and four Guardians on phone plus the frozen
  Probability Leg 1, Finance Leg 2, and Machine Learning Leg 3 scopes and Guardians on desktop;
  three reserved learners were deleted exactly, while Neuroscience received no UI-Leg claim. The
  guarded `lrnki` reset removed one pre-existing local-development user, account, session, and
  journey (zero verifications); those records are recoverable only by recreation.
  Android API 36 passed the owned flows against APK SHA-256 `6051a79d…9e9d83`; iOS 26.5 passed
  against Debug binary SHA-256 `319c7ceb…997ae`. This proves only local automated, owned
  development/test Postgres, intercepted/real-backend web, emulator, and simulator layers—not
  deployed, distributable, physical-device, production, release, arbitrary-source, or general
  external-fact accuracy.

### 2026-09-01 — Unit 9: status reconciled and exit test passed

- **Result:** The header, ordered index, and `TODO.md` agree that every unit and required evidence
  class passes; `BLOCKERS.md` remains `_None._`, no `RELEASE.md` exists, and Open findings is
  `_None._`. Positive controls over the five tracked JSON documents total 15 Legs, 60 Stops, 180
  Lesson sections, 118 Activities, 30 Support Paths, and 93 credits. This log retains exactly one
  entry per unit; the plan and rolling status remain below their size limits, documentation links
  point only to retained authorities, and `git diff --check` passes. The completed plan is ready for
  its required separate archival closure commit.

## Open findings

_None._
