import assert from "node:assert/strict";
import { test } from "node:test";
import { createScaffoldContentPort, createScaffoldOutlinePort } from "./learnerScaffoldGenerationAdapters";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { scaffoldContentValidator, scaffoldOutlineValidator } from "./toolSchemas";

test("the outline adapter calls submit_scaffold_outline and maps 1-3 steps through in order", async () => {
  const calls: { toolName: string; messages: { content: string }[] }[] = [];
  const client = {
    async call(input: { toolName: string; messages: { content: string }[] }) {
      calls.push(input);
      return { steps: [{ label: "Affine types", rationale: "needed first" }, { label: "Move semantics", rationale: "builds on it" }] };
    }
  } as unknown as LiteLlmForcedToolClient;
  const outline = await createScaffoldOutlinePort(client).propose({ declaredDomain: "cs", parentLabel: "Ownership", term: "borrow checker", existingLabels: ["Move semantics"] });
  assert.equal(calls[0].toolName, "submit_scaffold_outline");
  assert.deepEqual(outline.steps.map((s) => s.label), ["Affine types", "Move semantics"]);
  const user = calls[0].messages.map((m) => m.content).join("\n");
  assert.ok(user.includes("borrow checker") && user.includes("Ownership"));
});

test("the content adapter maps the micro-lesson, question, and options through", async () => {
  const calls: { messages: { content: string }[] }[] = [];
  const client = {
    async call(input: { messages: { content: string }[] }) {
      calls.push(input);
      return { microLesson: "A short lesson.", question: "Q?", explanation: "because", correctAnswer: "Right", distractors: ["A", "B", "C"] };
    }
  } as unknown as LiteLlmForcedToolClient;
  const draft = await createScaffoldContentPort(client).generate({
    declaredDomain: "cs",
    label: "Affine types",
    groundingContext: {
      kind: "scaffolded_anchor",
      anchor: {
        reference: "ownership",
        canonicalLabel: "Ownership",
        definitionPassages: ["Ownership assigns each value one owner."]
      }
    },
    groundingText: "grounding",
    retryFeedback: "The prior explanation asserted a false consequence."
  });
  assert.equal(draft.microLesson, "A short lesson.");
  assert.equal(draft.distractors.length, 3);
  const prompt = calls[0].messages.map((message) => message.content).join("\n");
  assert.match(prompt, /prior explanation asserted a false consequence/);
  assert.match(prompt, /Scaffolded anchor: "Ownership" \(ownership\)/);
  assert.match(prompt, /Anchor Definition Passage: "Ownership assigns each value one owner\."/);
  assert.match(prompt, /Preserve the grounding context's exact scope and the grounding's named type or system/);
  assert.match(prompt, /The learner cannot see the grounding context, so each field must stand on its own/);
  assert.match(prompt, /The grounding context is a hard upper bound on scope/);
  assert.match(prompt, /write only the narrower intersection supported by both/);
  assert.match(prompt, /Retry feedback is a defect report, not factual or correction authority/);
  assert.match(prompt, /narrow the draft to the grounding's exact scope/);
});

test("the scaffold schemas reject a wrong distractor count and an empty outline", () => {
  assert.throws(() => scaffoldContentValidator.parse({ microLesson: "x", question: "q", explanation: "e", correctAnswer: "c", distractors: ["a", "b"] }));
  assert.throws(() => scaffoldOutlineValidator.parse({ steps: [] }));
  assert.doesNotThrow(() => scaffoldOutlineValidator.parse({ steps: [{ label: "x", rationale: "y" }] }));
});
