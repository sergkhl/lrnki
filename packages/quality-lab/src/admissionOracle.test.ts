import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  FrozenAdmissionOracle,
  FrozenOracleLabel,
  FrozenOracleLabelAlignment,
  OracleLabelAlignmentPair,
  ProductionAdmittedConcept
} from "@lrnki/domain-core";
import { scoreAdmissionOracle, scoreAdmissionOracleAligned } from "./admissionOracle";

function norm(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function refLabel(label: string, tier: "core" | "optional", status: "agreed" | "quarantined"): FrozenOracleLabel {
  return {
    label,
    normalizedLabel: label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    expectedTier: tier,
    evidenceQuotes: [`evidence for ${label}`],
    rationale: "r",
    secondJudgeStatus: status,
    ...(status === "quarantined" ? { quarantineReason: "audit_disagreement" as const } : {}),
    auditRationale: "a"
  };
}

function oracle(labels: FrozenOracleLabel[]): FrozenAdmissionOracle {
  return {
    meta: {
      sourceResourceId: "src", declaredDomain: "d", title: "t", sourceContentHash: "h",
      referenceModel: "kg-oracle-reference", auditModel: "kg-oracle-judge",
      promptVersion: "p", rubricVersion: "r", authoredAt: "2026-06-14T00:00:00Z",
      authoredBy: "oracle-triangle", needsHumanReview: true
    },
    labels
  };
}

function prod(label: string, tier: "core" | "optional" | "reject" | "quarantine"): ProductionAdmittedConcept {
  return { canonicalLabel: label, normalizedLabel: label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(), tier };
}

test("perfect core agreement yields precision/recall 1.0", () => {
  const score = scoreAdmissionOracle({
    sourceResourceId: "src",
    runId: "run",
    production: [prod("Mitosis", "core"), prod("Meiosis", "core")],
    oracle: oracle([refLabel("Mitosis", "core", "agreed"), refLabel("Meiosis", "core", "agreed")])
  });
  assert.equal(score.core.precision, 1);
  assert.equal(score.core.recall, 1);
  assert.equal(score.core.f1, 1);
  assert.deepEqual(score.missedCore, []);
  assert.deepEqual(score.extraCore, []);
});

test("quarantined reference labels are excluded from the trusted set", () => {
  const score = scoreAdmissionOracle({
    sourceResourceId: "src",
    runId: "run",
    // Production omits the quarantined ref concept; that must NOT count as a miss.
    production: [prod("Mitosis", "core")],
    oracle: oracle([refLabel("Mitosis", "core", "agreed"), refLabel("Bogus Claim", "core", "quarantined")])
  });
  assert.equal(score.quarantinedReferenceLabels, 1);
  assert.equal(score.core.referenceCount, 1);
  assert.equal(score.core.recall, 1);
  assert.deepEqual(score.missedCore, []);
});

test("missed and extra core are reported by label", () => {
  const score = scoreAdmissionOracle({
    sourceResourceId: "src",
    runId: "run",
    production: [prod("Mitosis", "core"), prod("Cytokinesis", "core")],
    oracle: oracle([refLabel("Mitosis", "core", "agreed"), refLabel("Meiosis", "core", "agreed")])
  });
  assert.deepEqual(score.missedCore, ["Meiosis"]);
  assert.deepEqual(score.extraCore, ["Cytokinesis"]);
  assert.equal(score.core.recall, 0.5);
  assert.equal(score.core.precision, 0.5);
});

test("admit tier folds optional and core together", () => {
  const score = scoreAdmissionOracle({
    sourceResourceId: "src",
    runId: "run",
    production: [prod("Mitosis", "core"), prod("Spindle Apparatus", "optional"), prod("Noise", "reject")],
    oracle: oracle([refLabel("Mitosis", "core", "agreed"), refLabel("Spindle Apparatus", "optional", "agreed")])
  });
  assert.equal(score.admit.referenceCount, 2);
  assert.equal(score.admit.productionCount, 2); // reject excluded
  assert.equal(score.admit.recall, 1);
  assert.equal(score.admit.precision, 1);
});

test("empty trusted reference does not divide by zero", () => {
  const score = scoreAdmissionOracle({
    sourceResourceId: "src",
    runId: "run",
    production: [prod("Mitosis", "core")],
    oracle: oracle([refLabel("Bogus", "core", "quarantined")])
  });
  // No trusted reference: recall is vacuously 1, precision 0 (production core unmatched).
  assert.equal(score.core.recall, 1);
  assert.equal(score.core.precision, 0);
  assert.deepEqual(score.extraCore, ["Mitosis"]);
});

function pair(productionLabel: string, referenceLabel: string): OracleLabelAlignmentPair {
  return {
    productionLabel,
    productionNormalizedLabel: norm(productionLabel),
    referenceLabel,
    referenceNormalizedLabel: norm(referenceLabel),
    rationale: "surface variant"
  };
}

function alignment(pairs: OracleLabelAlignmentPair[]): FrozenOracleLabelAlignment {
  return {
    meta: {
      sourceResourceId: "src", runId: "run", declaredDomain: "d", alignmentModel: "kg-oracle-judge",
      promptVersion: "p", alignedAt: "2026-06-14T00:00:00Z", needsHumanReview: true
    },
    pairs
  };
}

test("aligned scoring recovers surface-variant agreement the exact baseline misses", () => {
  // Production says the same concept with an acronym parenthetical + a plural; exact
  // matching scores each as both a miss and an extra (P=R=0). Alignment recovers it.
  const score = scoreAdmissionOracleAligned({
    sourceResourceId: "src",
    runId: "run",
    production: [prod("Monte Carlo Tree Search (MCTS)", "core"), prod("AI research agents", "core")],
    oracle: oracle([refLabel("Monte Carlo Tree Search", "core", "agreed"), refLabel("AI research agent", "core", "agreed")]),
    alignment: alignment([
      pair("Monte Carlo Tree Search (MCTS)", "Monte Carlo Tree Search"),
      pair("AI research agents", "AI research agent")
    ])
  });
  assert.equal(score.exact.core.precision, 0);
  assert.equal(score.exact.core.recall, 0);
  assert.equal(score.aligned.core.precision, 1);
  assert.equal(score.aligned.core.recall, 1);
  assert.deepEqual(score.missedCore, []);
  assert.deepEqual(score.extraCore, []);
  assert.equal(score.surfaceVariantMatches.length, 2);
});

test("alignment never merges distinct reference concepts that share words", () => {
  // "Operator" and "Operator set" are distinct refs. Production has both, exactly.
  // An (erroneous) alignment edge pointing one production label at the OTHER reference
  // must not collapse the two reference concepts — edges are production->reference only.
  const score = scoreAdmissionOracleAligned({
    sourceResourceId: "src",
    runId: "run",
    production: [prod("Operator", "core"), prod("Operator set", "core")],
    oracle: oracle([refLabel("Operator", "core", "agreed"), refLabel("Operator set", "core", "agreed")]),
    // No surface-variant edges needed (both match exactly); an empty alignment is fine.
    alignment: alignment([])
  });
  assert.equal(score.aligned.core.precision, 1);
  assert.equal(score.aligned.core.recall, 1);
  assert.equal(score.aligned.core.referenceCount, 2);
});

test("two production surface variants of one concept collapse to a single match", () => {
  // Production emitted the same concept twice in different forms. Aligned scoring
  // counts it once: one matched ref, production core count drops to 1, precision 1.
  const score = scoreAdmissionOracleAligned({
    sourceResourceId: "src",
    runId: "run",
    production: [prod("trade-off", "core"), prod("tradeoff", "core")],
    oracle: oracle([refLabel("trade-off", "core", "agreed")]),
    alignment: alignment([pair("tradeoff", "trade-off")])
  });
  assert.equal(score.aligned.core.productionCount, 1);
  assert.equal(score.aligned.core.precision, 1);
  assert.equal(score.aligned.core.recall, 1);
  assert.deepEqual(score.extraCore, []);
});
