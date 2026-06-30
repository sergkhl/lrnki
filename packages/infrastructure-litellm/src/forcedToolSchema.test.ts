import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { toForcedToolSchema } from "./forcedToolSchema";

test("folds nullable scalar anyOf to a type union and preserves description", () => {
  const schema = toForcedToolSchema(z.object({
    literalValue: z.string().nullable().describe("A faithful, concise definition grounded in the evidence quote.")
  }).strict());

  assert.deepEqual((schema.properties as Record<string, unknown>).literalValue, {
    description: "A faithful, concise definition grounded in the evidence quote.",
    type: ["string", "null"]
  });
  assert.equal(JSON.stringify(schema).includes("anyOf"), false);
});

test("drops zod's unbounded integer maximum sentinel but keeps real maximum bounds", () => {
  const schema = toForcedToolSchema(z.object({
    unbounded: z.number().int().min(0),
    bounded: z.number().int().min(1).max(3)
  }).strict());
  const properties = schema.properties as Record<string, Record<string, unknown>>;

  assert.deepEqual(properties.unbounded, { type: "integer", minimum: 0 });
  assert.deepEqual(properties.bounded, { type: "integer", minimum: 1, maximum: 3 });
});

test("strict objects remain strict forced-tool schemas without draft metadata", () => {
  const schema = toForcedToolSchema(z.object({ value: z.string() }).strict());

  assert.equal(schema.$schema, undefined);
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ["value"]);
});

test("refine remains validator-only and is not represented in the schema", () => {
  const schema = toForcedToolSchema(z.object({
    edges: z.array(z.object({
      prerequisiteNumber: z.number().int(),
      dependentNumber: z.number().int()
    }).strict().refine((edge) => edge.prerequisiteNumber !== edge.dependentNumber))
  }).strict());

  assert.equal(JSON.stringify(schema).includes("refine"), false);
});

test("enum-bearing descriptions survive schema generation", () => {
  const schema = toForcedToolSchema(z.object({
    tier: z.enum(["core", "optional"]).describe("Admission tier.")
  }).strict());

  assert.deepEqual((schema.properties as Record<string, unknown>).tier, {
    type: "string",
    enum: ["core", "optional"],
    description: "Admission tier."
  });
});
