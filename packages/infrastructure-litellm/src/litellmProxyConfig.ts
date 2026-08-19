import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

// Mechanical read of `litellm/config.yaml`, the declared source of truth for the
// alias → deployment mapping (AGENTS rule 5) and for deployment token prices. Two
// consumers, one parser (rule 18): descriptor-shape tests resolve which aliases route
// to MiMo, operation hashes bind effective model/provider/fallback behavior to quality
// evidence, and the spend read path prices zero-spend OpenRouter BYOK rows from the
// same versioned authority instead of restating prices in code.

export type LitellmDeployment = {
  modelName: string;
  model: string;
  inputCostPerToken?: number;
  outputCostPerToken?: number;
  cacheReadInputTokenCost?: number;
  // Request-affecting deployment configuration with credentials and accounting-only
  // prices removed. Kept as one opaque value so callers do not need to understand
  // LiteLLM/OpenRouter routing syntax.
  behavior?: Record<string, unknown>;
};

export type LitellmProxyConfig = {
  deployments: LitellmDeployment[];
  modelGroupAlias: Record<string, string>;
  fallbacks?: Record<string, string[]>;
  routerBehavior?: Record<string, unknown>;
};

export type ModelRoutingBehaviorIdentity = {
  requestedModel: string;
  router: Record<string, unknown>;
  primary: ResolvedModelRoute;
  fallbacks: ResolvedModelRoute[];
};

type ResolvedModelRoute = {
  aliasChain: string[];
  modelGroup: string;
  deployments: Array<{
    modelName: string;
    model: string;
    behavior: Record<string, unknown>;
  }>;
};

export type DeploymentTokenPrices = {
  inputCostPerToken: number;
  outputCostPerToken: number;
  cacheReadInputTokenCost: number;
};

// Package-relative first (works wherever the source tree runs), then a cwd walk for
// composition roots whose bundler relocates this module out of the checkout layout.
function defaultConfigPath(): string {
  const packageRelative = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "litellm", "config.yaml");
  if (existsSync(packageRelative)) return packageRelative;
  for (let dir = process.cwd(), i = 0; i < 6; i++, dir = dirname(dir)) {
    const candidate = join(dir, "litellm", "config.yaml");
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("litellm/config.yaml not found relative to this package or any parent of the working directory.");
}

const configCache = new Map<string, LitellmProxyConfig>();

export function readLitellmProxyConfig(configPath: string = defaultConfigPath()): LitellmProxyConfig {
  const cached = configCache.get(configPath);
  if (cached) return cached;
  const raw = parse(readFileSync(configPath, "utf8")) as {
    model_list?: {
      model_name?: string;
      litellm_params?: Record<string, unknown>;
      model_info?: Record<string, unknown>;
    }[];
    router_settings?: Record<string, unknown> & {
      model_group_alias?: Record<string, string>;
      fallbacks?: unknown;
    };
  };
  if (!Array.isArray(raw.model_list) || raw.model_list.length === 0) {
    throw new Error(`${configPath}: expected a non-empty model_list.`);
  }
  const modelGroupAlias = raw.router_settings?.model_group_alias;
  if (!modelGroupAlias || Object.keys(modelGroupAlias).length === 0) {
    throw new Error(`${configPath}: expected router_settings.model_group_alias.`);
  }
  for (const [alias, target] of Object.entries(modelGroupAlias)) {
    if (typeof target !== "string" || target.length === 0) {
      throw new Error(`${configPath}: model_group_alias.${alias} must name a deployment.`);
    }
  }
  const {
    model_group_alias: _modelGroupAlias,
    fallbacks: rawFallbacks,
    ...rawRouterBehavior
  } = raw.router_settings ?? {};
  void _modelGroupAlias;
  const config: LitellmProxyConfig = {
    deployments: raw.model_list.map((entry, index) => {
      const modelName = entry.model_name;
      const model = entry.litellm_params?.model;
      if (typeof modelName !== "string" || typeof model !== "string") {
        throw new Error(`${configPath}: model_list[${index}] is missing model_name or litellm_params.model.`);
      }
      return {
        modelName,
        model,
        behavior: {
          litellmParams: sanitizeBehaviorRecord(entry.litellm_params, DEPLOYMENT_ACCOUNTING_KEYS),
          modelInfo: sanitizeBehaviorRecord(entry.model_info)
        },
        ...priceField(entry.litellm_params, "input_cost_per_token", "inputCostPerToken"),
        ...priceField(entry.litellm_params, "output_cost_per_token", "outputCostPerToken"),
        ...priceField(entry.litellm_params, "cache_read_input_token_cost", "cacheReadInputTokenCost")
      };
    }),
    modelGroupAlias,
    fallbacks: parseFallbacks(rawFallbacks, configPath),
    routerBehavior: sanitizeBehaviorRecord(rawRouterBehavior)
  };
  configCache.set(configPath, config);
  return config;
}

// Complete output-affecting routing identity for one model name as requested by a
// neural stage. The caller supplies only that name; alias traversal, deployment
// selection, provider pins, reasoning settings, and explicit fallback groups stay
// local to this module. Prices and credentials deliberately do not participate.
export function modelRoutingBehaviorIdentity(
  requestedModel: string,
  config: LitellmProxyConfig = readLitellmProxyConfig()
): ModelRoutingBehaviorIdentity {
  const primary = resolveModelRoute(requestedModel, config);
  // LiteLLM v1.88.1 looks fallbacks up by the model string on the original request.
  // An alias therefore needs its own explicit fallback entry; do not pretend that a
  // fallback keyed only by the resolved deployment group applies to the alias.
  const fallbackNames = config.fallbacks?.[requestedModel] ?? [];
  return {
    requestedModel,
    router: config.routerBehavior ?? {},
    primary,
    fallbacks: fallbackNames.map((name) => resolveModelRoute(name, config))
  };
}

