# @lrnki/infrastructure-litellm

LiteLLM-backed adapters for the extraction, generation, and judgment ports. See the root README and
active ADR registry; `litellm/config.yaml` owns the alias → deployment mapping and every per-model
measurement (AGENTS rule 5).

## Prompt files are cached by path in module state

`readPromptFile` and `readPartial` read each `.prompt` once per process and keep it. A long-lived
host-run process — the admin lab, `kg-worker`, a hand-started API — therefore keeps serving the
prompts it read at startup, so **restart it after editing a `.prompt` or a partial** or it silently
judges with the previous wording. This is the stale-container trap reproduced inside the working-tree
escape from it, and it costs a whole gate run when it goes unnoticed.

Stage config hashes derive mechanically from the descriptor and prompt
([ADR-0034](../../docs/adr/0034-neural-stage-descriptors-dotprompt-config-hashes.md)), so an edited
prompt needs no manual version bump — only the restart.
