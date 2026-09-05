# Architecture Decision Records

ADRs are the canonical source for current durable architectural decisions and rationale. Creation,
scope, amendment, and retirement rules live in [AGENTS.md](../../AGENTS.md#documentation-workflow).

## Current decisions

- [0003 — PostgreSQL only for identity and learner state](./0003-use-postgres-json-table-artifact-store.md)
- [0013 — Direct authored-source quality inspection](./0013-verify-quality-by-real-source-inspection.md)
- [0024 — Authored comparative difficulty bands](./0024-learner-neutral-intrinsic-difficulty.md)
- [0026 — Authored Activities and learner-response identity](./0026-typed-study-item-bank.md)
- [0032 — Mastery-aligned Learner App game UX](./0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md)
- [0033 — Authored keys and one themed vocabulary mapping](./0033-plain-identifiers-single-themed-vocabulary-mapping.md)
- [0035 — Universal Expo app over typed Hono API](./0035-separate-learner-app-static-spa-typed-api.md)
- [0037 — Authored Support visibility in Learner State](./0037-persist-learner-scoped-scaffold-detours.md)
- [0039 — Code-first Drizzle persisted-shape authority](./0039-own-persisted-shape-in-code-first-drizzle-schema.md)
- [0040 — Serve the public API only from the deployed container](./0040-serve-public-api-only-from-the-deployed-container.md)
- [0041 — Learner identity and sessions via self-hosted Better Auth](./0041-own-learner-identity-with-self-hosted-better-auth.md)
- [0042 — Directly authored Expeditions without runtime models](./0042-author-expeditions-directly-without-runtime-models.md)
