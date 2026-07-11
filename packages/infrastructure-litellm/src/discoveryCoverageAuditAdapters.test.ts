import assert from "node:assert/strict";
import { test } from "node:test";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import {
  createDiscoveryCoverageAuditPort,
  discoveryCoverageAuditDescriptor
} from "./discoveryCoverageAuditAdapters";
import { readPromptFile } from "./promptFile";
import { discoveryCoverageAuditSchema, discoveryCoverageAuditValidator } from "./toolSchemas";

const auditInput = {
  declaredDomain: "a domain",
  blocks: [
    { blockType: "heading", headingPath: ["Intro"], text: "Intro" },
    { blockType: "paragraph", headingPath: ["Intro"], text: "Teachable body text." }
  ],
  admittedConcepts: [
    { label: "Kept Concept", gist: "A short gist." },
    { label: "Bare Concept", gist: "" }
  ]
};

function adapterReturning(canned: unknown) {
  const calls: unknown[] = [];
  const client = {
    async call(input: unknown) {
      calls.push(input);
      return discoveryCoverageAuditValidator.parse(canned);
    }
  } as unknown as LiteLlmForcedToolClient;
  return { adapter: createDiscoveryCoverageAuditPort(client), calls };
}

test("audit validator accepts an empty miss list as the sufficient-coverage answer", () => {
  assert.deepEqual(discoveryCoverageAuditValidator.parse({ misses: [] }), { misses: [] });
});

test("audit validator fails closed on malformed tool arguments", () => {
  assert.throws(() => discoveryCoverageAuditValidator.parse({}));
  assert.throws(() => discoveryCoverageAuditValidator.parse({ misses: [{ missedObjective: "x" }] }));
  assert.throws(() => discoveryCoverageAuditValidator.parse({
    misses: [{ missedObjective: "", sourceGrounding: "g", whyStandalone: "w" }]
  }));
  assert.throws(() => discoveryCoverageAuditValidator.parse({ misses: [], extra: true }));
});

test("adapter uses the independent judge alias, stage tag, and rendered inputs", async () => {
  const miss = { missedObjective: "An objective", sourceGrounding: "A quote.", whyStandalone: "Durable." };
  const { adapter, calls } = adapterReturning({ misses: [miss] });

  assert.deepEqual(await adapter.audit(auditInput), [miss]);
  assert.equal(adapter.model, "kg-independent-judge");
  assert.equal(readPromptFile(discoveryCoverageAuditDescriptor.promptPath).model, "kg-independent-judge");

  const call = calls[0] as {
    model: string;
    toolName: string;
    parameters: unknown;
    tags: string[];
    messages: { content: string }[];
  };
  assert.equal(call.model, "kg-independent-judge");
  assert.equal(call.toolName, "submit_discovery_coverage_audit");
  assert.deepEqual(call.parameters, discoveryCoverageAuditSchema);
  assert.deepEqual(call.tags, [STAGE_TAGS.discoveryCoverageAudit]);
  const userMessage = call.messages[1]?.content ?? "";
  assert.match(userMessage, /\[heading heading="Intro"\] Intro/);
  assert.match(userMessage, /\[paragraph heading="Intro"\] Teachable body text\./);
  assert.match(userMessage, /- Kept Concept — A short gist\./);
  // A concept without a gist renders as a bare label, not a dangling separator.
  assert.match(userMessage, /- Bare Concept\n/);
});
