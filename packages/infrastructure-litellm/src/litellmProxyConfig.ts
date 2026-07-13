import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

// Mechanical read of `litellm/config.yaml`, the declared source of truth for the
// alias → deployment mapping (AGENTS rule 5) and for deployment token prices. Two
// consumers, one parser (rule 18): the MiMo trailing-nullable descriptor-shape test
// resolves WHICH aliases route to a MiMo deployment (plan 2026-07-10-004 U3/KTD5),
// and the spend read path prices zero-spend OpenRouter BYOK rows from the same
// versioned authority instead of restating prices in code (U4/KTD6).

export type LitellmDeployment = {
  modelName: string;
  model: string;
  inputCostPerToken?: number;
  outputCostPerToken?: number;
  cacheReadInputTokenCost?: number;
};

export type LitellmProxyConfig = {
  deployments: LitellmDeployment[];
  modelGroupAlias: Record<string, string>;
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
    model_list?: { model_name?: string; litellm_params?: Record<string, unknown> }[];
    router_settings?: { model_group_alias?: Record<string, string> };
  };
  if (!Array.isArray(raw.model_list) || raw.model_list.length === 0) {
    throw new Error(`${configPath}: expected a non-empty model_list.`);
  }
  const modelGroupAlias = raw.router_settings?.model_group_alias;
  if (!modelGroupAlias || Object.keys(modelGroupAlias).length === 0) {
    throw new Error(`${configPath}: expected router_settings.model_group_alias.`);
  }
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
        ...priceField(entry.litellm_params, "input_cost_per_token", "inputCostPerToken"),
        ...priceField(entry.litellm_params, "output_cost_per_token", "outputCostPerToken"),
        ...priceField(entry.litellm_params, "cache_read_input_token_cost", "cacheReadInputTokenCost")
      };
    }),
    modelGroupAlias
  };
  configCache.set(configPath, config);
  return config;
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
