import type { KnowledgeBoundaryProbePort, NodeEmbeddingPort } from "@lrnki/ports";
import { cosineSimilarity } from "./deduplicateDerivedNodes";
import { mapWithConcurrency } from "./mapWithConcurrency";

// Knowledge-boundary probe aggregation (plan 2026-06-30-001 U3, R7/R8, KTD4). Turns K
// independent probe draws into a `core_knowledge` / `boundary` verdict by measuring
// SEMANTIC AGREEMENT across the K answers with the existing embedding port — a
// similarity use ADR-0012 permits, not a new judge and not lexical overlap. High
// agreement means the small cross-family model answers the same way every time (it knows
// the concept); dispersion means the concept sits at its knowledge boundary, where
// confident hallucination scatters. This mirrors `deriveConsensusOrdering`'s shape
// (K draws → aggregate → route), but the aggregation is embedding cosine, not a vote.
//
// Recognized problem class (AGENTS rule 21): knowledge-boundary / hallucination
// detection via self-consistency (SelfCheckGPT) and semantic entropy. Both need sampling
// diversity, hence MODERATE temperature (set on the injected probe client), not low —
// low temperature masks confident hallucination behind a repeated wrong answer.

export type KnowledgeBoundaryDisposition = "core_knowledge" | "boundary";

type KnowledgeBoundaryVerdictCommon = {
  // Mean pairwise cosine over the K answer embeddings. A valid admission policy always samples
  // at least two answers, and an unavailable or malformed embedding result propagates instead of
  // being misreported as a measured boundary outcome.
  agreementScore: number;
  // The K raw probe answers, retained for the operation's inspectable trace.
  answers: string[];
  rationale: string;
};

export type KnowledgeBoundaryVerdict = KnowledgeBoundaryVerdictCommon & (
  | { disposition: "core_knowledge" }
  | { disposition: "boundary" }
);

export type KnowledgeBoundaryProbeConfig = {
  // K: how many independent probe draws to sample per concept.
  sampleCount: number;
  // Bounded fan-out for the K draws (mirrors the enrichment per-node concurrency).
  probeConcurrency: number;
  // Mean-pairwise-cosine floor a concept must clear to be routed `core_knowledge`.
  // A shipped DEFAULT calibrated by real-use inspection in U8 (never assumed).
  agreementThreshold: number;
};

// Shipped defaults, calibrated against the 2026-07-07 real-use ladder in
// tmp/2026-07-07-boundary-probe-calibration/evidence.md (ADR-0013/ADR-0028). K=10 is
// required on the weaker fallback deployment; K=5 failed to expose enough dispersion.
// The initial measured threshold candidate 0.92 kept the ladder's textbook tier core, but
// the production-path Biology control false-boundaried photosynthetic electron transport
// at 0.8951. Threshold 0.89 keeps that textbook control core while still routing the
// fabricated Caldrin-Voss production-path concept (0.8723) to boundary.
export const DEFAULT_KNOWLEDGE_BOUNDARY_PROBE_CONFIG: KnowledgeBoundaryProbeConfig = {
  sampleCount: 10,
  probeConcurrency: 5,
  agreementThreshold: 0.89
};

export async function probeKnowledgeBoundary(input: {
  conceptLabel: string;
  declaredDomain: string;
  probe: KnowledgeBoundaryProbePort;
  embedding: NodeEmbeddingPort;
  config: KnowledgeBoundaryProbeConfig;
}): Promise<KnowledgeBoundaryVerdict> {
  validateKnowledgeBoundaryProbeConfig(input.config);
  const k = input.config.sampleCount;
  const concurrency = input.config.probeConcurrency;

  // K independent draws over the SAME concept. A probe transport/schema failure
  // propagates (the operation fails the stage) — only the embedding half fails safe.
  const answers = await mapWithConcurrency(
    Array.from({ length: k }),
    concurrency,
    () => input.probe.probe({ conceptLabel: input.conceptLabel, declaredDomain: input.declaredDomain }).then((draw) => draw.answer)
  );

  const vectors = await input.embedding.embed(answers);
  if (vectors.length !== answers.length) {
    throw new Error(`Knowledge-Boundary Probe embedding returned ${vectors.length} vectors for ${answers.length} answers.`);
  }
  const agreementScore = meanPairwiseCosine(vectors);
  if (!Number.isFinite(agreementScore)) {
    throw new Error("Knowledge-Boundary Probe embedding produced a non-finite agreement score.");
  }

  const disposition: KnowledgeBoundaryDisposition =
    agreementScore >= input.config.agreementThreshold ? "core_knowledge" : "boundary";
  return {
    disposition,
    agreementScore,
    answers,
    rationale: `mean pairwise cosine ${agreementScore.toFixed(4)} over ${answers.length} draws ${disposition === "core_knowledge" ? ">=" : "<"} threshold ${input.config.agreementThreshold}`
  };
}

export function validateKnowledgeBoundaryProbeConfig(config: KnowledgeBoundaryProbeConfig): void {
  if (!Number.isInteger(config.sampleCount) || config.sampleCount < 2) {
    throw new Error("Knowledge-Boundary Probe sampleCount must be an integer of at least 2.");
  }
  if (!Number.isInteger(config.probeConcurrency) || config.probeConcurrency < 1) {
    throw new Error("Knowledge-Boundary Probe probeConcurrency must be a positive integer.");
  }
  if (!Number.isFinite(config.agreementThreshold) || config.agreementThreshold < -1 || config.agreementThreshold > 1) {
    throw new Error("Knowledge-Boundary Probe agreementThreshold must be between -1 and 1.");
  }
}

// Mean cosine over every unordered pair of the K answer vectors. With near-identical
// answers this approaches 1; a single divergent draw at large K only pulls the mean down
// by its fraction of the pairs, so a robust consensus survives one outlier.
function meanPairwiseCosine(vectors: number[][]): number {
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      sum += cosineSimilarity(vectors[i], vectors[j]);
      pairs += 1;
    }
  }
  return pairs === 0 ? 0 : sum / pairs;
}
