import assert from "node:assert/strict";
import { test } from "node:test";
import type { GeneratedGroundingBundle, MentionedNonCoreCandidate, MissingPrerequisiteProposal } from "@lrnki/domain-core";
import type {
  GroundingGenerationPort,
  MintingDurabilityJudgmentPort,
  MissingPrerequisiteProposalPort,
  RescueDurabilityJudgmentPort
} from "@lrnki/ports";
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

function recordingGrounder(calls: string[]): GroundingGenerationPort {
  return {
    model: "mock-gen",
    async generate(input) {
      calls.push(input.nodeLabel);
      return grounder.generate(input);
    }
  };
}

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

// Always-durable judge: an opt-in judge that accepts every rescue candidate.
const acceptAllJudge: RescueDurabilityJudgmentPort = {
  model: "kg-independent-judge",
  judge: async () => ({ verdict: "durable", groundingSpan: "", rationale: "durable" })
};

test("the rescue durability judge drops a non-durable candidate before it becomes a node", async () => {
  counter = 0;
  const dropPointer: RescueDurabilityJudgmentPort = {
    model: "kg-independent-judge",
    judge: async (input) =>
      input.candidate.canonicalLabel === "Pointer"
        ? { verdict: "not_durable", groundingSpan: "Pointer is mentioned.", rationale: "incidental mention" }
        : { verdict: "durable", groundingSpan: "", rationale: "durable" }
  };
  const { rescuedNodes, rescueDispositions } = await assembleEnrichmentNodes({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [mention("Pointer", "run-1"), mention("Lifetime", "run-1")],
    proposalPort: proposer({}),
    groundingPort: grounder,
    rescueDurabilityJudge: dropPointer,
    newNodeId
  });
  assert.deepEqual(rescuedNodes.map((n) => n.canonicalLabel), ["Lifetime"]);
  assert.equal(rescueDispositions.length, 2);
  assert.equal(rescueDispositions.find((d) => d.canonicalLabel === "Pointer")?.disposition, "dropped");
  assert.equal(rescueDispositions.find((d) => d.canonicalLabel === "Lifetime")?.disposition, "accepted");
});

test("a dropped rescue label is not resurrected as a minted node", async () => {
  counter = 0;
  const dropPointer: RescueDurabilityJudgmentPort = {
    model: "kg-independent-judge",
    judge: async () => ({ verdict: "not_durable", groundingSpan: "Pointer is mentioned.", rationale: "incidental" })
  };
  const { rescuedNodes, mintedNodes } = await assembleEnrichmentNodes({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [mention("Pointer", "run-1")],
    // The proposer tries to mint the very label the judge dropped.
    proposalPort: proposer({ a: [{ proposedLabel: "Pointer", rationale: "r" }] }),
    groundingPort: grounder,
    rescueDurabilityJudge: dropPointer,
    newNodeId
  });
  assert.equal(rescuedNodes.length, 0, "the dropped rescue node is gone");
  assert.equal(mintedNodes.length, 0, "and its label stays taken, so minting cannot resurrect it");
});

test("the durability judge sees a concept's MERGED evidence (judged after dedupe)", async () => {
  counter = 0;
  let seenMentionCount = -1;
  const recordingJudge: RescueDurabilityJudgmentPort = {
    model: "kg-independent-judge",
    judge: async (input) => {
      seenMentionCount = input.candidate.mentionQuotes.length;
      return { verdict: "durable", groundingSpan: "", rationale: "durable" };
    }
  };
  await assembleEnrichmentNodes({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [mention("Pointer", "run-1"), mention("Pointer", "run-2")],
    proposalPort: proposer({}),
    groundingPort: grounder,
    rescueDurabilityJudge: recordingJudge,
    newNodeId
  });
  assert.equal(seenMentionCount, 2, "the judge saw both member runs' mentions on the merged node");
});

test("omitting the judge accepts every rescue candidate with no dispositions (opt-in)", async () => {
  counter = 0;
  const { rescuedNodes, rescueDispositions } = await assembleEnrichmentNodes({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [mention("Pointer", "run-1")],
    proposalPort: proposer({}),
    groundingPort: grounder,
    newNodeId
  });
  assert.equal(rescuedNodes.length, 1);
  assert.deepEqual(rescueDispositions, []);
});

