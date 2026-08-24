import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { toForcedToolSchema } from "./forcedToolSchema";
import {
  buildPrerequisiteOrderingSchema,
  buildPrerequisiteOrderingValidator,
  buildClaimFactualityJudgmentValidator,
  buildClaimVerificationAnsweringSchema,
  buildClaimVerificationAnsweringValidator,
  buildClaimVerificationQuestionPlanningValidator,
  conceptAdmissionSchemaForCandidateKeys,
  conceptAdmissionValidatorForCandidateKeys,
  conceptCoreSelectionSchemaForCandidateKeys,
  conceptCoreSelectionValidatorForCandidateKeys,
  conceptEvidenceProfileSchema,
  conceptSetSynthesisValidator,
  CONCEPT_LESSON_SECTION_TEXT_MAX_LENGTH,
  conceptLessonSchema,
  conceptLessonValidator,
  groundingGenerationToolResultSchema,
  groundingGenerationToolResultValidator,
  answerKeyVerificationSchema,
  answerKeyVerificationValidator,
  impostorSchema,
  impostorValidator,
  scaffoldOutlineValidator,
  toolValidators
} from "./toolSchemas";

test("concept-set synthesis enforces the operation's at-most-16 concept budget", () => {
  const concepts = Array.from({ length: 17 }, (_, index) => ({
    conceptKey: `concept_${index}`,
    canonicalLabel: `Concept ${index}`,
    aliases: []
  }));

  assert.throws(() => conceptSetSynthesisValidator.parse({ concepts }));
  assert.doesNotThrow(() => conceptSetSynthesisValidator.parse({ concepts: concepts.slice(0, 16) }));
});

