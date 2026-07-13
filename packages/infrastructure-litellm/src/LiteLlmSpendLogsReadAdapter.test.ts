import assert from "node:assert/strict";
import test from "node:test";
import { STAGE_TAGS } from "@lrnki/domain-core";
import { NON_LLM_STAGES } from "@lrnki/application";
import {
  estimateUnbilledSpend,
  liteLlmOperationTimelineStageTags,
  shapeOperationStageSpend,
  type SpendLogAggregateRow
} from "./LiteLlmSpendLogsReadAdapter";
import { deploymentTokenPrices, mimoRoutedAliases, readLitellmProxyConfig } from "./litellmProxyConfig";

// Deterministic price fixture mirroring the real litellm/config.yaml MiMo deployment
// (input 0.14/M, output 0.28/M, cache read 0.0028/M).
const fixtureConfig = {
  deployments: [
    {
      modelName: "openrouter/xiaomi/mimo-v2.5",
      model: "openrouter/xiaomi/mimo-v2.5",
      inputCostPerToken: 0.00000014,
      outputCostPerToken: 0.00000028,
      cacheReadInputTokenCost: 0.0000000028
    },
    { modelName: "openrouter/openai/gpt-oss-120b", model: "openrouter/openai/gpt-oss-120b" }
  ],
  modelGroupAlias: { "kg-concept-discovery": "openrouter/xiaomi/mimo-v2.5" }
};

const billedRow = (overrides: Partial<SpendLogAggregateRow>): SpendLogAggregateRow => ({
  operation_id: "run-A",
  stage: "admission",
  model: "openrouter/xiaomi/mimo-v2.5",
  log_count: 1,
  total_spend: 0,
  total_tokens: 0,
  unbilled_prompt_tokens: 0,
  unbilled_completion_tokens: 0,
  unbilled_cached_tokens: 0,
  ...overrides
});

test("shapes per-operation stage aggregates and numeric database values", () => {
  assert.deepEqual(
    shapeOperationStageSpend(
      [
        billedRow({ operation_id: "run-A", stage: "admission", log_count: 2, total_spend: "0.12", total_tokens: "900" }),
        billedRow({ operation_id: "run-B", stage: "admission", log_count: "1", total_spend: 0.04, total_tokens: 300 }),
        billedRow({ operation_id: "run-A", stage: "cep-extraction", log_count: 3, total_spend: null, total_tokens: null })
      ],
      fixtureConfig
    ),
    [
      { operationId: "run-A", stage: "admission", logCount: 2, totalSpend: 0.12, estimatedSpend: 0, totalTokens: 900 },
      { operationId: "run-B", stage: "admission", logCount: 1, totalSpend: 0.04, estimatedSpend: 0, totalTokens: 300 },
      { operationId: "run-A", stage: "cep-extraction", logCount: 3, totalSpend: 0, estimatedSpend: 0, totalTokens: 0 }
    ]
  );
});

// Sanitized real BYOK row (gen-1783754606…, 2026-07-11): spend 0.0 with prompt 2283
// (1024 cached) / completion 593. OpenRouter's retained usage reported the provider-
// billed upstream cost as 0.0003451672; the cache-discounted token calculation from
// the config prices reproduces it exactly, which is the U4 reconciliation.
test("cached BYOK estimate reconciles exactly with the provider-reported upstream cost", () => {
  const estimate = estimateUnbilledSpend(
    billedRow({
      log_count: 1,
      total_tokens: 2876,
      unbilled_prompt_tokens: 2283,
      unbilled_completion_tokens: 593,
      unbilled_cached_tokens: 1024
    }),
    fixtureConfig
  );
  assert.equal(estimate.toFixed(10), "0.0003451672");
});

test("uncached BYOK estimate prices every prompt token at the input rate", () => {
  const estimate = estimateUnbilledSpend(
    billedRow({
      total_tokens: 1503,
      unbilled_prompt_tokens: 1020,
      unbilled_completion_tokens: 483,
      unbilled_cached_tokens: 0
    }),
    fixtureConfig
  );
  // 1020×0.14/M + 483×0.28/M
  assert.equal(estimate.toFixed(10), "0.0002780400");
});

test("a MiMo BYOK stage with non-zero tokens cannot render $0", () => {
  const shaped = shapeOperationStageSpend(
    [
      billedRow({
        total_spend: 0,
        total_tokens: 2876,
        unbilled_prompt_tokens: 2283,
        unbilled_completion_tokens: 593,
        unbilled_cached_tokens: 1024
      })
    ],
    fixtureConfig
  );
  assert.equal(shaped.length, 1);
  assert.equal(shaped[0]?.totalSpend, 0);
  assert.ok((shaped[0]?.estimatedSpend ?? 0) > 0);
});

test("models the config no longer prices keep their historical zero rows unestimated", () => {
  const estimate = estimateUnbilledSpend(
    billedRow({
      model: "deepseek/deepseek-v4-flash",
      total_tokens: 1000,
      unbilled_prompt_tokens: 800,
      unbilled_completion_tokens: 200
    }),
    fixtureConfig
  );
  assert.equal(estimate, 0);
});

test("folds per-model groups back to one row per operation and stage", () => {
  const shaped = shapeOperationStageSpend(
    [
      billedRow({ log_count: 2, total_spend: 0.1, total_tokens: 500 }),
      billedRow({
        model: "openrouter/xiaomi/mimo-v2.5",
        log_count: 1,
        total_spend: 0,
        total_tokens: 1503,
        unbilled_prompt_tokens: 1020,
        unbilled_completion_tokens: 483
      })
    ],
    fixtureConfig
  );
  assert.equal(shaped.length, 1);
  assert.equal(shaped[0]?.logCount, 3);
  assert.equal(shaped[0]?.totalSpend, 0.1);
  assert.equal(shaped[0]?.totalTokens, 2003);
  assert.ok((shaped[0]?.estimatedSpend ?? 0) > 0);
});

// The silent-zero regression guard (U4/R7): every production alias routed to a MiMo
// deployment must carry input/output/cache prices in litellm/config.yaml, so the
// estimate above can never fall back to 0 for current BYOK traffic. Reads the REAL
// config — removing the prices fails this test before it can blind the cost lens.
test("every MiMo-routed production deployment declares token prices in litellm/config.yaml", () => {
  const config = readLitellmProxyConfig();
  const aliases = mimoRoutedAliases(config);
  assert.ok(aliases.length > 0, "expected at least one MiMo-routed alias while MiMo is the production extractor");
  for (const alias of aliases) {
    const target = config.modelGroupAlias[alias];
    assert.ok(target, `alias ${alias} has no deployment target`);
    const prices = deploymentTokenPrices(target ?? "", config);
    assert.ok(prices, `deployment ${target} (alias ${alias}) is missing input/output token prices`);
    assert.ok((prices?.cacheReadInputTokenCost ?? 0) < (prices?.inputCostPerToken ?? 0),
      `deployment ${target} should declare a cache-read discount below the input price`);
  }
});

test("uses the application Operation Timeline LLM stage catalog for spend reads", () => {
  const tags = liteLlmOperationTimelineStageTags();
  assert.deepEqual(tags, Object.values(STAGE_TAGS));
  assert.equal(new Set<string>(tags).has(NON_LLM_STAGES.persist), false);
  assert.equal(new Set<string>(tags).has(NON_LLM_STAGES.symbolicDisposal), false);
});
