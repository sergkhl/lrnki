import assert from "node:assert/strict";
import test from "node:test";
import type { ImpostorItemDraft, ImpostorTruthDraft } from "@lrnki/domain-core";
import { validateImpostorItem, type ImpostorGrounding } from "./impostorGuard";

// A deterministic statement-id minter so assertions can name statement ids.
function sequentialIds(): () => string {
  let n = 0;
  return () => `stmt-${++n}`;
}

// Source-grounded context whose single passage backs three verbatim truths via distinct
// substrings (KTD1: a thin lesson can still supply three truths from one passage).
function sourceGrounding(): ImpostorGrounding {
  return {
    studyItemId: "si-1",
    graphVersionId: "gv-1",
    enrichmentId: "en-1",
    derivedNodeId: "dn-1",
    groundingProvenance: "source_cep",
    generatingModel: "test-model",
    configHash: "cfg-1",
    passages: [
      {
        passageId: "blk-1",
        text: "A heap allocates memory at runtime and stores dynamically sized data for long-lived allocations.",
        sourceResourceId: "src-1",
        sourceBlockId: "blk-1"
      }
    ]
  };
}

function generatedGrounding(): ImpostorGrounding {
  return {
    studyItemId: "si-2",
    graphVersionId: "gv-1",
    enrichmentId: "en-1",
    derivedNodeId: "dn-2",
    groundingProvenance: "generated",
    generatingModel: "test-model",
    configHash: "cfg-1",
    passages: [{ passageId: "dn-2:definition:0", text: "Ownership tracks which binding frees a value and enforces single responsibility.", derivedNodeId: "dn-2" }]
  };
}

function truth(text: string, evidenceQuote: string, passageId = "blk-1"): ImpostorTruthDraft {
  return { text, citation: { passageId, evidenceQuote } };
}

function draftOf(truths: ImpostorTruthDraft[], overrides: Partial<ImpostorItemDraft> = {}): ImpostorItemDraft {
  return {
    itemType: "impostor",
    question: "Which statement about the Heap is false?",
    truths: truths as ImpostorItemDraft["truths"],
    lie: {
      text: "The heap is a LIFO region for call frames.",
      reveal: "The LIFO claim is false; that is actually true of the Stack.",
      lieSource: "sibling",
      siblingLabel: "Stack"
    },
    ...overrides
  };
}

const threeTruths: ImpostorTruthDraft[] = [
  truth("The heap allocates at runtime.", "A heap allocates memory at runtime"),
  truth("The heap stores dynamically sized data.", "stores dynamically sized data"),
  truth("The heap holds long-lived allocations.", "long-lived allocations")
];

test("AE3 happy path: three verbatim-cited truths + one generated impostor → ok with one impostor", () => {
  const result = validateImpostorItem(
    draftOf(threeTruths),
    sourceGrounding(),
    sequentialIds(),
    () => 3
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.item.statements.length, 4);
  const impostors = result.item.statements.filter((s) => s.isImpostor);
  assert.equal(impostors.length, 1);
  assert.equal(impostors[0].provenance, "generated");
  assert.equal(impostors[0].reveal, "The LIFO claim is false; that is actually true of the Stack.");
  assert.equal(impostors[0].lieSource, "sibling");
  assert.equal(impostors[0].siblingLabel, "Stack");
  // truths' citations resolve from the matched passage, byte-exact
  for (const truthStatement of result.item.statements.filter((s) => !s.isImpostor)) {
    assert.ok(truthStatement.citation && truthStatement.citation.provenance === "source");
    if (truthStatement.citation.provenance === "source") assert.equal(truthStatement.citation.matchKind, "exact");
  }
  assert.deepEqual(result.item.statements.map((s) => s.statementId), ["stmt-1", "stmt-2", "stmt-3", "stmt-4"]);
});

test("AE3: a 'true' statement whose quote does not verify verbatim → reject", () => {
  const result = validateImpostorItem(
    draftOf([
      truth("The heap is garbage-collected eagerly.", "memory is never freed automatically"),
      threeTruths[1],
      threeTruths[2]
    ]),
    sourceGrounding()
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /does not verify/i);
});

test("wrong truth count → reject", () => {
  const result = validateImpostorItem(
    draftOf([threeTruths[0], threeTruths[1]]),
    sourceGrounding()
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /exactly 3 true statements/i);
});

test("impostor text equal to a truth after normalization → reject", () => {
  const result = validateImpostorItem(
    draftOf(threeTruths, { lie: { text: "  THE HEAP allocates at runtime.  ", reveal: "r", lieSource: "generated" } }),
    sourceGrounding()
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /identical to a true statement/i);
});

test("empty reveal → reject", () => {
  const result = validateImpostorItem(
    draftOf(threeTruths, { lie: { text: "The heap is a LIFO region.", reveal: "   ", lieSource: "generated" } }),
    sourceGrounding()
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /reveal/i);
});

test("lieSource 'sibling' with no siblingLabel → reject", () => {
  const result = validateImpostorItem(
    draftOf(threeTruths, { lie: { text: "The heap is a LIFO region.", reveal: "r", lieSource: "sibling", siblingLabel: undefined } }),
    sourceGrounding()
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /siblingLabel/i);
});

test("lieSource 'generated' with a siblingLabel → reject", () => {
  const result = validateImpostorItem(
    draftOf(threeTruths, { lie: { text: "The heap is a LIFO region.", reveal: "r", lieSource: "generated", siblingLabel: "Stack" } }),
    sourceGrounding()
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /siblingLabel/i);
});

test("lieSource 'generated' with no siblingLabel → ok (fresh misconception)", () => {
  const result = validateImpostorItem(
    draftOf(threeTruths, { lie: { text: "The heap is a LIFO region.", reveal: "r", lieSource: "generated" } }),
    sourceGrounding()
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const lie = result.item.statements.find((statement) => statement.isImpostor);
  assert.ok(lie?.isImpostor);
  assert.equal(lie.lieSource, "generated");
  assert.equal(lie.siblingLabel, undefined);
});

test("generated-origin node: a truth citing a generated lesson passage verifies and is labeled generated", () => {
  const result = validateImpostorItem(
    draftOf(
      [
        truth("Ownership tracks which binding frees a value.", "Ownership tracks which binding frees a value", "dn-2:definition:0"),
        truth("Ownership enforces single responsibility.", "enforces single responsibility", "dn-2:definition:0"),
        truth("Ownership decides when a value is dropped.", "frees a value", "dn-2:definition:0")
      ],
      { lie: { text: "Ownership is reference counting at runtime.", reveal: "r", lieSource: "generated" } }
    ),
    generatedGrounding()
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  for (const truthStatement of result.item.statements.filter((s) => !s.isImpostor)) {
    assert.ok(truthStatement.citation && truthStatement.citation.provenance === "generated");
  }
});
