import assert from "node:assert/strict";
import test from "node:test";
import { STAGE_TAGS } from "@lrnki/domain-core";
import { NON_LLM_STAGES } from "@lrnki/application";
import { liteLlmOperationTimelineStageTags, shapeOperationStageSpend } from "./LiteLlmSpendLogsReadAdapter";

test("shapes per-operation stage aggregates and numeric database values", () => {
  assert.deepEqual(
    shapeOperationStageSpend([
      { operation_id: "run-A", stage: "admission", log_count: 2, total_spend: "0.12", total_tokens: "900" },
      { operation_id: "run-B", stage: "admission", log_count: "1", total_spend: 0.04, total_tokens: 300 },
      { operation_id: "run-A", stage: "cep-extraction", log_count: 3, total_spend: null, total_tokens: null }
    ]),
    [
      { operationId: "run-A", stage: "admission", logCount: 2, totalSpend: 0.12, totalTokens: 900 },
      { operationId: "run-B", stage: "admission", logCount: 1, totalSpend: 0.04, totalTokens: 300 },
      { operationId: "run-A", stage: "cep-extraction", logCount: 3, totalSpend: 0, totalTokens: 0 }
    ]
  );
});

test("uses the application Operation Timeline LLM stage catalog for spend reads", () => {
  const tags = liteLlmOperationTimelineStageTags();
  assert.deepEqual(tags, Object.values(STAGE_TAGS));
  assert.equal(new Set<string>(tags).has(NON_LLM_STAGES.persist), false);
  assert.equal(new Set<string>(tags).has(NON_LLM_STAGES.symbolicDisposal), false);
});
