import assert from "node:assert/strict";
import { test } from "node:test";
import { createStudyItemGenerationPort } from "./studyItemGenerationAdapters";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { impostorValidator, optionSelectValidator } from "./toolSchemas";

test("generateOptionSelect assembles a draft: grounded correct + three generated distractors", async () => {
  const calls: { toolName: string; messages: { content: string }[]; maxRetries?: number }[] = [];
  const client = {
    async call(input: { toolName: string; messages: { content: string }[]; maxRetries?: number }) {
      calls.push(input);
      return {
        question: "Where is memory allocated at runtime?",
        explanation: "The heap is correct because the grounding says it allocates at runtime.",
        correctAnswer: { text: "Heap", citation: { passageId: "b1", evidenceQuote: "the heap allocates at runtime" } },
        distractors: ["Stack", "Register", "Cache"]
      };
    }
  } as unknown as LiteLlmForcedToolClient;
  const adapter = createStudyItemGenerationPort(client);

  const draft = await adapter.generateOptionSelect({
    declaredDomain: "software engineering",
    node: { derivedNodeId: "n1", canonicalLabel: "Heap", aliases: [] },
    groundingProvenance: "source_cep",
    groundingPassages: [{ passageId: "b1", kind: "definition", text: "the heap allocates at runtime", sourceResourceId: "res-1", sourceBlockId: "b1" }],
    siblings: [{ label: "Stack", snippet: "LIFO region for call frames" }]
  });

  assert.equal(draft.itemType, "option_select");
  assert.equal(draft.explanation, "The heap is correct because the grounding says it allocates at runtime.");
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
  assert.equal(calls[0].maxRetries, 4);
  // siblings flow into the prompt
  assert.ok(calls[0].messages.some((m) => m.content.includes("Stack")));
  assert.ok(calls[0].messages.some((m) => m.content.includes("correctAnswer field must be an object")));
});

test("generateOptionSelect labels the correct answer 'generated' on a generated-grounding node", async () => {
  const client = {
    async call() {
      return {
        question: "Q?",
        explanation: "Ownership is correct because the grounding describes what it tracks.",
        correctAnswer: { text: "Ownership", citation: { passageId: "p0", evidenceQuote: "tracks which binding frees a value" } },
        distractors: ["a", "b", "c"]
      };
    }
  } as unknown as LiteLlmForcedToolClient;
  const adapter = createStudyItemGenerationPort(client);
  const draft = await adapter.generateOptionSelect({
    declaredDomain: "software engineering",
    node: { derivedNodeId: "n2", canonicalLabel: "Ownership", aliases: [] },
    groundingProvenance: "generated",
    groundingPassages: [{ passageId: "p0", kind: "definition", text: "tracks which binding frees a value", derivedNodeId: "n2" }],
    siblings: []
  });
  assert.equal(draft.options.find((o) => o.isCorrect)!.provenance, "generated");
});

test("generateImpostor assembles a draft: three cited truths + one generated impostor (sibling-sourced)", async () => {
  const calls: { toolName: string; messages: { content: string }[]; maxRetries?: number; tags?: string[] }[] = [];
  const client = {
    async call(input: { toolName: string; messages: { content: string }[]; maxRetries?: number; tags?: string[] }) {
      calls.push(input);
      return {
        question: "Which statement about the Heap is false?",
        truth1Text: "The heap allocates at runtime.", truth1PassageId: "b1", truth1Quote: "the heap allocates at runtime",
        truth2Text: "The heap stores dynamically sized data.", truth2PassageId: "b1", truth2Quote: "the heap allocates",
        truth3Text: "The heap holds long-lived allocations.", truth3PassageId: "b1", truth3Quote: "at runtime",
        lieText: "The heap is a LIFO region for call frames.",
        reveal: "The LIFO statement is false; that is actually true of the Stack.",
        lieSource: "sibling",
        siblingLabel: "Stack"
      };
    }
  } as unknown as LiteLlmForcedToolClient;
  const adapter = createStudyItemGenerationPort(client);

  const draft = await adapter.generateImpostor({
    declaredDomain: "software engineering",
    node: { derivedNodeId: "n1", canonicalLabel: "Heap", aliases: [] },
    groundingProvenance: "source_cep",
    groundingPassages: [{ passageId: "b1", kind: "definition", text: "the heap allocates at runtime", sourceResourceId: "res-1", sourceBlockId: "b1" }],
    siblings: [{ label: "Stack", snippet: "LIFO region for call frames" }]
  });

  assert.equal(draft.itemType, "impostor");
  assert.equal(draft.truths.length, 3);
  for (const truth of draft.truths) {
    assert.ok(truth.citation, "truth carries a citation");
  }
  assert.equal(draft.lie.text, "The heap is a LIFO region for call frames.");
  assert.equal(draft.lie.lieSource, "sibling");
  assert.equal(draft.lie.siblingLabel, "Stack");
  assert.equal(calls[0].toolName, "submit_impostor_item");
  assert.equal(calls[0].maxRetries, 4);
  assert.deepEqual(calls[0].tags, ["impostor-generation"]);
  assert.ok(calls[0].messages.some((m) => m.content.includes("Stack")));
});

