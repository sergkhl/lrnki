import assert from "node:assert/strict";
import { test } from "node:test";
import { claimVerificationAnsweringDescriptor } from "./groundingGenerationAdapters";
import {
  modelAssignmentIdentity,
  modelRoutingBehaviorIdentity,
  type LitellmDeployment,
  type LitellmProxyConfig
} from "./litellmProxyConfig";
import { operationConfigHash } from "./operationConfigHash";

const ROLE = "kg-claim-verification-answerer";
const MODEL = "openrouter/deepseek/deepseek-v4-flash-0731";

function deployment(input: {
  name: string;
  provider: string | string[];
  model?: string;
  quantizations?: string[];
  reasoning?: boolean;
  maxInputTokens?: number;
  temperature?: number;
  requireParameters?: boolean;
}): LitellmDeployment {
  const only = Array.isArray(input.provider) ? input.provider : [input.provider];
  return {
    modelName: input.name,
    model: input.model ?? MODEL,
    inputCostPerToken: 0.00000009,
    behavior: {
      litellmParams: {
        model: input.model ?? MODEL,
        api_key: "must-not-enter-any-identity",
        input_cost_per_token: 0.00000009,
        ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
        extra_body: {
          reasoning: { enabled: input.reasoning ?? false },
          provider: {
            require_parameters: input.requireParameters ?? true,
            only,
            order: [...only].reverse(),
            allow_fallbacks: false,
            ...(input.quantizations ? { quantizations: input.quantizations } : {})
          }
        }
      },
      modelInfo: {
        mode: "chat",
        max_input_tokens: input.maxInputTokens ?? 1048576,
        output_cost_per_token: 99
      }
    }
  };
}

function config(input: {
  primary?: LitellmDeployment;
  backup?: LitellmDeployment;
  fallback?: boolean;
  routingStrategy?: string;
} = {}): LitellmProxyConfig {
  const primary = input.primary ?? deployment({
    name: "primary",
    provider: ["baseten/fp8", "parasail/fp8"]
  });
  const backup = input.backup ?? deployment({ name: "backup", provider: "deepinfra/fp8" });
  return {
    deployments: [primary, backup],
    modelGroupAlias: { [ROLE]: primary.modelName },
    fallbacks: input.fallback ? { [ROLE]: [backup.modelName] } : {},
    routerBehavior: { routing_strategy: input.routingStrategy ?? "usage-based-routing-v2" }
  };
}

test("Model Assignment ignores provider identity and order when model, FP8, and inference behavior match", () => {
  const baseTenParasail = config();
  const baiduDeepInfra = config({
    primary: deployment({ name: "baidu", provider: "baidu/fp8", quantizations: ["fp8"] }),
    backup: deployment({ name: "deepinfra", provider: "deepinfra/fp8", quantizations: ["fp8"] }),
    fallback: true
  });
  assert.deepEqual(
    modelAssignmentIdentity(ROLE, baseTenParasail),
    modelAssignmentIdentity(ROLE, baiduDeepInfra)
  );

  const reversedOrder = config({
    primary: deployment({
      name: "reordered",
      provider: ["parasail/fp8", "baseten/fp8"],
      requireParameters: false
    })
  });
  assert.deepEqual(modelAssignmentIdentity(ROLE, reversedOrder), modelAssignmentIdentity(ROLE, baseTenParasail));
  assert.equal(modelAssignmentIdentity(ROLE, baiduDeepInfra).assignments.length, 1,
    "a same-assignment backup collapses out of quality identity");
});

test("Model Assignment changes on model, quantization, reasoning, and non-routing inference behavior", () => {
  const base = modelAssignmentIdentity(ROLE, config());
  for (const [name, primary] of [
    ["model revision", deployment({
      name: "different-model",
      provider: "baidu/fp8",
      model: "openrouter/deepseek/deepseek-v4-flash-0801"
    })],
    ["quantization", deployment({ name: "fp4", provider: "baidu/fp4", quantizations: ["fp4"] })],
    ["reasoning", deployment({ name: "reasoning", provider: "baidu/fp8", reasoning: true })],
    ["model-info limit", deployment({ name: "limit", provider: "baidu/fp8", maxInputTokens: 131072 })],
    ["inference parameter", deployment({ name: "temperature", provider: "baidu/fp8", temperature: 0.4 })]
  ] as const) {
    assert.notDeepEqual(modelAssignmentIdentity(ROLE, config({ primary })), base, name);
  }

  const differentBackup = config({
    backup: deployment({ name: "fp4-backup", provider: "deepinfra/fp4", quantizations: ["fp4"] }),
    fallback: true
  });
  assert.equal(modelAssignmentIdentity(ROLE, differentBackup).assignments.length, 2,
    "a behaviorally different fallback remains a distinct assignment");
});

test("missing or ambiguous quantization fails closed with a provider-sensitive route discriminator", () => {
  const baiduUnknown = config({ primary: deployment({ name: "baidu", provider: "baidu" }) });
  const deepInfraUnknown = config({ primary: deployment({ name: "deepinfra", provider: "deepinfra" }) });
  const ambiguous = config({
    primary: deployment({ name: "mixed", provider: ["baidu/fp8", "deepinfra/fp4"] })
  });
  assert.notDeepEqual(modelAssignmentIdentity(ROLE, baiduUnknown), modelAssignmentIdentity(ROLE, deepInfraUnknown));
  assert.notDeepEqual(modelAssignmentIdentity(ROLE, ambiguous), modelAssignmentIdentity(ROLE, config()));
  assert.match(JSON.stringify(modelAssignmentIdentity(ROLE, baiduUnknown)), /unresolvedRoute.*baidu/);
});

test("exact operation identity still follows provider, fallback, and router behavior", () => {
  const hash = (candidate: LitellmProxyConfig): string => operationConfigHash(
    "routing-probe",
    [claimVerificationAnsweringDescriptor],
    {},
    { litellmConfig: candidate }
  );
  const baseConfig = config();
  const base = hash(baseConfig);
  assert.equal(base, hash(config()), "routing identity is deterministic");
  assert.notEqual(hash(config({
    primary: deployment({ name: "primary", provider: "baidu/fp8" })
  })), base, "provider pin");
  assert.notEqual(hash(config({ fallback: true })), base, "fallback chain");
  assert.notEqual(hash(config({ routingStrategy: "latency-based-routing" })), base, "router behavior");

  const accountingOnly = config();
  accountingOnly.deployments[0] = { ...accountingOnly.deployments[0]!, inputCostPerToken: 99 };
  accountingOnly.routerBehavior = {
    ...accountingOnly.routerBehavior,
    api_key: "router-secret",
    input_cost_per_token: 99
  };
  assert.equal(hash(accountingOnly), base, "accounting-only prices do not enter exact operation identity");
  assert.deepEqual(modelAssignmentIdentity(ROLE, accountingOnly), modelAssignmentIdentity(ROLE, baseConfig),
    "credentials and accounting-only prices do not enter Model Assignment");
  const serialized = JSON.stringify(modelRoutingBehaviorIdentity(ROLE, accountingOnly));
  assert.match(serialized, /provider/);
  assert.doesNotMatch(serialized, /api_key|must-not-enter|cost_per_token|authorization/i);

  const unrelatedAlias = config();
  unrelatedAlias.modelGroupAlias["unrelated-role"] = "backup";
  assert.equal(hash(unrelatedAlias), base, "unrelated aliases do not perturb this operation");
  const missingDeployment = config();
  missingDeployment.modelGroupAlias[ROLE] = "missing-model";
  assert.throws(() => hash(missingDeployment), /has no declared deployment/);
});
