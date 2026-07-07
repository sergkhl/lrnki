import type { KnowledgeBoundaryProbePort, NodeEmbeddingPort } from "@lrnki/ports";
import { cosineSimilarity } from "./deduplicateDerivedNodes";
import { mapWithConcurrency } from "./mapWithConcurrency";

export const KNOWLEDGE_BOUNDARY_TIERS = ["established-core", "fringe-contested", "fabricated"] as const;
export type KnowledgeBoundaryTier = (typeof KNOWLEDGE_BOUNDARY_TIERS)[number];

export type KnowledgeBoundaryLadderConcept = {
  conceptLabel: string;
  declaredDomain: string;
  tier: KnowledgeBoundaryTier;
};

export type KnowledgeBoundaryCalibrationPass = {
  deployment: string;
  temperature: number;
  probe: KnowledgeBoundaryProbePort;
};

export type KnowledgeBoundaryCalibrationReport = {
  generatedAt: string;
  sampleCount: number;
  kValues: number[];
  thresholds: number[];
  concepts: KnowledgeBoundaryCalibrationConceptReport[];
  tierSummaries: KnowledgeBoundaryTierSummary[];
};

export type KnowledgeBoundaryCalibrationConceptReport = KnowledgeBoundaryLadderConcept & {
  deployment: string;
  temperature: number;
  servedModels: string[];
  answers: string[];
  scores: KnowledgeBoundaryKScore[];
  pairwiseCosines: number[];
};

export type KnowledgeBoundaryKScore = {
  k: number;
  agreementScore: number;
  dispositionsByThreshold: Record<string, "core_knowledge" | "boundary">;
};

export type KnowledgeBoundaryTierSummary = {
  deployment: string;
  temperature: number;
  tier: KnowledgeBoundaryTier;
  k: number;
  count: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  mean: number;
  boundaryCountsByThreshold: Record<string, number>;
};

