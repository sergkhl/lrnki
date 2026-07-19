import assert from "node:assert/strict";
import { test } from "node:test";
import {
  conceptSetSynthesisDescriptor,
  createConceptSetSynthesisPort,
  createKnowledgeBoundaryProbePort,
  knowledgeBoundaryProbeDescriptor
} from "./syntheticGenerationAdapters";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { readPromptFile } from "./promptFile";

type Capture = { lastCall?: { messages?: { role: string; content: string }[]; tags?: string[]; toolName?: string; model?: string } };

function clientReturning(canned: unknown, capture?: Capture): LiteLlmForcedToolClient {
  return {
    async call(input: unknown) {
      if (capture) capture.lastCall = input as Capture["lastCall"];
      return canned;
    }
  } as unknown as LiteLlmForcedToolClient;
}

test("synthesis descriptor frontmatter owns the DeepSeek-family synthesis alias", () => {
  assert.equal(readPromptFile(conceptSetSynthesisDescriptor.promptPath).model, "kg-concept-synthesis");
});

test("probe descriptor frontmatter owns the small cross-family probe alias", () => {
  assert.equal(readPromptFile(knowledgeBoundaryProbeDescriptor.promptPath).model, "kg-knowledge-boundary-probe");
});

test("synthesis port parses a forced-tool concept-set payload into candidate concepts", async () => {
  const capture: Capture = {};
  const concepts = await createConceptSetSynthesisPort(clientReturning({
    concepts: [
      { conceptKey: "a", canonicalLabel: "Concept A", aliases: [] },
      { conceptKey: "b", canonicalLabel: "Concept B", aliases: ["B-prime"] }
    ]
  }, capture)).synthesize({ topic: "Some Topic", declaredDomain: "some domain" });

  assert.equal(concepts.length, 2);
  assert.equal(concepts[0]?.conceptKey, "a");
  assert.deepEqual(concepts[1]?.aliases, ["B-prime"]);
  assert.equal(capture.lastCall?.toolName, "submit_synthesized_concepts");
  assert.deepEqual(capture.lastCall?.tags, ["concept-set-synthesis"]);
  assert.ok(capture.lastCall?.messages?.some((message) => message.content.includes("coordinated comparison label")));
});

test("probe port parses a forced-tool factual-answer payload", async () => {
  const capture: Capture = {};
  const result = await createKnowledgeBoundaryProbePort(clientReturning({ answer: "A factual answer." }, capture))
    .probe({ conceptLabel: "Concept A", declaredDomain: "some domain" });

  assert.equal(result.answer, "A factual answer.");
  assert.equal(capture.lastCall?.toolName, "submit_knowledge_boundary_answer");
  assert.deepEqual(capture.lastCall?.tags, ["knowledge-boundary-probe"]);
});

test("probe calibration can override the frontmatter model explicitly", async () => {
  const capture: Capture = {};
  await createKnowledgeBoundaryProbePort(clientReturning({ answer: "A factual answer." }, capture), "probe-deployment")
    .probe({ conceptLabel: "Concept A", declaredDomain: "some domain" });
  assert.equal(capture.lastCall?.model, "probe-deployment");
});
