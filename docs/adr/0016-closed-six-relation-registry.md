# Seed a closed six-relation registry that models cannot extend

Status: Accepted

## Decision

The claim-extraction tool schema exposes a closed relation enum seeded with exactly six relations: `is-a`, `part-of`, `asserted-prerequisite-of`, `contrasts-with`, `uses` (all concept-to-concept), and `defined-as` (concept-to-literal). The model can never invent a relation type; adding one is an explicit human registry change. `related-to` is rejected as a noise magnet, `causes` is deferred until a domain demands it, and synonym/alias links are concept properties handled by refinement, not claims.

## Context

The `asserted-` prefix encodes provenance into the relation name: sources rarely state prerequisites explicitly, and a future projection layer may introduce `inferred-prerequisite-of`, which must never be confusable with source-asserted prerequisites. An open relation vocabulary was the previous architecture's fastest path to uncontrolled noise.
