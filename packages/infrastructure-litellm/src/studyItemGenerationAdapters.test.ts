import assert from "node:assert/strict";
import { test } from "node:test";
import { LiteLlmStudyItemGenerationAdapter } from "./studyItemGenerationAdapters";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { optionSelectValidator } from "./toolSchemas";

test("generateOptionSelect assembles a draft: grounded correct + three generated distractors", async () => {
  const calls: { toolName: string; messages: { content: string }[] }[] = [];
  const client = {
    async call(input: { toolName: string; messages: { content: string }[] }) {
      calls.push(input);
      return {
        question: "Where is memory allocated at runtime?",
        correctAnswer: { text: "Heap", citation: { passageId: "b1", evidenceQuote: "the heap allocates at runtime" } },
        distractors: ["Stack", "Register", "Cache"]
      };
    }
  } as unknown as LiteLlmForcedToolClient;
  const adapter = new LiteLlmStudyItemGenerationAdapter(client, "mock-gen");

  const draft = await adapter.generateOptionSelect({
    declaredDomain: "software engineering",
    node: { derivedNodeId: "n1", canonicalLabel: "Heap", aliases: [] },
    groundingProvenance: "source_cep",
    groundingPassages: [{ passageId: "b1", kind: "definition", text: "the heap allocates at runtime", sourceResourceId: "res-1", sourceBlockId: "b1" }],
    siblings: [{ label: "Stack", snippet: "LIFO region for call frames" }]
  });

  assert.equal(draft.itemType, "option_select");
  assert.equal(draft.options.length, 4);
  const correct = draft.options.filter((o) => o.isCorrect);
  assert.equal(correct.length, 1);
  assert.equal(correct[0].text, "Heap");
  assert.equal(correct[0].provenance, "source");
  assert.deepEqual(correct[0].citation, { passageId: "b1", evidenceQuote: "the heap allocates at runtime" });
  for (const distractor of draft.options.filter((o) => !o.isCorrect)) {
    assert.equal(distractor.provenance, "generated");
    assert.equal(distractor.citation, undefined);
  }
  assert.equal(calls[0].toolName, "submit_option_select_item");
  // siblings flow into the prompt
  assert.ok(calls[0].messages.some((m) => m.content.includes("Stack")));
});

test("generateOptionSelect labels the correct answer 'generated' on a generated-grounding node", async () => {
  const client = {
    async call() {
      return {
        question: "Q?",
        correctAnswer: { text: "Ownership", citation: { passageId: "p0", evidenceQuote: "tracks which binding frees a value" } },
        distractors: ["a", "b", "c"]
      };
    }
  } as unknown as LiteLlmForcedToolClient;
  const adapter = new LiteLlmStudyItemGenerationAdapter(client, "mock-gen");
  const draft = await adapter.generateOptionSelect({
    declaredDomain: "software engineering",
    node: { derivedNodeId: "n2", canonicalLabel: "Ownership", aliases: [] },
    groundingProvenance: "generated",
    groundingPassages: [{ passageId: "p0", kind: "definition", text: "tracks which binding frees a value", derivedNodeId: "n2" }],
    siblings: []
  });
  assert.equal(draft.options.find((o) => o.isCorrect)!.provenance, "generated");
});

test("optionSelectValidator rejects arguments missing correctAnswer", () => {
  assert.throws(() => optionSelectValidator.parse({ question: "Q?", distractors: ["a", "b", "c"] }));
});

test("optionSelectValidator rejects arguments missing distractors", () => {
  assert.throws(() =>
    optionSelectValidator.parse({ question: "Q?", correctAnswer: { text: "x", citation: { passageId: "p", evidenceQuote: "q" } } })
  );
});

test("optionSelectValidator rejects the wrong distractor count (fail-closed, rule 6)", () => {
  const base = { question: "Q?", correctAnswer: { text: "x", citation: { passageId: "p", evidenceQuote: "q" } } };
  assert.throws(() => optionSelectValidator.parse({ ...base, distractors: ["a", "b"] }));
  assert.throws(() => optionSelectValidator.parse({ ...base, distractors: ["a", "b", "c", "d"] }));
});

test("optionSelectValidator accepts a well-formed argument set (shape only, no content assertion)", () => {
  const parsed = optionSelectValidator.parse({
    question: "Q?",
    correctAnswer: { text: "x", citation: { passageId: "p", evidenceQuote: "q" } },
    distractors: ["a", "b", "c"]
  });
  assert.equal(parsed.distractors.length, 3);
});
