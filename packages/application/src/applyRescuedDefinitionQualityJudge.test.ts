import assert from "node:assert/strict";
import test from "node:test";
import type {
  DefinitionPassageQualityJudgment,
  EnrichmentNode,
  LlmGroundedEnrichmentNode,
  SourceMentionedEnrichmentNode,
  SourceMentionGroundingPassage
} from "@lrnki/domain-core";
import type { DefinitionPassageQualityJudgmentPort } from "@lrnki/ports";
import { applyRescuedDefinitionQualityJudge } from "./applyRescuedDefinitionQualityJudge";

function defPassage(text: string, blockId: string): SourceMentionGroundingPassage {
  return {
    passageType: "definition",
    text,
    groundingOrigin: "source_mentioned",
    sourceResourceId: "source-1",
    sourceBlockId: blockId,
    evidenceQuote: text,
    headingPath: [],
    locator: {},
    verbatimCheck: { disposition: "verified", sourceResourceId: "source-1", sourceBlockId: blockId }
  };
}

function mentionPassage(text: string, blockId: string): SourceMentionGroundingPassage {
  return { ...defPassage(text, blockId), passageType: "mention" };
}

function rescuedNode(overrides: Partial<SourceMentionedEnrichmentNode> = {}): SourceMentionedEnrichmentNode {
  return {
    nodeKind: "enrichment",
    derivedNodeId: overrides.derivedNodeId ?? "node-1",
    groundingOrigin: "source_mentioned",
    role: "prerequisite",
    layer: "derived",
    canonicalLabel: overrides.canonicalLabel ?? "Ownership",
    normalizedLabel: overrides.normalizedLabel ?? "ownership",
    declaredDomain: overrides.declaredDomain ?? "systems programming",
    aliases: overrides.aliases ?? [],
    groundingPassages: overrides.groundingPassages ?? [defPassage("Ownership is Rust's discipline for managing heap memory through a set of rules the compiler checks.", "block-1")]
  };
}

// A judge that vetoes any passage whose quote contains a marker token, keeping the rest.
function judgeVetoingContaining(marker: string): DefinitionPassageQualityJudgmentPort {
  return {
    model: "kg-independent-judge",
    judgeDefinitions: async (input) =>
      input.passages.map((passage): DefinitionPassageQualityJudgment =>
        passage.evidenceQuote.includes(marker)
          ? { establishesMeaning: false, category: "heading_or_title", judgedSpan: passage.evidenceQuote, rationale: `hollow: ${marker}` }
          : { establishesMeaning: true, category: "establishes_meaning", judgedSpan: "", rationale: "defines" }
      )
  };
}

const judgeKeepAll: DefinitionPassageQualityJudgmentPort = {
  model: "kg-independent-judge",
  judgeDefinitions: async (input) =>
    input.passages.map((): DefinitionPassageQualityJudgment => ({ establishesMeaning: true, category: "establishes_meaning", judgedSpan: "", rationale: "defines" }))
};

test("a hollow rescued definition passage is dropped; the node is retained mention-only", async () => {
  const node = rescuedNode({
    groundingPassages: [
      defPassage("Ownership", "b1"), // a bare heading/title — hollow
      mentionPassage("Ownership is how Rust frees you from manual memory management.", "b2")
    ]
  });
  // The marker "Ownership" appears in the mention too, but mentions are never judged —
  // only the bare-heading definition passage is vetoed.
  const { nodes, dispositions } = await applyRescuedDefinitionQualityJudge({ nodes: [node], judge: judgeVetoingContaining("Ownership") });
  const kept = nodes[0] as SourceMentionedEnrichmentNode;
  assert.deepEqual(kept.groundingPassages.map((p) => p.passageType), ["mention"]);
  assert.equal(dispositions.filter((d) => d.disposition === "vetoed").length, 1);
});

