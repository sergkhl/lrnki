import { createHash } from "node:crypto";
import type { StageTag } from "@lrnki/domain-core";
import type { ZodType } from "zod";
import type { JsonSchema, LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { promptFileDependencyBytes, renderPromptFile, readPromptFile } from "./promptFile";

export type NeuralStageDescriptor<TInput, TArgs, TResult> = {
  promptPath: string;
  modelOverride?: string;
  stageTag: StageTag;
  schema: JsonSchema | ((input: TInput) => JsonSchema);
  validator: ZodType<TArgs> | ((input: TInput) => ZodType<TArgs>);
  sentinelInput: TInput;
  maxRetries?: number;
  templateData: (input: TInput) => Record<string, unknown>;
  mapResult: (args: TArgs, input: TInput, model: string) => TResult;
};

// Existential erasure of a descriptor for the heterogeneous config-hash arrays: TInput is
// invariant (covariant in `sentinelInput`, contravariant in the builder params), so it cannot be
// widened to `unknown` nor narrowed to `never` as a single parameter. Widening the covariant
// positions and narrowing the contravariant ones makes every concrete descriptor assignable
// without `any`. Only the hash-relevant surface is exercised through this type.
export type AnyNeuralStageDescriptor = {
  promptPath: string;
  modelOverride?: string;
  stageTag: StageTag;
  schema: JsonSchema | ((input: never) => JsonSchema);
  validator: ZodType<unknown> | ((input: never) => ZodType<unknown>);
  sentinelInput: unknown;
  maxRetries?: number;
  templateData: (input: never) => Record<string, unknown>;
  mapResult: (args: never, input: never, model: string) => unknown;
};

export function withModelOverride<TInput, TArgs, TResult>(
  descriptor: NeuralStageDescriptor<TInput, TArgs, TResult>,
  modelOverride?: string
): NeuralStageDescriptor<TInput, TArgs, TResult> {
  return modelOverride === undefined ? descriptor : { ...descriptor, modelOverride };
}

export async function executeForcedToolStage<TInput, TArgs, TResult>(
  client: LiteLlmForcedToolClient,
  descriptor: NeuralStageDescriptor<TInput, TArgs, TResult>,
  input: TInput
): Promise<TResult> {
  const rendered = renderPromptFile(descriptor.promptPath, descriptor.templateData(input));
  const model = descriptor.modelOverride ?? rendered.model;
  const args = await client.call({
    model,
    messages: rendered.messages,
    toolName: rendered.toolName,
    toolDescription: rendered.toolDescription,
    parameters: resolveSchema(descriptor, input),
    validator: resolveValidator(descriptor, input),
    tags: [descriptor.stageTag],
    ...(descriptor.maxRetries !== undefined ? { maxRetries: descriptor.maxRetries } : {})
  });
  return descriptor.mapResult(args, input, model);
}

export function stageConfigHash(descriptor: AnyNeuralStageDescriptor): string {
  const prompt = readPromptFile(descriptor.promptPath);
  const hash = createHash("sha256");
  hash.update("neural-stage-descriptor/v1\n");
  for (const bytes of promptFileDependencyBytes(descriptor.promptPath)) {
    hash.update(bytes);
    hash.update("\n");
  }
  const schema = typeof descriptor.schema === "function"
    ? (descriptor.schema as (input: unknown) => JsonSchema)(descriptor.sentinelInput)
    : descriptor.schema;
  hash.update(stableStringify({
    model: prompt.model,
    modelOverride: descriptor.modelOverride ?? null,
    toolName: prompt.toolName,
    toolDescription: prompt.toolDescription,
    stageTag: descriptor.stageTag,
    maxRetries: descriptor.maxRetries ?? null,
    schema
  }));
  return hash.digest("hex");
}

function resolveSchema<TInput, TArgs, TResult>(
  descriptor: NeuralStageDescriptor<TInput, TArgs, TResult>,
  input: TInput
): JsonSchema {
  return typeof descriptor.schema === "function" ? descriptor.schema(input) : descriptor.schema;
}

function resolveValidator<TInput, TArgs, TResult>(
  descriptor: NeuralStageDescriptor<TInput, TArgs, TResult>,
  input: TInput
): ZodType<TArgs> {
  return typeof descriptor.validator === "function" ? descriptor.validator(input) : descriptor.validator;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
}
