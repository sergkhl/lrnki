# Plans

Planning documents are the canonical source for implementation design only while the work is ready or
in progress. Linked brainstorms own accepted problem framing, requirements, and scope. A plan also
owns the validation record for its own implementation units, in a `## Validation Log` section. When
work completes, fold durable decisions into ADRs, current status into `TODO.md`, and terminology into
`CONTEXT.md`, then delete the completed plan.

## Live coordination

- [TODO](./TODO.md) — current tasks, grouped completed outcomes, and the latest plan-less validation.
- [BLOCKERS](./BLOCKERS.md) — unresolved manual actions required from the user only.

## Retention

Every document here is bounded by the edit that touches it, not by a later cleanup pass. Enforce the
limits below in the same change that adds the entry. These apply to `TODO.md`, to every plan file,
and to every `## Validation Log` inside one; the two subsections that follow add per-document caps:

- **Consolidate outward before deleting.** Every deletion here — a closed unit's log entries, a
  rolled-off `COMPLETED` entry, a superseded `VALIDATION` record, a finished plan — is first swept
  for content that outlives this directory, and that content is moved to its owner **in the same
  change**, with a pointer left behind. The destination map, used by every rule below:
  architectural decisions, code invariants, and repeatable verifications that prove them →
  `docs/adr/`; workflow and enforcement rules → `AGENTS.md`; project language → `CONTEXT.md`; rig
  gotchas → `apps/learner-app/e2e-native/README.md`, `apps/learner-app/e2e-realuse/README.md`, the
  owning `packages/*/README.md`, or the relevant `.agents/skills/*/SKILL.md`; curated-source and
  content rules → `fixtures/README.md`.
- **Git history is the archive for the record, never for the knowledge.** Deleted detail is
  recoverable — `git log -p -- docs/plans/<plan>.md` reads what a consolidation removed, and
  `git log --diff-filter=D -p -- docs/plans/<plan>.md` reads a deleted plan whole. That licenses
  deleting the *entry*; a fact reachable only by `git log` is a fact nobody will find, so it must
  have a live owner first.
- **Never delete a record that was never committed.** Commit the plan file or validation entry first
  — even when the work it describes is already done — then delete it in a later commit whose message
  names it. Content that exists nowhere in git history must not be deleted from anywhere.
- **Consolidate in its own commit**, after the detailed entries are committed, with a message naming
  what was consolidated.
- **No entry links into `tmp/`** — it is gitignored and auto-pruned (AGENTS rule 10), so such a link
  is dead on arrival for every other checkout.

### Validation Log retention

A log that is only ever appended to becomes most of its plan. Every plan file carries these rules as
a hygiene comment above its title, so whoever opens one to append sees them without coming here.

- **A Validation Log is append-only within an implementation unit and rewritten when that unit
  closes.** A closed unit leaves **one** entry: date, commits, what is proved, the invariants a later
  unit or a re-run must not break, and what it hands off. Aim for under a screen. Two entries for the
  same unit, or an entry left beside the one that supersedes it, means a consolidation was skipped.
- **Never record a metric's trajectory.** One current value and its invariant ("the bank is at 24 of
  a possible 48 items, and no node above the matching threshold may lose its item"), never the
  sequence that produced it. The same goes for re-run suite tallies: record that `pnpm check` and
  `pnpm test:db` are green and which did not run, not their per-pass counts. This is the single
  largest source of log growth.
- **A real-use gate entry uses the note format owned by
  `.agents/skills/real-use-quality-evaluation/SKILL.md`** (AGENTS rule 14). That skill owns the
  fields; never restate or extend them here. The entry belongs to the plan, not to `TODO.md`,
  whenever a plan owns the unit being gated.
- **One `Open findings` section per plan**, at the end of the log. A pass that finds something appends
  there; the pass that closes it deletes the line. Never a per-entry "not done in this pass" list —
  each is superseded by the next pass and none ever gets removed, so the open work ends up scattered
  across every entry and true in none of them.
- **Durable mechanics never enter a Validation Log.** Route them to their owner on the destination
  map above, in the same commit that discovers them — do not let the consolidation sweep be the
  first time anyone looks. A plan is deleted at completion; anything that should outlive it must not
  be living there when that happens.
- **Caps.** Validation Log ≤ ~200 lines; whole plan file ≤ ~600 lines; plan status header ≤ 15 lines.
  The same status is written in three places — the plan header, this README's entry (≤ 5 lines) and
  `TODO.md`'s (≤ 10) — so keep each to its own altitude rather than restating the others. Crossing a
  cap means consolidation is due **before** anything new is appended.

### TODO retention

`TODO.md` has exactly three sections — `TODO`, `COMPLETED`, `VALIDATION`:

- **TODO** holds 3–7 tasks. A task is status + link + live state that exists nowhere else. A plan's
  requirements, design, implementation units, and acceptance criteria stay in the plan. A task that
  outgrows ~15 lines needs a plan file; what stays behind is status, the next action, and links.
- **COMPLETED** holds at most 8 grouped outcomes of ~8 lines each — date, outcome, ADR link, evidence
  pointer. Adding a ninth deletes the oldest in the same edit. Carry-forwards and accepted risks go
  into the linked ADR or a `TODO` item, never into a `COMPLETED` sub-list.
- **VALIDATION** holds exactly one entry, ~20 lines, and only for work no plan owns: the latest
  plan-less validation. Adding one deletes the previous. Validation for planned work lives in that
  plan's `## Validation Log`; for plan-less work, commit the full record here once, then cut it to a
  pointer at the next consolidation.
- **Whole-file soft cap: ~150 lines.** Crossing it means consolidation is due before anything new is
  added.

## Active implementation plans (execution order)

- [2026-08-07-001 — Matching item quality](./2026-08-07-001-fix-matching-item-quality-plan.md) —
  **Gated, awaiting one decision.** All four units shipped; U4's probes pass and its two VPS runs
  removed four ambiguous items, but 1 admitted item of 26 still carries an ambiguous pair set against
  a bar of none. Accept that tail and close, or spend a unit on judgment stability.
- [2026-08-08-001 — Integrate self-hosted Better Auth](./2026-08-08-001-integrate-better-auth-plan.md) —
  **Ready, queued second.** Interview-locked (D1–D9): Better Auth inside `learner-api` replaces the
  PIN placeholder — Google primary + email/password e2e fallback, cookie sessions on both platforms,
  `learnerRef` = `user.id`, hard reset. Precondition: the matching plan merges; then
  `feat/better-auth` off `main`.

## Ownership rules

- ADRs own durable policy; linked brainstorms own accepted requirements and scope; plans link to both
  rather than restating them.
- Source types own exact interfaces and the internal Drizzle schema owns exact persisted shapes
  ([ADR-0039](../adr/0039-own-persisted-shape-in-code-first-drizzle-schema.md)).
- Keep only ready/in-progress plans here. Delete stale or completed plans immediately after their
  durable content has been consolidated.
