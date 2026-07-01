import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONCEPT_SYNTHESIS_MODEL,
  KNOWLEDGE_BOUNDARY_PROBE_MODEL,
  LiteLlmConceptSetSynthesisAdapter,
  LiteLlmKnowledgeBoundaryProbeAdapter
} from "./syntheticGenerationAdapters";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";

// Stub the forced-tool client so the tests exercise ONLY the adapter's render + validate
// + passthrough, not the network. `capture` records the last client call so a test can
// assert the forced tool name and stage tag (rule 11 — deterministic envelope over a
// canned response).
type Capture = { lastCall?: { messages?: { role: string; content: string }[]; tags?: string[]; toolName?: string; model?: string } };

function clientReturning(canned: unknown, capture?: Capture): LiteLlmForcedToolClient {
  return {
    async call(input: unknown) {
      if (capture) capture.lastCall = input as Capture["lastCall"];
      return canned;
    }
  } as unknown as LiteLlmForcedToolClient;
}

test("synthesis adapter runs on the DeepSeek-family synthesis alias", () => {
  assert.equal(CONCEPT_SYNTHESIS_MODEL, "kg-concept-synthesis");
  assert.equal(new LiteLlmConceptSetSynthesisAdapter(clientReturning({ concepts: [] })).model, "kg-concept-synthesis");
});

test("probe adapter runs on the small cross-family probe alias", () => {
  assert.equal(KNOWLEDGE_BOUNDARY_PROBE_MODEL, "kg-knowledge-boundary-probe");
  assert.equal(new LiteLlmKnowledgeBoundaryProbeAdapter(clientReturning({ answer: "x" })).model, "kg-knowledge-boundary-probe");
});

test("synthesis adapter parses a forced-tool concept-set payload into candidate concepts", async () => {
  const capture: Capture = {};
  const concepts = await new LiteLlmConceptSetSynthesisAdapter(clientReturning({
    concepts: [
      { conceptKey: "a", canonicalLabel: "Concept A", aliases: [] },
      { conceptKey: "b", canonicalLabel: "Concept B", aliases: ["B-prime"] }
    ]
  }, capture)).synthesize({ topic: "Some Topic", declaredDomain: "some domain" });

  assert.equal(concepts.length, 2);
  assert.equal(concepts[0].conceptKey, "a");
  assert.deepEqual(concepts[1].aliases, ["B-prime"]);
  assert.equal(capture.lastCall?.toolName, "submit_synthesized_concepts");
  assert.deepEqual(capture.lastCall?.tags, ["concept-set-synthesis"]);
});

test("probe adapter parses a forced-tool factual-answer payload", async () => {
  const capture: Capture = {};
  const result = await new LiteLlmKnowledgeBoundaryProbeAdapter(clientReturning({ answer: "A factual answer." }, capture))
    .probe({ conceptLabel: "Concept A", declaredDomain: "some domain" });

  assert.equal(result.answer, "A factual answer.");
  assert.equal(capture.lastCall?.toolName, "submit_knowledge_boundary_answer");
  assert.deepEqual(capture.lastCall?.tags, ["knowledge-boundary-probe"]);
});
