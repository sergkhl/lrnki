import assert from "node:assert/strict";
import test from "node:test";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { LiteLlmClaimEntailmentJudgmentAdapter } from "./extractionAdapters";

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
  return new LiteLlmClaimEntailmentJudgmentAdapter(client);
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
