import assert from "node:assert/strict";
import { test } from "node:test";
import type { SourceBlock, SourceBlockType } from "./index";
import { selectEvidenceNeighborhood } from "./index";

function block(
  blockId: string,
  text: string,
  options: { blockType?: SourceBlockType; headingPath?: string[] } = {}
): SourceBlock {
  return {
    blockId,
    blockType: options.blockType ?? "paragraph",
    text,
    headingPath: options.headingPath ?? [],
    locator: {}
  };
}

function ids(blocks: SourceBlock[]): string[] {
  return blocks.map((selected) => selected.blockId);
}

test("includes the subject's mention block", () => {
  const blocks = [
    block("b1", "Unrelated setup."),
    block("b2", "Sparse labels are named here."),
    block("b3", "Another paragraph.")
  ];

  assert.deepEqual(
    ids(selectEvidenceNeighborhood(blocks, { mentionBlockIds: new Set(["b2"]), labels: ["sparse labels"] })),
    ["b2", "b1", "b3"]
  );
});

test("recovers an adjacent definition that does not repeat the label", () => {
  const blocks = [
    block("b1", "The paper introduces Concept Alpha."),
    block("b2", "It is a structure-aware retrieval step that widens source context without generating new evidence.")
  ];

  assert.deepEqual(
    ids(selectEvidenceNeighborhood(blocks, { mentionBlockIds: new Set(["b1"]), labels: ["concept alpha"] })),
    ["b1", "b2"]
  );
});

test("adjacency is computed over extractable blocks, skipping placeholders", () => {
  const blocks = [
    block("b1", "Concept Alpha is introduced."),
    block("fig-1", "Concept Alpha pipeline", { blockType: "figure_placeholder" }),
    block("b2", "It selects nearby teachable blocks before extraction.")
  ];

  assert.deepEqual(
    ids(selectEvidenceNeighborhood(blocks, { mentionBlockIds: new Set(["b1"]), labels: ["concept alpha"] })),
    ["b1", "b2"]
  );
});

test("includes same-heading siblings that are not adjacent or label-containing", () => {
  const blocks = [
    block("b1", "Concept Alpha is introduced.", { headingPath: ["Method"] }),
    block("b2", "Neighbor paragraph.", { headingPath: ["Method"] }),
    block("b3", "Different section paragraph.", { headingPath: ["Results"] }),
    block("b4", "A later method paragraph explains the selector.", { headingPath: ["Method"] })
  ];

  assert.deepEqual(
    ids(selectEvidenceNeighborhood(blocks, { mentionBlockIds: new Set(["b1"]), labels: ["concept alpha"] })),
    ["b1", "b2", "b4"]
  );
});

test("mention-first cap keeps only mentions when mentions exceed the global cap", () => {
  const blocks = [
    block("m1", "Concept Alpha mention one.", { headingPath: ["Long"] }),
    block("m2", "Concept Alpha mention two.", { headingPath: ["Long"] }),
    block("m3", "Concept Alpha mention three.", { headingPath: ["Long"] }),
    block("s1", "Same section sibling.", { headingPath: ["Long"] })
  ];

  assert.deepEqual(
    ids(
      selectEvidenceNeighborhood(
        blocks,
        { mentionBlockIds: new Set(["m1", "m2", "m3"]), labels: ["concept alpha"] },
        { maxEvidenceBlocksPerConcept: 2, siblingCap: 4, adjacencyRadius: 1 }
      )
    ),
    ["m1", "m2"]
  );
});

test("same-heading sibling contribution is sub-capped before the global cap", () => {
  const blocks = [
    block("m1", "Concept Alpha mention.", { headingPath: ["Method"] }),
    block("s1", "Sibling one.", { headingPath: ["Method"] }),
    block("s2", "Sibling two.", { headingPath: ["Method"] }),
    block("s3", "Sibling three.", { headingPath: ["Method"] })
  ];

  assert.deepEqual(
    ids(
      selectEvidenceNeighborhood(
        blocks,
        { mentionBlockIds: new Set(["m1"]), labels: ["concept alpha"] },
        { maxEvidenceBlocksPerConcept: 10, siblingCap: 1, adjacencyRadius: 0 }
      )
    ),
    ["m1", "s1"]
  );
});

