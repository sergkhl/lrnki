---
title: DeepSeek Flash Generation Cutover and Pipeline Simplification - Brainstorm
type: brainstorm
date: 2026-08-08
---

# DeepSeek Flash Generation Cutover and Pipeline Simplification

**Status:** Interview resolved. The initial Topic-scoped cutover and stage-value decision are
complete. The owner-approved
[operation-neutral Grounding plan](../plans/2026-08-23-003-unify-source-less-grounding-on-deepseek.md)
now owns the expanded all-consumer assignment and qualification; the predecessor retains only its
implemented context and answer-correlation record.

## Decided direction

Expedition generation will move to the latest official DeepSeek Flash release selected during the
follow-up. This is a cutover direction, not a hypothesis that asks whether DeepSeek is better than
the incumbent.

At the repository date, the current official release is
[`DeepSeek-V4-Flash-0731`](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731). DeepSeek's
model card states that it supersedes the preview release, and the repository already registers this
revision for judge roles. `litellm/config.yaml` remains the source of truth for the current
alias-to-deployment mapping; this brainstorm does not change it or any Model Assignment.

The implemented Topic cutover uses the exact pinned
[Model Assignment](../../CONTEXT.md#model-operations), not a moving `latest` alias. The subsequent
owner decision assigns Grounding Generation to that DeepSeek release for Topic Expedition, Graph
Enrichment, and generated Support Steps. ADR-0023 makes the graph-node pair atomic: Concept Set
Synthesis and missing-prerequisite proposal use the same DeepSeek assignment, while independent
admission/node judgments move as one cross-family bundle. Current alias-to-deployment truth remains
in `litellm/config.yaml`.

## Dated evidence and known defects

The 2026-08-08 comparison ran three models over 16 nodes with two draws per node, reasoning disabled,
and identical inputs. Each blueprint facet was replayed through the same production matching
generator and guard:

| Arm | Downstream matching items | Decision-relevant observation |
| --- | ---: | --- |
| MiMo v2.5 | 12 of 16 | Incumbent; declined some nodes |
| MiMo v2.5 Pro | 11 of 16 | Rejected on yield, guard failures, latency, and price |
| DeepSeek v4 Flash | 16 of 16 | Best yield and latency; never declined |

Hand inspection also found off-node facets, label-cued matching, one false match, and much longer
facet text. Matching Assignment Verification measures board assignability, not claim truth, so its
later shipment did not close those findings. The latency plan subsequently found over-broad
Grounding Bundles across domains and no qualifying end-to-end attempt.

These defects remain inputs to the release gate. They do not reopen the model choice or justify a
lexical veto, weaker admission, or a generator judging its own output.

## Resolved handoff

The initial stage decision remains complete and seventeen stages remain `KEEP`. The predecessor
implemented only the two accepted interface changes. The new execution owner retains these
constraints:

- Re-derive the affected consumer set from prompt frontmatter and the current LiteLLM mapping.
- **Grounding generation and its judges stay cross-family.**
  [ADR-0023](../adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md) requires the
  generating and judging roles to move as an independent pair. The qualified Topic topology now
  supplies the operation-neutral destination: DeepSeek source-less node production/Grounding, MiMo
  answering and node/primary judgment, and GPT-OSS planning/challenge/ordering. Graph's merge seam
  splits from Concept Canonicalization so generated nodes move to MiMo judgment without reassigning
  source canonicalization.
- Treat earlier blueprint changes, extra attempts, and pipeline stages as scope candidates rather
  than inherited implementation requirements.
- Keep the DeepSeek Model Assignment decision separate from Provider Route selection and
  qualification.

## Release qualification

Validation does not compare models to decide whether to proceed. The operation-neutral plan must
qualify the pinned Model Assignment and Provider Route, every affected consumer, cost, and
learner-facing quality; the active latency plan separately owns the successful 420-second baseline
and soak required before release under
[ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md) and
[ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md).
Affected prior quality evidence is re-run or explicitly marked unqualified.