// Aliases whose backing deployment is a MiMo model (U3/KTD5). Resolved from the
// config at call time — never restated — so the test set tracks alias re-routing.
export function mimoRoutedAliases(config: LitellmProxyConfig = readLitellmProxyConfig()): string[] {
  const deploymentByName = new Map(config.deployments.map((deployment) => [deployment.modelName, deployment]));
  return Object.entries(config.modelGroupAlias)
    .filter(([, target]) => (deploymentByName.get(target)?.model ?? target).toLowerCase().includes("mimo"))
    .map(([alias]) => alias);
}

// Token prices for one served model (the SpendLogs `model` column matches the
// deployment's model_name). Returns undefined for a model the config no longer
// names — retired deployments keep their historical zero rows unestimated.
export function deploymentTokenPrices(
  servedModel: string,
  config: LitellmProxyConfig = readLitellmProxyConfig()
): DeploymentTokenPrices | undefined {
  const deployment = config.deployments.find((entry) => entry.modelName === servedModel || entry.model === servedModel);
  if (!deployment || deployment.inputCostPerToken === undefined || deployment.outputCostPerToken === undefined) {
    return undefined;
  }
  return {
    inputCostPerToken: deployment.inputCostPerToken,
    outputCostPerToken: deployment.outputCostPerToken,
    // A deployment without a cache discount bills cached prompt tokens at full price.
    cacheReadInputTokenCost: deployment.cacheReadInputTokenCost ?? deployment.inputCostPerToken
  };
}

function priceField(
  params: Record<string, unknown> | undefined,
  yamlKey: string,
  outKey: "inputCostPerToken" | "outputCostPerToken" | "cacheReadInputTokenCost"
): Partial<Record<typeof outKey, number>> {
  const value = params?.[yamlKey];
  return typeof value === "number" && Number.isFinite(value) ? { [outKey]: value } : {};
}

const DEPLOYMENT_ACCOUNTING_KEYS = new Set([
  "api_key",
  "input_cost_per_token",
  "output_cost_per_token",
  "cache_read_input_token_cost",
  "cache_creation_input_token_cost",
  "input_cost_per_token_batches",
  "output_cost_per_token_batches"
]);

function sanitizeBehaviorRecord(
  record: Record<string, unknown> | undefined,
  omittedKeys: ReadonlySet<string> = new Set()
): Record<string, unknown> {
  if (!record) return {};
  return Object.fromEntries(Object.entries(record)
    .filter(([key]) => !omittedKeys.has(key) && !isCredentialKey(key))
    .map(([key, value]) => [key, sanitizeBehaviorValue(value)]));
}

function sanitizeBehaviorValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeBehaviorValue);
  if (value && typeof value === "object") {
    return sanitizeBehaviorRecord(value as Record<string, unknown>);
  }
  return value;
}

function isCredentialKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized === "api_key"
    || normalized === "authorization"
    || normalized.endsWith("_api_key")
    || normalized.endsWith("_secret")
    || normalized.endsWith("_password")
    || normalized.endsWith("_credential")
    || normalized.endsWith("_access_token");
}

function parseFallbacks(raw: unknown, configPath: string): Record<string, string[]> {
  if (raw === undefined) return {};
  if (!Array.isArray(raw)) throw new Error(`${configPath}: router_settings.fallbacks must be a list.`);
  const parsed: Record<string, string[]> = {};
  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${configPath}: router_settings.fallbacks[${index}] must be a mapping.`);
    }
    for (const [source, targets] of Object.entries(entry as Record<string, unknown>)) {
      if (!Array.isArray(targets) || targets.some((target) => typeof target !== "string" || target.length === 0)) {
        throw new Error(`${configPath}: fallback ${source} must contain deployment names.`);
      }
      if (parsed[source]) throw new Error(`${configPath}: duplicate fallback definition for ${source}.`);
      parsed[source] = targets as string[];
    }
  });
  return parsed;
}

function resolveModelRoute(requestedModel: string, config: LitellmProxyConfig): ResolvedModelRoute {
  const aliasChain = [requestedModel];
  const seen = new Set(aliasChain);
  let modelGroup = requestedModel;
  while (config.modelGroupAlias[modelGroup]) {
    modelGroup = config.modelGroupAlias[modelGroup]!;
    if (seen.has(modelGroup)) {
      throw new Error(`LiteLLM model_group_alias cycle: ${[...aliasChain, modelGroup].join(" -> ")}`);
    }
    seen.add(modelGroup);
    aliasChain.push(modelGroup);
  }
  const deployments = config.deployments
    .filter((deployment) => deployment.modelName === modelGroup)
    .map((deployment) => ({
      modelName: deployment.modelName,
      model: deployment.model,
      behavior: deployment.behavior ?? { litellmParams: { model: deployment.model }, modelInfo: {} }
    }));
  if (deployments.length === 0) {
    throw new Error(`LiteLLM model route ${aliasChain.join(" -> ")} has no declared deployment.`);
  }
  return {
    aliasChain,
    modelGroup,
    deployments
  };
}
