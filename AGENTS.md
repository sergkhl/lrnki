## Rules

1. IMPORTANT: breaking architectural changes are allowed. This is greenfield development. Do not preserve compatibility unless explicitly requested.

2. Preserve Deep Module Architecture. Keep domain logic isolated from infrastructure, UI, and orchestration. Enforce dependency direction inward. Communicate only through explicit ports.

3. Keep the Learner-Neutral Core Concept Graph intentionally small. Add embeddings, graph databases, schema induction, neuro-symbolic inference, multimodal extraction, and personalization only as explicit measured modules or experiments.

4. Prioritize real curated source fixtures across mixed domains and formats. Use real LLM calls in integration quality runs.

5. Route LLM calls through LiteLLM aliases. Concept discovery, concept admission, and concept-conditioned claim extraction must not bypass their ports. Production extraction uses DeepSeek V4 Flash with thinking explicitly disabled unless an experiment states otherwise.

6. Structured LLM output must use forced named tool schemas. Do not depend on free-form JSON output. Validate all tool arguments in the application boundary and fail closed.

7. Use PostgreSQL 18 with JSONB artifact envelopes and JSON_TABLE query surfaces from the start.

8. The app is unreleased. Do not preserve backward compatibility unless explicitly requested. Keep only the single initial database migration. You may reset DB state aggressively without asking for an approval.

9. Store stable curated sources under fixtures/. Store generated artifacts, reports, and scratch outputs under disposable gitignored tmp/.

10. Model-authored benchmark labels are oracle references, not human gold. Freeze model, prompt, rubric, evidence, source hashes, and second-judge outcomes. Quarantine disagreements.

11. Keep Admin Lab minimal and graph-focused. It may inspect and trigger explicit versioned operations. It must never silently mutate a published graph.

12. After every important behavior-changing milestone, apply @.agents/skills/real-use-quality-evaluation/SKILL.md before adding downstream complexity. Passing tests alone is not sufficient; inspect representative real-use output, fix foundational quality defects early, and state explicit caveats when intended quality cannot be verified.
