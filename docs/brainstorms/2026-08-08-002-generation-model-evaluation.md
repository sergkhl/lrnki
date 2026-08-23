---
title: DeepSeek Flash Generation Cutover and Pipeline Simplification - Brainstorm
type: brainstorm
date: 2026-08-08
---

# DeepSeek Flash Generation Cutover and Pipeline Simplification

**Status:** Interview resolved. The scoped cutover and stage-value decision are complete. The
[ready deepening plan](../plans/2026-08-23-002-deepen-source-less-grounding-and-answer-correlation.md)
owns the two accepted quality seams and affected-consumer qualification.

## Decided direction

Expedition generation will move to the latest official DeepSeek Flash release selected during the
follow-up. This is a cutover direction, not a hypothesis that asks whether DeepSeek is better than
the incumbent.

At the repository date, the current official release is
[`DeepSeek-V4-Flash-0731`](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731). DeepSeek's
model card states that it supersedes the preview release, and the repository already registers this
revision for judge roles. `litellm/config.yaml` remains the source of truth for the current
alias-to-deployment mapping; this brainstorm does not change it or any Model Assignment.

The implemented cutover uses the exact pinned [Model Assignment](../../CONTEXT.md#model-operations),
not a moving `latest` alias. Current alias-to-deployment truth remains in `litellm/config.yaml`.

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

The planning interview and initial stage decision are complete. Seventeen stages remain `KEEP`; the
ready deepening plan owns Grounding Generation and Verification Answering without reopening the
judge topology. The handoff retains these constraints:

- Re-derive the affected consumer set from prompt frontmatter and the current LiteLLM mapping.
- **Grounding generation and its judge must stay cross-family.**
  [ADR-0023](../adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md) requires the
  generating and judging roles to move as an independent pair. The judge has no independently
  qualified destination if the whole alias moves today.
- Treat earlier blueprint changes, extra attempts, and pipeline stages as scope candidates rather
  than inherited implementation requirements.
- Keep the DeepSeek choice separate from Provider Route selection and qualification.

## Release qualification

Validation does not compare models to decide whether to proceed. The ready deepening plan must
qualify the pinned Model Assignment and Provider Route, every affected consumer, cost, and
learner-facing quality; the active latency plan separately owns the successful 420-second baseline
and soak required before release under
[ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md) and
[ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md).
Affected prior quality evidence is re-run or explicitly marked unqualified.
