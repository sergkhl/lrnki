import assert from "node:assert/strict";
import test from "node:test";
import { allNeuralOperationDescriptors, measurementNeuralStageDescriptors } from "./configHashes";
import type { AnyNeuralStageDescriptor } from "./forcedToolStage";
import type { JsonSchema } from "./LiteLlmForcedToolClient";
import { mimoRoutedAliases, readLitellmProxyConfig } from "./litellmProxyConfig";
import { readPromptFile } from "./promptFile";

// Trailing-nullable descriptor-shape congruence test (plan 2026-07-10-004 U3/KTD5).
// MiMo's constrained tool decoder truncates arguments before a trailing literal
// `null`: a wire schema whose object's FINAL property admits null was measured fatal
// (impostor item, 0/8 usable — see the MiMo deployment comment in litellm/config.yaml).
// This locks the one proven-fatal shape mechanically. Which descriptors are
// MiMo-routed is parsed from litellm/config.yaml (the declared source of truth,
// AGENTS rule 5) — never restated here. Mid-object nullables and nested arrays
// demonstrably work on MiMo and stay allowed (recorded scope decision).

// Everything a model can be sent: the registry-derived runtime inventory (KTD7 — no manual
// per-operation spread to fall out of date) plus the explicitly classified measurement
// descriptors, whose calls carry no operation_id but still cross the same wire.
const allDescriptors: readonly AnyNeuralStageDescriptor[] = [
  ...allNeuralOperationDescriptors,
  ...measurementNeuralStageDescriptors
];

function descriptorAlias(descriptor: AnyNeuralStageDescriptor): string {
  return descriptor.modelOverride ?? readPromptFile(descriptor.promptPath).model;
}

function resolveWireSchema(descriptor: AnyNeuralStageDescriptor): JsonSchema {
  return typeof descriptor.schema === "function"
    ? (descriptor.schema as (input: unknown) => JsonSchema)(descriptor.sentinelInput)
    : descriptor.schema;
}

function admitsNull(schema: unknown): boolean {
  if (typeof schema !== "object" || schema === null) return false;
  const record = schema as Record<string, unknown>;
  if (record.type === "null") return true;
  if (Array.isArray(record.type) && record.type.includes("null")) return true;
  for (const combinator of ["anyOf", "oneOf"]) {
    const options = record[combinator];
    if (Array.isArray(options) && options.some((option) => admitsNull(option))) return true;
  }
  return false;
}

// Every object node in the wire schema whose FINAL property admits null, with its path.
function trailingNullableObjects(schema: unknown, path: string): { path: string; property: string }[] {
  if (typeof schema !== "object" || schema === null) return [];
  const record = schema as Record<string, unknown>;
  const found: { path: string; property: string }[] = [];
  const properties = record.properties;
  if (record.type === "object" && typeof properties === "object" && properties !== null && !Array.isArray(properties)) {
    const keys = Object.keys(properties);
    const finalKey = keys[keys.length - 1];
    if (finalKey && admitsNull((properties as Record<string, unknown>)[finalKey])) {
      found.push({ path, property: finalKey });
    }
    for (const key of keys) {
      found.push(...trailingNullableObjects((properties as Record<string, unknown>)[key], `${path}.${key}`));
    }
  }
  if (typeof record.items === "object" && record.items !== null) {
    found.push(...trailingNullableObjects(record.items, `${path}[]`));
  }
  for (const combinator of ["anyOf", "oneOf", "allOf"]) {
    const options = record[combinator];
    if (Array.isArray(options)) {
      options.forEach((option, index) => found.push(...trailingNullableObjects(option, `${path}<${combinator}[${index}]>`)));
    }
  }
  return found;
}

test("no MiMo-routed descriptor wire schema ends an object with a nullable property", () => {
  const config = readLitellmProxyConfig();
  const mimoAliases = new Set(mimoRoutedAliases(config));
  assert.ok(mimoAliases.size > 0, "expected MiMo-routed aliases while MiMo is the production extractor");

  const mimoDescriptors = allDescriptors.filter((descriptor) => mimoAliases.has(descriptorAlias(descriptor)));
  assert.ok(mimoDescriptors.length > 0, "expected at least one MiMo-routed descriptor");

  for (const descriptor of mimoDescriptors) {
    const offending = trailingNullableObjects(resolveWireSchema(descriptor), "$");
    assert.deepEqual(
      offending,
      [],
      `${descriptor.promptPath}: ${offending
        .map((entry) => `object at ${entry.path} ends with nullable property "${entry.property}"`)
        .join("; ")} — MiMo's constrained decoder truncates before a trailing literal null ` +
        `(proven-fatal shape; see the MiMo deployment comment in litellm/config.yaml). ` +
        `Move the nullable earlier in the object or flatten it.`
    );
  }
});

// The walker itself must catch the fatal shape: a synthetic schema mirroring the
// pre-fix impostor wire shape (nested object whose last property is nullable).
test("the trailing-nullable walker detects the proven-fatal shape", () => {
  const fatal = {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            statement: { type: "string" },
            citation: { type: ["string", "null"] }
          }
        }
      }
    }
  };
  const offending = trailingNullableObjects(fatal, "$");
  assert.deepEqual(offending, [{ path: "$.items[]", property: "citation" }]);
  // Unfolded zod nullables (anyOf with a null branch) are caught too.
  const unfolded = {
    type: "object",
    properties: {
      value: { anyOf: [{ type: "string" }, { type: "null" }], description: "d" }
    }
  };
  assert.deepEqual(trailingNullableObjects(unfolded, "$"), [{ path: "$", property: "value" }]);
  // A mid-object nullable stays allowed (measured working on MiMo).
  const midObject = {
    type: "object",
    properties: {
      literalValue: { type: ["string", "null"] },
      evidence: { type: "array", items: { type: "string" } }
    }
  };
  assert.deepEqual(trailingNullableObjects(midObject, "$"), []);
});
