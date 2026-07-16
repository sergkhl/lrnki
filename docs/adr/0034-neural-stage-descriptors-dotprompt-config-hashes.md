# Neural Stage Descriptors with dotprompt files and mechanical config hashes

Status: Accepted

## Decision

Every forced-tool LLM call is represented by a Neural Stage Descriptor. The descriptor is split
between:

- a `.prompt` file under `packages/infrastructure-litellm/prompts/`, whose frontmatter owns the
  LiteLLM alias, tool name, and tool description, and whose body owns the system/user prompt
  templates;
- a typed TypeScript rim beside the owning infrastructure port factory, whose single sources of
  truth are the zod-derived forced-tool schema, validator, stage tag, retry budget, sentinel input,
  template data mapping, and result mapping.

Application ports remain the seam seen by use cases. Composition roots construct ports through
factory functions and still choose the correct LiteLLM client policy (discovery, deterministic,
probe, embedding). Adapter classes and per-stage model constants are not retained for forced-tool
calls.

Operation config hashes are derived mechanically in `@lrnki/infrastructure-litellm` from the
operation seed, all owned descriptor hashes, and operation-level application config. A descriptor
hash includes prompt file bytes, referenced prompt partial bytes, frontmatter scalars, stage tag,
retry budget, and the JSON schema evaluated at the descriptor's sentinel input. Composition roots
pass the resulting strings into unchanged application inputs such as extraction pipeline config,
enrichment config hash, and Study Item Bank config hash.

One infrastructure-owned, operation-centric registry is the descriptor-registration authority. For
each neural operation it owns the hash seed, corresponding Operation Timeline type, and complete
descriptor set. Operation hashes, the distinct all-descriptor inventory, descriptor-shape checks,
and descriptor-to-timeline completeness tests derive from that registry. A descriptor shared by
several operations is registered under every operation that executes it. The application-owned
Operation Timeline catalog remains a separate authority and is compared mechanically rather than
merged into infrastructure.

Scaffold Generation persists that complete config hash on each `scaffold` Operation Timeline run,
because one Scaffold Detour may have multiple claimed attempts and direct reuse or failed attempts
may publish no generated Support Step. The operation run is the canonical attribution home for the
attempt; the detour's operation pointer identifies its latest attempt. A hash on the detour or each
step would either erase retry history or duplicate attribution.

## Context

The prior class-per-stage pattern spread one stage's neural knowledge across adapter classes,
model constants, prompt strings, tool-schema wiring, stage tags, timeline catalog entries, root
wiring, and hand-bumped config hashes. That made new stages expensive to add and made stale
run-attribution hashes easy to miss.

Prompt text belongs in files because prompt bytes are the meaningful operator-facing artifact, and
file bytes can be hashed identically by the worker and Admin Lab roots. The implemented loader is a
small local parser for the subset currently used: YAML-like scalar frontmatter, system/user blocks,
plain interpolation, loops, and prompt partials. It writes `.prompt` files compatible with the
chosen dotprompt shape without adopting an external runtime.

## Consequences

Changing a prompt, model alias, tool name, tool description, schema, retry budget, stage tag, or
operation knob changes the next persisted config hash without a manual bump.

The operation timeline catalog stays a separate application concern, but infrastructure tests assert
that every descriptor stage tag belongs to its owning operation catalog entry.

The hash intentionally does not include arbitrary TypeScript function source for `templateData` or
`mapResult`. Those functions remain reviewed code, while textual prompt knowledge and forced-tool
wire shape are data-first and mechanically attributed.