test("Grounding Generation requires one strict identity-scope audit beside one bounded nested bundle", () => {
  const properties = groundingGenerationToolResultSchema.properties as Record<string, {
    additionalProperties?: boolean;
    properties?: Record<string, { maxItems?: number }>;
    required?: string[];
  }>;
  const auditSchema = properties.identityScopeAudit;
  const bundleSchema = properties.bundle;
  assert.deepEqual(groundingGenerationToolResultSchema.required, ["identityScopeAudit", "bundle"]);
  assert.equal(auditSchema.additionalProperties, false);
  assert.deepEqual(auditSchema.required, [
    "selectedSense",
    "identityInvariant",
    "contextSpecificQualifiers",
    "materialNarrowingCounterexample"
  ]);
  assert.equal(bundleSchema.additionalProperties, false);
  assert.equal(bundleSchema.properties?.definitions?.maxItems, 2);
  assert.equal(bundleSchema.properties?.mentions?.maxItems, 1);

  const passage = (text: string) => ({ text });
  const valid = {
    identityScopeAudit: {
      selectedSense: "The established sense selected for this context.",
      identityInvariant: "The shared condition that preserves the concept identity.",
      contextSpecificQualifiers: [],
      materialNarrowingCounterexample: null
    },
    bundle: {
      definitions: [passage("The candidate has one defining criterion."), passage("A distinct necessary sense has another criterion.")],
      mentions: [passage("One necessary context relation.")],
      rationale: "The bundle supports the grounding context."
    }
  };
  assert.doesNotThrow(() => groundingGenerationToolResultValidator.parse(valid));
  assert.doesNotThrow(() => groundingGenerationToolResultValidator.parse({
    ...valid,
    identityScopeAudit: {
      ...valid.identityScopeAudit,
      contextSpecificQualifiers: ["One implementation detail is context-specific."],
      materialNarrowingCounterexample: "One relevant case lacks that implementation detail."
    }
  }));

  const { identityScopeAudit: _audit, ...withoutAudit } = valid;
  const { bundle: _bundle, ...withoutBundle } = valid;
  const { selectedSense: _sense, ...auditWithoutSense } = valid.identityScopeAudit;
  void _audit;
  void _bundle;
  void _sense;
  for (const invalid of [
    withoutAudit,
    withoutBundle,
    { ...valid, unexpected: true },
    { ...valid, identityScopeAudit: auditWithoutSense },
    { ...valid, identityScopeAudit: { ...valid.identityScopeAudit, unexpected: true } },
    { ...valid, identityScopeAudit: { ...valid.identityScopeAudit, selectedSense: "" } },
    { ...valid, identityScopeAudit: { ...valid.identityScopeAudit, identityInvariant: "" } },
    { ...valid, identityScopeAudit: { ...valid.identityScopeAudit, contextSpecificQualifiers: [""] } },
    { ...valid, identityScopeAudit: { ...valid.identityScopeAudit, materialNarrowingCounterexample: "" } },
    { ...valid, bundle: { ...valid.bundle, unexpected: true } },
    { ...valid, bundle: { ...valid.bundle, definitions: [] } },
    { ...valid, bundle: { ...valid.bundle, definitions: [passage("One."), passage("Two."), passage("Three.")] } },
    { ...valid, bundle: { ...valid.bundle, mentions: [passage("One mention."), passage("Two mentions.")] } }
  ]) {
    assert.throws(() => groundingGenerationToolResultValidator.parse(invalid));
  }
});

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

  for (const fixtureTerm of ["ownership", "rust", "market", "economics", "instructkg", "meselson", "aira", "heap allocation", "string memory representation", "pyruvate oxidation", "transaction isolation", "labor productivity", "mitochondrial", "bacterial cytoplasmic", "anaerobic", "hidden-until-commit", "time-only"]) {
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

test("claim verification schemas require exact known-target, question, and judgment coverage", () => {
  const plan = buildClaimVerificationQuestionPlanningValidator(["definition:0", "mention:0"]);
  assert.doesNotThrow(() => plan.parse({
    questions: [
      { targetKey: "definition:0", question: "What establishes the first atomic claim?" },
      { targetKey: "mention:0", question: "What establishes the second atomic claim?" }
    ]
  }));
  assert.throws(() => plan.parse({
    questions: [
      { targetKey: "definition:0", question: "What establishes one claim?" },
      { targetKey: "definition:0", question: "What establishes another claim in the same target?" }
    ]
  }), /missing verification question/);
  assert.throws(() => plan.parse({
    questions: [
      ...Array.from({ length: 7 }, (_, index) => ({
        targetKey: "definition:0",
        question: `What establishes definition claim ${index + 1}?`
      })),
      { targetKey: "mention:0", question: "What establishes the mention claim?" }
    ]
  }), /too many verification questions/);

  const answerKeys = ["q:0", "q:1"];
  const answers = buildClaimVerificationAnsweringValidator(answerKeys);
  assert.doesNotThrow(() => answers.parse({ answers: {
    "q:1": "The second answer.",
    "q:0": "The first answer."
  } }));
  assert.throws(() => answers.parse({ answers: { "q:0": "The first answer." } }));
  assert.throws(() => answers.parse({ answers: {
    "q:0": "The first answer.",
    "q:1": "The second answer.",
    unknown: "An extra answer."
  } }));
  assert.throws(() => answers.parse({ answers: {
    "q:0": "The first answer.",
    "q:1": ""
  } }));
  assert.throws(() => buildClaimVerificationAnsweringValidator(["q:0", "q:0"]), /duplicate input questionKey/);

  const answeringSchema = buildClaimVerificationAnsweringSchema(answerKeys);
  const answerObject = (answeringSchema.properties as Record<string, unknown>).answers as {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: boolean;
  };
  assert.equal(answerObject.type, "object");
  assert.deepEqual(Object.keys(answerObject.properties), answerKeys);
  assert.deepEqual(answerObject.required, answerKeys);
  assert.equal(answerObject.additionalProperties, false);

  const judgments = buildClaimFactualityJudgmentValidator(["definition:0", "mention:0"]);
  assert.doesNotThrow(() => judgments.parse({ judgments: [
    {
      targetKey: "mention:0",
      strongestLiteralClaim: "The support claim states one scoped relation.",
      categoryBoundaryAudit: "The claim imposes no conflicting category boundary.",
      scopeAudit: "No relevant variation conflicts with the scoped relation.",
      materialObjection: null,
      disposition: "accepted",
      rationale: "established"
    },
    {
      targetKey: "definition:0",
      strongestLiteralClaim: "The definition assigns one mechanism to the parent category.",
      categoryBoundaryAudit: "One actual member falls outside the stated mechanism boundary.",
      scopeAudit: "A descendant uses a different mechanism.",
      materialObjection: "The descendant contradicts the parent-level predicate.",
      disposition: "rejected",
      rationale: "not established"
    }
  ] }));
  assert.throws(() => judgments.parse({ judgments: [
    {
      targetKey: "mention:0",
      strongestLiteralClaim: "The support claim states one scoped relation.",
      categoryBoundaryAudit: "The claim imposes no conflicting category boundary.",
      scopeAudit: "No relevant variation conflicts with the scoped relation.",
      materialObjection: null,
      disposition: "accepted",
      rationale: "established"
    },
    {
      targetKey: "definition:0",
      strongestLiteralClaim: "The definition assigns one mechanism to the parent category.",
      scopeAudit: "A descendant uses a different mechanism.",
      materialObjection: "The descendant contradicts the parent-level predicate.",
      disposition: "rejected",
      rationale: "not established"
    }
  ] }), /categoryBoundaryAudit/);
  assert.throws(() => judgments.parse({ judgments: [
    {
      targetKey: "definition:0",
      strongestLiteralClaim: "The definition states one mechanism.",
      categoryBoundaryAudit: "No established member conflicts with the stated category boundary.",
      scopeAudit: "No conflict found.",
      materialObjection: null,
      disposition: "accepted",
      rationale: "established",
      text: "rewrite"
    },
    {
      targetKey: "mention:0",
      strongestLiteralClaim: "The support claim states one relation.",
      categoryBoundaryAudit: "The support claim imposes no conflicting category boundary.",
      scopeAudit: "No conflict found.",
      materialObjection: null,
      disposition: "accepted",
      rationale: "established"
    }
  ] }));
  assert.throws(() => judgments.parse({ judgments: [
    {
      targetKey: "definition:0",
      strongestLiteralClaim: "The definition assigns one mechanism to the parent category.",
      categoryBoundaryAudit: "One actual member falls outside the stated mechanism boundary.",
      scopeAudit: "A descendant uses a different mechanism.",
      materialObjection: "The descendant contradicts the parent-level predicate.",
      disposition: "accepted",
      rationale: "accepted despite the conflict"
    },
    {
      targetKey: "mention:0",
      strongestLiteralClaim: "The support claim states one relation.",
      categoryBoundaryAudit: "The support claim imposes no conflicting category boundary.",
      scopeAudit: "No conflict found.",
      materialObjection: null,
      disposition: "accepted",
      rationale: "established"
    }
  ] }), /cannot retain a materialObjection/);
  assert.throws(() => judgments.parse({ judgments: [
    {
      targetKey: "definition:0",
      strongestLiteralClaim: "The definition assigns one mechanism to the parent category.",
      categoryBoundaryAudit: "One actual member falls outside the stated mechanism boundary.",
      scopeAudit: "A descendant uses a different mechanism.",
      materialObjection: null,
      disposition: "rejected",
      rationale: "rejected without naming the defect"
    },
    {
      targetKey: "mention:0",
      strongestLiteralClaim: "The support claim states one relation.",
      categoryBoundaryAudit: "The support claim imposes no conflicting category boundary.",
      scopeAudit: "No conflict found.",
      materialObjection: null,
      disposition: "accepted",
      rationale: "established"
    }
  ] }), /requires a materialObjection/);
});

test("concept evidence profile emits nullable literalValue in forced-tool dialect", () => {
  const assertions = (conceptEvidenceProfileSchema.properties as Record<string, { items: { properties: Record<string, unknown> } }>).assertions;

  assert.deepEqual(assertions.items.properties.literalValue, {
    type: ["string", "null"],
    description: "A faithful, concise definition grounded in the evidence quote."
  });
});

test("concept lesson schema folds nullable citation/diagram scalars and is registered", () => {
  // Registration: the strict-invariant and domain-neutral suites iterate toolValidators,
  // so membership keeps the lesson schema under the same fail-closed guarantees (U2).
  assert.ok(toolValidators.includes(conceptLessonValidator));

  const section = (conceptLessonSchema.properties as Record<string, { items: { properties: Record<string, unknown> } }>)
    .sections.items.properties;
  // Optional citation/diagram fields are plain nullable scalars (no min) so they fold to
  // a type union rather than an anyOf the strict guard would reject.
  assert.deepEqual((section.citationPassageId as Record<string, unknown>).type, ["string", "null"]);
  assert.deepEqual((section.diagramSpec as Record<string, unknown>).type, ["string", "null"]);
  // Section text stays a non-nullable bounded string.
  assert.deepEqual(section.text, {
    type: "string",
    minLength: 1,
    maxLength: CONCEPT_LESSON_SECTION_TEXT_MAX_LENGTH,
    description: "The teaching prose for this section. Self-contained, compact, and readable on its own; do not reference 'the passage' or 'the source'."
  });
});

test("concept lesson validator accepts the R3 minimum and rejects empty or overlong section text", () => {
  // gist + one application + one substantive (definition) section — the R3 minimum
  // (membership in the array is the optionality model; absent sections are omitted).
  assert.doesNotThrow(() => conceptLessonValidator.parse({
    sections: [
      { kind: "gist", text: "A one-line organizer.", items: [], citationPassageId: null, citationEvidenceQuote: null, diagramCaption: null, diagramSpec: null },
      { kind: "definition", text: "The precise statement.", items: [], citationPassageId: "block-1", citationEvidenceQuote: "The precise statement.", diagramCaption: null, diagramSpec: null },
      { kind: "applications", text: "How it connects to neighbors.", items: ["Use one.", "Use two."], citationPassageId: null, citationEvidenceQuote: null, diagramCaption: null, diagramSpec: null }
    ],
    explorableTerms: []
  }));
  // An empty `text` on any present section fails closed (rule 6).
  assert.throws(() => conceptLessonValidator.parse({
    sections: [{ kind: "gist", text: "", items: [], citationPassageId: null, citationEvidenceQuote: null, diagramCaption: null, diagramSpec: null }]
  }));
  assert.throws(() => conceptLessonValidator.parse({
    sections: [{
      kind: "applications",
      text: "x".repeat(CONCEPT_LESSON_SECTION_TEXT_MAX_LENGTH + 1),
      items: [],
      citationPassageId: null,
      citationEvidenceQuote: null,
      diagramCaption: null,
      diagramSpec: null
    }]
  }));
});

test("concept lesson validator accepts a section with and without a diagram descriptor", () => {
  assert.doesNotThrow(() => conceptLessonValidator.parse({
    sections: [
      { kind: "examples", text: "A worked example.", items: ["First example.", "Second example."], citationPassageId: null, citationEvidenceQuote: null, diagramCaption: "A vs B", diagramSpec: "A relates to B" },
      { kind: "gist", text: "A one-line organizer.", items: [], citationPassageId: null, citationEvidenceQuote: null, diagramCaption: null, diagramSpec: null }
    ],
    explorableTerms: []
  }));
});

test("impostor schema binds three flat truths and scalar lie fields, and is registered", () => {
  // Registration: membership keeps the impostor schema under the strict-invariant and
  // domain-neutral sweeps that iterate toolValidators (U3).
  assert.ok(toolValidators.includes(impostorValidator));

  // FULLY FLAT wire shape (measured 2026-07-10, see toolSchemas.ts): no nested array
  // (stringified-blob failure) and no nullable field (trailing-null truncation).
  const properties = impostorSchema.properties as Record<string, Record<string, unknown>>;
  for (const n of [1, 2, 3]) {
    assert.equal(properties[`truth${n}Text`].type, "string");
    assert.equal(properties[`truth${n}PassageId`].type, "string");
    assert.equal(properties[`truth${n}Quote`].type, "string");
  }
  assert.ok(properties.lieText);
  assert.ok(properties.reveal);
  assert.equal(properties.siblingLabel.type, "string");
});

test("impostorValidator rejects a non-closed lieSource enum", () => {
  assert.throws(() => impostorValidator.parse({
    question: "Q?",
    truth1Text: "a", truth1PassageId: "p", truth1Quote: "q",
    truth2Text: "b", truth2PassageId: "p", truth2Quote: "q",
    truth3Text: "c", truth3PassageId: "p", truth3Quote: "q",
    lieText: "d", reveal: "r", lieSource: "neighbor", siblingLabel: ""
  }));
});

test("owner-neutral Answer-Key Verification schema is registered and fail-closed", () => {
  assert.ok(toolValidators.includes(answerKeyVerificationValidator));
  assert.ok(answerKeyVerificationSchema.properties);
  assert.doesNotThrow(() => answerKeyVerificationValidator.parse({
    verdicts: [
      { ordinal: 0, verdict: "claim_true", reason: "correct for the node" },
      { ordinal: 1, verdict: "claim_false", reason: "true only of a neighbour" },
      { ordinal: 2, verdict: "unclear", reason: "cannot decide" }
    ]
  }));
  assert.throws(() => answerKeyVerificationValidator.parse({ verdicts: [{ ordinal: 0, verdict: "maybe", reason: "unclear" }] }));
});

// Plan 2026-07-13-002 U1 (R2, AE1): generated learner-copy terms stay capped at five while
// the Scaffold outline stays capped at three Support Steps. Option-select now has a code-owned
// generic question and therefore returns no model-selected question terms.
test("lesson explorable terms accept five and reject six; scaffold outline stays at three", () => {
  const terms = (n: number) => Array.from({ length: n }, (_, i) => `term-${i + 1}`);
  const lesson = (count: number) => ({
    sections: [
      { kind: "gist", text: "A one-line organizer.", items: [], citationPassageId: null, citationEvidenceQuote: null, diagramCaption: null, diagramSpec: null }
    ],
    explorableTerms: terms(count).map((term) => ({ term, sectionKind: "gist" }))
  });
  assert.doesNotThrow(() => conceptLessonValidator.parse(lesson(5)));
  assert.throws(() => conceptLessonValidator.parse(lesson(6)));

  const steps = (n: number) => ({ steps: Array.from({ length: n }, (_, i) => ({ label: `step-${i + 1}`, rationale: "r" })) });
  assert.doesNotThrow(() => scaffoldOutlineValidator.parse(steps(3)));
  assert.throws(() => scaffoldOutlineValidator.parse(steps(4)));
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
