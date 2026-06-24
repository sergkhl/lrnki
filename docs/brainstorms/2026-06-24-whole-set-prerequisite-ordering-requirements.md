---
date: 2026-06-24
topic: whole-set-prerequisite-ordering
---

# Whole-Set Prerequisite Ordering

## Summary

Replace exhaustive per-pair prerequisite judging with one whole-set judgment call per
Declared Domain that returns a directed prerequisite DAG. The judge runs on a stronger
non-DeepSeek model; the application boundary verifies acyclicity, issues at most one
corrective re-prompt, and routes any stubborn cycle to `uncertain`. Ship single-sample as a
measured experiment and promote only if edges are more learner-sensible and the run is
cheaper than today's exhaustive baseline.

## Problem Frame

Prerequisite edges are derived by judging every unordered same-domain pair, now regrouped
into per-node batched calls. Pairwise judgment is intransitive by nature: a judge can call
A→B, B→C, and C→A all locally plausible. Cycles are therefore not anomalies but the expected
residue, and `removeCycles` exists to mop them up after the fact. The cost is O(n²) pair
judgments, and the certain-edge set is noisier than it should be because nothing forces the
pieces to cohere globally.

The recent history compounds this. The batched-judging work fought a subject/candidate
asymmetry that flipped edge directions purely from which concept held the "subject" role; the
parity fix neutralized it but could not make a per-pair judge globally self-consistent,
because no per-pair call ever sees the whole set.

Asking the judge for one global structure per domain changes the correctness model. A
whole-set DAG is globally self-consistent by construction, has no privileged subject (so the
asymmetry cannot arise), and converts a purely semantic question ("is this edge right?") into
an additional structural one ("is the whole thing acyclic?"). Acyclicity is provable, so it
belongs in the deterministic envelope and can inform the model without silently vetoing its
meaning.

## Key Decisions

- **Directed edge list, not a total order or tier assignment.** The judge emits directed
  edges (prerequisite → dependent) with per-edge confidence and rationale. This keeps the
  richest inspection surface. The trade is that an edge list *can* express a cycle, which a
  linear order or tier numbering cannot — so the deterministic envelope must verify and
  correct, rather than getting acyclicity for free.

- **The judge role moves to a non-DeepSeek model; DeepSeek is not retired.** A single
  whole-set call per domain mixes anchors and minted (`llm_grounded`) nodes in one prompt, so
  per-pair family routing is impossible. ADR-0023 forbids the minted-node grounding generator
  (DeepSeek) from judging relations involving its own generated output, so the single judge
  must be cross-family. This aligns with wanting a stronger model than DeepSeek V4 Flash for
  the harder global task. DeepSeek remains the extractor and the minted-node grounding
  generator; only the prerequisite-judge role moves.

- **Backing model chosen by measurement, not committed in code.** The application calls one
  ordering alias; the real-use pass sweeps that alias over non-DeepSeek candidates and picks
  by learner-sensible edges and net cost.

- **Asserted-edges-only trace.** The run records the edges the judge asserts plus the
  deterministic dispositions on them; pairs the judge stays silent on are implicit "no
  relation" with no record. A spurious edge stays fully visible; a wrongly-omitted edge leaves
  no trace. Accepted as the cost of the cleaner output shape.

- **`removeCycles` is split, not kept whole.** Cycle *detection* is load-bearing and stays as
  the acyclicity verifier and the source of the corrective-re-prompt feedback. The
  lowest-confidence-edge *removal* heuristic is deleted in the same change: under whole-set
  ordering a surviving cycle is rare and is genuine epistemic-uncertainty signal (ADR-0028),
  so it is routed wholesale to `uncertain` rather than suppressed by silently dropping one
  edge and trusting the rest of a structure the model just contradicted itself on.

## Requirements

### Whole-set ordering mechanism

- R1. Prerequisite derivation issues one whole-set judgment call per Declared Domain over the
  deduplicated derived node set (anchors ∪ rescued ∪ minted), replacing per-pair and
  per-node-batched judging.
- R2. The judge returns a directed prerequisite edge list, each edge carrying its direction
  (prerequisite → dependent), a confidence in [0,1], and a rationale.
- R3. A pair the judge does not assert as an edge is treated as "no prerequisite relation";
  no disposition is recorded for non-edges.
- R4. A node with no evidence is excluded from the judgment input and recorded once as an
  insufficient-evidence exclusion, not per pair.

### Judge model and routing

- R5. The whole-set ordering runs through a single LiteLLM ordering alias backed by a
  non-DeepSeek model, cross-family from the minted-node grounding generator (ADR-0023).
- R6. DeepSeek stays the extractor and the minted-node grounding generator; only the
  prerequisite-judge role moves off it.
- R7. The two existing prerequisite-judge aliases and the per-pair anchor/generated routing
  split are removed in the same change (rule 18).
- R8. The backing model is selected by a measured sweep over non-DeepSeek candidates, not
  hard-committed in application code.

### Acyclicity validation

- R9. Before persisting, the application boundary verifies the returned edge set is acyclic
  and that every edge cites a real node in the judged set, failing closed on invalid
  tool arguments (rule 6).
- R10. A detected cycle triggers exactly one bounded corrective re-prompt naming the specific
  violating cycle; an open agentic self-checking loop is a non-goal.
- R11. A still-cyclic result after the single re-prompt routes every edge in the offending
  cycle(s) to `uncertain` (kept, flagged, excluded from the traversable DAG), never silently
  dropped.
- R12. Cycle detection is retained as the acyclicity verifier; the lowest-confidence-edge
  removal heuristic is deleted in the same change (rule 18).

### Disposal and output contract

- R13. After validation, certain edges pass weak-edge cut then transitive reduction;
  `uncertain` edges are retained outside the traversable DAG.
