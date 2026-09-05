# Author Expeditions directly without build or runtime models

Status: Accepted

Codex CLI is an offline author: it researches online evidence and writes the exact Expedition
document consumed by learner-runtime. The repository contains no model client, model port, prompt,
compiler, content package, installer, publication transaction, source packet, or content database.
Build and runtime never call models or fetch source links; those links are learner-visible metadata.

[The tracked catalog](../../content/catalog.json) owns exact membership and order. Each Expedition
owns its route and content, with human-readable authored keys and authoritative array order. Runtime
code does not infer prerequisites, Support destinations, difficulty, Guardian pools, or a competing
route. [Source types](../../packages/learner-runtime/src/contentSchema.ts) own the document shape.

One pure all-or-nothing qualifier runs in authoring checks, CI, tests, and API startup. It derives
only in-memory lookup/projection data and canonical revisions, never a second content representation.
Semantic changes alter the revision; JSON formatting and property order do not.

Direct documents avoid separate authoring, installation, and publication systems while keeping the
catalog reviewable and usable without a model service. [The authoring guide](../../content/AUTHORING.md)
owns the working procedure.
