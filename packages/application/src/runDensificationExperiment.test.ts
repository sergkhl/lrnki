import assert from "node:assert/strict";
import test from "node:test";
import type { DerivedGraphLayer, DerivedGraphNode, GeneratedGroundingBundle, InferredPrerequisiteEdge } from "@lrnki/domain-core";
import type { BridgeConceptProposalPort, DifficultyPort, GroundingGenerationPort, PrerequisiteJudgmentPort } from "@lrnki/ports";
import { runDensificationExperiment } from "./runDensificationExperiment";
import type { DeclinedPairDisposition } from "./sparseRegionDetection";

function node(id: string, domain = "biology"): DerivedGraphNode {
  return {
    nodeKind: "anchor",
    derivedNodeId: id,
    conceptId: id,
    groundingOrigin: "document_anchored",
    role: "anchor",
    layer: "asserted",
    canonicalLabel: id,
    normalizedLabel: id,
    declaredDomain: domain,
    aliases: []
  };
}

function edge(prereq: string, dependent: string, confidence = 0.9): InferredPrerequisiteEdge {
  return {
    prerequisiteConceptId: prereq,
    dependentConceptId: dependent,
    predicate: "inferred-prerequisite-of",
    confidence,
    uncertain: false,
    provenance: { judgmentRationale: "baseline" }
  };
}

function layer(): DerivedGraphLayer {
  return {
    enrichmentId: "baseline",
    graphVersionId: "gv1",
    enrichmentConfigHash: "baseline-config",
    judgeModel: "baseline-judge",
    derivedNodes: [node("a"), node("b"), node("c"), node("d")],
    prerequisiteEdges: [edge("a", "b"), edge("c", "d")],
    difficulties: []
  };
}

const declinedPairs: DeclinedPairDisposition[] = [
  { aConceptId: "b", bConceptId: "c", declaredDomain: "biology", outcome: "none", rationale: "baseline declined direct relation" }
];

function ports(options: { proposalLabels?: string[]; noneJudgment?: boolean } = {}) {
  const proposalCalls: unknown[] = [];
  const groundingCalls: unknown[] = [];
  const judgeCalls: unknown[] = [];
  const proposal: BridgeConceptProposalPort = {
    model: "mock-proposer",
    async propose(input) {
      proposalCalls.push(input);
      return (options.proposalLabels ?? ["Bridge Concept"]).map((label) => ({ proposedLabel: label, rationale: "bridges the endpoints" }));
    }
  };
  const grounding: GroundingGenerationPort = {
    model: "mock-grounder",
    async generate(input): Promise<GeneratedGroundingBundle> {
      groundingCalls.push(input);
      return {
        derivedNodeId: input.derivedNodeId,
        groundingOrigin: "llm_grounded",
        definitions: [{ passageType: "definition", text: `${input.nodeLabel} definition.`, groundingOrigin: "llm_grounded", headingPath: [], locator: {}, verbatimCheck: { disposition: "not_applicable_by_grounding", rationale: "generated" } }],
        mentions: [],
        scaffoldedAnchorConceptIds: input.scaffoldedAnchors.map((anchor) => anchor.conceptId),
        generatingModel: "mock-grounder",
        rationale: "generated"
      };
    }
  };
  const judge: PrerequisiteJudgmentPort = {
    model: "mock-cross-family",
    async judge(input) {
      judgeCalls.push(input);
      if (options.noneJudgment) return { prerequisiteConceptId: input.a.conceptId, dependentConceptId: input.b.conceptId, outcome: "none", confidence: 0.9, rationale: "none" };
      return { prerequisiteConceptId: input.a.conceptId, dependentConceptId: input.b.conceptId, outcome: "directed", confidence: 0.9, rationale: "bridge precedes endpoint" };
    }
  };
  const difficulty: DifficultyPort = {
    method: "mock-difficulty",
    async score({ nodeIds }) {
      return nodeIds.map((conceptId) => ({ conceptId, score: 0, method: "mock-difficulty", components: {} }));
    }
  };
  return { proposal, grounding, judge, difficulty, proposalCalls, groundingCalls, judgeCalls };
}

test("creates densification bridge nodes and inferred-prerequisite edges without mutating the baseline", async () => {
  const baseline = layer();
  const p = ports();
  const result = await runDensificationExperiment({
    experimentId: "experiment",
    baselineLayer: baseline,
    declinedPairs,
    bridgeProposal: p.proposal,
    groundingGeneration: p.grounding,
    generatedPrerequisiteJudge: p.judge,
    difficulty: p.difficulty,
    newNodeId: () => "bridge-1",
    groundingTextsByNodeId: new Map([["b", ["B evidence"]], ["c", ["C evidence"]]])
  });

  const bridge = result.densifiedLayer.derivedNodes.find((n) => n.derivedNodeId === "bridge-1");
  assert.ok(bridge && bridge.nodeKind === "enrichment" && bridge.groundingOrigin === "llm_grounded");
  assert.equal(bridge.mintingReason, "densification");
  assert.equal(result.densifiedLayer.prerequisiteEdges.every((e) => e.predicate === "inferred-prerequisite-of"), true);
  assert.equal(p.judgeCalls.length, 2);
  assert.equal(result.baselineLayer.derivedNodes.length, 4);
  assert.equal(baseline.derivedNodes.length, 4);
});

test("enforces the per-run bridge bound", async () => {
  const p = ports({ proposalLabels: ["Bridge A", "Bridge B"] });
  const result = await runDensificationExperiment({
    experimentId: "experiment",
    baselineLayer: layer(),
    declinedPairs,
    bridgeProposal: p.proposal,
    groundingGeneration: p.grounding,
    generatedPrerequisiteJudge: p.judge,
    difficulty: p.difficulty,
    config: { maxBridgesPerRun: 1 },
    newNodeId: () => "bridge"
  });

  assert.equal(result.bridges.length, 1);
});

test("cycle removal and transitive reduction run over the combined edge set", async () => {
  const p = ports();
  let nextId = 0;
  const result = await runDensificationExperiment({
    experimentId: "experiment",
    baselineLayer: {
      ...layer(),
      derivedNodes: [node("a"), node("b"), node("c")],
      prerequisiteEdges: [edge("a", "b"), edge("b", "c"), edge("a", "c")]
    },
    declinedPairs: [{ aConceptId: "a", bConceptId: "c", declaredDomain: "biology", outcome: "none", rationale: "shortcut gap" }],
    bridgeProposal: p.proposal,
    groundingGeneration: p.grounding,
    generatedPrerequisiteJudge: p.judge,
    difficulty: p.difficulty,
    newNodeId: () => `bridge-${++nextId}`
  });

  const edges = result.densifiedLayer.prerequisiteEdges.map((e) => `${e.prerequisiteConceptId}->${e.dependentConceptId}`);
  assert.equal(edges.includes("a->c"), false);
});

test("records generated-grounding disposition and leaves authoritative stores out of the API", async () => {
  const p = ports({ noneJudgment: true });
  const result = await runDensificationExperiment({
    experimentId: "experiment",
    baselineLayer: layer(),
    declinedPairs,
    bridgeProposal: p.proposal,
    groundingGeneration: p.grounding,
    generatedPrerequisiteJudge: p.judge,
    difficulty: p.difficulty,
    newNodeId: () => "bridge-1"
  });

  assert.equal(result.groundingDispositions[0].outcome, "not_applicable_by_grounding");
  assert.equal(result.bridges[0].proposedEdges.length, 0);
});
