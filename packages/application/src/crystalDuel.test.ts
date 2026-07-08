import assert from "node:assert/strict";
import test from "node:test";
import type { ImpostorItem, OptionSelectItem, StudyItem, StudyItemType } from "@lrnki/domain-core";
import type { StudyItemBankStorePort } from "@lrnki/ports";
import { gradeDuelAnswer } from "./crystalDuel";

function optionItem(): OptionSelectItem {
  return {
    studyItemId: "opt-1",
    itemType: "option_select",
    graphVersionId: "g",
    enrichmentId: "e",
    derivedNodeId: "n",
    groundingProvenance: "source_cep",
    generatingModel: "m",
    configHash: "c",
    question: "Q?",
    explanation: "because",
    options: [
      { optionId: "a", text: "right", isCorrect: true, provenance: "generated", citation: { provenance: "generated", derivedNodeId: "n", passageText: "p" } },
      { optionId: "b", text: "wrong", isCorrect: false, provenance: "generated" },
      { optionId: "c", text: "wrong", isCorrect: false, provenance: "generated" },
      { optionId: "d", text: "wrong", isCorrect: false, provenance: "generated" }
    ]
  };
}

function fakeStore(item: StudyItem | undefined): StudyItemBankStorePort {
  return {
    persist: async () => {},
    getStudyItem: async () => undefined,
    getStudyItemById: async (id: string) => (item && item.studyItemId === id ? item : undefined),
    listStudyItemsForEnrichment: async () => (item ? [item] : []),
    supportedItemTypes: async (): Promise<StudyItemType[]> => []
  };
}

test("gradeDuelAnswer resolves the key server-side and returns correctness without persisting (KTD3/AE4)", async () => {
  const store = fakeStore(optionItem());
  const right = await gradeDuelAnswer({ studyItemId: "opt-1", submission: { itemType: "option_select", chosenOptionId: "a" } }, { studyItemStore: store });
  assert.deepEqual(right, { graded: true, correct: true, keyedCorrectId: "a" });
  const wrong = await gradeDuelAnswer({ studyItemId: "opt-1", submission: { itemType: "option_select", chosenOptionId: "b" } }, { studyItemStore: store });
  assert.deepEqual(wrong, { graded: true, correct: false, keyedCorrectId: "a" });
});

test("gradeDuelAnswer refuses an unknown item and a type mismatch", async () => {
  const store = fakeStore(optionItem());
  assert.deepEqual(await gradeDuelAnswer({ studyItemId: "missing", submission: { itemType: "option_select", chosenOptionId: "a" } }, { studyItemStore: store }), { graded: false, refused: "item_not_found" });
  assert.deepEqual(await gradeDuelAnswer({ studyItemId: "opt-1", submission: { itemType: "impostor", chosenStatementId: "x" } }, { studyItemStore: store }), { graded: false, refused: "item_type_mismatch" });
});

test("gradeDuelAnswer keys the impostor statement", async () => {
  const impostor: ImpostorItem = {
    studyItemId: "imp-1",
    itemType: "impostor",
    graphVersionId: "g",
    enrichmentId: "e",
    derivedNodeId: "n",
    groundingProvenance: "source_cep",
    generatingModel: "m",
    configHash: "c",
    question: "Which is the lie?",
    statements: [
      { statementId: "s1", ordinal: 0, text: "truth", isImpostor: false, provenance: "generated", citation: { provenance: "generated", derivedNodeId: "n", passageText: "p" } },
      { statementId: "s2", ordinal: 1, text: "lie", isImpostor: true, provenance: "generated", reveal: "nope", lieSource: "generated" },
      { statementId: "s3", ordinal: 2, text: "truth", isImpostor: false, provenance: "generated", citation: { provenance: "generated", derivedNodeId: "n", passageText: "p" } },
      { statementId: "s4", ordinal: 3, text: "truth", isImpostor: false, provenance: "generated", citation: { provenance: "generated", derivedNodeId: "n", passageText: "p" } }
    ]
  };
  const store = fakeStore(impostor);
  const result = await gradeDuelAnswer({ studyItemId: "imp-1", submission: { itemType: "impostor", chosenStatementId: "s2" } }, { studyItemStore: store });
  assert.deepEqual(result, { graded: true, correct: true, keyedCorrectId: "s2" });
});
