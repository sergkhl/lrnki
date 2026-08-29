# agent-workflow-core

A plan-driven workflow for coding agents, packaged for repository-scoped or marketplace
installation.

It is one loop. A task list is **grilled** into a design, the design becomes a **plan file** in an
ordered index, an agent **drains** that index batch by batch until nothing is actionable, and a
periodic **hygiene** sweep keeps every fact in exactly one place. The skills here are the entry
points to each stage.

## Skills

| Skill | Invocation | What it does |
|---|---|---|
| `plan-lifecycle` | model | Defines the plan index, `TODO`/`RELEASE`/`BLOCKERS`, ownership rules, closure test, and Validation Log retention. |
| `plan-from-tasks` | explicit | Turns a task list into a new plan after answering what it can from the repository and grilling the remaining decisions. |
| `drain-plans` | explicit | Repeats batch, validation, status persistence, commit, and re-read until nothing is actionable. |
| `docs-hygiene` | explicit | Enforces one canonical definition per concept and Keep/Simplify/Merge/Defer/Remove traceability. |
| `worklog` | explicit | Estimates hands-on effort per day from commit authorship and emits a CSV. |
| `grilling` | model | Runs a relentless interview over a design tree, one frontier of questions per round. |
| `grill-with-docs` | explicit | Combines `grilling` with `domain-modeling` so ADRs and glossary entries result from the interview. |
| `domain-modeling` | model | Builds and sharpens a project's ubiquitous language and ADR record. |
| `codebase-design` | model | Supplies vocabulary for deep modules, interfaces, seams, and testability. |
| `improve-codebase-architecture` | explicit | Finds deepening opportunities, reports them, then grills the selected one. |
| `wait-what` | explicit | Re-pitches an explanation that did not land. |

The source for all eleven skills is this one `skills/` tree. Repository installs link to it; they do
not make additional physical skill copies.

## Invocation policy

Seven skills are explicit-only:

- `docs-hygiene`
- `drain-plans`
- `grill-with-docs`
- `improve-codebase-architecture`
- `plan-from-tasks`
- `wait-what`
- `worklog`

Each carries both harness gates:

- `disable-model-invocation: true` in `SKILL.md` for Claude.
- `policy.allow_implicit_invocation: false` in `agents/openai.yaml` for Codex.

The four model-invocable skills are `codebase-design`, `domain-modeling`, `grilling`, and
`plan-lifecycle`. A gated skill's default prompt names the skill explicitly.

## Host repository assumptions

The skills reference these conventional files and describe setup instead of editing when they are
absent:

- `docs/plans/README.md` — ordered execution index and ownership rules.
- `docs/plans/TODO.md`, `docs/plans/RELEASE.md`, `docs/plans/BLOCKERS.md` — live coordination.
- `docs/adr/README.md` — decision index.
- `CONTEXT.md` — ubiquitous language.

Nothing here names a build tool, programming language, product, deployment target, machine path, or
personal identifier. Project-specific procedure belongs in the consuming repository's real
`.agents/skills` directories.

## Installation

Use the catalog's
[`scripts/install-repository.mjs`](../../scripts/install-repository.mjs) for a pinned team-repository
installation, or follow the catalog [README](../../README.md) for a personal marketplace install.
Do not enable both copies in the same working context.

Repository installation is always explicit. This plugin has no hook that mutates a consumer.

## License and provenance

Original work is MIT licensed. `grilling`, `grill-with-docs`, `domain-modeling`, `codebase-design`,
`improve-codebase-architecture`, and `wait-what` were derived from
[`mattpocock/skills`](https://github.com/mattpocock/skills) and have since diverged. The complete
upstream MIT notice is in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
