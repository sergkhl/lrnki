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
    canonicalLabel: "Memory regions",
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

function draftOf(pairs: MatchingPairDraft[], explorableTerms: string[] = []): MatchingItemDraft {
  return { itemType: "matching", question: "Match each concept to its grounded description.", pairs, explorableTerms };
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


// --- Containment veto (plan 2026-08-07-001 D4) --------------------------------------------
// The deterministic half of the cueing defect: a pair one side of which displays the other's whole
// phrase is solvable by reading, provably, with no judgment. The paraphrase half belongs to the
// generation prompt — rule 16 keeps it out of here.

function groundingWith(extra: { passageId: string; text: string }[]): MatchingGrounding {
  const base = sourceGrounding();
  return {
    ...base,
    passages: [...base.passages, ...extra.map((p) => ({ ...p, sourceResourceId: "src-1", sourceBlockId: `blk-${p.passageId}` }))]
  };
}

test("containment rejects in both directions: match displaying the whole prompt, and prompt displaying the whole match", () => {
  const grounding = groundingWith([
    { passageId: "p-5", text: "The heap performs runtime allocation of values whose size is unknown at compile time." },
    { passageId: "p-6", text: "A stack stores frames for each call in last-in, first-out order." }
  ]);

  const matchContainsPrompt = validateMatchingItem(
    draftOf([
      validPairs[1],
      validPairs[2],
      pair(
        "Runtime allocation",
        "The heap performs runtime allocation of values whose size is unknown at compile time",
        "p-5",
        "The heap performs runtime allocation of values whose size is unknown at compile time."
      )
    ]),
    grounding
  );
  assert.equal(matchContainsPrompt.ok, false);
  if (!matchContainsPrompt.ok) assert.match(matchContainsPrompt.reason, /must not contain one another/);

  const promptContainsMatch = validateMatchingItem(
    draftOf([
      validPairs[0],
      validPairs[2],
      pair("Stores frames for each call in last-in, first-out order", "Stores frames", "p-6", "A stack stores frames for each call in last-in, first-out order.")
    ]),
    grounding
  );
  assert.equal(promptContainsMatch.ok, false);
  if (!promptContainsMatch.ok) assert.match(promptContainsMatch.reason, /must not contain one another/);
});

test("containment survives case, collapsed whitespace, and punctuation dropped between the words", () => {
  // A character-level `includes` misses this one: the match reads "memory, at" with a comma.
  const result = validateMatchingItem(
    draftOf([
      validPairs[1],
      validPairs[2],
      pair("Allocates memory at runtime", "A heap  ALLOCATES memory, at runtime; then reuses the freed space", "p-1", "A heap allocates memory at runtime.")
    ]),
    sourceGrounding()
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /must not contain one another/);
});

test("exact normalized equality still rejects under its own distinct reason", () => {
  const result = validateMatchingItem(
    draftOf([validPairs[0], validPairs[1], { ...validPairs[2], matchText: " OWNERSHIP " }]),
    sourceGrounding()
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /must differ/);
});

test("a pair sharing a distinctive word without containment is accepted: this is not a shared-word veto", () => {
  const result = validateMatchingItem(
    draftOf([
      validPairs[0],
      validPairs[1],
      pair("Value lifetime owner", "The binding responsible for freeing a value", "p-3", "Ownership tracks the binding responsible for freeing a value.")
    ]),
    sourceGrounding()
  );
  assert.equal(result.ok, true);
});

test("a prompt word appearing only inside a longer word is not containment (rule 16: veto only the provable)", () => {
  // "cheapest" contains the characters of "heap". A character-level `includes` would reject this
  // legitimate pair, which is the false negative rule 16's removal clause exists to prevent.
  const result = validateMatchingItem(
    draftOf([
      validPairs[1],
      validPairs[2],
      pair("Heap", "Cheapest region to grow at runtime", "p-5", "The heap is the cheapest region to grow at runtime.")
    ]),
    groundingWith([{ passageId: "p-5", text: "The heap is the cheapest region to grow at runtime." }])
  );
  assert.equal(result.ok, true);
});

// --- Citation resolution ladder (plan 2026-08-05-001 D9) ----------------------------------
// Matching shares `resolveGroundingCitation`, so U1's rungs reach it with no matching-specific
// change (rule 18) — but D6 keeps the U3 generated-passage fallback away from matching, whose
// answer key is never judge-verified. These two tests are the boundary that fallback lands on.

function generatedGrounding(): MatchingGrounding {
  return {
    ...sourceGrounding(),
    derivedNodeId: "dn-2",
    groundingProvenance: "generated",
    passages: [
      { passageId: "dn-2:s0", text: "A heap allocates memory at runtime.", derivedNodeId: "dn-2" },
      { passageId: "dn-2:s1", text: "A stack stores frames in last-in, first-out order.", derivedNodeId: "dn-2" },
      { passageId: "dn-2:s2", text: "Ownership tracks the binding responsible for freeing a value.", derivedNodeId: "dn-2" }
    ]
  };
}

test("ladder rung 2 reaches matching: a verbatim quote citing the wrong generated id is repaired", () => {
  const result = validateMatchingItem(
    draftOf([
      pair("Heap", "Allocates memory at runtime", "dn-2:s1", "A heap allocates memory at runtime."),
      pair("Stack", "Stores frames in LIFO order", "dn-2:s2", "A stack stores frames in last-in, first-out order."),
      pair("Ownership", "Tracks who frees a value", "dn-2:s0", "Ownership tracks the binding responsible for freeing a value.")
    ]),
    generatedGrounding()
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.item.pairs.every((p) => p.citation.provenance === "generated"));
});

test("a matching quote that verifies against no passage rejects", () => {
  const result = validateMatchingItem(
    draftOf([
      pair("Heap", "Allocates memory at runtime", "dn-2:s0", "A heap allocates memory at runtime."),
      pair("Stack", "Stores frames in LIFO order", "dn-2:s1", "A stack is a queue served oldest-first."),
      pair("Ownership", "Tracks who frees a value", "dn-2:s2", "Ownership tracks the binding responsible for freeing a value.")
    ]),
    generatedGrounding()
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /citation does not verify/);
});