- R14. The Derived Graph Layer output contract is unchanged, so Study Item Bank, Learner Path,
  and intrinsic difficulty are untouched.
- R15. The run persists asserted edges with confidence and rationale, their deterministic
  dispositions (weak-cut, transitive-reduction, kept, cycle→uncertain), and per-node
  insufficient-evidence exclusions; the exhaustive per-pair disposition grid is removed.

### Sizing and failure

- R16. One call per domain. If a domain's input exceeds the judge's token budget the run fails
  closed without persisting a partial layer; chunked-DAG merging is not introduced.

### Measurement and promotion

- R17. Ship as a single-sample run-scoped experiment compared against the current ADR-0019
  exhaustive baseline by real-use inspection (rules 13/14) on the Rust + economics fixtures.
- R18. Promote into the core only if edges are more learner-sensible and the run is net
  cheaper; otherwise hold at EXPERIMENT_ONLY or revert.
- R19. The existing per-stage `stage_timing` and `/spend/tags` measurement instrument carries
  forward unchanged.

## Acceptance Examples

- AE1. Covers R9, R10.
  - **Given:** a domain's first whole-set response contains a cycle X→Y→Z→X.
  - **When:** the boundary verifies acyclicity.
  - **Then:** it issues one corrective re-prompt naming that cycle; if the revised response is
    acyclic, it persists normally.
- AE2. Covers R11.
  - **Given:** the response is still cyclic after the one corrective re-prompt.
  - **When:** disposal runs.
  - **Then:** every edge in the offending cycle is routed to `uncertain` and excluded from the
    traversable DAG; the rest of the edge set is unaffected; nothing is silently dropped.
- AE3. Covers R5.
  - **Given:** a domain whose node set includes a minted `llm_grounded` node.
  - **When:** the whole-set call runs.
  - **Then:** it runs on the non-DeepSeek ordering alias, so the grounding generator never
    grades relations involving its own minted output.
- AE4. Covers R16.
  - **Given:** a domain whose concepts plus evidence exceed the judge's token budget.
  - **When:** the run attempts the whole-set call.
  - **Then:** the run fails closed with no partial layer persisted; it does not chunk and merge.
- AE5. Covers R4.
  - **Given:** a derived node with no definition or mention evidence.
  - **When:** the judgment input is assembled.
  - **Then:** the node is excluded from the prompt and recorded once as an insufficient-evidence
    exclusion.

## Success Criteria

- Edges read as more learner-sensible than the exhaustive baseline on the Rust + economics
  fixtures under real-use inspection (rule 14), not by any deterministic proxy.
- Net cost per enrichment run is lower than the baseline — the ~1-call-per-domain volume drop
  offsets a higher per-token price.
- Every cycle outcome is inspectable: no cycle is silently dropped, and each `uncertain`
  routing is visible in Admin Lab.
- Forced-tool transport holds for whole-domain prompts; malformed tool arguments fail closed
  (rule 6) rather than producing a partial layer.

## Scope Boundaries

### Deferred for later

- K-sampling / self-consistency for direction-instability (TODO #2) — ship single-sample
  first and add K only if real-use inspection shows direction-instability is the live defect.
- Chunked-DAG merging for oversized domains — revisited only if the fail-loud guard fires in
  practice.

### Outside this change's identity

- Embeddings in prerequisite derivation — they propose dedup candidates only, never prerequisite
  edges (rule 20, ADR-0012).
- An agentic self-checking tool-call loop — bounded verify-and-route plus one re-prompt only.
- Re-opening serving determinism — MoE non-determinism is signal, not a bug (ADR-0028).
- Cross-domain ordering — judgment stays same-domain (ADR-0015).

## Dependencies / Assumptions

- Assumes the deduplicated per-domain node set is small enough for one call (rule 3 keeps the
  core small; the merged dedup pass collapses duplicates). R16's fail-loud guard surfaces this
  if it is false.
- Builds on the already-merged dedup + rescue/minting durability cleanup, which provides the
  cleaner derived node set the DAG ranges over.
- Assumes the candidate judge models support forced `tool_choice` for the edge-list schema;
  confirm per candidate during planning.
- ADR-0019 and ADR-0023 require amendment to record the whole-set call and the
  single-non-DeepSeek-judge routing.

## Outstanding Questions

### Deferred to planning

- The forced-tool schema for the edge list and its argument validator.
- Whether weak-edge cut should also route to `uncertain` rather than drop; kept as a drop for
  now, revisit if inspection shows low confidence does not predict wrong edges.
- The corrective re-prompt's exact framing of the violating cycle.
- The token-budget threshold for the R16 fail-loud guard.

## Sources / Research

- `packages/application/src/runGraphEnrichment.ts` — enrichment orchestration; the per-node
  judging steps (domain grouping, forward-candidate selection, edge mapping, disposal) this
  change reshapes.
- `packages/application/src/judgeNodeAgainstCandidates.ts` — the per-node batched primitive and
  family-routing split being removed.
- `packages/infrastructure-litellm/src/enrichmentAdapters.ts` — the batched
  `submit_prerequisite_judgments` adapter and the judge aliases being consolidated.
- `packages/application/src/prerequisiteDag.ts` — `removeCycles` (to be split),
  `cutWeakEdges`, `transitiveReduction` (retained).
- `litellm/config.yaml` — judge aliases and the already-provisioned non-DeepSeek candidates
  (gpt-oss-120b, mimo-v2.5-pro, qwen3-235b, llama-4-scout).
- ADRs: 0019 (Graph Enrichment), 0023 (cross-family generated-node judge), 0028
  (non-deterministic quality), 0015 (same-domain identity), 0012 (embeddings propose-only).
- `docs/plans/TODO.md` #1 (parked findings for this task) and #2 (K-sampling sequencing).
