# Blockers

## InstructKG core CEP completeness for borderline meta-concepts (2026-06-16)

- **Run:** `7ed1dbc1-6112-48b0-a263-5432e297f1a2` (educational technology, InstructKG), status `failed`.
- **Symptom:** one **core** Concept, `pedagogical roles`, has no complete Concept Evidence Profile, so the
  run fails closed (ADR-0017). Eight optional concepts are also incomplete but do not fail the run.
- **Diagnosis (inspected):** admission's definition-bearing criterion (U1) passed correctly — block-40
  verbatim-verifies and genuinely defines the four roles (DEFINITION/EXAMPLE/ASSUMPTION/NA). The independent
  CEP verbatim floor then could not lock a single verbatim definition passage for the *unified* meta-concept
  `pedagogical roles`, whose meaning is distributed across the per-role sentences. This is the verbatim floor
  working as designed on a borderline meta-concept, not a regression and not a prompt-overfit target (rule 17).
- **Not the fix:** do NOT patch the prompt with InstructKG-specific text or relax the verbatim floor.
- **Candidate root-cause directions (for a future unit):** (a) admission should treat a distributed-definition
  meta-concept as `optional` rather than `core` when no single passage defines it as one unit; or (b) the CEP
  floor should accept a bounded multi-passage definition for a concept the source defines compositionally.
  Decide with a measured neural judgment, not a lexical rule.
- **Consequence for the 2026-06-16 re-run:** InstructKG did not publish, so its rescue-noise path could not be
  inspected directly; the rescue durability judge's generalization is evidenced on Rust/biology/economics
  instead (see `tmp/2026-06-16-evidence-backed-rerun/rule-14-evaluation.md`).
