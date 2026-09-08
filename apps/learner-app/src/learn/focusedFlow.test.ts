import { expect, test } from "@jest/globals";
import { firstUnfinishedCard, resumeLearningCursor, retainLearningCursor, stepCards, type LearningStep } from "./focusedFlow";

const first: LearningStep = {
  key: "first", stopKey: "first", label: "First idea", locked: false, settled: false, lessonRead: false,
  correctActivityKeys: [], source: { kind: "trail" },
  lesson: { sections: ["one", "two"].map(key => ({ key, title: key, body: key, sourceCreditKeys: ["guide"], explorableTerms: [] })) },
  activities: ["a", "b"].map(key => ({ key, family: "option_select", prompt: key, options: [{ key: "yes", text: "Yes" }] }))
};
const second: LearningStep = { ...first, key: "second", stopKey: "second", locked: true };

test("the authored theory precedes questions and completion", () => {
  expect(stepCards(first).map(card => [card.kind, card.itemKey])).toEqual([
    ["theory", "one"], ["theory", "two"], ["question", "a"], ["question", "b"], ["complete", "first"]
  ]);
  expect(firstUnfinishedCard(first)).toEqual({ stepKey: "first", kind: "theory", itemKey: "one" });
});

test("resume keeps an unfinished section but cannot use a question pointer to bypass reading", () => {
  expect(resumeLearningCursor([first], { stepKey: "first", kind: "theory", itemKey: "two" })?.itemKey).toBe("two");
  expect(resumeLearningCursor([first], { stepKey: "first", kind: "question", itemKey: "a" })?.kind).toBe("theory");
});

test("a committed correct answer is retained for feedback during the visit and skipped on reload", () => {
  const saved = { stepKey: "first", kind: "question" as const, itemKey: "a" };
  const progress = { ...first, lessonRead: true, correctActivityKeys: ["a"] };
  expect(retainLearningCursor([progress], saved)).toEqual(saved);
  expect(resumeLearningCursor([progress], saved)).toEqual({ ...saved, itemKey: "b" });
});

test("unlocked next Stops win over a completed answer and invalid or newly locked pointers reconcile", () => {
  const completed = { ...first, settled: true, lessonRead: true, correctActivityKeys: ["a", "b"] };
  const next = { ...second, locked: false };
  expect(resumeLearningCursor([completed, next], { stepKey: "first", kind: "question", itemKey: "b" })?.stepKey).toBe("second");
  expect(resumeLearningCursor([first, second], { stepKey: "second", kind: "theory", itemKey: "one" })?.stepKey).toBe("first");
  expect(resumeLearningCursor([first], { stepKey: "retired", kind: "question", itemKey: "old" })?.kind).toBe("theory");
});

test("clearing known reconciles a completion screen to the missing lesson", () => {
  const completion = { stepKey: "first", kind: "complete" as const, itemKey: "first" };
  expect(retainLearningCursor([{ ...first, settled: true }], completion)).toEqual(completion);
  expect(retainLearningCursor([first], completion)?.kind).toBe("theory");
});

test("Support opens its teaching even when the referenced Stop has already been read", () => {
  const support: LearningStep = { ...first, lessonRead: true, source: { kind: "support", supportPathKey: "help" } };
  expect(firstUnfinishedCard(support).kind).toBe("theory");
  expect(resumeLearningCursor([support], { stepKey: "first", kind: "question", itemKey: "a" })?.kind).toBe("question");
});
