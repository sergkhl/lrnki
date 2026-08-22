import { LiteLlmEmbeddingClient } from "./LiteLlmEmbeddingClient";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";

// Shared client-construction policy for every composition root (Candidate 4 of the
// 2026-07-07 architecture deepening review). The kg-worker and the Admin Lab learner
// generation root previously each hand-restated this policy; the sampling decisions
// below are measured and load-bearing, so they live here once. Model ALIASES are not
// policy — each adapter/stage owns its alias (LiteLLM config owns alias → backing model).

export type NeuralClientBaseOptions = {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
};

export type NeuralClients = {
  // Discovery stays at default sampling. It is the recall stage and, empirically,
  // greedy decoding (temperature 0) makes DeepSeek emit a MORE exhaustive candidate
  // list (~26 → ~40 candidates), which inflates downstream over-admission of generic
  // primitives. Determinism here is also moot: discovery output is not reproducible
  // across processes even at temperature 0 (MoE non-determinism), and the replayable
  // unit is the graph-version build, not the extraction run (ADR-0017).
  discoveryClient: LiteLlmForcedToolClient;
  // Low-temperature policy applied where the measured bundle was beneficial: admission
  // is the precision gate and, GIVEN a fixed candidate set, temperature 0 plus seed 7
  // collapsed its core-set drift (probe: spread 3→1/4→0/1→0 across the three fixtures);
  // claims are per-subject and benefit from stable text. The experiment did not isolate
  // seed's contribution from greedy decoding, and seed is only a best-effort sampling
  // input—not a reproducibility guarantee. The Provider Route repair deliberately keeps
  // this policy unchanged rather than reassign every deterministic-client consumer.
  deterministicClient: LiteLlmForcedToolClient;
  // Knowledge-boundary probe client (plan 2026-06-30-001, KTD4). MODERATE temperature —
  // NOT the deterministic 0 — so the K draws carry the sampling diversity that exposes a
  // small model's knowledge boundary as answer dispersion; low temperature would mask
  // confident hallucination behind a repeated wrong answer (ADR-0030 amended). No seed,
  // so the K draws vary.
  probeClient: LiteLlmForcedToolClient;
  // Embedding transport for the semantic-dedup PROPOSE signal (plan U1). Same base
  // options as the forced-tool clients; embeddings have no sampling knobs.
  embeddingClient: LiteLlmEmbeddingClient;
};

// The env → base-config mapping, exported on its own for callers that sweep the
// sampling policy experimentally (boundary-probe calibration) rather than adopt it.
export function resolveNeuralClientBaseOptions(overrides?: Partial<NeuralClientBaseOptions>): NeuralClientBaseOptions {
  return {
    baseUrl: overrides?.baseUrl ?? process.env.LITELLM_BASE_URL ?? "http://localhost:4000",
    apiKey: overrides?.apiKey ?? process.env.LITELLM_API_KEY ?? "sk-local",
    timeoutMs: overrides?.timeoutMs ?? Number(process.env.LITELLM_TIMEOUT_SECONDS ?? "600") * 1000
  };
}

// Owns the env → base-config mapping too; pass `overrides` for experiment-time
// variation (nonstandard timeout, calibration against a different base URL).
export function createNeuralClients(overrides?: Partial<NeuralClientBaseOptions>): NeuralClients {
  const base = resolveNeuralClientBaseOptions(overrides);
  return {
    discoveryClient: new LiteLlmForcedToolClient(base),
    deterministicClient: new LiteLlmForcedToolClient({ ...base, temperature: 0, seed: 7 }),
    probeClient: new LiteLlmForcedToolClient({ ...base, temperature: 0.7 }),
    embeddingClient: new LiteLlmEmbeddingClient(base)
  };
}
