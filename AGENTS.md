## Rules

1. IMPORTANT: breaking architectural changes are allowed. This is greenfield development. Do not preserve compatibility unless explicitly requested.

2. Preserve Deep Module Architecture. Keep domain logic isolated from infrastructure, UI, and orchestration. Enforce dependency direction inward. Communicate only through explicit ports.

3. Keep the Learner-Neutral Core Concept Graph intentionally small.

4. Prioritize real curated source fixtures across mixed domains and formats.

5. Route LLM calls through LiteLLM aliases. Concept discovery, concept admission, and concept-conditioned Concept Evidence Profile extraction must not bypass their ports. Production extraction uses DeepSeek V4 Flash with thinking explicitly disabled unless an experiment states otherwise.

6. Structured LLM output must use forced named tool schemas. Do not depend on free-form JSON output. Validate all tool arguments in the application boundary and fail closed.

7. Use PostgreSQL 18 with JSONB artifact envelopes and JSON_TABLE query surfaces from the start.

8. The app is unreleased. Do not preserve backward compatibility unless explicitly requested. Keep only the single initial database migration.

9. You are allowed to reset and re-initialize DB aggressively without asking for an approval if needed while development.

10. Store stable curated sources under fixtures/. Store generated artifacts, reports, and scratch outputs under disposable gitignored tmp/.

11. Quality validation is real-source inspection (rule 14), the retained inline production judges, and deterministic verbatim-evidence verification. Model-authored measurement is disposable scaffolding, never human gold: build a benchmark or oracle only for a specific fix, keep it only while it earns its keep, and remove it once it has. No standing benchmark harness lives in the core (ADR-0013). Automated tests NEVER validate neural output quality, and a green suite is NEVER reported as quality evidence — quality is established only by inspecting real model output (rule 14). Do NOT write tests that stand in for the LLM: no test may feed a fabricated "good" model response and assert the pipeline therefore produced good output (a test that asserts the model's judgment *content* rather than the deterministic *transform of it* has crossed this line). Tests are for the deterministic envelope around the model — symbolic gates (rule 16), policy and fusion logic, graph algorithms, and rule-6 fail-closed argument validation, which must stay tested precisely because they may veto neural output. A canned model response is allowed ONLY as an input fixture exercising that deterministic envelope, never as the thing under assertion (ADR-0013).

12. Keep Admin Lab minimal and graph-focused. It may inspect and trigger explicit versioned operations. It must never silently mutate a published graph.

13. Prioritize real-use quality evaluation and fire real extraction runs with LLM calls.

14. After every important behavior-changing milestone, apply @.agents/skills/real-use-quality-evaluation/SKILL.md before adding downstream complexity. Passing tests alone is not sufficient; inspect representative real-use output, fix foundational quality defects early, and state explicit caveats when intended quality cannot be verified.

15. When developing Web UI, use shadcn base-ui components, apply instructions from @.agents/skills/shadcn/SKILL.md. For graph visualization use cytoscape library.

16. Symbolic gates over neural output must earn their veto. Keep the symbolic layer of the neuro-symbolic approach minimal and prefer neural judgment. A deterministic gate may hard-veto only to enforce a provable guarantee — for example, evidence quotes must match a cited source block verbatim. Heuristic symbolic gates — hardcoded lexical patterns, phrase whitelists, surface-order matchers, closed connective lists — must NOT silently veto otherwise-valid LLM output. Introduce such a gate only as an explicit measured module, and keep it only while an oracle shows it raises precision without discarding valid output. When a heuristic gate produces false negatives, replace it with a measured neural judge or remove it; never expand its hardcoded patterns to chase coverage. The "fail closed" in rule 6 governs schema and tool-argument validity, not semantic acceptance of well-formed output.

17. Keep extraction domain-neutral; never overfit prompts to fixtures or benchmarks. Concept discovery, admission, Core Set Selection, CEP extraction, and all judge prompts — including forced-tool-schema `description` fields, which are model-facing — must express domain-neutral rubric language only. Do NOT inject fixture- or benchmark-specific calibration: named concepts from a known source, expected per-source outcomes, "this source should yield X" tuning, or exemplar lists drawn from a project fixture (e.g. Rust ownership terms, MLE-bench method names, a specific economics chapter title). Such hacks raise one benchmark's score while violating the learner-neutral, domain-general contract (rule 3) and hiding the real defect. When real-use output is wrong, do not patch the prompt with the fixture's answer: surface the defect, record it as a run-scoped quality issue, and fix the root cause — a generic rubric clause, a measured neural judge (rule 16), or an architectural change. Accepting temporary, explicitly-noted quality degradation while the root-cause fix is designed (rules 13–14) is preferred over a benchmark-fitting prompt. Generic illustrative phrasing and abstract placeholders that name no project fixture are allowed; fixture-derived exemplars are not.

18. Delete a superseded path the moment you supersede it — in the same change that introduces the replacement. When you replace or reshape a code path, schema, migration column, port, prompt, adapter, type, or any representation of a fact, the old version must not survive "for reference," "for safety," or "in case." Rules 1 and 8 remove every compatibility excuse: greenfield has no external callers to protect. A retained-but-stale artifact is not harmless dead code — it is a second source of truth that silently drifts, lies to the next reader, and detonates when something regenerates from it (e.g. a Drizzle `schema.ts` left diverging from the canonical hand-written SQL migration until `drizzle-kit generate` would revert the live schema). Therefore: keep exactly ONE source of truth per fact. If a second representation is genuinely needed, it must be mechanically generated from that source, never hand-maintained in parallel; if it cannot be generated, delete it. Before deleting, grep for importers/callers/config references and remove them too, including now-unused dependencies, exports, scripts, and config fields. Do not weaken this into a deferred-cleanup TODO: removing the old path IS part of the migration, not follow-up work.
