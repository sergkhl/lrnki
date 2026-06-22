import assert from "node:assert/strict";
import { test } from "node:test";
import { GRAPH_NODE_FILL_TOKENS, graphNodeFillToken, type GraphNodeFillKey } from "./graphNodeStyles";

// The fill map is the SINGLE source the canvas and the legend both read (KTD1). These
// guards prevent the original collision — enrichment and locked resolving to the same
// near-white token — and keep every node state distinguishable.

test("the map has an entry for every adapted node state plus the enrichment fill (Covers R1)", () => {
  const keys: GraphNodeFillKey[] = ["mastered", "frontier", "locked", "enrichment"];
  for (const key of keys) {
    assert.equal(typeof GRAPH_NODE_FILL_TOKENS[key], "string");
    assert.ok(GRAPH_NODE_FILL_TOKENS[key].startsWith("--"), `${key} maps to a CSS custom property`);
  }
  // No stray keys beyond the four states.
  assert.deepEqual(Object.keys(GRAPH_NODE_FILL_TOKENS).sort(), [...keys].sort());
});

test("no two states resolve to the same token (locked != enrichment; both != mastered/frontier)", () => {
  const tokens = Object.values(GRAPH_NODE_FILL_TOKENS);
  assert.equal(new Set(tokens).size, tokens.length, "every node-state fill token is distinct");
  // The exact collision the bug fixed: enrichment and locked must differ.
  assert.notEqual(GRAPH_NODE_FILL_TOKENS.enrichment, GRAPH_NODE_FILL_TOKENS.locked);
});

test("the accessor returns the same token the map holds (legend/canvas parity source)", () => {
  for (const key of Object.keys(GRAPH_NODE_FILL_TOKENS) as GraphNodeFillKey[]) {
    assert.equal(graphNodeFillToken(key), GRAPH_NODE_FILL_TOKENS[key]);
  }
});