test("a genuinely defining rescued passage is kept as a definition passage", async () => {
  const node = rescuedNode();
  const { nodes } = await applyRescuedDefinitionQualityJudge({ nodes: [node], judge: judgeKeepAll });
  const kept = nodes[0] as SourceMentionedEnrichmentNode;
  assert.deepEqual(kept.groundingPassages.map((p) => p.passageType), ["definition"]);
});

test("a judge transport failure keeps every passage and flags kept_judge_unavailable (fail closed = preserve)", async () => {
  const node = rescuedNode({
    groundingPassages: [defPassage("Ownership defines who frees memory.", "b1"), mentionPassage("Ownership again.", "b2")]
  });
  const failing: DefinitionPassageQualityJudgmentPort = {
    model: "kg-independent-judge",
    judgeDefinitions: async () => { throw new Error("model unavailable"); }
  };
  const { nodes, dispositions } = await applyRescuedDefinitionQualityJudge({ nodes: [node], judge: failing });
  const kept = nodes[0] as SourceMentionedEnrichmentNode;
  assert.equal(kept.groundingPassages.length, 2);
  assert.ok(dispositions.every((d) => d.disposition === "kept_judge_unavailable"));
});

test("mention passages are never altered by this stage", async () => {
  const node = rescuedNode({
    groundingPassages: [
      defPassage("HOLLOW marker passage.", "b1"),
      mentionPassage("HOLLOW marker passage in a mention.", "b2")
    ]
  });
  const { nodes } = await applyRescuedDefinitionQualityJudge({ nodes: [node], judge: judgeVetoingContaining("HOLLOW") });
  const kept = nodes[0] as SourceMentionedEnrichmentNode;
  // The mention containing the marker survives untouched; only the definition was vetoed.
  assert.deepEqual(kept.groundingPassages.map((p) => p.passageType), ["mention"]);
  assert.equal(kept.groundingPassages[0].evidenceQuote, "HOLLOW marker passage in a mention.");
});

test("llm_grounded nodes pass through untouched (only source_mentioned rescue definitions are judged)", async () => {
  const generated: LlmGroundedEnrichmentNode = {
    nodeKind: "enrichment",
    derivedNodeId: "gen-1",
    groundingOrigin: "llm_grounded",
    mintingReason: "assumed_prerequisite",
    role: "prerequisite",
    layer: "derived",
    canonicalLabel: "Stack frame",
    normalizedLabel: "stack frame",
    declaredDomain: "systems programming",
    aliases: [],
    groundingBundle: {
      groundingOrigin: "llm_grounded",
      definitions: [{ passageType: "definition", text: "A stack frame is...", groundingOrigin: "llm_grounded", headingPath: [], locator: {}, verbatimCheck: { disposition: "not_applicable_by_grounding", rationale: "generated" } }],
      mentions: [],
      groundingAnchorReferences: [],
      generatingModel: "deepseek",
      rationale: "assumed"
    }
  };
  const nodes: EnrichmentNode[] = [generated];
  const { nodes: out, dispositions } = await applyRescuedDefinitionQualityJudge({ nodes, judge: judgeVetoingContaining("stack frame") });
  assert.equal(out[0], generated); // identity preserved — not judged
  assert.equal(dispositions.length, 0);
});

test("drop-only and index-aligned across multiple nodes", async () => {
  const a = rescuedNode({ derivedNodeId: "a", groundingPassages: [defPassage("VETO this definition.", "a1"), defPassage("A clean definition that defines the concept.", "a2")] });
  const b = rescuedNode({ derivedNodeId: "b", groundingPassages: [defPassage("Another clean definition.", "b1")] });
  const { nodes } = await applyRescuedDefinitionQualityJudge({ nodes: [a, b], judge: judgeVetoingContaining("VETO") });
  const ka = nodes.find((n) => n.derivedNodeId === "a") as SourceMentionedEnrichmentNode;
  const kb = nodes.find((n) => n.derivedNodeId === "b") as SourceMentionedEnrichmentNode;
  assert.deepEqual(ka.groundingPassages.map((p) => p.evidenceQuote), ["A clean definition that defines the concept."]);
  assert.equal(kb.groundingPassages.length, 1);
});