test("generateImpostor with lieSource 'generated' returns siblingLabel undefined", async () => {
  const client = {
    async call() {
      return {
        question: "Which is false?",
        truth1Text: "t1", truth1PassageId: "p0", truth1Quote: "tracks which binding frees a value",
        truth2Text: "t2", truth2PassageId: "p0", truth2Quote: "tracks which binding",
        truth3Text: "t3", truth3PassageId: "p0", truth3Quote: "frees a value",
        lieText: "a fresh misconception",
        reveal: "The fourth is invented and false.",
        lieSource: "generated",
        siblingLabel: ""
      };
    }
  } as unknown as LiteLlmForcedToolClient;
  const adapter = createStudyItemGenerationPort(client);
  const draft = await adapter.generateImpostor({
    declaredDomain: "software engineering",
    node: { derivedNodeId: "n2", canonicalLabel: "Ownership", aliases: [] },
    groundingProvenance: "generated",
    groundingPassages: [{ passageId: "p0", kind: "definition", text: "tracks which binding frees a value", derivedNodeId: "n2" }],
    siblings: []
  });
  assert.equal(draft.lie.lieSource, "generated");
  assert.equal(draft.lie.siblingLabel, undefined);
});

test("impostorValidator rejects a missing third truth (fail-closed, rule 6)", () => {
  assert.throws(() => impostorValidator.parse({
    question: "Q?",
    truth1Text: "a", truth1PassageId: "p", truth1Quote: "q",
    truth2Text: "b", truth2PassageId: "p", truth2Quote: "q",
    lieText: "c", reveal: "r", lieSource: "generated", siblingLabel: ""
  }));
});

test("impostorValidator rejects arguments missing reveal", () => {
  assert.throws(() => impostorValidator.parse({
    question: "Q?",
    truth1Text: "a", truth1PassageId: "p", truth1Quote: "q",
    truth2Text: "b", truth2PassageId: "p", truth2Quote: "q",
    truth3Text: "c", truth3PassageId: "p", truth3Quote: "q",
    lieText: "d", lieSource: "generated", siblingLabel: ""
  }));
});

test("optionSelectValidator rejects arguments missing correctAnswer", () => {
  assert.throws(() => optionSelectValidator.parse({ question: "Q?", explanation: "Because.", distractors: ["a", "b", "c"] }));
});

test("optionSelectValidator rejects arguments missing distractors", () => {
  assert.throws(() =>
    optionSelectValidator.parse({ question: "Q?", explanation: "Because.", correctAnswer: { text: "x", citation: { passageId: "p", evidenceQuote: "q" } } })
  );
});

test("optionSelectValidator rejects the wrong distractor count (fail-closed, rule 6)", () => {
  const base = { question: "Q?", explanation: "Because.", correctAnswer: { text: "x", citation: { passageId: "p", evidenceQuote: "q" } } };
  assert.throws(() => optionSelectValidator.parse({ ...base, distractors: ["a", "b"] }));
  assert.throws(() => optionSelectValidator.parse({ ...base, distractors: ["a", "b", "c", "d"] }));
});

test("optionSelectValidator rejects arguments missing explanation", () => {
  assert.throws(() => optionSelectValidator.parse({
    question: "Q?",
    correctAnswer: { text: "x", citation: { passageId: "p", evidenceQuote: "q" } },
    distractors: ["a", "b", "c"]
  }));
});

test("optionSelectValidator accepts a well-formed argument set (shape only, no content assertion)", () => {
  const parsed = optionSelectValidator.parse({
    question: "Q?",
    explanation: "The correct option follows from the grounding.",
    correctAnswer: { text: "x", citation: { passageId: "p", evidenceQuote: "q" } },
    distractors: ["a", "b", "c"]
  });
  assert.equal(parsed.distractors.length, 3);
});
