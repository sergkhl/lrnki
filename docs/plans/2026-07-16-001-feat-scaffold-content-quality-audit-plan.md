---
title: Scaffold Content Quality Audit - Plan
type: feat
date: 2026-07-16
execution: code
---

# Scaffold Content Quality Audit - Plan

## Goal Capsule

- **Objective:** Turn the TODO's "scaffold step content polish (measure-first)" follow-up into a
  durable measurement instrument: a `kg-worker audit-scaffold-content` command that classifies
  persisted generated Support Step content for (a) formatting artifacts rendered raw by the plain-
  text learner surface and (b) label↔content congruence, then a fresh-generation sweep whose
  measured recurrence decides whether the two observed 2026-07-13 defects get fixed — and how.
- **Authority:** Follow [CONTEXT.md](../../CONTEXT.md),
  [ADR-0006](../adr/0006-use-forced-named-tool-schemas.md),
  [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md),
  [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md),
  [ADR-0037](../adr/0037-persist-learner-scoped-scaffold-detours.md), and AGENTS rules 14, 16, 17,
  and 21. Precedent to mirror: `auditDiscoveryCoverage` + the `audit-discovery-coverage` worker
  command (application module `packages/application/src/auditDiscoveryCoverage.ts`, command wiring
  in `apps/kg-worker/src/knowledgeGraphWorker.ts`).
- **Execution profile:** Audit-over-persisted-output, not audit-by-regeneration. The production
  scaffold generation composition lives in `apps/learner-api/src/learnerScaffoldGeneration.ts`
  (two-composition-root pattern); duplicating it inside kg-worker would violate rule 18, and
  regenerating would measure a different artifact than learners saw. The command therefore reads
  persisted `learner_scaffold_steps` (kind `generated`) with their detour term + parent context and
  judges those, exactly as `audit-discovery-coverage` reads a persisted extraction run. Fresh
  content for the sweep comes from driving real detours through the real learner-api path.
- **Stop conditions:** Stop and re-plan before adding any deterministic veto over scaffold output
  (the artifact detector is measurement/reporting ONLY — rule 16), changing persisted shapes or the
  migration, touching the neutral Study Item Bank or Derived Graph Layer, tuning any prompt with
  fixture/sweep concepts (rule 17), or adding a production judge before the sweep's numbers and
  human inspection justify it.
- **Tail ownership:** Ship the command, run the sweep, apply only the fixes the measurement
  licenses, re-run the audit as post-fix verification, amend ADR-0037 to name the command as the
  standing scaffold-content quality instrument, fold status into `TODO.md`, and delete this plan.

## Problem framing (owned here; supersedes the TODO follow-up entry)

The 2026-07-13 Support Path U6 gate observed two model-variance defects in generated Support Step
content, once each:

1. **Formatting artifact:** a `microLesson` contained literal `**bold**` markdown, rendered raw —
   the learner app renders scaffold lesson text as plain RN `Text`, and
   `prompts/learner-scaffold-content-generation.prompt` contains no output-format constraint at
   all. Problem class (rule 21): *LLM emits markup into a plain-text field*; conventional fixes are
   an explicit format instruction, rendering markdown, or post-processing. Rendering markdown is
   rejected (one generated field would gain a rendering pipeline no other learner text has);
   stripping is rejected (surface-pattern rewriting of well-formed neural output, rule 16 spirit).
   The conventional root-cause fix is the prompt's missing format contract.
2. **Label↔content mismatch:** one step's outline label mismatched its own (accurate, easier)
   lesson/question. Problem class: *semantic drift between two chained LLM calls* — the outline
   call names the step, a separate content call writes it. This is judgment-based quality and must
   be measured/judged neurally (ADR-0028), never lexically.

Both were single observations; the TODO gated any fix on recurrence in real use. The live DB holds
1 detour / 1 step (post-gate hard resets wiped organic learner state), so recurrence can only be
measured against a fresh-generation sweep. USER DECISION 2026-07-16: run the sweep, build the
audit as a durable command, and update docs/ADR to make it the standing instrument.

## Key Technical Decisions

- **KTD1 — Audit persisted steps, never regenerate inside the worker.** One new read seam exposes
  generated steps with context; the generation path stays exactly the one production runs.
