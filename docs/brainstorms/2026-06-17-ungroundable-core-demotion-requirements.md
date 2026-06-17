# Extraction Run Resilience: Demote Ungroundable Core Concepts

- **Date:** 2026-06-17
- **Status:** Requirements (ready for planning)
- **Scope:** Deep — feature (application-boundary run-status policy + quality-issue surfacing + Admin Lab)
- **Trigger:** Failed run `7ed1dbc1-6112-48b0-a263-5432e297f1a2` (InstructKG, domain "educational technology")

## Problem

A single core candidate that cannot be grounded fails the **entire** extraction run. In run
`7ed1dbc1` the only defect was one concept, `pedagogical roles`, admitted `core` but with an incomplete
Concept Evidence Profile (0 verified definition passages). The three legitimate cores
(`INSTRUCTKG framework`, `conceptual dependencies`, `instructor-aligned knowledge graphs`) all grounded
cleanly, yet the run was marked `failed` and refused for publication.

Root cause is a definition-contract split between two pipeline stages:
- **Admission** judged that `pedagogical roles` has definition-bearing treatment, citing block-40.
- **CEP extraction** could not produce a verbatim definition of the subject itself, so `complete=false`.
- The run-status rule fails the whole run if any core CEP is incomplete.

## What the brainstorm established (evidence)

These findings come from live DB inspection of the failed run plus an isolated admission A/B experiment
with real model calls (harness deleted; see `tmp/exp-admission/FINDINGS.md`).

1. **The failure is a TRUE NEGATIVE — the CEP gate worked correctly.** Block-40 defines the *members*
   of the category (`DEFINITION`, `EXAMPLE`, `ASSUMPTION`, `NA`), not the container `pedagogical roles`.
   A skim of every source block mentioning the term found no passage defining the container itself. There
   is nothing valid to ground; refusing to ground it is correct.
2. **The members are already handled.** Discovery already split `definition_role`, `example_role`,
   `assumption_role`, `role_classification` into separate candidates, and admission already tiered them
   `optional` with their own valid definitions. No member-splitting work is needed.
3. **The two gates are independent and that independence is a feature.** The CEP definition check is the
   cross-check that caught an admission over-acceptance — defense-in-depth, not redundancy. External
   practice (verification asymmetry; EDC's "bootstrap-from-hints + independent verification" hybrid)
   supports keeping them separate. The admission→CEP hint forward-pass stays.
4. **The "tighten the admission definition prompt" fix is empirically refuted.** Adding a domain-neutral
   subject-anchored container-vs-members clause to admission criterion (4) did **not** demote the
   container (it stayed `core`), and it destabilized the stage (core-selected concepts jumped 8 → 17).
   Chasing this semantic judgment through prompt text is unreliable and has large collateral effects
   (consistent with AGENTS rules 16/17).

## Decisions

### D1 — Demote, don't fail (primary fix)
When an admitted **core** candidate's CEP cannot be grounded (no verbatim subject definition survives the
deterministic verbatim floor), **demote it to `optional`** and let the run **succeed** with the remaining
grounded cores. This is a deterministic policy at the application boundary (`executeExtractionRun.ts`
status logic, today at lines ~156–162). It enforces the real invariant — *a published core always has a
grounded definition* — by demotion rather than run-death. No LLM prompt changes.

### D2 — Surface demotion as a loud quality issue (never blocks publication)
Each demotion emits a high-visibility quality issue (extend `detectExtractionQualityIssues.ts` /
`ExtractionQualityIssue` in `domain-core`). It must be consumable two ways:
- **Operator:** clearly rendered in Admin Lab on the run page (`apps/admin-lab/src/app/admin/lab/runs/[runId]/page.tsx`).
- **Code agent:** machine-readable in the run artifact/relational output so an automated check can assert
  on it during live test runs and catch regressions early.

Demotion **never blocks publication**. A run that demotes its *last* core still publishes, but emits a
higher-severity variant of the issue.

### D3 — Keep gates separate; no seeding; no admission-prompt tightening
Do not seed CEP definitions from admission evidence for completeness, and do not add the
container-vs-members clause to the admission prompt. Both are explicitly out of scope (one unjustified by
the data, one refuted by it).

### D4 — Correctness riders (cheap, in-scope)
- Fix the artifact projection views in the initial migration: they filter `extraction_run.v5` while the
  app writes `extraction_run.v6` (`migrations/0000_initial_lrnki_schema.sql` lines ~294, ~314).
  Use `LIKE 'extraction_run.%'` so the next artifact bump can't reintroduce the bug. Hard-reset after.
- Fix the stale domain comment claiming any `(core|optional)` incomplete CEP fails the run
  (`domain-core/src/index.ts` lines ~249, ~379–380); the rule is core-only, and under D1 it becomes
  "incomplete core ⇒ demote, not fail."
- Surface admission's `definitionBearingTreatment.evidence` beside CEP completeness in Admin Lab so the
  TN-vs-FN distinction is a glance, not an investigation.

### D5 — Deferred (explicitly not now)
- The prune agenda (remove `defines`/entailment path, RDF export, local storage, Docling deferral, rename
  `kg-claim-extraction`) — a separate scope-reduction decision, not part of this fix.
- A measured downgrade-only **container judge** (the `AdmissionLabelJudgmentPort` pattern) — adopt only if
  accumulated demotion data shows it is frequent or hides real recall loss, and only if a small oracle
  shows it raises precision without discarding valid cores.

## Success criteria

1. Re-running the InstructKG source **succeeds**: `pedagogical roles` lands `optional`, the three real
   cores publish, and the run is publishable.
2. The demotion produces a quality issue visible in Admin Lab **and** present in machine-readable run
   output that a code-agent check can assert on.
3. No run is marked `failed` solely because one core candidate is ungroundable.
4. v6 runs render their candidates in Admin Lab (v5/v6 view bug fixed).
5. No fixture-specific text appears in any prompt or code (AGENTS rule 17).

## Open questions / caveats

- **N=1.** Only one failed run exists; demotion frequency on other sources is unknown. The D2 quality
  issue is the watch mechanism — if demotions become common, revisit D5's measured judge.
- **Core-set instability under prompt perturbation** was observed during the experiment (admission output
  is sensitive to prompt edits). Latent concern, not addressed here; flagged for awareness.
- **Severity model for zero-core runs** (D2) is a default ("publish with higher-severity issue"); confirm
  during planning whether operators want any additional signal for that degenerate case.
