import assert from "node:assert/strict";
import { test } from "node:test";
import type { KnowledgeBoundaryProbePort, NodeEmbeddingPort } from "@lrnki/ports";
import {
  calibrateKnowledgeBoundaryProbe,
  parseKnowledgeBoundaryLadder,
  scoreKnowledgeBoundaryVectors
} from "./calibrateKnowledgeBoundaryProbe";

function probe(model: string, answers: string[]): KnowledgeBoundaryProbePort {
  let cursor = 0;
  return {
    model,
    async probe() {
      const answer = answers[cursor % answers.length];
      cursor += 1;
      return { answer };
    }
  };
}

function embedding(vectorsByText: Record<string, number[]>): NodeEmbeddingPort {
  return {
    model: "fake-embedding",
    async embed(texts: string[]) {
      return texts.map((text) => {
        const vector = vectorsByText[text];
        if (!vector) throw new Error(`missing vector for ${text}`);
        return vector;
      });
    }
  };
}

test("crafted vectors produce expected K-subset scores and threshold dispositions", () => {
  const scored = scoreKnowledgeBoundaryVectors({
    vectors: [
      [1, 0],
      [1, 0],
      [0, 1]
    ],
    kValues: [2, 3],
    thresholds: [0.5, 0.8]
  });
  assert.equal(scored.scores.find((score) => score.k === 2)?.agreementScore, 1);
  assert.equal(scored.scores.find((score) => score.k === 3)?.agreementScore, 1 / 3);
  assert.equal(scored.scores.find((score) => score.k === 3)?.dispositionsByThreshold["0.5000"], "boundary");
  assert.equal(scored.scores.find((score) => score.k === 2)?.dispositionsByThreshold["0.8000"], "core_knowledge");
});

test("calibration report includes raw answers, served models, K scores, and tier summaries", async () => {
  const report = await calibrateKnowledgeBoundaryProbe({
    ladder: [
      { conceptLabel: "Photosynthesis", declaredDomain: "Biology", tier: "established-core" },
      { conceptLabel: "The invented Moravec-Linden fixed point", declaredDomain: "Mathematics", tier: "fabricated" }
    ],
    passes: [{ deployment: "deployment-a", temperature: 0.7, probe: probe("deployment-a", ["same", "same", "same", "same", "same"]) }],
    embedding: embedding({ same: [1, 0] }),
    sampleCount: 5,
    drawConcurrency: 2,
    kValues: [3, 5],
    thresholds: [0.82],
    now: new Date("2026-07-07T00:00:00.000Z")
  });
  assert.equal(report.generatedAt, "2026-07-07T00:00:00.000Z");
  assert.equal(report.concepts.length, 2);
  assert.deepEqual(report.concepts[0]?.servedModels, ["deployment-a", "deployment-a", "deployment-a", "deployment-a", "deployment-a"]);
  assert.equal(report.concepts[0]?.answers.length, 5);
  assert.equal(report.concepts[0]?.scores.find((score) => score.k === 3)?.agreementScore, 1);
  assert.equal(report.tierSummaries.find((summary) => summary.tier === "established-core" && summary.k === 5)?.count, 1);
});

test("threshold sweep flips a concept disposition exactly at its score", () => {
  const scored = scoreKnowledgeBoundaryVectors({
    vectors: [
      [1, 0],
      [0.6, 0.8]
    ],
    kValues: [2],
    thresholds: [0.6, 0.6001]
  });
  assert.equal(scored.scores[0]?.agreementScore, 0.6);
  assert.equal(scored.scores[0]?.dispositionsByThreshold["0.6000"], "core_knowledge");
  assert.equal(scored.scores[0]?.dispositionsByThreshold["0.6001"], "boundary");
});

test("single-concept tiers and identical vectors summarize cleanly", async () => {
  const report = await calibrateKnowledgeBoundaryProbe({
    ladder: [{ conceptLabel: "Single", declaredDomain: "Test", tier: "fringe-contested" }],
    passes: [{ deployment: "deployment-b", temperature: 1, probe: probe("deployment-b", ["one"]) }],
    embedding: embedding({ one: [1, 0] }),
    sampleCount: 3,
    kValues: [3],
    thresholds: [0.9],
    now: new Date("2026-07-07T00:00:00.000Z")
  });
  const summary = report.tierSummaries[0];
  assert.equal(summary?.tier, "fringe-contested");
  assert.equal(summary?.min, 1);
  assert.equal(summary?.max, 1);
  assert.deepEqual(summary?.boundaryCountsByThreshold, { "0.9000": 0 });
});

test("empty, malformed, and unknown-tier ladder files fail fast", () => {
  assert.throws(() => parseKnowledgeBoundaryLadder("[]"), /at least one concept/);
  assert.throws(() => parseKnowledgeBoundaryLadder("{"), /malformed/);
  assert.throws(
    () => parseKnowledgeBoundaryLadder(JSON.stringify([{ conceptLabel: "X", declaredDomain: "Y", tier: "unknown" }])),
    /unknown tier/
  );
});
