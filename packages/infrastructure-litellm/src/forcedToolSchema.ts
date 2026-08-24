import { z, type ZodType } from "zod";
import type { JsonSchema } from "./LiteLlmForcedToolClient";

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

export function toForcedToolSchema(schema: ZodType): JsonSchema {
  return normalizeForcedToolSchema(z.toJSONSchema(schema, { target: "draft-2020-12" })) as JsonSchema;
}

function normalizeForcedToolSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeForcedToolSchema(item));
  if (!isRecord(value)) return value;

  const normalized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    // Function parameters carry a schema object, not a standalone draft document.
    if (key === "$schema") continue;
    normalized[key] = normalizeForcedToolSchema(child);
  }

  foldScalarNullableAnyOf(normalized);
  dropUnboundedIntegerSentinel(normalized);
  return normalized;
}

function foldScalarNullableAnyOf(schema: Record<string, unknown>): void {
  const anyOf = schema.anyOf;
  if (!Array.isArray(anyOf) || anyOf.length !== 2) return;

  const scalar = anyOf.find((option) => isRecord(option) && typeof option.type === "string" && option.type !== "null");
  const nullable = anyOf.find((option) => isRecord(option) && option.type === "null");
  if (!isRecord(scalar) || !nullable) return;

  // Scalar-only constraints remain valid beside a nullable type union: JSON Schema ignores
  // string/number keywords when the instance is null. Keeping them here lets the owning Zod
  // validator drive both provider-side constraints and application-boundary validation.
  for (const [key, value] of Object.entries(scalar)) {
    if (key !== "type") schema[key] = value;
  }
  schema.type = [scalar.type, "null"];
  delete schema.anyOf;
}

function dropUnboundedIntegerSentinel(schema: Record<string, unknown>): void {
  if ((schema.type === "integer" || schema.type === "number") && schema.maximum === MAX_SAFE_INTEGER) {
    // zod emits MAX_SAFE_INTEGER for unbounded numeric schemas; it is not tool intent.
    delete schema.maximum;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
