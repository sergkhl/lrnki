import assert from "node:assert/strict";
import { test } from "node:test";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import {
  createSourceMaterialClaimSupportVerificationPort,
  sourceMaterialClaimSupportDescriptor
} from "./sourceMaterialClaimSupportAdapters";
import { readPromptFile } from "./promptFile";
import {
  sourceMaterialClaimSupportSchema,
  sourceMaterialClaimSupportValidator,
  toolValidators
} from "./toolSchemas";

test("source-support schema is flat, strict, and fail-closed", () => {
  assert.deepEqual(
    sourceMaterialClaimSupportValidator.parse({ disposition: "supported", reason: "The block entails every field." }),
    { disposition: "supported", reason: "The block entails every field." }
  );
  assert.throws(() => sourceMaterialClaimSupportValidator.parse({ disposition: "supported" }));
  assert.throws(() => sourceMaterialClaimSupportValidator.parse({ disposition: "yes", reason: "r" }));
  assert.throws(() => sourceMaterialClaimSupportValidator.parse({ disposition: "unclear", reason: "r", extra: true }));
  assert.equal(sourceMaterialClaimSupportSchema.type, "object");
  assert.deepEqual(Object.keys(sourceMaterialClaimSupportSchema.properties as object), ["disposition", "reason"]);
  assert.ok(toolValidators.includes(sourceMaterialClaimSupportValidator));
});

test("source-support adapter uses the dedicated alias and renders the exact claim beside full evidence", async () => {
  const calls: unknown[] = [];
  const client = {
    async call(input: unknown) {
      calls.push(input);
      return { disposition: "unsupported", reason: "The cited quote omits the limiting condition." };
    }
  } as unknown as LiteLlmForcedToolClient;
  const adapter = createSourceMaterialClaimSupportVerificationPort(client);
  const verdict = await adapter.verify({
    declaredDomain: "systems engineering",
    subject: { canonicalLabel: "Lease", aliases: ["temporary grant"] },
    claim: {
      claimKey: "lesson:definition",
      statement: "The lease grants permanent authority.",
      evaluationKind: "assertion"
    },
    evidence: [{
      evidenceKey: "e1",
      passageKind: "definition",
      blockText: "A lease grants temporary authority until its stated expiry time.",
      citedQuote: "grants temporary authority",
      direct: true
    }]
  });
  assert.deepEqual(verdict, { disposition: "unsupported", reason: "The cited quote omits the limiting condition." });
  assert.equal(adapter.model, "kg-source-material-support-verifier");
  assert.equal(readPromptFile(sourceMaterialClaimSupportDescriptor.promptPath).model, adapter.model);
  const call = calls[0] as {
    model: string;
    toolName: string;
    toolDescription: string;
    parameters: unknown;
    tags: string[];
    maxRetries: number;
    messages: { content: string }[];
  };
  assert.equal(call.model, adapter.model);
  assert.equal(call.toolName, "submit_source_material_claim_support");
  assert.deepEqual(call.parameters, sourceMaterialClaimSupportSchema);
  assert.deepEqual(call.tags, [STAGE_TAGS.sourceMaterialClaimSupport]);
  assert.equal(call.maxRetries, 3, "the source gate can cross one provider minute-limit window");
  assert.match(call.messages[0]?.content ?? "", /sole authority/);
  assert.match(call.messages[0]?.content ?? "", /collective versus distributive/);
  assert.match(call.messages[0]?.content ?? "", /missing domain rule or definition/);
  assert.match(call.messages[0]?.content ?? "", /throughout.*require explicit evidence/);
  assert.match(call.messages[0]?.content ?? "", /independently verify the proposed refusal/);
  assert.match(call.messages[0]?.content ?? "", /positive occurrence mechanically proves that the claim's words are present/);
  assert.match(call.messages[0]?.content ?? "", /claim contains the supposedly missing content.*discard that reason/);
  assert.match(call.messages[0]?.content ?? "", /matching relationship.*assessment transformation/i);
  assert.match(call.messages[1]?.content ?? "", /The lease grants permanent authority/);
  assert.match(call.messages[1]?.content ?? "", /A lease grants temporary authority until its stated expiry time/);
  assert.match(call.messages[1]?.content ?? "", /Evidence 1: absent/);
  assert.match(call.messages[1]?.content ?? "", /directly cited/);
});

test("source-support request mechanically marks a whole claim already present in the full block", async () => {
  const calls: { messages: { content: string }[] }[] = [];
  const client = {
    async call(input: { messages: { content: string }[] }) {
      calls.push(input);
      return { disposition: "supported", reason: "The complete sentence is asserted by the source block." };
    }
  } as unknown as LiteLlmForcedToolClient;
  const adapter = createSourceMaterialClaimSupportVerificationPort(client);
  await adapter.verify({
    declaredDomain: "critical thinking",
    subject: { canonicalLabel: "Appeal to Authority", aliases: [] },
    claim: {
      claimKey: "lesson:applications",
      statement: "Responsible reliance on specialists is unavoidable in complex societies.",
      evaluationKind: "assertion"
    },
    evidence: [{
      evidenceKey: "e1",
      passageKind: "definition",
      blockText: "An appeal to authority relies on status. Responsible reliance on specialists is unavoidable in complex societies.",
      citedQuote: "An appeal to authority relies on status.",
      direct: false
    }]
  });

  const rendered = calls[0]!.messages.map((message) => message.content).join("\n");
  const userMessage = calls[0]!.messages[1]?.content ?? "";
  assert.match(rendered, /Evidence 1: exact substring/);
  assert.match(rendered, /presence only, not contextual entailment/);
  assert.equal(userMessage.match(/<occurrence_audit>/g)?.length, 1, "the audit has one delimiter pair");
  assert.equal(userMessage.match(/<\/occurrence_audit>/g)?.length, 1, "the audit has one delimiter pair");
});

test("source-support request scopes matching presentation as a semantic assessment transformation", async () => {
  const calls: { messages: { content: string }[] }[] = [];
  const client = {
    async call(input: { messages: { content: string }[] }) {
      calls.push(input);
      return { disposition: "supported", reason: "The source entails the relationship." };
    }
  } as unknown as LiteLlmForcedToolClient;
  const adapter = createSourceMaterialClaimSupportVerificationPort(client);
  await adapter.verify({
    declaredDomain: "critical thinking",
    subject: { canonicalLabel: "Moving the Goalposts", aliases: [] },
    claim: {
      claimKey: "matching:item:relationship:2",
      statement: 'Matching prompt "A standard is applied consistently" maps to "Consistency in application".',
      evaluationKind: "matching_relationship"
    },
    evidence: [{
      evidenceKey: "e1",
      passageKind: "mention",
      blockText: "The reason for the change should be stated and applied consistently.",
      citedQuote: "applied consistently",
      direct: true
    }]
  });

  const rendered = calls[0]!.messages.map((message) => message.content).join("\n");
  assert.match(rendered, /claim-evaluation scope \(matching_relationship\)/);
  assert.match(rendered, /need not contain a matching exercise.*prompt wording.*match label verbatim/);
  assert.match(rendered, /absence of that presentation form is not a refusal reason/);
});
