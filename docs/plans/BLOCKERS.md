# Blockers

## Source Expedition catalog schema transition

- **Owner decision required before U2.** U2 must add `source_expedition_catalog_entries` through the
  code-first Drizzle schema and publish the existing Critical Thinking artifacts in the live
  development database. [ADR-0039](../adr/0039-own-persisted-shape-in-code-first-drizzle-schema.md)
  makes that database reset-required after the baseline changes and forbids incremental or manual
  DDL, while the active plan permits no second development reset before U8. The exclusive U3–U9
  sequence depends on U2, so none can advance around this conflict.
- **Recommended resolution:** authorize one additional guarded development reset after the U2 schema
  lands, regenerate and re-qualify Critical Thinking against that schema, then preserve that Concept
  registry without another reset through U7. The alternatives are a new data-preserving migration
  policy that replaces ADR-0039, or a material redesign/reordering that defers persisted publication;
  neither is implied by the accepted plan.
