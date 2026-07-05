import assert from "node:assert/strict";
import test from "node:test";
import type { MatchingItemDraft, MatchingPairDraft } from "@lrnki/domain-core";
import { validateMatchingItem, type MatchingGrounding } from "./matchingGuard";

function sequentialIds(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

function sourceGrounding(): MatchingGrounding {
  return {
    studyItemId: "match-1",
    graphVersionId: "gv-1",
    enrichmentId: "en-1",
    derivedNodeId: "dn-1",
    groundingProvenance: "source_cep",
    generatingModel: "test-model",
    configHash: "cfg-1",
    passages: [
      { passageId: "p-1", text: "A heap allocates memory at runtime.", sourceResourceId: "src-1", sourceBlockId: "blk-1" },
      { passageId: "p-2", text: "A stack stores frames in last-in, first-out order.", sourceResourceId: "src-1", sourceBlockId: "blk-2" },
      { passageId: "p-3", text: "Ownership tracks the binding responsible for freeing a value.", sourceResourceId: "src-1", sourceBlockId: "blk-3" },
      { passageId: "p-4", text: "Borrowing lets code refer to a value without taking ownership.", sourceResourceId: "src-1", sourceBlockId: "blk-4" }
    ]
  };
}

function pair(promptText: string, matchText: string, passageId: string, evidenceQuote: string): MatchingPairDraft {
  return { promptText, matchText, citation: { passageId, evidenceQuote } };
}

function draftOf(pairs: MatchingPairDraft[]): MatchingItemDraft {
  return { itemType: "matching", question: "Match each concept to its grounded description.", pairs };
}

const validPairs = [
  pair("Heap", "Allocates memory at runtime", "p-1", "A heap allocates memory at runtime."),
  pair("Stack", "Stores frames in LIFO order", "p-2", "A stack stores frames in last-in, first-out order."),
  pair("Ownership", "Tracks who frees a value", "p-3", "Ownership tracks the binding responsible for freeing a value."),
  pair("Borrowing", "Refers without taking ownership", "p-4", "Borrowing lets code refer to a value without taking ownership.")
];

test("happy path: three or four grounded pairs are accepted with independent prompt and match ids", () => {
  const result = validateMatchingItem(draftOf(validPairs.slice(0, 3)), sourceGrounding(), sequentialIds("pair"), sequentialIds("match"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.item.pairs.map((p) => [p.pairId, p.matchId]),
    [["pair-1", "match-1"], ["pair-2", "match-2"], ["pair-3", "match-3"]]
  );
  assert.equal(result.item.itemType, "matching");
  assert.equal(result.item.pairs[0].citation.provenance, "source");
});

test("matching rejects pair counts outside the 3-4 range", () => {
  const tooFew = validateMatchingItem(draftOf(validPairs.slice(0, 2)), sourceGrounding());
  assert.equal(tooFew.ok, false);
  if (!tooFew.ok) assert.match(tooFew.reason, /3 or 4 pairs/);

  const tooMany = validateMatchingItem(draftOf([...validPairs, pair("Move", "Transfers ownership", "p-3", "Ownership tracks the binding responsible for freeing a value.")]), sourceGrounding());
  assert.equal(tooMany.ok, false);
  if (!tooMany.ok) assert.match(tooMany.reason, /3 or 4 pairs/);
});

test("matching rejects duplicate prompts, duplicate matches, and self-matches after normalization", () => {
  const duplicatePrompt = validateMatchingItem(draftOf([validPairs[0], { ...validPairs[1], promptText: " heap " }, validPairs[2]]), sourceGrounding());
  assert.equal(duplicatePrompt.ok, false);
  if (!duplicatePrompt.ok) assert.match(duplicatePrompt.reason, /prompts must be distinct/);

  const duplicateMatch = validateMatchingItem(draftOf([validPairs[0], { ...validPairs[1], matchText: "allocates memory at runtime" }, validPairs[2]]), sourceGrounding());
  assert.equal(duplicateMatch.ok, false);
  if (!duplicateMatch.ok) assert.match(duplicateMatch.reason, /matches must be distinct/);

  const selfMatch = validateMatchingItem(draftOf([validPairs[0], validPairs[1], { ...validPairs[2], matchText: " ownership " }]), sourceGrounding());
  assert.equal(selfMatch.ok, false);
  if (!selfMatch.ok) assert.match(selfMatch.reason, /must differ/);
});

test("matching rejects citations that do not verify against grounding", () => {
  const result = validateMatchingItem(
    draftOf([validPairs[0], validPairs[1], pair("Ownership", "Tracks who frees a value", "p-3", "ownership is reference counting")]),
    sourceGrounding()
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /citation does not verify/);
});