test("an accept-all judge records accepted dispositions and keeps every node", async () => {
  counter = 0;
  const { rescuedNodes, rescueDispositions } = await assembleEnrichmentNodes({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [mention("Pointer", "run-1")],
    proposalPort: proposer({}),
    groundingPort: grounder,
    rescueDurabilityJudge: acceptAllJudge,
    newNodeId
  });
  assert.equal(rescuedNodes.length, 1);
  assert.equal(rescueDispositions[0].disposition, "accepted");
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

test("minting durability drops not_durable proposals before grounding generation", async () => {
  counter = 0;
  const groundingCalls: string[] = [];
  const judge: MintingDurabilityJudgmentPort = {
    model: "kg-independent-judge",
    judge: async (input) =>
      input.proposal.proposedLabel === "Incidental Label"
        ? { verdict: "not_durable", rationale: "tangential" }
        : { verdict: "durable", rationale: "foundation" }
  };
  const { mintedNodes, mintingDispositions } = await assembleEnrichmentNodes({
    anchors: [anchor("a", "Borrowing")],
    rescueCandidates: [],
    proposalPort: proposer({ a: [
      { proposedLabel: "Incidental Label", rationale: "named in passing" },
      { proposedLabel: "Lifetime", rationale: "needed first" }
    ] }),
    groundingPort: recordingGrounder(groundingCalls),
    mintingDurabilityJudge: judge,
    newNodeId
  });
  assert.deepEqual(mintedNodes.map((node) => node.canonicalLabel), ["Lifetime"]);
  assert.deepEqual(groundingCalls, ["Lifetime"], "dropped proposal spent no grounding call");
  assert.equal(mintingDispositions.find((item) => item.proposedLabel === "Incidental Label")?.disposition, "dropped");
  assert.equal(mintingDispositions.find((item) => item.proposedLabel === "Lifetime")?.disposition, "accepted");
  assert.equal(mintingDispositions[0].anchorConceptId, "a");
});

test("minting durability judge failure keeps and mints fail-open", async () => {
  counter = 0;
  const judge: MintingDurabilityJudgmentPort = {
    model: "kg-independent-judge",
    judge: async () => {
      throw new Error("transport");
    }
  };
  const { mintedNodes, mintingDispositions } = await assembleEnrichmentNodes({
    anchors: [anchor("a", "Borrowing")],
    rescueCandidates: [],
    proposalPort: proposer({ a: [{ proposedLabel: "Lifetime", rationale: "needed first" }] }),
    groundingPort: grounder,
    mintingDurabilityJudge: judge,
    newNodeId
  });
  assert.deepEqual(mintedNodes.map((node) => node.canonicalLabel), ["Lifetime"]);
  assert.equal(mintingDispositions[0].disposition, "kept_judge_unavailable");
});

test("a minting-dropped label is released so a later same-domain anchor can re-propose and mint it", async () => {
  counter = 0;
  // The verdict is anchor-scoped: tangential to "Borrowing" but durable for "Move
  // Semantics". Anchors are processed in conceptId order ("a" before "b").
  const judge: MintingDurabilityJudgmentPort = {
    model: "kg-independent-judge",
    judge: async (input) =>
      input.anchor.canonicalLabel === "Borrowing"
        ? { verdict: "not_durable", rationale: "tangential here" }
        : { verdict: "durable", rationale: "durable for this anchor" }
  };
  const { mintedNodes, mintingDispositions } = await assembleEnrichmentNodes({
    anchors: [anchor("a", "Borrowing"), anchor("b", "Move Semantics")],
    rescueCandidates: [],
    proposalPort: proposer({
      a: [{ proposedLabel: "RAII", rationale: "first anchor proposes it" }],
      b: [{ proposedLabel: "RAII", rationale: "later anchor genuinely needs it" }]
    }),
    groundingPort: grounder,
    mintingDurabilityJudge: judge,
    newNodeId
  });
  // The drop for "a" releases the label, so "b" re-proposes it and mints it: reservation
  // scope follows verdict scope, never suppressing a durable prerequisite for another anchor.
  assert.deepEqual(mintedNodes.map((node) => node.canonicalLabel), ["RAII"]);
  assert.equal(mintingDispositions.length, 2);
  assert.equal(mintingDispositions.find((item) => item.anchorConceptId === "a")?.disposition, "dropped");
  assert.equal(mintingDispositions.find((item) => item.anchorConceptId === "b")?.disposition, "accepted");
});

test("a minting-dropped label that no later anchor needs is never minted", async () => {
  counter = 0;
  // Both anchors find RAII tangential; releasing the label must not cause a spurious mint.
  const judge: MintingDurabilityJudgmentPort = {
    model: "kg-independent-judge",
    judge: async () => ({ verdict: "not_durable", rationale: "tangential everywhere" })
  };
  const { mintedNodes, mintingDispositions } = await assembleEnrichmentNodes({
    anchors: [anchor("a", "Borrowing"), anchor("b", "Move Semantics")],
    rescueCandidates: [],
    proposalPort: proposer({
      a: [{ proposedLabel: "RAII", rationale: "first anchor proposes it" }],
      b: [{ proposedLabel: "RAII", rationale: "later anchor proposes it too" }]
    }),
    groundingPort: grounder,
    mintingDurabilityJudge: judge,
    newNodeId
  });
  assert.deepEqual(mintedNodes.map((node) => node.canonicalLabel), []);
  assert.deepEqual(mintingDispositions.map((item) => item.disposition), ["dropped", "dropped"]);
});

test("omitting minting durability judge preserves prior minting and emits no dispositions", async () => {
  counter = 0;
  const { mintedNodes, mintingDispositions } = await assembleEnrichmentNodes({
    anchors: [anchor("a", "Borrowing")],
    rescueCandidates: [],
    proposalPort: proposer({ a: [{ proposedLabel: "Lifetime", rationale: "needed first" }] }),
    groundingPort: grounder,
    newNodeId
  });
  assert.deepEqual(mintedNodes.map((node) => node.canonicalLabel), ["Lifetime"]);
  assert.deepEqual(mintingDispositions, []);
});
