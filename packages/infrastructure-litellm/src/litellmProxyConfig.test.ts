import assert from "node:assert/strict";
import { test } from "node:test";
import { groundingGenerationDescriptor } from "./groundingGenerationAdapters";
import {
  modelAssignmentIdentity,
  modelRoutingBehaviorIdentity,
  readLitellmProxyConfig,
  type LitellmDeployment,
  type LitellmProxyConfig
} from "./litellmProxyConfig";
import { operationConfigHash } from "./operationConfigHash";

const ROLE = "kg-grounding-generation";
const MODEL = "openrouter/deepseek/deepseek-v4-flash-0731";
const PRIMARY = MODEL;
const BACKUP = "openrouter/deepseek/deepseek-v4-flash-0731-parasail-backup";

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
    provider: ["provider-a/fp8", "provider-b/fp8"]
  });
  const backup = input.backup ?? deployment({ name: "backup", provider: "provider-c/fp8" });
  return {
    deployments: [primary, backup],
    modelGroupAlias: { [ROLE]: primary.modelName },
    fallbacks: input.fallback ? { [ROLE]: [backup.modelName] } : {},
    routerBehavior: { routing_strategy: input.routingStrategy ?? "usage-based-routing-v2" }
  };
}

test("Model Assignment ignores provider identity and order when model, FP8, and inference behavior match", () => {
  const multiProviderFp8 = config();
  const explicitPrimaryAndBackup = config({
    primary: deployment({ name: "provider-a", provider: "provider-a/fp8", quantizations: ["fp8"] }),
    backup: deployment({ name: "provider-b", provider: "provider-b/fp8", quantizations: ["fp8"] }),
    fallback: true
  });
  assert.deepEqual(
    modelAssignmentIdentity(ROLE, multiProviderFp8),
    modelAssignmentIdentity(ROLE, explicitPrimaryAndBackup)
  );

  const reversedOrder = config({
    primary: deployment({
      name: "reordered",
      provider: ["provider-b/fp8", "provider-a/fp8"],
      requireParameters: false
    })
  });
  assert.deepEqual(modelAssignmentIdentity(ROLE, reversedOrder), modelAssignmentIdentity(ROLE, multiProviderFp8));
  assert.equal(modelAssignmentIdentity(ROLE, explicitPrimaryAndBackup).assignments.length, 1,
    "a same-assignment backup collapses out of quality identity");
});

test("Model Assignment changes on model, quantization, reasoning, and non-routing inference behavior", () => {
  const base = modelAssignmentIdentity(ROLE, config());
  for (const [name, primary] of [
    ["model revision", deployment({
      name: "different-model",
      provider: "provider-a/fp8",
      model: "openrouter/deepseek/deepseek-v4-flash-0801"
    })],
    ["quantization", deployment({ name: "fp4", provider: "provider-a/fp4", quantizations: ["fp4"] })],
    ["reasoning", deployment({ name: "reasoning", provider: "provider-a/fp8", reasoning: true })],
    ["model-info limit", deployment({ name: "limit", provider: "provider-a/fp8", maxInputTokens: 131072 })],
    ["inference parameter", deployment({ name: "temperature", provider: "provider-a/fp8", temperature: 0.4 })]
  ] as const) {
    assert.notDeepEqual(modelAssignmentIdentity(ROLE, config({ primary })), base, name);
  }

  const differentBackup = config({
    backup: deployment({ name: "fp4-backup", provider: "provider-b/fp4", quantizations: ["fp4"] }),
    fallback: true
  });
  assert.equal(modelAssignmentIdentity(ROLE, differentBackup).assignments.length, 2,
    "a behaviorally different fallback remains a distinct assignment");
});

test("missing or ambiguous quantization fails closed with a provider-sensitive route discriminator", () => {
  const providerAUnknown = config({ primary: deployment({ name: "provider-a", provider: "provider-a" }) });
  const providerBUnknown = config({ primary: deployment({ name: "provider-b", provider: "provider-b" }) });
  const ambiguous = config({
    primary: deployment({ name: "mixed", provider: ["provider-a/fp8", "provider-b/fp4"] })
  });
  assert.notDeepEqual(modelAssignmentIdentity(ROLE, providerAUnknown), modelAssignmentIdentity(ROLE, providerBUnknown));
  assert.notDeepEqual(modelAssignmentIdentity(ROLE, ambiguous), modelAssignmentIdentity(ROLE, config()));
  assert.match(JSON.stringify(modelAssignmentIdentity(ROLE, providerAUnknown)), /unresolvedRoute.*provider-a/);
});

test("exact operation identity still follows provider, fallback, and router behavior", () => {
  const hash = (candidate: LitellmProxyConfig): string => operationConfigHash(
    "routing-probe",
    [groundingGenerationDescriptor],
    {},
    { litellmConfig: candidate }
  );
  const baseConfig = config();
  const base = hash(baseConfig);
  assert.equal(base, hash(config()), "routing identity is deterministic");
  assert.notEqual(hash(config({
    primary: deployment({ name: "primary", provider: "provider-a/fp8" })
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

test("neutral DeepSeek generation aliases are primary-only while the source judge keeps its fallback", () => {
  const proxy = readLitellmProxyConfig();
  const aliases = [
    "kg-source-less-node-generation",
    "kg-grounding-generation"
  ];
  const deepSeekGroups = proxy.deployments
    .filter((deployment) => deployment.model === MODEL)
    .map((deployment) => deployment.modelName)
    .sort();
  assert.deepEqual(deepSeekGroups, [BACKUP, PRIMARY].sort(), "one primary and one backup own this revision");

  const identities = aliases.map((alias) => modelAssignmentIdentity(alias, proxy));
  assert.deepEqual(identities[1], identities[0]);
  assert.deepEqual(identities[0]?.assignments.map((assignment) => assignment.quantization), [{ value: "fp8" }]);

  const expectedBehavior = (provider: "deepinfra/fp8" | "parasail/fp8") => ({
    litellmParams: {
      model: MODEL,
      extra_body: {
        reasoning: { enabled: false },
        provider: {
          require_parameters: true,
          quantizations: ["fp8"],
          only: [provider],
          order: [provider],
          allow_fallbacks: false
        }
      }
    },
    modelInfo: { mode: "chat", max_input_tokens: 1048576 }
  });

  for (const alias of aliases) {
    const route = modelRoutingBehaviorIdentity(alias, proxy);
    assert.equal(route.primary.modelGroup, PRIMARY);
    assert.deepEqual(route.fallbacks, [], `${alias} remains primary-only until U2`);
    assert.equal(route.primary.deployments.length, 1);
    assert.deepEqual(route.primary.deployments[0]?.behavior, expectedBehavior("deepinfra/fp8"));
  }

  const sourceJudge = modelRoutingBehaviorIdentity("kg-independent-judge", proxy);
  assert.equal(sourceJudge.primary.modelGroup, PRIMARY);
  assert.deepEqual(sourceJudge.fallbacks.map((fallback) => fallback.modelGroup), [BACKUP]);
  assert.deepEqual(sourceJudge.fallbacks[0]?.deployments[0]?.behavior, expectedBehavior("parasail/fp8"));
});
