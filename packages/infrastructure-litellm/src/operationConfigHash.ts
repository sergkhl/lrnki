import { createHash } from "node:crypto";
import { stageConfigHash, stableStringify, type AnyNeuralStageDescriptor } from "./forcedToolStage";
import {
  modelRoutingBehaviorIdentity,
  readLitellmProxyConfig,
  type LitellmProxyConfig
} from "./litellmProxyConfig";
import { readPromptFile } from "./promptFile";

export type OperationConfigHashOptions = {
  additionalModels?: readonly string[];
  litellmConfig?: LitellmProxyConfig;
};

export function operationConfigHash(
  seed: string,
  descriptors: readonly AnyNeuralStageDescriptor[],
  appConfig: Record<string, unknown> = {},
  options: OperationConfigHashOptions = {}
): string {
  const hash = createHash("sha256");
  hash.update("neural-operation-config/v2\n");
  hash.update(`${seed}\n`);
  const stageHashes = descriptors.map((descriptor) => stageConfigHash(descriptor)).sort();
  for (const stageHash of stageHashes) hash.update(`${stageHash}\n`);
  const requestedModels = [...new Set([
    ...descriptors.map((descriptor) => descriptor.modelOverride ?? readPromptFile(descriptor.promptPath).model),
    ...(options.additionalModels ?? [])
  ])].sort();
  const litellmConfig = options.litellmConfig ?? readLitellmProxyConfig();
  hash.update(stableStringify(requestedModels.map((model) => modelRoutingBehaviorIdentity(model, litellmConfig))));
  hash.update(stableStringify(appConfig));
  return `${seed}-${hash.digest("hex").slice(0, 12)}`;
}
