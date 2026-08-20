import assert from "node:assert/strict";
import test from "node:test";
import type { ScaffoldNodePayload } from "@lrnki/domain-core";
import { projectScaffoldPositiveClaims } from "./scaffoldPositiveClaims";

function payload(): ScaffoldNodePayload {
  return {
    scaffoldNodeId: "node-secret-id",
    label: "Excluded scaffold label",
    lesson: [
      {
        kind: "definition",
        text: "Definition body.",
        items: ["First list assertion.", "Second list assertion."],
        groundingProvenance: "generated",
        diagram: { caption: "Diagram caption.", spec: "A points to B." }
      },
      {
        kind: "examples",
        text: "Example body.",
        groundingProvenance: "generated"
      }
    ],
    item: {
      scaffoldItemId: "item-secret-id",
      question: "Which answer follows?",
      explanation: "The keyed answer follows from the definition.",
      options: [
        { optionId: "wrong-1-secret-id", text: "False distractor one.", isCorrect: false },
        { optionId: "correct-secret-id", text: "True keyed answer.", isCorrect: true },
        { optionId: "wrong-2-secret-id", text: "False distractor two.", isCorrect: false },
        { optionId: "wrong-3-secret-id", text: "False distractor three.", isCorrect: false }
      ]
    }
  };
}

test("the projector exhaustively covers positive learner text and excludes labels, ids, provenance, and distractors", () => {
  const claims = projectScaffoldPositiveClaims(payload());
  assert.deepEqual(claims, [
    { targetKey: "lesson:0:text", targetPurpose: "definition", text: "Definition body." },
    { targetKey: "lesson:0:item:0", targetPurpose: "support", text: "First list assertion." },
    { targetKey: "lesson:0:item:1", targetPurpose: "support", text: "Second list assertion." },
    { targetKey: "lesson:0:diagram:caption", targetPurpose: "support", text: "Diagram caption." },
    { targetKey: "lesson:0:diagram:spec", targetPurpose: "support", text: "A points to B." },
    { targetKey: "lesson:1:text", targetPurpose: "support", text: "Example body." },
    {
      targetKey: "item:question-keyed-answer",
      targetPurpose: "support",
      text: "For the learner question \"Which answer follows?\", the correct answer is \"True keyed answer.\""
    },
    { targetKey: "item:explanation", targetPurpose: "support", text: "The keyed answer follows from the definition." }
  ]);
  assert.equal(claims.some((claim) => claim.text === "Which answer follows?"), false, "an interrogative is not a factual target");
  assert.equal(claims.some((claim) => claim.text === "True keyed answer."), false, "the keyed answer is settled in its QA pair");
  const serialized = JSON.stringify(claims);
  for (const excluded of [
    "Excluded scaffold label",
    "node-secret-id",
    "item-secret-id",
    "correct-secret-id",
    "False distractor one.",
    "False distractor two.",
    "False distractor three.",
    "groundingProvenance"
  ]) {
    assert.equal(serialized.includes(excluded), false, `${excluded} must be excluded`);
  }
});

test("the projector fails closed unless exactly one option is keyed", () => {
  const none = payload();
  none.item.options.forEach((option) => { option.isCorrect = false; });
  assert.throws(() => projectScaffoldPositiveClaims(none), /exactly one keyed option, got 0/);

  const two = payload();
  two.item.options[0]!.isCorrect = true;
  assert.throws(() => projectScaffoldPositiveClaims(two), /exactly one keyed option, got 2/);
});

test("the projector fails closed on an unknown behavior-identity version", () => {
  assert.throws(
    () => projectScaffoldPositiveClaims(payload(), "question_answer_pair_v2" as "question_answer_pair_v1"),
    /Unknown generated Support Step positive-claim projection/
  );
});
