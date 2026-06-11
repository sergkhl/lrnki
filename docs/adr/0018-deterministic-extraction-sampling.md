# Sample the admission and claim stages deterministically; leave discovery and end-to-end reproducibility to the build layer

Status: Accepted

## Decision

Concept admission and concept-conditioned claim extraction call the model with `temperature: 0` and a fixed `seed`. Candidate discovery stays at the model's default sampling. Sampling parameters are part of pipeline-configuration identity (ADR-0017), so changing them bumps the pipeline config hash. Determinism here is a *stage lever*, not an end-to-end guarantee: the replayable unit is the deterministic graph-version build (ADR-0017), not the LLM-heavy extraction run. The forced-tool transport stays neutral — it sends `temperature`/`seed` only when the composition root sets them.

## Context

Forced structured extraction wants reproducible output, not creative sampling, but the lever is only worth applying where it is both effective and harmless. Measured on the three Gate 1 fixtures:

- **Admission, given a fixed candidate set:** default sampling drifted the `core` set by 3–4 concepts across identical re-runs (biology 8→12, 33% candidate flip). Greedy decoding with a fixed seed collapsed that drift (biology and economics to zero, Rust to one borderline candidate). This is the win — and it aligns the neural precision gate with the already-deterministic symbolic half (evidence checks, schema validation, fail-closed gates).
- **Discovery:** greedy decoding made DeepSeek emit a *more exhaustive* candidate list (~26 → ~40 candidates), inflating downstream over-admission of generic primitives (Rust published core rose from 14 to 23–29). Determinism there is also moot — discovery output is not reproducible across separate process invocations even at `temperature: 0`, because the production model's mixture-of-experts inference is not bit-exact. So discovery keeps default sampling.
- **End-to-end:** because discovery output varies across processes, the published core count still varies run-to-run regardless of temperature. That is expected and acceptable: extraction runs are noisy and versioned, and the human selects which runs a graph version publishes. Reproducibility is a property of the build (same runs + rules → same graph), not of extraction.
