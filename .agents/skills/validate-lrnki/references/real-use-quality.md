# Real-use quality

Load this reference after every important behavior-changing milestone and before adding downstream
complexity. Automated correctness is necessary but cannot establish that produced knowledge or
visible behavior is useful.

## Contents

- [Evaluation loop](#evaluation-loop)
- [Foundation failures](#foundation-failures)
- [Throttled runs](#throttled-runs)
- [Required note](#required-note)

## Evaluation loop

1. **Name the milestone and product outcome.** State what should now be useful to an end user or
   downstream module.
2. **Run the smallest representative real-use fixture.** Use a curated source and real production
   model calls when changed behavior depends on an LLM. Start narrow; expand only after the first
   result is useful.
3. **Inspect actual artifacts or visible behavior.** Judge them as an expert user, not only as a test
   author. Depending on the milestone, inspect parsed blocks and locators; candidates and admission
   tiers; rejections and quarantine; typed claims and evidence; missing concepts; graph nodes,
   edges, aliases, confidence, contradictions, and version diffs; Admin Lab behavior; or learner and
   projection output.
4. **Assign one verdict.**
   - `PASS`: useful enough for the next step.
   - `FIX_FIRST`: this layer would contaminate downstream work.
   - `EXPERIMENT_ONLY`: promising, but not authoritative.
   - `BLOCKED`: a required fixture, model, service, or environment prevents evaluation.
5. **Record concrete evidence.** Include representative useful output and defects. Say whether the
   result is noisy, incomplete, misleading, unstable, or unverified; do not report aggregate status
   alone.
6. **Act on the verdict.** Fix `FIX_FIRST` before downstream work, keep `EXPERIMENT_ONLY` outside the
   authoritative core, and preserve the exact caveat for `BLOCKED`.

Gate scripts that register learners against the shared development DB must use
`reservedLearnerEmails(runId)` and `cleanupReservedLearners` from
`@lrnki/infrastructure-postgres/test-support`. They own the allowed identity grammar and exact
foreign-key cleanup under [ADR-0041](../../../../docs/adr/0041-own-learner-identity-with-self-hosted-better-auth.md).

## Foundation failures

Stop and repair the current layer when:

- incidental concepts enter the authoritative graph or important concepts are consistently absent;
- claims are unsupported, incorrectly scoped, or backed by quotes that do not verify against stored
  source blocks;
- aliases merge distinct concepts, or refinement creates noisy or untraceable edges;
- Admin Lab hides defects that an operator needs to inspect; or
- a plausible downstream result cannot be traced to stable graph evidence.

## Throttled runs

Rule out upstream rate limiting before calling missing content a quality regression:

- The upstream limit is requests per minute on a shared account and can be tripped by concurrent
  pipeline brackets. A successful single request and available credit do not disprove it. A `200`
  from `/v1/models` rules out a dead virtual key; the root
  [deployment guide](../../../../README.md#deployment) owns the `401` versus `429` diagnosis.
- A saturated bracket can return no forced tool call; inspect
  `operation_run_stages.error_detail` for `{"kind":"no_tool_call"}` before blaming a schema.
- One missing item family can reflect unavailable judge capacity. Read `rejected_study_items` for
  key-verification `429` reasons before judging generation quality.
- Check `learner_expeditions.generation_attempts` before manual retriggering. The supervisor can
  retry a failed attempt, so an interrupted pipeline may still self-heal.
- Check `litellm/config.yaml` for aliases pinned with `allow_fallbacks: false`; one provider ceiling
  can remove every stage on that alias.

Never lower production concurrency to make a gate pass. Adjust only the verification concurrency
when the gate owns such a control; generation concurrency changes the behavior being measured.

## Required note

Add this to the implementation report or owning validation record:

```md
### Real-use quality evaluation

- Milestone:
- Fixture and source type:
- Real model calls used: yes / no / not applicable
- Result: PASS / FIX_FIRST / EXPERIMENT_ONLY / BLOCKED
- Useful output observed:
- Defects observed:
- Changes made after inspection:
- Remaining caveats:
- Safe to continue downstream: yes / no
```

Use the smallest evaluation that can expose a product-quality failure early. Do not build a large
benchmark when direct inspection of one representative fixture can reveal the current defect.
