import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { toForcedToolSchema } from "./forcedToolSchema";
import {
  buildPrerequisiteOrderingSchema,
  buildPrerequisiteOrderingValidator,
  conceptAdmissionSchemaForCandidateKeys,
  conceptAdmissionValidatorForCandidateKeys,
  conceptCoreSelectionSchemaForCandidateKeys,
  conceptCoreSelectionValidatorForCandidateKeys,
  conceptEvidenceProfileSchema,
  toolValidators
} from "./toolSchemas";

test("all forced-tool schemas satisfy strict object invariants", () => {
  for (const validator of toolValidators) {
    assertStrictForcedToolSchema(toForcedToolSchema(validator));
  }
});

test("strict object invariant catches optional object properties", () => {
  const schema = toForcedToolSchema(z.object({
    requiredValue: z.string(),
    optionalValue: z.string().optional()
  }).strict());

  assert.throws(() => assertStrictForcedToolSchema(schema), /missing required property optionalValue/);
});

test("all generated schema descriptions remain domain-neutral", () => {
  const modelFacingText = toolValidators
    .map((validator) => JSON.stringify(toForcedToolSchema(validator)))
    .join("\n")
    .toLowerCase();

  for (const fixtureTerm of ["ownership", "rust", "market", "economics", "instructkg", "meselson", "aira"]) {
    assert.equal(modelFacingText.includes(fixtureTerm), false, `fixture-derived term leaked: ${fixtureTerm}`);
  }
});

test("candidate-key enum is symmetric for admission schemas and validators", () => {
  const schema = conceptAdmissionSchemaForCandidateKeys(["a", "b"]);
  const decisions = ((schema.properties as Record<string, unknown>).decisions as { items: { properties: Record<string, unknown> } }).items.properties;

  assert.deepEqual(decisions.parentCandidateKey, {
    type: "string",
    enum: ["a", "b"],
    description: "The discovered candidateKey this atomic concept was split from."
  });
  assert.throws(() => conceptAdmissionValidatorForCandidateKeys(["a", "b"]).parse({
    decisions: [validAdmissionDecision("c")]
  }));
  assert.doesNotThrow(() => conceptAdmissionValidatorForCandidateKeys().parse({
    decisions: [validAdmissionDecision("c")]
  }));
});

test("candidate-key enum is symmetric for core-selection schemas and validators", () => {
  const schema = conceptCoreSelectionSchemaForCandidateKeys(["a", "b"]);
  const selections = ((schema.properties as Record<string, unknown>).selections as { maxItems: number; items: { properties: Record<string, unknown> } });

  assert.equal(selections.maxItems, 2);
  assert.deepEqual(selections.items.properties.candidateKey, { type: "string", enum: ["a", "b"] });
  assert.throws(() => conceptCoreSelectionValidatorForCandidateKeys(["a", "b"]).parse({
    selections: [{ candidateKey: "c", selected: true, canonicalLabel: "C", reasonCode: "source_level_core" }]
  }));
});

test("prerequisite ordering schema keeps numeric bounds while refine remains validator-only", () => {
  const schema = buildPrerequisiteOrderingSchema(3);
  const edgeProperties = (((schema.properties as Record<string, unknown>).edges as { items: { properties: Record<string, unknown> } }).items.properties);

  assert.deepEqual(edgeProperties.prerequisiteNumber, {
    type: "integer",
    minimum: 1,
    maximum: 3,
    description: "The 1-based Concept number (as shown before each concept) of the concept that must be understood FIRST."
  });
  assert.throws(() => buildPrerequisiteOrderingValidator(3).parse({
    edges: [{ prerequisiteNumber: 2, dependentNumber: 2, confidence: 0.5, rationale: "r" }]
  }));
});

test("concept evidence profile emits nullable literalValue in forced-tool dialect", () => {
  const assertions = (conceptEvidenceProfileSchema.properties as Record<string, { items: { properties: Record<string, unknown> } }>).assertions;

  assert.deepEqual(assertions.items.properties.literalValue, {
    type: ["string", "null"],
    description: "A faithful, concise definition grounded in the evidence quote."
  });
});

function assertStrictForcedToolSchema(schema: unknown): void {
  assert.equal(recordValue(schema).type, "object", "root must be type:object");
  assertSchemaNode(schema, "$");
}

function assertSchemaNode(schema: unknown, path: string): void {
  if (Array.isArray(schema)) {
    schema.forEach((item, index) => assertSchemaNode(item, `${path}[${index}]`));
    return;
  }
  if (!schema || typeof schema !== "object") return;

  const node = schema as Record<string, unknown>;
  assert.equal(node.$schema, undefined, `${path} must not include $schema`);
  assert.notEqual(isScalarNullableAnyOf(node), true, `${path} must not use scalar nullable anyOf`);

  if (node.type === "object") {
    assert.equal(node.additionalProperties, false, `${path} must set additionalProperties:false`);
    const properties = recordValue(node.properties);
    const required = Array.isArray(node.required) ? node.required : [];
    for (const key of Object.keys(properties)) {
      assert.ok(required.includes(key), `${path} missing required property ${key}`);
    }
  }

  for (const [key, value] of Object.entries(node)) {
    assertSchemaNode(value, `${path}.${key}`);
  }
}

function isScalarNullableAnyOf(node: Record<string, unknown>): boolean {
  const anyOf = node.anyOf;
  if (!Array.isArray(anyOf) || anyOf.length !== 2) return false;
  return anyOf.some((option) => recordValue(option).type === "null") &&
    anyOf.some((option) => typeof recordValue(option).type === "string" && recordValue(option).type !== "null");
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function validAdmissionDecision(parentCandidateKey: string) {
  return {
    parentCandidateKey,
    atomicKey: "atom",
    proposedCanonicalLabel: "Atomic Concept",
    tier: "core",
    sourceRole: "declared_domain_concept",
    standaloneLearningObjective: criterion(),
    establishedDomainMeaning: criterion(),
    definitionBearingTreatment: criterion(),
    organizingPower: {
      passed: true,
      rationale: "r",
      aspects: [{ summary: "s", nature: "definition-or-property", evidence: evidence() }]
    },
    reasonCodes: ["r"],
    confidence: 0.8
  };
}

function criterion() {
  return { passed: true, rationale: "r", evidence: [evidence()] };
}

function evidence() {
  return { blockId: "block-1", evidenceQuote: "quote" };
}
