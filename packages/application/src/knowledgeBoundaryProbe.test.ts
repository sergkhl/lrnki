import assert from "node:assert/strict";
import { test } from "node:test";
import type { KnowledgeBoundaryProbePort, NodeEmbeddingPort } from "@lrnki/ports";
import {
  DEFAULT_KNOWLEDGE_BOUNDARY_PROBE_CONFIG,
  probeKnowledgeBoundary,
  type KnowledgeBoundaryProbeConfig
} from "./knowledgeBoundaryProbe";

// Fake probe: returns the scripted answers in order, one per draw. A concept with a firm
// knowledge boundary yields near-identical answers; a boundary concept yields divergent
// ones. The fake never touches the network (rule 11).
function fakeProbe(answers: string[]): KnowledgeBoundaryProbePort {
  let cursor = 0;
  return {
    model: "fake-probe",
    async probe() {
      const answer = answers[cursor % answers.length];
      cursor += 1;
      return { answer };
    }
  };
}

// Fake embedding: maps each answer string to a caller-supplied vector so a test can model
// "these two answers mean the same thing" (near-identical vectors) vs "these diverge"
// (orthogonal vectors) without a real embedding model. Preserves input order like the real
// port and throws on an unknown answer (shape mismatch, mirroring the real fail-closed).
function fakeEmbedding(vectorByAnswer: Record<string, number[]>): NodeEmbeddingPort {
  return {
    model: "fake-embedding",
    async embed(texts: string[]) {
      return texts.map((text) => {
        const vector = vectorByAnswer[text];
        if (!vector) throw new Error(`no fake vector for ${JSON.stringify(text)}`);
        return vector;
      });
    }
  };
}

const config: KnowledgeBoundaryProbeConfig = { sampleCount: 5, probeConcurrency: 2, agreementThreshold: 0.82 };

test("K near-identical answers score high agreement and route core_knowledge (AE1)", async () => {
  const verdict = await probeKnowledgeBoundary({
    conceptLabel: "Concept A",
    declaredDomain: "some domain",
    probe: fakeProbe(["same answer"]),
    embedding: fakeEmbedding({ "same answer": [1, 0] }),
    config
  });
  assert.equal(verdict.disposition, "core_knowledge");
  assert.equal(verdict.agreementScore, 1);
});

test("K divergent answers score low agreement and route boundary (AE2)", async () => {
  const answers = ["d0", "d1", "d2", "d3", "d4"];
  const verdict = await probeKnowledgeBoundary({
    conceptLabel: "Concept B",
    declaredDomain: "some domain",
    probe: fakeProbe(answers),
    embedding: fakeEmbedding({
      d0: [1, 0, 0, 0, 0],
      d1: [0, 1, 0, 0, 0],
      d2: [0, 0, 1, 0, 0],
      d3: [0, 0, 0, 1, 0],
      d4: [0, 0, 0, 0, 1]
    }),
    config
  });
  assert.equal(verdict.disposition, "boundary");
  assert.equal(verdict.agreementScore, 0);
});

test("a single stray divergent draw at K=5 does not flip a robust core_knowledge to boundary", async () => {
  // Four tightly-agreeing answers (cosine 1 to each other) plus one stray that still shares
  // domain vocabulary (cosine 0.8 to the others). Mean pairwise cosine = (6*1 + 4*0.8)/10 =
  // 0.92 >= 0.82, so the robust consensus survives the outlier.
  const answers = ["a", "a", "a", "a", "stray"];
  const verdict = await probeKnowledgeBoundary({
    conceptLabel: "Concept C",
    declaredDomain: "some domain",
    probe: fakeProbe(answers),
    embedding: fakeEmbedding({ a: [1, 0], stray: [0.8, 0.6] }),
    config
  });
  assert.equal(verdict.disposition, "core_knowledge");
  assert.ok(verdict.agreementScore !== null && verdict.agreementScore > 0.82);
});

test("embedding-port failure fails safe to boundary, never silently core_knowledge", async () => {
  const throwingEmbedding: NodeEmbeddingPort = {
    model: "fake-embedding",
    async embed() {
      throw new Error("embedding transport down");
    }
  };
  const verdict = await probeKnowledgeBoundary({
    conceptLabel: "Concept D",
    declaredDomain: "some domain",
    probe: fakeProbe(["x"]),
    embedding: throwingEmbedding,
    config
  });
  assert.equal(verdict.disposition, "boundary");
  assert.equal(verdict.agreementScore, null);
  assert.match(verdict.rationale, /embedding port unavailable/);
});

test("a single draw carries no dispersion signal and fails safe to boundary", async () => {
  const verdict = await probeKnowledgeBoundary({
    conceptLabel: "Concept E",
    declaredDomain: "some domain",
    probe: fakeProbe(["only"]),
    embedding: fakeEmbedding({ only: [1, 0] }),
    config: { ...config, sampleCount: 1 }
  });
  assert.equal(verdict.disposition, "boundary");
  assert.equal(verdict.agreementScore, null);
});

test("a mismatched embedding count fails safe to boundary", async () => {
  const shortEmbedding: NodeEmbeddingPort = {
    model: "fake-embedding",
    async embed(texts: string[]) {
      return texts.slice(1).map(() => [1, 0]); // one fewer vector than answers
    }
  };
  const verdict = await probeKnowledgeBoundary({
    conceptLabel: "Concept F",
    declaredDomain: "some domain",
    probe: fakeProbe(["p", "q", "r"]),
    embedding: shortEmbedding,
    config: { ...config, sampleCount: 3 }
  });
  assert.equal(verdict.disposition, "boundary");
  assert.equal(verdict.agreementScore, null);
});

test("thresholds and K are config-driven, not hard-coded", () => {
  assert.equal(DEFAULT_KNOWLEDGE_BOUNDARY_PROBE_CONFIG.sampleCount, 10);
  assert.equal(DEFAULT_KNOWLEDGE_BOUNDARY_PROBE_CONFIG.agreementThreshold, 0.89);
  assert.ok(DEFAULT_KNOWLEDGE_BOUNDARY_PROBE_CONFIG.agreementThreshold > 0 && DEFAULT_KNOWLEDGE_BOUNDARY_PROBE_CONFIG.agreementThreshold < 1);
});

test("measured defaults route a fabricated production-path score below 0.89 to boundary and a core score above it to core_knowledge", async () => {
  const fabricatedAnswers = Array.from({ length: 10 }, (_, index) => `fabricated-${index}`);
  const fabricatedVerdict = await probeKnowledgeBoundary({
    conceptLabel: "Fabricated measurement analogue",
    declaredDomain: "some domain",
    probe: fakeProbe(fabricatedAnswers),
    embedding: fakeEmbedding({
      ...Object.fromEntries(fabricatedAnswers.slice(0, 9).map((answer) => [answer, [1, 0]])),
      "fabricated-9": [0, 1]
    }),
    config: DEFAULT_KNOWLEDGE_BOUNDARY_PROBE_CONFIG
  });
  assert.equal(fabricatedVerdict.disposition, "boundary");
  assert.match(fabricatedVerdict.rationale, /threshold 0\.89/);

  const coreVerdict = await probeKnowledgeBoundary({
    conceptLabel: "Core measurement analogue",
    declaredDomain: "some domain",
    probe: fakeProbe(["same"]),
    embedding: fakeEmbedding({ same: [1, 0] }),
    config: DEFAULT_KNOWLEDGE_BOUNDARY_PROBE_CONFIG
  });
  assert.equal(coreVerdict.disposition, "core_knowledge");
});
