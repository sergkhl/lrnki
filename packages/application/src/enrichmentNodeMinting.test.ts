import assert from "node:assert/strict";
import { test } from "node:test";
import type { GeneratedGroundingBundle, MentionedNonCoreCandidate, MissingPrerequisiteProposal } from "@lrnki/domain-core";
import type { GroundingGenerationPort, MissingPrerequisiteProposalPort } from "@lrnki/ports";
import { assembleEnrichmentNodes, type MintingAnchor } from "./enrichmentNodeMinting";

function anchor(id: string, label: string, domain = "software engineering"): MintingAnchor {
  return { conceptId: id, canonicalLabel: label, normalizedLabel: label.toLowerCase(), declaredDomain: domain, definitionQuotes: [`${label} is defined here.`] };
}

function proposer(byAnchor: Record<string, MissingPrerequisiteProposal[]>): MissingPrerequisiteProposalPort {
  return {
    model: "mock-proposer",
    async propose(input) {
      return (byAnchor[input.anchor.conceptId] ?? []).slice(0, input.maxProposals);
    }
  };
}

const grounder: GroundingGenerationPort = {
  model: "mock-gen",
  async generate(input): Promise<GeneratedGroundingBundle> {
    return {
      derivedNodeId: input.derivedNodeId,
      groundingOrigin: "llm_grounded",
      definitions: [{ passageType: "definition", text: `${input.nodeLabel} explained.`, groundingOrigin: "llm_grounded", headingPath: [], locator: {}, verbatimCheck: { disposition: "not_applicable_by_grounding", rationale: "generated" } }],
      mentions: [],
      scaffoldedAnchorConceptIds: input.scaffoldedAnchors.map((a) => a.conceptId),
      generatingModel: "mock-gen",
      rationale: `scaffolds ${input.scaffoldedAnchors[0]?.canonicalLabel}`
    };
  }
};

function mention(label: string, runId: string): MentionedNonCoreCandidate {
  return {
    runId,
    declaredDomain: "software engineering",
    candidateKey: label.toLowerCase(),
    canonicalLabel: label,
    normalizedLabel: label.toLowerCase(),
    aliases: [label],
    tier: "reject",
    mentions: [{ sourceResourceId: "src", sourceBlockId: `blk-${runId}`, evidenceQuote: `${label} is mentioned.`, blockText: `${label} is mentioned somewhere.`, headingPath: [], locator: {} }]
  };
}

let counter = 0;
const newNodeId = () => `dn-${++counter}`;

test("a member-run mention with no definition becomes a source_mentioned rescued node", async () => {
  counter = 0;
  const { rescuedNodes } = await assembleEnrichmentNodes({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [mention("Pointer", "run-1")],
    proposalPort: proposer({}),
    groundingPort: grounder,
    newNodeId
  });
  assert.equal(rescuedNodes.length, 1);
  assert.equal(rescuedNodes[0].groundingOrigin, "source_mentioned");
  assert.equal(rescuedNodes[0].role, "prerequisite");
  assert.equal(rescuedNodes[0].groundingPassages[0].evidenceQuote, "Pointer is mentioned.");
});

test("an anchor yields llm_grounded minted nodes within the per-anchor cap", async () => {
  counter = 0;
  const { mintedNodes } = await assembleEnrichmentNodes({
    anchors: [anchor("a", "Move Semantics")],
    rescueCandidates: [],
    proposalPort: proposer({ a: [
      { proposedLabel: "Stack allocation", rationale: "r" },
      { proposedLabel: "Heap allocation", rationale: "r" },
      { proposedLabel: "Pointers", rationale: "r" }
    ] }),
    groundingPort: grounder,
    bounds: { maxMintedPerAnchor: 2, maxMintedPerRun: 12 },
    newNodeId
  });
  assert.equal(mintedNodes.length, 2, "per-anchor cap honored");
  assert.ok(mintedNodes.every((node) => node.groundingOrigin === "llm_grounded"));
  assert.ok(mintedNodes[0].groundingBundle.scaffoldedAnchorConceptIds.includes("a"));
});

test("the per-run cap bounds total minting across anchors", async () => {
  counter = 0;
  const { mintedNodes } = await assembleEnrichmentNodes({
    anchors: [anchor("a", "A"), anchor("b", "B"), anchor("c", "C")],
    rescueCandidates: [],
    proposalPort: proposer({
      a: [{ proposedLabel: "p1", rationale: "r" }, { proposedLabel: "p2", rationale: "r" }],
      b: [{ proposedLabel: "p3", rationale: "r" }, { proposedLabel: "p4", rationale: "r" }],
      c: [{ proposedLabel: "p5", rationale: "r" }, { proposedLabel: "p6", rationale: "r" }]
    }),
    groundingPort: grounder,
    bounds: { maxMintedPerAnchor: 2, maxMintedPerRun: 3 },
    newNodeId
  });
  assert.equal(mintedNodes.length, 3, "per-run cap caps total minted nodes");
});

test("rescue dedupes a concept appearing in two member runs into one node", async () => {
  counter = 0;
  const { rescuedNodes } = await assembleEnrichmentNodes({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [mention("Pointer", "run-1"), mention("Pointer", "run-2")],
    proposalPort: proposer({}),
    groundingPort: grounder,
    newNodeId
  });
  assert.equal(rescuedNodes.length, 1, "the duplicate concept collapses to a single node");
  assert.equal(rescuedNodes[0].groundingPassages.length, 2, "both runs' mentions are merged onto the node");
});

test("a proposal duplicating an anchor or rescued label is dropped", async () => {
  counter = 0;
  const { mintedNodes } = await assembleEnrichmentNodes({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [mention("Pointer", "run-1")],
    // The proposer (incorrectly) re-proposes both an anchor and a rescued label.
    proposalPort: proposer({ a: [{ proposedLabel: "Ownership", rationale: "r" }, { proposedLabel: "Pointer", rationale: "r" }] }),
    groundingPort: grounder,
    newNodeId
  });
  assert.equal(mintedNodes.length, 0, "duplicates of existing node labels are not minted");
});
