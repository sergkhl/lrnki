import assert from "node:assert/strict";
import { test } from "node:test";
import { createAnswerKeyVerificationPort, createStudyItemGenerationPort } from "./studyItemGenerationAdapters";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { impostorValidator, optionSelectValidator } from "./toolSchemas";

test("generateOptionSelect assembles a draft: grounded correct + three generated distractors", async () => {
  const calls: { toolName: string; messages: { content: string }[]; maxRetries?: number }[] = [];
  const client = {
    async call(input: { toolName: string; messages: { content: string }[]; maxRetries?: number }) {
      calls.push(input);
      return {
        distractors: [
          "the stack allocates every value at runtime",
          "a register allocates all dynamic data at runtime",
          "the cache permanently owns every allocation at runtime"
        ]
      };
    }
  } as unknown as LiteLlmForcedToolClient;
  const adapter = createStudyItemGenerationPort(client);

  const draft = await adapter.generateOptionSelect({
    declaredDomain: "software engineering",
    node: { derivedNodeId: "n1", canonicalLabel: "Heap", aliases: [] },
    groundingProvenance: "source_cep",
    groundingPassages: [{ passageId: "b1", kind: "definition", text: "the heap allocates at runtime", sourceResourceId: "res-1", sourceBlockId: "b1" }],
    correctAnswer: { text: "Heap allocation reserves runtime memory.", citation: { passageId: "b1", evidenceQuote: "the heap allocates at runtime" } },
    siblings: [{ label: "Stack", snippet: "LIFO region for call frames" }]
  });

  assert.equal(draft.itemType, "option_select");
  assert.equal(draft.question, "Which option exactly repeats the source-backed lesson text for Heap?");
  assert.deepEqual(draft.explorableTerms, []);
  assert.equal(draft.explanation, "Heap allocation reserves runtime memory.");
  assert.equal(draft.options.length, 4);
  const correct = draft.options.filter((o) => o.isCorrect);
  assert.equal(correct.length, 1);
  assert.equal(correct[0].text, "Heap allocation reserves runtime memory.");
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
  assert.ok(calls[0].messages.some((m) => m.content.includes("Heap allocation reserves runtime memory.")));
  assert.ok(calls[0].messages.some((m) => m.content.includes("You do not select, rewrite, summarize, qualify")));
  assert.ok(calls[0].messages.some((m) => m.content.includes("approximate length as the correct description")));
});

