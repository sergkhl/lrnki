import assert from "node:assert/strict";
import { test } from "node:test";
import { frontierNeighborhood } from "./derivedGraph";

// `frontierNeighborhood` (KTD2) is the pure helper that frames the study graph on the
// learner's working region: the frontier target plus its direct prerequisites and direct
// dependents, deduped. Direction-agnostic, computed over rendered edges (certain AND
// uncertain). The cy.fit/recenter viewport behavior itself is verified in the U6 rule-14 pass.

function edge(prerequisiteDerivedNodeId: string, dependentDerivedNodeId: string) {
  return { prerequisiteDerivedNodeId, dependentDerivedNodeId };
}

// scope -> ownership -> move ; borrow -> ownership ; ownership -> alias (a dependent).
const edges = [edge("scope", "ownership"), edge("ownership", "move"), edge("borrow", "ownership"), edge("ownership", "alias")];

test("returns the target plus its direct prerequisites and direct dependents, deduped (Covers R3)", () => {
  const hood = frontierNeighborhood("ownership", edges);
  assert.deepEqual([...hood].sort(), ["alias", "borrow", "move", "ownership", "scope"].sort());
  assert.equal(new Set(hood).size, hood.length, "no duplicates");
});

test("an isolated node (no edges) returns just itself", () => {
  assert.deepEqual(frontierNeighborhood("solo", edges), ["solo"]);
  assert.deepEqual(frontierNeighborhood("solo", []), ["solo"]);
});

test("direction-agnostic: both upstream and downstream 1-hop neighbors are included", () => {
  const hood = new Set(frontierNeighborhood("ownership", edges));
  assert.ok(hood.has("scope") && hood.has("borrow"), "upstream prerequisites included");
  assert.ok(hood.has("move") && hood.has("alias"), "downstream dependents included");
});

test("an uncertain-edge neighbor is included — the canvas renders it, so framing should too", () => {
  // frontierNeighborhood ignores certainty by design; an uncertain edge is just an edge here.
  const hood = frontierNeighborhood("ownership", [edge("uncertainPrereq", "ownership")]);
  assert.deepEqual([...hood].sort(), ["ownership", "uncertainPrereq"].sort());
});

test("only DIRECT neighbors — a 2-hop node is not pulled in", () => {
  const hood = new Set(frontierNeighborhood("ownership", edges));
  // `scope`'s prerequisite would be 2 hops from ownership; here scope has none, but assert
  // the rule by adding a grandparent.
  const withGrandparent = frontierNeighborhood("ownership", [...edges, edge("grandparent", "scope")]);
  assert.equal(new Set(withGrandparent).has("grandparent"), false, "2-hop ancestor excluded");
  assert.ok(hood.has("scope"));
});