test("sibling sub-cap counts only unique sibling additions after adjacency", () => {
  const blocks = [
    block("m1", "Concept Alpha mention.", { headingPath: ["Method"] }),
    block("adjacent", "Adjacent body block.", { headingPath: ["Method"] }),
    block("sibling", "Non-adjacent sibling.", { headingPath: ["Method"] })
  ];

  assert.deepEqual(
    ids(
      selectEvidenceNeighborhood(
        blocks,
        { mentionBlockIds: new Set(["m1"]), labels: ["concept alpha"] },
        { maxEvidenceBlocksPerConcept: 10, siblingCap: 1, adjacencyRadius: 1 }
      )
    ),
    ["m1", "adjacent", "sibling"]
  );
});

test("deduplicates blocks that qualify through multiple buckets", () => {
  const blocks = [
    block("m1", "Concept Alpha mention.", { headingPath: ["Method"] }),
    block("s1", "Concept Alpha sibling repeats the label.", { headingPath: ["Method"] })
  ];

  assert.deepEqual(
    ids(selectEvidenceNeighborhood(blocks, { mentionBlockIds: new Set(["m1", "s1"]), labels: ["concept alpha"] })),
    ["m1", "s1"]
  );
});

test("includes distant alias-containing blocks through the label bucket", () => {
  const blocks = [
    block("m1", "Concept Alpha is introduced."),
    block("x1", "Unrelated paragraph."),
    block("x2", "The CA selector is useful when definitions are thin.", { headingPath: ["Other"] })
  ];

  assert.deepEqual(
    ids(selectEvidenceNeighborhood(blocks, { mentionBlockIds: new Set(["m1"]), labels: ["concept alpha", "ca selector"] })),
    ["m1", "x1", "x2"]
  );
});

test("never selects non-extractable blocks even when mentioned, label-containing, or raw-adjacent", () => {
  const nonExtractable: SourceBlockType[] = ["reference", "appendix", "caption", "table_placeholder", "figure_placeholder"];
  const blocks = [
    block("m1", "Concept Alpha appears in body."),
    ...nonExtractable.map((blockType, index) => block(`non-${index}`, "Concept Alpha in non-body text.", { blockType })),
    block("b2", "Body neighbor.")
  ];

  assert.deepEqual(
    ids(
      selectEvidenceNeighborhood(
        blocks,
        { mentionBlockIds: new Set(["m1", "non-0", "non-1", "non-2", "non-3", "non-4"]), labels: ["concept alpha"] },
        { maxEvidenceBlocksPerConcept: 20, siblingCap: 10, adjacencyRadius: 1 }
      )
    ),
    ["m1", "b2"]
  );
});

test("falls back to label-containing blocks when there are no mentions", () => {
  const blocks = [
    block("b1", "Unrelated paragraph."),
    block("b2", "Concept Alpha appears here."),
    block("b3", "CA selector appears here.")
  ];

  assert.deepEqual(
    ids(selectEvidenceNeighborhood(blocks, { mentionBlockIds: new Set(), labels: ["concept alpha", "ca selector"] })),
    ["b2", "b3"]
  );
});

test("returns deterministic ordering across calls", () => {
  const blocks = [
    block("m1", "Concept Alpha mention.", { headingPath: ["Method"] }),
    block("s1", "Sibling definition.", { headingPath: ["Method"] }),
    block("x1", "CA selector appears later.", { headingPath: ["Other"] })
  ];
  const subject = { mentionBlockIds: new Set(["m1"]), labels: ["concept alpha", "ca selector"] };

  assert.deepEqual(ids(selectEvidenceNeighborhood(blocks, subject)), ids(selectEvidenceNeighborhood(blocks, subject)));
});
