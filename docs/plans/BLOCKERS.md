# Blockers

- **LLM provider returns 403 on the extraction aliases — blocks rule-14 real-use measurement.**
  As of 2026-06-25 the `kg-concept-discovery` (and extraction) alias returns HTTP 403 in ~0.4s
  through the local LiteLLM proxy (proxy itself reports alive). Because discovery is the first
  pipeline stage, every real extraction run fails immediately, so the rule-14 A/B for the CEP
  definition in-window mis-pick prompt clause (TODO #1) could not be completed. Preliminary signal
  from runs before the outage was positive (baseline run: 1 hollow demotion / 3 vetoes; one clean
  post-clause run: 0 / 0), but this is not a rule-14 PASS. **Manual action:** restore provider
  access (credits / key / routing) for the extraction aliases, then re-run the A/B with
  `bash tmp/2026-06-25-cep-defn-retrieval/ab.sh` (SKIP_SCAN fast variant) and record the result.
