import { createHash } from "node:crypto";
import { stageConfigHash, stableStringify, type NeuralStageDescriptor } from "./forcedToolStage";

type AnyNeuralStageDescriptor = NeuralStageDescriptor<any, any, any>;

export function operationConfigHash(
  seed: string,
  descriptors: readonly AnyNeuralStageDescriptor[],
  appConfig: Record<string, unknown> = {}
): string {
  const hash = createHash("sha256");
  hash.update("neural-operation-config/v1\n");
  hash.update(`${seed}\n`);
  const stageHashes = descriptors.map((descriptor) => stageConfigHash(descriptor)).sort();
  for (const stageHash of stageHashes) hash.update(`${stageHash}\n`);
  hash.update(stableStringify(appConfig));
  return `${seed}-${hash.digest("hex").slice(0, 12)}`;
}