export function parseKnowledgeBoundaryLadder(jsonText: string): KnowledgeBoundaryLadderConcept[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`knowledge-boundary ladder JSON is malformed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const rawConcepts = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { concepts?: unknown }).concepts)
      ? (parsed as { concepts: unknown[] }).concepts
      : undefined;
  if (!rawConcepts) {
    throw new Error("knowledge-boundary ladder must be a JSON array or an object with a concepts array.");
  }
  if (rawConcepts.length === 0) {
    throw new Error("knowledge-boundary ladder must contain at least one concept.");
  }
  return rawConcepts.map((raw, index) => parseLadderConcept(raw, index));
}

export async function calibrateKnowledgeBoundaryProbe(input: {
  ladder: KnowledgeBoundaryLadderConcept[];
  passes: KnowledgeBoundaryCalibrationPass[];
  embedding: NodeEmbeddingPort;
  sampleCount?: number;
  conceptConcurrency?: number;
  drawConcurrency?: number;
  kValues?: number[];
  thresholds?: number[];
  now?: Date;
}): Promise<KnowledgeBoundaryCalibrationReport> {
  if (input.ladder.length === 0) {
    throw new Error("knowledge-boundary calibration requires at least one ladder concept.");
  }
  if (input.passes.length === 0) {
    throw new Error("knowledge-boundary calibration requires at least one probe deployment pass.");
  }
  const sampleCount = positiveInteger(input.sampleCount ?? 10, "sampleCount");
  const conceptConcurrency = positiveInteger(input.conceptConcurrency ?? 1, "conceptConcurrency");
  const drawConcurrency = positiveInteger(input.drawConcurrency ?? 5, "drawConcurrency");
  const kValues = normalizeKValues(input.kValues ?? [3, 5, 10], sampleCount);
  const thresholds = normalizeThresholds(input.thresholds ?? thresholdSweep());

  const jobs = input.passes.flatMap((pass) => input.ladder.map((concept) => ({ pass, concept })));
  const concepts = await mapWithConcurrency(jobs, conceptConcurrency, ({ pass, concept }) =>
    calibrateConcept({
      concept,
      pass,
      embedding: input.embedding,
      sampleCount,
      drawConcurrency,
      kValues,
      thresholds
    })
  );

  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    sampleCount,
    kValues,
    thresholds,
    concepts,
    tierSummaries: summarizeTiers(concepts, kValues, thresholds)
  };
}

export function scoreKnowledgeBoundaryVectors(input: {
  vectors: number[][];
  kValues: number[];
  thresholds: number[];
}): { scores: KnowledgeBoundaryKScore[]; pairwiseCosines: number[] } {
  const kValues = normalizeKValues(input.kValues, input.vectors.length);
  const thresholds = normalizeThresholds(input.thresholds);
  return {
    scores: kValues.map((k) => {
      const agreementScore = meanPairwiseCosine(input.vectors.slice(0, k));
      return { k, agreementScore, dispositionsByThreshold: dispositionsByThreshold(agreementScore, thresholds) };
    }),
    pairwiseCosines: pairwiseCosines(input.vectors)
  };
}

function parseLadderConcept(raw: unknown, index: number): KnowledgeBoundaryLadderConcept {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`knowledge-boundary ladder concept ${index + 1} must be an object.`);
  }
  const record = raw as Record<string, unknown>;
  const conceptLabel = stringField(record, "conceptLabel", index);
  const declaredDomain = stringField(record, "declaredDomain", index);
  const tier = stringField(record, "tier", index);
  if (!KNOWLEDGE_BOUNDARY_TIERS.includes(tier as KnowledgeBoundaryTier)) {
    throw new Error(`knowledge-boundary ladder concept ${index + 1} has unknown tier "${tier}".`);
  }
  return { conceptLabel, declaredDomain, tier: tier as KnowledgeBoundaryTier };
}

function stringField(record: Record<string, unknown>, field: string, index: number): string {
  const value = record[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`knowledge-boundary ladder concept ${index + 1} requires a non-empty ${field}.`);
  }
  return value.trim();
}

async function calibrateConcept(input: {
  concept: KnowledgeBoundaryLadderConcept;
  pass: KnowledgeBoundaryCalibrationPass;
  embedding: NodeEmbeddingPort;
  sampleCount: number;
  drawConcurrency: number;
  kValues: number[];
  thresholds: number[];
}): Promise<KnowledgeBoundaryCalibrationConceptReport> {
  const answers = await mapWithConcurrency(Array.from({ length: input.sampleCount }), input.drawConcurrency, () =>
    input.pass.probe.probe({
      conceptLabel: input.concept.conceptLabel,
      declaredDomain: input.concept.declaredDomain
    }).then((draw) => draw.answer)
  );
  const vectors = await input.embedding.embed(answers);
  if (vectors.length !== answers.length) {
    throw new Error(`embedding returned ${vectors.length} vectors for ${answers.length} calibration answers.`);
  }
  const scored = scoreKnowledgeBoundaryVectors({ vectors, kValues: input.kValues, thresholds: input.thresholds });
  return {
    ...input.concept,
    deployment: input.pass.deployment,
    temperature: input.pass.temperature,
    servedModels: answers.map(() => input.pass.probe.model),
    answers,
    scores: scored.scores,
    pairwiseCosines: scored.pairwiseCosines
  };
}

function summarizeTiers(
  concepts: KnowledgeBoundaryCalibrationConceptReport[],
  kValues: number[],
  thresholds: number[]
): KnowledgeBoundaryTierSummary[] {
  const summaries: KnowledgeBoundaryTierSummary[] = [];
  const deployments = [...new Set(concepts.map((concept) => concept.deployment))];
  const temperatures = [...new Set(concepts.map((concept) => concept.temperature))];
  for (const deployment of deployments) {
    for (const temperature of temperatures) {
      for (const tier of KNOWLEDGE_BOUNDARY_TIERS) {
        for (const k of kValues) {
          const scores = concepts
            .filter((concept) => concept.deployment === deployment && concept.temperature === temperature && concept.tier === tier)
            .map((concept) => concept.scores.find((score) => score.k === k)?.agreementScore)
            .filter((score): score is number => typeof score === "number")
            .sort((a, b) => a - b);
          if (scores.length === 0) continue;
          summaries.push({
            deployment,
            temperature,
            tier,
            k,
            count: scores.length,
            min: scores[0] ?? 0,
            p25: percentile(scores, 0.25),
            median: percentile(scores, 0.5),
            p75: percentile(scores, 0.75),
            max: scores[scores.length - 1] ?? 0,
            mean: scores.reduce((sum, score) => sum + score, 0) / scores.length,
            boundaryCountsByThreshold: Object.fromEntries(
              thresholds.map((threshold) => [thresholdKey(threshold), scores.filter((score) => score < threshold).length])
            )
          });
        }
      }
    }
  }
  return summaries;
}

function meanPairwiseCosine(vectors: number[][]): number {
  const cosines = pairwiseCosines(vectors);
  return cosines.length === 0 ? 0 : cosines.reduce((sum, cosine) => sum + cosine, 0) / cosines.length;
}

function pairwiseCosines(vectors: number[][]): number[] {
  const cosines: number[] = [];
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      cosines.push(cosineSimilarity(vectors[i], vectors[j]));
    }
  }
  return cosines;
}

function dispositionsByThreshold(score: number, thresholds: number[]): Record<string, "core_knowledge" | "boundary"> {
  return Object.fromEntries(
    thresholds.map((threshold) => [thresholdKey(threshold), score >= threshold ? "core_knowledge" : "boundary"])
  );
}

function thresholdSweep(): number[] {
  const thresholds: number[] = [];
  for (let value = 0.7; value <= 0.950001; value += 0.01) {
    thresholds.push(Number(value.toFixed(2)));
  }
  return thresholds;
}

function normalizeKValues(kValues: number[], sampleCount: number): number[] {
  const normalized = [...new Set(kValues.map((value) => positiveInteger(value, "k")))].sort((a, b) => a - b);
  if (normalized.length === 0) throw new Error("knowledge-boundary calibration requires at least one K value.");
  for (const k of normalized) {
    if (k > sampleCount) throw new Error(`knowledge-boundary calibration K=${k} exceeds sampleCount=${sampleCount}.`);
  }
  return normalized;
}

function normalizeThresholds(thresholds: number[]): number[] {
  const normalized = [...new Set(thresholds.map((threshold) => Number(threshold.toFixed(4))))].sort((a, b) => a - b);
  if (normalized.length === 0) throw new Error("knowledge-boundary calibration requires at least one threshold.");
  for (const threshold of normalized) {
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      throw new Error(`knowledge-boundary calibration threshold must be between 0 and 1, got ${threshold}.`);
    }
  }
  return normalized;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`knowledge-boundary calibration ${name} must be a positive integer.`);
  }
  return value;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower] ?? 0;
  const weight = index - lower;
  return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight;
}

function thresholdKey(threshold: number): string {
  return threshold.toFixed(4);
}
