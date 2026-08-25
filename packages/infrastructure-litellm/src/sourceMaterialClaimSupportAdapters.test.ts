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
    claim: { claimKey: "lesson:definition", statement: "The lease grants permanent authority." },
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
    messages: { content: string }[];
  };
  assert.equal(call.model, adapter.model);
  assert.equal(call.toolName, "submit_source_material_claim_support");
  assert.deepEqual(call.parameters, sourceMaterialClaimSupportSchema);
  assert.deepEqual(call.tags, [STAGE_TAGS.sourceMaterialClaimSupport]);
  assert.match(call.messages[0]?.content ?? "", /sole authority/);
  assert.match(call.messages[1]?.content ?? "", /The lease grants permanent authority/);
  assert.match(call.messages[1]?.content ?? "", /A lease grants temporary authority until its stated expiry time/);
  assert.match(call.messages[1]?.content ?? "", /directly cited/);
});
