# Author Expeditions directly without build or runtime models

Status: Accepted

## Decision

Codex CLI is an offline author. It researches inspectable online evidence and writes the exact
declarative Expedition document consumed by learner-runtime. The repository contains no Codex/model
client, model port, prompt, compiler, package, installer, publication transaction, source packet,
content database, or build/runtime model or source-fetch call.

The tracked catalog owns exact membership and order. Each Expedition document owns its presentation,
source disclosures, ordered Legs and Stops, prerequisites, difficulty, Lessons, Activities, Support
Paths, and Guardian pools. Human-readable authored keys and array order are authoritative; runtime
code does not derive a competing route.

One pure all-or-nothing qualifier is used by authoring checks, CI, tests, and learner-api startup. It
derives only in-memory lookup/projection data and canonical revisions; it never emits a second content
representation. A semantic document change changes the revision, while JSON formatting and property
order do not. Source links are learner-visible metadata and are never fetched by build or runtime.

## Context

The previous model pipeline made authoring, installation, publication, inspection, and learner
projection separate systems. Direct documents preserve private grading and the full learner game
while making the structure editable, reviewable, and usable without any model service.
