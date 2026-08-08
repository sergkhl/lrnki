---
name: real-use-quality-evaluation
description: Evaluate actual end-user usefulness after each meaningful implementation milestone. Use when implementing or changing parsing, concept discovery, concept admission, claim extraction, evidence validation, graph refinement, graph publication, Admin Lab behavior, LLM prompts or tool schemas, quality gates, learner modeling, or projection. Run representative real-use fixtures, inspect outputs with AGI-level judgment, record concrete defects and caveats, and stop downstream work when a foundational result is unusable.
---

# Real-Use Quality Evaluation

Use this skill after every important behavior-changing step and before adding downstream complexity.

Automated tests are necessary but not sufficient. Unit tests, schema validation, and LLM integration tests can prove that code executes as designed while the resulting product remains noisy, incomplete, misleading, or unusable. The coding agent must evaluate real-use quality directly.

## Mandatory evaluation loop

1. **Name the milestone and intended product outcome.**
   State what should now be useful to an end user or downstream module.

2. **Run the smallest representative real-use fixture.**
   Use a curated source and real model calls when the changed behavior depends on an LLM. Prefer one narrow fixture first; expand coverage only after the first output is useful.

3. **Inspect the actual produced artifacts and visible behavior.**
   Review the output as an expert user would, not only as a test author. Depending on the milestone, inspect:
   - parsed source blocks and locators;
   - concept candidates and admission tiers;
   - rejected, optional, and quarantined candidates;
   - typed claims and exact evidence quotes;
   - missing-concept proposals;
   - graph nodes, edges, aliases, confidence, and contradictions;
   - graph-version diffs;
   - Admin Lab rendering and exploration behavior;
   - learner or projection output when those modules exist.

4. **Judge real-use quality explicitly.**
   Classify the result as one of:
   - `PASS`: useful enough to support the next step;
   - `FIX_FIRST`: a defect in the current layer would contaminate downstream work;
   - `EXPERIMENT_ONLY`: promising but not reliable enough to promote into the core;
   - `BLOCKED`: quality cannot be verified because a required fixture, model, service, or environment is unavailable.

5. **Record concrete evidence.**
   Include representative examples of correct output and defects. Do not report only aggregate test status. State whether the result is noisy, incomplete, misleading, unstable, or unverified.

6. **Act before continuing.**
   - Fix `FIX_FIRST` defects before adding downstream complexity.
   - Keep `EXPERIMENT_ONLY` mechanisms outside the authoritative core.
   - For `BLOCKED`, state the exact caveat and do not claim the feature is quality-verified.
   - Continue only after the current layer is useful enough for its intended consumer.
   - Gate scripts that register `learners` against the shared dev DB must delete every learner
     they registered (FK children first) when done, so junk never accumulates on the weekly
     board (plan 2026-07-07-007, R2).

## Foundation failures that must block downstream work

Stop and fix the current layer when any of these occur:

- incidental or low-value concepts enter the authoritative graph;
- important concepts are consistently omitted;
- claim extraction creates unsupported or incorrectly scoped claims;
- evidence quotes do not verify against stored source blocks;
- aliases silently merge distinct concepts;
- graph refinement amplifies noise or creates untraceable edges;
- Admin Lab obscures defects that an operator must inspect;
- a downstream result appears plausible but cannot be traced to stable graph evidence.

## Reading a throttled run before calling it a quality regression

Upstream rate limiting produces *missing content*, which looks exactly like a quality regression in
the output and is not one. Rule these out before recording a defect:

- **The limit is requests-per-minute on a shared upstream account, tripped by the pipeline's
  concurrent brackets — not by one request.** A single hand-run call succeeding proves nothing.
  **Account credit cannot relieve it**: credits buy tokens, not request rate, so a funded balance and
  a sustained 429 coexist normally. `/v1/models` answering `200` is what rules out a dead virtual key
  (the 401-vs-429 separation is in the root README's deployment section).
- **A saturated bracket can return a degraded response with no tool call at all** —
  `{"kind":"no_tool_call"}` in `operation_run_stages.error_detail`. That is upstream load, not a
  schema defect.
- **A topic short on exactly one item type is a throttling signature.** A judge exhausted by 429s
  makes Study Item Key Verification unavailable, which drops impostor items with a
  `… key verification unavailable: … 429` reason in `rejected_study_items` while option-select is
  untouched, because the unavailability dispositions differ by harm (ADR-0026). Read the rejection
  reasons before concluding the generator got worse.
- **Check `learner_expeditions.generation_attempts` before re-triggering by hand.** The topic
  supervisor retries a failed attempt up to 3 times with a 2-minute stale window, so a run that dies
  mid-pipeline usually self-heals.
- **Forced-tool provider locks are paid for in availability.** ADR-0006's guarantee pins some aliases
  to a single provider with `allow_fallbacks: false`, so that provider's ceiling takes out every
  stage on the alias at once. `litellm/config.yaml` owns which aliases carry that exposure.

**Never lower production concurrency to make a gate pass.** The verification concurrency constant is
the knob that moves; changing generation concurrency changes the thing being measured.

## Required evaluation note

Add a short note to the implementation report or pull-request summary:

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

## Scope discipline

Use the smallest evaluation that can reveal product-quality failure early. Do not delay all real-use inspection until the final pipeline exists. Do not add elaborate benchmark infrastructure when direct inspection of one representative fixture can expose the current architectural defect.
