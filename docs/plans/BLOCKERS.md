# Blockers

Manual actions and unresolved external dependencies. Remove entries once resolved.

- **Drizzle snapshot meta is stale relative to `schema.ts`.** The single migration SQL is hand-authored
  and is the source of truth; `drizzle-kit migrate` applies it correctly. Do not run `drizzle-kit
  generate` expecting a clean diff — it would regenerate against the old `0000_snapshot.json`. Reset
  local state with `scripts/reset-db.sh`.

- **Claim extraction is slow (one LLM call per core concept).** A large source (e.g. the Rust chapter
  with ~25 core concepts) takes several minutes per run. No correctness blocker; see TODO item 3 for
  throughput hardening before scaling fixture count.