- **KTD2 — Two classifiers with different epistemics.** (a) Formatting artifacts are detected
  deterministically (markdown emphasis/heading/code-fence/link/list tokens) because the defect is a
  format-contract violation, objectively decidable; the detector reports, it never gates (rule 16).
  (b) Congruence is judged by the cross-family independent judge (`kg-independent-judge`,
  gpt-oss-120b), K-sampled with the discovery-coverage recurrence rule (default K=3, recurring at
  ≥2 of K), because it is judgment-based quality (ADR-0028). The audit never auto-verdicts; human
  inspection of the report decides (ADR-0013).
- **KTD3 — Judge sees the same contract the learner relies on.** Per generated step the judge
  receives Declared Domain, the detour's term, the parent concept label, the step label, and the
  step's microLesson/question/explanation/options (correct answer NOT identified), and answers two
  forced-tool booleans + rationale: does the content actually teach the named step label, and is
  the taught content a genuinely simpler prerequisite of the term (not the term itself, not the
  parent)? Prompt wording stays domain-neutral (rule 17).
- **KTD4 — Fix licensing rule.** After the sweep: defect (a) recurs at ≥1 artifact-bearing step →
  add ONE output-format sentence to the content-generation system prompt (plain prose, no markdown
  or markup syntax) and re-sweep to verify; defect (b) shows ≥1 human-confirmed recurring
  (≥2-of-K) mismatch → add the generation-time congruence check as one bounded re-pick inside
  `runScaffoldGeneration`'s content loop (judge-fail → drop the draft and retry once; second fail →
  the step is skipped, falling into the existing "no safe step survived" failure path). Neither
  measured trigger firing → record the negative result in TODO VALIDATION and ship only the
  command + docs.
- **KTD5 — Reports go to gitignored `tmp/` (rule 10)**, JSON + markdown, mirroring
  `discovery-coverage-<runId>.{json,md}`; audit calls carry no `operation_id` so they never pollute
  an operation's cost report.

## Implementation Units

- **U1 — Audit read seam.** Add one read method to the postgres scaffold store + its port (e.g.
  `listGeneratedStepsForAudit(enrichmentId?)`): every `learner_scaffold_steps` row with kind
  `generated`, joined to its detour's `term`, parent derived-node label, and Declared Domain.
  Read-only; no learner-identifying data beyond what the audit needs. Postgres test against the
  fresh migration.
- **U2 — Pure audit module** `packages/application/src/auditScaffoldContent.ts` (+ test):
  deterministic formatting-artifact classifier (per-field findings with the offending excerpt),
  K-sample judge orchestration over a `ScaffoldContentCongruencePort`, per-step recurrence
  aggregation (threshold shared in spirit with `DISCOVERY_COVERAGE_RECURRENCE_THRESHOLD`), and one
  typed report (per-step verdict samples, aggregated recurring findings, artifact totals, judge
  model, K, generatedAt).
- **U3 — Judge adapter** in infrastructure-litellm: `scaffold-content-congruence.prompt` (model
  alias `kg-independent-judge`, forced named tool per ADR-0006, KTD3 fields) +
  `createScaffoldContentCongruencePort`. Congruence test coverage mirrors the existing adapter
  suites.
- **U4 — Worker command** `kg-worker audit-scaffold-content <enrichmentId> [--k <n>] [--out <dir>]`
  wired like `audit-discovery-coverage` (context ports, per-sample progress lines, JSON + markdown
  report, usage string updated).
- **U5 — Fresh-generation sweep + conditional fixes + docs (rule-14 gate).** Generate ≥3 fresh
  mixed-domain synthetic expeditions over production LiteLLM, drive ≥10 real detours through the
  real learner-api path (2026-07-13 gate scale: 131 terms / 8 detours / 16 steps), run the audit,
  human-inspect the report against the actual generated content (ADR-0013). Apply KTD4's licensed
  fixes only, each verified by a re-run of the audit over freshly generated steps. Amend ADR-0037
  (Consequences) to name `kg-worker audit-scaffold-content` as the standing scaffold-content
  quality instrument, to be re-run after any change to scaffold prompts, schemas, or the extraction
  model alias. Clean up disposable learner state; fold status into `TODO.md`; delete this plan.

## Acceptance

- The command runs against any enrichment with generated steps and produces an inspectable report;
  deterministic envelope green (typecheck/lint/test incl. the new suites).
- Sweep evidence + the required evaluation note under `tmp/2026-07-16-scaffold-content-audit/`,
  including the explicit fix/no-fix decision per defect with the measured numbers.
- No neutral-graph, Study Item Bank, persisted-shape, or API change; scaffold prompts change only
  if KTD4 licenses it, and only with domain-neutral wording.
