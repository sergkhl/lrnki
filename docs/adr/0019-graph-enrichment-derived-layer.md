# Keep inferred graph facts in Derived Graph Layers

Status: Accepted

## Decision

Learner-neutral facts not asserted by a Curated Source exist only in immutable Derived Graph Layers;
they never mutate published graph versions.

Graph Enrichment derives a layer from one explicit published graph version. Synthetic Topic
Generation derives an anchor-less layer from a topic and Declared Domain. Both use the same derived
ownership boundary for inferred prerequisite edges, learner-neutral difficulty, and generated
grounding while preserving their distinct inputs and operation identities.

Rescued source-mentioned nodes and model-grounded nodes remain derived. Same-domain identity
candidates follow [ADR-0012](0012-embeddings-permitted-except-prerequisite-derivation.md), and
prerequisite structure is judged over the whole relevant node set. Contested, cyclic, or
insufficiently supported edges remain inspectable but outside trusted learner paths.

Each Enrichment Run retains enough model, configuration, judgment, and transform provenance to replay
its immutable artifact. Re-running creates a new observation rather than claiming identical neural
output.

## Context

Prerequisite structure requires graph-global judgment and cannot belong to a per-source Extraction Run
or deterministic Graph-Version Build. A separate layer keeps inference replaceable and prevents it
from weakening the asserted graph's evidence contract.
