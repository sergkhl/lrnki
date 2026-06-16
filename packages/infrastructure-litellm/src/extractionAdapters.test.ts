import assert from "node:assert/strict";
import test from "node:test";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { LiteLlmAdmissionLabelJudgmentAdapter, LiteLlmAssertionEntailmentJudgmentAdapter } from "./extractionAdapters";
import { admissionLabelJudgmentValidator } from "./toolSchemas";

function adapterReturning(result: {
  subjectMatch: "exact_or_interchangeable" | "qualified_variant" | "different_or_absent";
  subjectSpan: string;
  definitionEntailed: boolean;
  entailingSpan: string;
  rationale: string;
}) {
  const client = {
    call: async (input: { toolName: string }) => {
      assert.equal(input.toolName, "submit_definition_entailment_judgment");
      return result;
    }
  } as unknown as LiteLlmForcedToolClient;
  return new LiteLlmAssertionEntailmentJudgmentAdapter(client);
}

const generalizationInput = {
  declaredDomain: "machine learning systems",
  subject: { canonicalLabel: "generalization gap", aliases: [] },
  definition: "the discrepancy between validation score and test set performance due to finite sample effects",
  evidenceQuotes: [
    "Due to finite sample effects, the validation score is not perfectly predictive of performance on the test set-a discrepancy known as the generalization gap."
  ]
};

test("definition judge accepts an identified subject and formatting-normalized grounded span", async () => {
  const adapter = adapterReturning({
    subjectMatch: "exact_or_interchangeable",
    subjectSpan: "the generalization gap",
    definitionEntailed: true,
    entailingSpan: "Due to finite sample effects, the validation score is not perfectly predictive of performance on the test set—a discrepancy known as the generalization gap.",
    rationale: "appositive definition"
  });

  const result = await adapter.judgeDefinition(generalizationInput);
  assert.equal(result.entailed, true);
});

test("definition judge rejects evidence that defines an anonymous different subject", async () => {
  const adapter = adapterReturning({
    subjectMatch: "different_or_absent",
    subjectSpan: "",
    definitionEntailed: true,
    entailingSpan: "an agent that operates by searching a directed graph",
    rationale: "requested framework is not identified"
  });

  const result = await adapter.judgeDefinition({
    declaredDomain: "machine learning systems",
    subject: { canonicalLabel: "graph-based search framework", aliases: [] },
    definition: "an agent that operates by searching a directed graph",
    evidenceQuotes: ["We consider an agent that operates by searching a directed graph."]
  });
  assert.equal(result.entailed, false);
});

test("definition judge rejects a definition of a qualified variant", async () => {
  const adapter = adapterReturning({
    subjectMatch: "qualified_variant",
    subjectSpan: "MLE-bench lite",
    definitionEntailed: true,
    entailingSpan: "a curated subset of 22 tasks selected from the full benchmark",
    rationale: "lite is not the full benchmark"
  });

  const result = await adapter.judgeDefinition({
    declaredDomain: "machine learning systems",
    subject: { canonicalLabel: "MLE-bench", aliases: [] },
    definition: "a curated subset of 22 tasks selected from the full benchmark",
    evidenceQuotes: ["MLE-bench lite—a curated subset of 22 tasks selected from the full benchmark."]
  });
  assert.equal(result.entailed, false);
});

// --- Concept-vs-proposition admission judge (ADR-0005) --------------------

function admissionAdapterReturning(result: {
  labelKind: "concept" | "proposition_or_claim";
  underlyingNounPhrase: string;
  groundingSpan: string;
  rationale: string;
}) {
  const client = {
    call: async (input: { toolName: string }) => {
      assert.equal(input.toolName, "submit_admission_label_judgment");
      return result;
    }
  } as unknown as LiteLlmForcedToolClient;
  return new LiteLlmAdmissionLabelJudgmentAdapter(client);
}

const operatorSetInput = {
  declaredDomain: "machine learning systems",
  label: "Operator Set as Bottleneck to Performance",
  aliases: [],
  evidenceQuotes: ["The operator set is the bottleneck to performance in this system."]
};

test("admission judge demotes a grounded proposition label to its underlying noun phrase", async () => {
  const adapter = admissionAdapterReturning({
    labelKind: "proposition_or_claim",
    underlyingNounPhrase: "Operator Set",
    groundingSpan: "operator set is the bottleneck to performance",
    rationale: "asserts a claim about the operator set"
  });

  const result = await adapter.judge(operatorSetInput);
  assert.equal(result.labelKind, "proposition_or_claim");
  assert.equal(result.underlyingNounPhrase, "Operator Set");
});

test("admission judge keeps a concept label as concept with empty spans", async () => {
  const adapter = admissionAdapterReturning({
    labelKind: "concept",
    underlyingNounPhrase: "ignored",
    groundingSpan: "ignored",
    rationale: "names a search algorithm"
  });

  const result = await adapter.judge({
    declaredDomain: "machine learning systems",
    label: "Monte Carlo Tree Search",
    aliases: ["MCTS"],
    evidenceQuotes: ["Monte Carlo Tree Search explores the game tree by sampling."]
  });
  assert.equal(result.labelKind, "concept");
  assert.equal(result.underlyingNounPhrase, "");
  assert.equal(result.groundingSpan, "");
});

test("admission judge coerces an ungrounded proposition verdict back to concept (fail closed)", async () => {
  const adapter = admissionAdapterReturning({
    labelKind: "proposition_or_claim",
    underlyingNounPhrase: "Operator Set",
    groundingSpan: "operator set causes all latency", // absent from the evidence
    rationale: "claimed predication is not in the cited evidence"
  });

  const result = await adapter.judge(operatorSetInput);
  assert.equal(result.labelKind, "concept");
  assert.equal(result.underlyingNounPhrase, "");
});

test("admission judge grounding tolerates markdown and typographic-quote noise", async () => {
  const adapter = admissionAdapterReturning({
    labelKind: "proposition_or_claim",
    underlyingNounPhrase: "operator set",
    groundingSpan: 'operator set is the "bottleneck" to performance',
    rationale: "predication grounded despite formatting"
  });

  const result = await adapter.judge({
    ...operatorSetInput,
    evidenceQuotes: ["The **operator set** is the “bottleneck” to performance."]
  });
  assert.equal(result.labelKind, "proposition_or_claim");
});

test("admission label validator rejects a verdict missing labelKind (fail-closed arg validation)", () => {
  assert.equal(
    admissionLabelJudgmentValidator.safeParse({ underlyingNounPhrase: "", groundingSpan: "", rationale: "x" }).success,
    false
  );
  assert.equal(
    admissionLabelJudgmentValidator.safeParse({ labelKind: "concept", underlyingNounPhrase: "", groundingSpan: "", rationale: "x" }).success,
    true
  );
});
