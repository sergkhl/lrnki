import assert from "node:assert/strict";
import { test } from "node:test";
import type { RescuedNodeLabeling, SourceMentionedEnrichmentNode } from "@lrnki/domain-core";
import type { RescuedNodeLabelingPort } from "@lrnki/ports";
import { applyRescuedNodeLabeling } from "./applyRescuedNodeLabeling";

function rescuedNode(derivedNodeId: string, canonicalLabel: string, declaredDomain = "software engineering"): SourceMentionedEnrichmentNode {
  return {
    nodeKind: "enrichment",
    derivedNodeId,
    groundingOrigin: "source_mentioned",
    role: "prerequisite",
    layer: "derived",
    canonicalLabel,
    normalizedLabel: canonicalLabel.toLowerCase(),
    declaredDomain,
    aliases: [],
    groundingPassages: [
      {
        passageType: "mention",
        text: canonicalLabel,
        groundingOrigin: "source_mentioned",
        sourceResourceId: "source-1",
        sourceBlockId: "block-1",
        evidenceQuote: canonicalLabel,
        headingPath: [],
        locator: {},
        verbatimCheck: { disposition: "verified", sourceResourceId: "source-1", sourceBlockId: "block-1" }
      }
    ]
  };
}

// A judge that returns a label per node by position. `by` is a per-domain factory so a test
// can assert per-domain grouping and echo the "may equal current" contract.
function judge(by: (declaredDomain: string, nodeLabels: string[]) => RescuedNodeLabeling, capture?: { calls: { declaredDomain: string; nodeLabels: string[]; takenLabels: string[] }[] }): RescuedNodeLabelingPort {
  return {
    model: "kg-independent-judge",
    label: async (input) => {
      const nodeLabels = input.nodes.map((node) => node.canonicalLabel);
      capture?.calls.push({ declaredDomain: input.declaredDomain, nodeLabels, takenLabels: input.takenLabels });
      return by(input.declaredDomain, nodeLabels);
    }
  };
}

test("maps number-cited labels back to nodes by position within a domain", async () => {
  const nodes = [rescuedNode("n1", "Each value has an owner"), rescuedNode("n2", "Borrowing")];
  const map = await applyRescuedNodeLabeling({
    rescuedNodes: nodes,
    takenLabelsByDomain: new Map(),
    judge: judge(() => ({ labels: [{ nodeNumber: 2, conceptLabel: "Borrowing" }, { nodeNumber: 1, conceptLabel: "Value ownership" }] }))
  });
  assert.equal(map.get("n1"), "Value ownership");
  assert.equal(map.get("n2"), "Borrowing", "an echoed label is still surfaced; the no-op is decided at adoption time");
});

test("fails OPEN on a judge throw for a domain, keeping that domain's originals but not others", async () => {
  const nodes = [rescuedNode("n1", "sentence A", "rust"), rescuedNode("n2", "sentence B", "biology")];
  const map = await applyRescuedNodeLabeling({
    rescuedNodes: nodes,
    takenLabelsByDomain: new Map(),
    judge: judge((declaredDomain) => {
      if (declaredDomain === "rust") throw new Error("transport failure");
      return { labels: [{ nodeNumber: 1, conceptLabel: "Cell theory" }] };
    })
  });
  assert.equal(map.has("n1"), false, "the failing domain surfaces no proposal");
  assert.equal(map.get("n2"), "Cell theory", "an unaffected domain is still labeled");
});

test("ignores an out-of-range or duplicate node number (first-writer-wins)", async () => {
  const nodes = [rescuedNode("n1", "sentence A"), rescuedNode("n2", "sentence B")];
  const map = await applyRescuedNodeLabeling({
    rescuedNodes: nodes,
    takenLabelsByDomain: new Map(),
    judge: judge(() => ({
      labels: [
        { nodeNumber: 1, conceptLabel: "First" },
        { nodeNumber: 1, conceptLabel: "Duplicate ignored" },
        { nodeNumber: 9, conceptLabel: "Out of range ignored" }
      ]
    }))
  });
  assert.equal(map.get("n1"), "First");
  assert.equal(map.size, 1);
});

test("groups nodes by Declared Domain into one call each, passing that domain's taken labels", async () => {
  const nodes = [
    rescuedNode("n1", "sentence A", "rust"),
    rescuedNode("n2", "sentence B", "rust"),
    rescuedNode("n3", "sentence C", "biology")
  ];
  const capture = { calls: [] as { declaredDomain: string; nodeLabels: string[]; takenLabels: string[] }[] };
  await applyRescuedNodeLabeling({
    rescuedNodes: nodes,
    takenLabelsByDomain: new Map([["rust", ["Ownership"]], ["biology", ["Cell"]]]),
    judge: judge(() => ({ labels: [] }), capture)
  });
  assert.equal(capture.calls.length, 2, "one call per domain");
  const rust = capture.calls.find((c) => c.declaredDomain === "rust");
  const biology = capture.calls.find((c) => c.declaredDomain === "biology");
  assert.deepEqual(rust?.nodeLabels, ["sentence A", "sentence B"]);
  assert.deepEqual(rust?.takenLabels, ["Ownership"]);
  assert.deepEqual(biology?.nodeLabels, ["sentence C"]);
  assert.deepEqual(biology?.takenLabels, ["Cell"]);
});

test("drops an empty proposal, keeping the node's original label", async () => {
  const nodes = [rescuedNode("n1", "sentence A")];
  const map = await applyRescuedNodeLabeling({
    rescuedNodes: nodes,
    takenLabelsByDomain: new Map(),
    judge: judge(() => ({ labels: [{ nodeNumber: 1, conceptLabel: "   " }] }))
  });
  assert.equal(map.has("n1"), false);
});