test("generateOptionSelect labels the correct answer 'generated' on a generated-grounding node", async () => {
  const client = {
    async call() {
      return {
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
    correctAnswer: { text: "Ownership tracks which binding frees a value.", citation: { passageId: "p0", evidenceQuote: "tracks which binding frees a value" } },
    siblings: []
  });
  const correct = draft.options.find((o) => o.isCorrect)!;
  assert.equal(correct.provenance, "generated");
  assert.equal(correct.text, "Ownership tracks which binding frees a value.");
  assert.equal(draft.explanation, "Ownership tracks which binding frees a value.");
  assert.equal(draft.question, "Which statement accurately describes Ownership?");
});

test("generateImpostor assembles a draft and conservatively owns neural lie provenance", async () => {
  const calls: { toolName: string; messages: { content: string }[]; maxRetries?: number; tags?: string[] }[] = [];
  const client = {
    async call(input: { toolName: string; messages: { content: string }[]; maxRetries?: number; tags?: string[] }) {
      calls.push(input);
      return {
        truth1Text: "The heap allocates at runtime.", truth1PassageId: "b1", truth1Quote: "the heap allocates at runtime",
        truth2Text: "The heap stores dynamically sized data.", truth2PassageId: "b1", truth2Quote: "the heap allocates",
        truth3Text: "The heap holds long-lived allocations.", truth3PassageId: "b1", truth3Quote: "at runtime",
        lieText: "The heap is a LIFO region for call frames.",
        revealPassageId: "b1",
        revealEvidenceQuote: "the heap allocates at runtime"
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
  assert.deepEqual(draft.lie.revealCitation, {
    passageId: "b1",
    evidenceQuote: "the heap allocates at runtime"
  });
  assert.equal(draft.lie.lieSource, "generated");
  assert.equal(draft.lie.siblingLabel, undefined);
  assert.equal(calls[0].toolName, "submit_impostor_item");
  assert.equal(calls[0].maxRetries, 4);
  assert.deepEqual(calls[0].tags, ["impostor-generation"]);
  assert.ok(calls[0].messages.some((m) => m.content.includes("Stack")));
  const rendered = calls[0].messages.map((message) => message.content).join("\n");
  assert.match(rendered, /application owns the fixed learner prompt/);
  assert.match(rendered, /never infer or name an inverse, category, contrast, qualifier, or taxonomy/);
  assert.match(rendered, /display the selected passage's complete text as the learner-visible correction/);
  assert.match(rendered, /never choose a passage whose full text is distracting, incomplete, or unrelated/);
  assert.match(rendered, /conservatively treats every planted lie as freshly generated/);
  assert.match(rendered, /do not claim the lie is true of one/);
  assert.doesNotMatch(rendered, /zero to five explorableTerms/);
});

test("generateImpostor without neighbors still returns generated provenance", async () => {
  const client = {
    async call() {
      return {
        truth1Text: "t1", truth1PassageId: "p0", truth1Quote: "tracks which binding frees a value",
        truth2Text: "t2", truth2PassageId: "p0", truth2Quote: "tracks which binding",
        truth3Text: "t3", truth3PassageId: "p0", truth3Quote: "frees a value",
        lieText: "a fresh misconception",
        revealPassageId: "p0",
        revealEvidenceQuote: "tracks which binding frees a value"
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

test("Answer-Key Verification renders an owner-neutral, key-free option-select request under its stage", async () => {
  const calls: { toolName: string; tags?: string[]; messages: { content: string }[] }[] = [];
  const client = {
    async call(input: { toolName: string; tags?: string[]; messages: { content: string }[] }) {
      calls.push(input);
      return { verdicts: [
        { ordinal: 0, verdict: "claim_true", reason: "true of the subject" },
        { ordinal: 1, verdict: "claim_false", reason: "false of the subject" }
      ] };
    }
  } as unknown as LiteLlmForcedToolClient;
  const verdicts = await createAnswerKeyVerificationPort(client).verify({
    itemType: "option_select",
    declaredDomain: "software engineering",
    subject: { canonicalLabel: "Affine type", aliases: ["affine typing"] },
    question: "Which statement is accurate?",
    candidates: [{ ordinal: 0, text: "Used at most once." }, { ordinal: 1, text: "Always copied." }],
    groundingPassages: [{ passageId: "definition:0", kind: "definition", text: "An affine value may be used at most once." }],
    relatedConcepts: [{ label: "Linear type", snippet: "Must be used exactly once." }]
  });
  assert.equal(calls[0].toolName, "submit_answer_key_verification");
  assert.deepEqual(calls[0].tags, ["option-select-key-verification"]);
  const rendered = calls[0].messages.map((message) => message.content).join("\n");
  assert.match(rendered, /Learning subject: "Affine type"/);
  assert.match(rendered, /Which statement is accurate/);
  assert.match(rendered, /Classify each \(question, candidate\) pair/);
  assert.match(rendered, /true statement about a different subject is claim_false/);
  assert.match(rendered, /Linear type/);
  assert.equal(/derivedNodeId|isCorrect|optionId|answer key/i.test(rendered), false);
  assert.deepEqual(verdicts.map((verdict) => verdict.verdict), ["claim_true", "claim_false"]);
});

test("standalone impostor verification never turns an accurate narrower description into the planted lie", async () => {
  const calls: { messages: { content: string }[] }[] = [];
  const client = {
    async call(input: { messages: { content: string }[] }) {
      calls.push(input);
      return { verdicts: [
        { ordinal: 0, verdict: "claim_true", reason: "an accurate component remains true" }
      ] };
    }
  } as unknown as LiteLlmForcedToolClient;
  await createAnswerKeyVerificationPort(client).verify({
    itemType: "impostor",
    declaredDomain: "software engineering",
    subject: { canonicalLabel: "Code review", aliases: [] },
    candidates: [{ ordinal: 0, text: "Code review is the practice of checking changes for defects." }],
    groundingPassages: [{ passageId: "definition:0", kind: "definition", text: "Code review examines proposed changes before integration." }],
    relatedConcepts: [{ label: "Testing", snippet: "Executes software to reveal defects." }]
  });

  const rendered = calls[0].messages.map((message) => message.content).join("\n");
  assert.match(rendered, /accurate component, special case, narrower description, or related practice.*remains claim_true/);
  assert.match(rendered, /could reasonably be read either as a true partial description or as a false exhaustive identity, return unclear/);
  assert.doesNotMatch(rendered, /The item asks:/);
});

test("impostorValidator rejects a missing third truth (fail-closed, rule 6)", () => {
  assert.throws(() => impostorValidator.parse({
    truth1Text: "a", truth1PassageId: "p", truth1Quote: "q",
    truth2Text: "b", truth2PassageId: "p", truth2Quote: "q",
    lieText: "c", revealPassageId: "p", revealEvidenceQuote: "q"
  }));
});

test("impostorValidator rejects arguments missing the corrective witness", () => {
  assert.throws(() => impostorValidator.parse({
    truth1Text: "a", truth1PassageId: "p", truth1Quote: "q",
    truth2Text: "b", truth2PassageId: "p", truth2Quote: "q",
    truth3Text: "c", truth3PassageId: "p", truth3Quote: "q",
    lieText: "d", revealPassageId: "p"
  }));
});

test("optionSelectValidator rejects arguments missing distractors", () => {
  assert.throws(() => optionSelectValidator.parse({}));
});

test("optionSelectValidator rejects the wrong distractor count (fail-closed, rule 6)", () => {
  assert.throws(() => optionSelectValidator.parse({ distractors: ["a", "b"] }));
  assert.throws(() => optionSelectValidator.parse({ distractors: ["a", "b", "c", "d"] }));
});

test("optionSelectValidator accepts a well-formed argument set (shape only, no content assertion)", () => {
  const parsed = optionSelectValidator.parse({
    distractors: ["a", "b", "c"]
  });
  assert.equal(parsed.distractors.length, 3);
});

test("optionSelectValidator rejects model attempts to rewrite the code-owned answer", () => {
  assert.throws(() => optionSelectValidator.parse({
    correctAnswer: "a model rewrite",
    distractors: ["a", "b", "c"]
  }));
});
