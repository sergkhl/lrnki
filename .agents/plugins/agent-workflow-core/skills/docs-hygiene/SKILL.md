---
name: docs-hygiene
description: Explicit invocation only. Sweep the documentation set so every concept has exactly one canonical definition and every retained section is traceable to a real consumer, then consolidate or delete the rest. Use only when the current prompt names $docs-hygiene or this skill path.
disable-model-invocation: true
---

# Documentation hygiene

Two sweeps over the same material. Run both; they catch different failures.

## Authorization boundary

Proceed only when the current user prompt explicitly names `$docs-hygiene` or this skill path. This
skill deletes and rewrites tracked documentation across many files, so a mention in a plan or an
earlier turn is not authorization.

Deleting is the point, not a side effect — but **never delete a document that was never committed**.
Commit it first, then delete it in a later commit. Git history is the archive; content that exists
nowhere in history must not be deleted from anywhere.

## What to read

- `CONTEXT.md` — the ubiquitous language.
- `docs/adr/README.md` and the ADRs it links.
- `docs/plans/README.md` and the linked plans, `TODO.md`, `RELEASE.md`, `BLOCKERS.md`.
- The repository instruction file every agent loads.
- Every runbook and README the above link to.

## Sweep one — one canonical definition

Each architectural concept, decision, data model, interface contract, and implementation plan should
have **exactly one** canonical definition. For every duplicated or overlapping section, ask:

- Which document should be authoritative?
- Is each responsibility assigned to exactly one component?
- Are domain boundaries and dependency directions explicit?
- Is the same concept described differently across ADRs, plans, and TODOs?

Consolidate into the canonical location. Replace the repeated explanation with a link. Where two
documents genuinely conflict, do not pick the more convenient one — flag the conflict and the
ambiguous ownership for the owner to resolve.

The usual ownership split: an ADR owns durable policy and its reasoning; the repository instruction
file owns day-to-day mechanics; source types and the initial migration own persisted shapes; plans own
implementation sequencing. Each links to the others rather than restating them.

## Sweep two — traceable value or removal

Every retained architectural element and documentation section must be traceable to at least one of:

- a validated user or system requirement;
- a concrete downstream consumer;
- an invariant, risk, or non-functional requirement;
- an executable test, acceptance criterion, or operational need.

Classify each item as **Keep** (necessary and correctly scoped), **Simplify** (necessary but
over-designed), **Merge** (duplicates another responsibility or section), **Defer** (plausible future
value, not currently justified), or **Remove** (obsolete, contradictory, or low-value).

**Prefer deletion over preservation when no clear traceability exists.** Record unresolved decisions
explicitly rather than preserving speculative complexity — an open question belongs in a plan or a
`TODO` item, not in a document that reads as settled.

## Two things that always fail this sweep

- **An inventory a command can print** — available states, translation keys, table names, installed
  versions. A copied list goes stale silently. Reference the command instead.
- **A metric's trajectory.** One current value and its invariant, never the sequence that produced it.

## Output

Report the classification before acting on `Remove` and `Merge`, so the owner can object. Then apply
`Keep`, `Simplify` and the uncontested consolidations. Deletions get their own commit, whose message
names what was deleted and where its content now lives.
