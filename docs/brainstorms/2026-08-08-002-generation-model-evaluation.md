---
title: Generation Model Evaluation - Brainstorm
type: brainstorm
date: 2026-08-08
---

# Generation Model Evaluation — MiMo v2.5 vs DeepSeek v4 Flash

**Status:** Shaping. No implementation plan is ready; resolve the open decisions below through a
planning interview.

## Question

A dated study-item-blueprint comparison put DeepSeek v4 Flash ahead of production MiMo v2.5 on
downstream yield, latency, and price. Should any production generation stage move, and what evidence
would justify that scope?

litellm/config.yaml owns the current alias-to-deployment mapping. This brainstorm owns the decision
framing and the dated measurement summary; a future plan must re-read the current mapping rather than
copy it.

## Evidence and gap

The 2026-08-08 comparison ran three models over 16 nodes with two draws per node, reasoning disabled,
and identical inputs. Each blueprint facet was replayed through the same production matching generator
and guard:

| Arm | Downstream matching items | Decision-relevant observation |
| --- | ---: | --- |
| MiMo v2.5 | 12 of 16 | Incumbent; declined some nodes |
| MiMo v2.5 Pro | 11 of 16 | Rejected on yield, guard failures, latency, and price |
| DeepSeek v4 Flash | 16 of 16 | Best yield and latency; never declined |

DeepSeek's added yield is not yet trustworthy. Hand inspection found off-node facets, label-cued
matching, one false match, and much longer facet text. Matching Assignment Verification measures
board assignability, not claim truth, so its later shipment did not answer the pre-registered
re-decision test. The missing evidence is a direct comparison of claim truth and on-node relevance for
the items unique to each arm.

## Constraints

- **One alias has a broad blast radius.** At the time of the comparison, kg-claim-extraction served
  eleven prompt descriptors, including grounding generation, CEP extraction, Concept Lessons, all
  Study Item generators, and scaffold generation. Prompt frontmatter is authoritative; re-derive the
  consumer set before planning.
- **Grounding generation and its judge must stay cross-family.**
  [ADR-0023](../adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md) requires the
  generating and judging roles to move as an independent pair. The judge has no independently
  qualified destination if the whole alias moves today.
- **The cost comparison did not cover document-heavy caching.** MiMo's production deployment is
  provider-pinned for prefix caching, as documented beside the mapping in litellm/config.yaml. Any
  comparison of document-heavy stages must include that current behavior.
- **A model move retires affected quality evidence.** AGENTS rule 14 and
  [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md) require every moved consumer to
  be re-gated or explicitly marked unqualified.

## Candidate options

1. **Give study-item-blueprint its own alias and move only that stage.** This is the smallest scope
   supported by the existing comparison, but claim truth, on-node relevance, and facet length still
   need evaluation.
2. **Move kg-claim-extraction wholesale.** This requires a qualified independent judge destination,
   a multi-consumer comparison, cache-aware economics, and a full re-gate.
3. **Keep MiMo and close the question.** This is justified if the required evidence costs more than
   the measured upside.
4. **Add matching claim-truth verification first.** This addresses a real measurement gap but is a
   separate product decision and does not itself choose a model.

## Carried generation changes

These changes were intentionally excluded from the measured matching-quality branch and belong to the
next plan that pays for a real-use gate:

- Remove the blueprint's matching-facet decline constraint if a fresh gate confirms it rejects useful
  nodes without preventing a reproduced defect.
- Consider a third matching generation attempt. The existing retry remains guarded, so the decision
  is a measured yield-versus-cost trade-off rather than a relaxation of quality.

## Open decisions

1. Is the decision scoped to study-item-blueprint, kg-claim-extraction, or a wider model assignment?
2. What independent model can own judging if grounding generation moves?
3. Will claim truth be scored by representative human inspection or by a separately justified
   matching truth verifier?
4. How many domains and repeated draws make the comparison readable under
   [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md)?
5. Which affected gates will be re-run, and which will be explicitly marked unqualified?
