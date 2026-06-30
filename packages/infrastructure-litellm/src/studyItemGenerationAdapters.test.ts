import assert from "node:assert/strict";
import { test } from "node:test";
import { LiteLlmStudyItemGenerationAdapter } from "./studyItemGenerationAdapters";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { impostorValidator, optionSelectValidator } from "./toolSchemas";

test("generateOptionSelect assembles a draft: grounded correct + three generated distractors", async () => {
  const calls: { toolName: string; messages: { content: string }[]; maxRetries?: number }[] = [];
  const client = {
    async call(input: { toolName: string; messages: { content: string }[]; maxRetries?: number }) {
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

test("generateImpostor assembles a draft: three cited truths + one generated impostor (sibling-sourced)", async () => {
  const calls: { toolName: string; messages: { content: string }[]; maxRetries?: number; tags?: string[] }[] = [];
  const client = {
    async call(input: { toolName: string; messages: { content: string }[]; maxRetries?: number; tags?: string[] }) {
      calls.push(input);
      return {
        question: "Which statement about the Heap is false?",
        statements: [
          { text: "The heap allocates at runtime.", isImpostor: false, citationPassageId: "b1", citationEvidenceQuote: "the heap allocates at runtime" },
          { text: "The heap stores dynamically sized data.", isImpostor: false, citationPassageId: "b1", citationEvidenceQuote: "the heap allocates" },
          { text: "The heap holds long-lived allocations.", isImpostor: false, citationPassageId: "b1", citationEvidenceQuote: "at runtime" },
          { text: "The heap is a LIFO region for call frames.", isImpostor: true, citationPassageId: null, citationEvidenceQuote: null }
        ],
        reveal: "The LIFO statement is false; that is actually true of the Stack.",
        lieSource: "sibling",
        siblingLabel: "Stack"
      };
    }
  } as unknown as LiteLlmForcedToolClient;
  const adapter = new LiteLlmStudyItemGenerationAdapter(client, "mock-gen");

  const draft = await adapter.generateImpostor({
    declaredDomain: "software engineering",
    node: { derivedNodeId: "n1", canonicalLabel: "Heap", aliases: [] },
    groundingProvenance: "source_cep",
    groundingPassages: [{ passageId: "b1", kind: "definition", text: "the heap allocates at runtime", sourceResourceId: "res-1", sourceBlockId: "b1" }],
    siblings: [{ label: "Stack", snippet: "LIFO region for call frames" }]
  });

  assert.equal(draft.itemType, "impostor");
  assert.equal(draft.statements.length, 4);
  const impostors = draft.statements.filter((s) => s.isImpostor);
  assert.equal(impostors.length, 1);
  assert.equal(impostors[0].citation, undefined);
  for (const truth of draft.statements.filter((s) => !s.isImpostor)) {
    assert.ok(truth.citation, "truth carries a citation");
  }
  assert.equal(draft.lieSource, "sibling");
  assert.equal(draft.siblingLabel, "Stack");
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
        statements: [
          { text: "t1", isImpostor: false, citationPassageId: "p0", citationEvidenceQuote: "tracks which binding frees a value" },
          { text: "t2", isImpostor: false, citationPassageId: "p0", citationEvidenceQuote: "tracks which binding" },
          { text: "t3", isImpostor: false, citationPassageId: "p0", citationEvidenceQuote: "frees a value" },
          { text: "a fresh misconception", isImpostor: true, citationPassageId: null, citationEvidenceQuote: null }
        ],
        reveal: "The fourth is invented and false.",
        lieSource: "generated",
        siblingLabel: null
      };
    }
  } as unknown as LiteLlmForcedToolClient;
  const adapter = new LiteLlmStudyItemGenerationAdapter(client, "mock-gen");
  const draft = await adapter.generateImpostor({
    declaredDomain: "software engineering",
    node: { derivedNodeId: "n2", canonicalLabel: "Ownership", aliases: [] },
    groundingProvenance: "generated",
    groundingPassages: [{ passageId: "p0", kind: "definition", text: "tracks which binding frees a value", derivedNodeId: "n2" }],
    siblings: []
  });
  assert.equal(draft.lieSource, "generated");
  assert.equal(draft.siblingLabel, undefined);
});

test("impostorValidator rejects the wrong statement count (fail-closed, rule 6)", () => {
  const three = [
    { text: "a", isImpostor: false, citationPassageId: "p", citationEvidenceQuote: "q" },
    { text: "b", isImpostor: false, citationPassageId: "p", citationEvidenceQuote: "q" },
    { text: "c", isImpostor: true, citationPassageId: null, citationEvidenceQuote: null }
  ];
  assert.throws(() => impostorValidator.parse({ question: "Q?", statements: three, reveal: "r", lieSource: "generated", siblingLabel: null }));
});

test("impostorValidator rejects arguments missing reveal", () => {
  const four = [
    { text: "a", isImpostor: false, citationPassageId: "p", citationEvidenceQuote: "q" },
    { text: "b", isImpostor: false, citationPassageId: "p", citationEvidenceQuote: "q" },
    { text: "c", isImpostor: false, citationPassageId: "p", citationEvidenceQuote: "q" },
    { text: "d", isImpostor: true, citationPassageId: null, citationEvidenceQuote: null }
  ];
  assert.throws(() => impostorValidator.parse({ question: "Q?", statements: four, lieSource: "generated", siblingLabel: null }));
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
