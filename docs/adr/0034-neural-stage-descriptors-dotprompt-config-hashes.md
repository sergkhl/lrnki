# Represent neural stages with descriptors and mechanical config hashes

Status: Accepted

## Decision

Each forced-tool LLM stage is represented by one Neural Stage Descriptor. Its prompt file owns the
model alias, tool metadata, and templates; a typed infrastructure rim owns the zod-derived schema,
validation, stage attribution, bounded execution policy, and result mapping. Application ports remain
the interface seen by use-cases.

Operation configuration hashes derive mechanically from the operation seed, its complete registered
descriptor set, and operation-level configuration. Prompt content, referenced partials, tool wire
shape, and execution metadata therefore change attribution without a hand-bumped version.

One infrastructure registry owns Neural Stage Descriptor membership and mechanical configuration
hashes. The application Operation Timeline catalog separately owns operation-to-stage membership.
The catalog-derived allowed set reaches infrastructure through the ambient operation context, so a
wrong operation-stage pair fails closed without creating a second infrastructure stage map.

## Context

The previous class-per-stage pattern spread one stage's knowledge across prompts, constants, adapters,
composition roots, and manual hashes. Descriptors concentrate that knowledge behind the existing port
seam and make run attribution a generated fact.
