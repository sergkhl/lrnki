import assert from "node:assert/strict";
import { test } from "node:test";
import { LiteLlmCardGenerationAdapter } from "./cardGenerationAdapters";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { cardGenerationValidator } from "./toolSchemas";

test("passes the node and its grounding passages into the forced-tool prompt", async () => {
  const calls: { model: string; toolName: string; messages: { content: string }[] }[] = [];
  const client = {
    async call(input: { model: string; toolName: string; messages: { content: string }[] }) {
      calls.push(input);
      return { question: "Q?", answerKey: "A.", selfReportPrompt: "Confident?", citations: [{ sourceBlockId: "b1", evidenceQuote: "rules that govern memory" }] };
    }
  } as unknown as LiteLlmForcedToolClient;
  const adapter = new LiteLlmCardGenerationAdapter(client, "mock-card-gen");

  const draft = await adapter.generate({
    declaredDomain: "software engineering",
    node: { derivedNodeId: "n1", canonicalLabel: "Ownership", aliases: ["owner"] },
    groundingProvenance: "source_cep",
    groundingPassages: [{ passageId: "b1", kind: "definition", text: "Ownership is a set of rules that govern memory.", sourceResourceId: "res-1", sourceBlockId: "b1" }],
    definesLiteral: "the rules governing memory"
  });

  assert.equal(draft.citations[0].sourceBlockId, "b1");
  assert.equal(calls[0].model, "mock-card-gen");
  assert.equal(calls[0].toolName, "submit_recall_card");
  assert.ok(calls[0].messages.some((m) => m.content.includes("Ownership")));
  assert.ok(calls[0].messages.some((m) => m.content.includes("b1")));
});

test("validator rejects a tool argument missing answerKey", () => {
  assert.throws(() => cardGenerationValidator.parse({ question: "Q?", selfReportPrompt: "C?", citations: [] }));
});

test("validator rejects a tool argument missing selfReportPrompt", () => {
  assert.throws(() => cardGenerationValidator.parse({ question: "Q?", answerKey: "A.", citations: [] }));
});
