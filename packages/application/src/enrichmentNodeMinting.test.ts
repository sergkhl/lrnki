import assert from "node:assert/strict";
import { test } from "node:test";
import type { GeneratedGroundingBundle, NonCoreRescueCandidate, MissingPrerequisiteProposal } from "@lrnki/domain-core";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type {
  GroundingGenerationPort,
  MintingDurabilityJudgmentPort,
  MissingPrerequisiteProposalPort,
  RescueDurabilityJudgmentPort,
  RescuedNodeLabelingPort
} from "@lrnki/ports";
import { assembleEnrichmentNodes, type MintingAnchor } from "./enrichmentNodeMinting";
import type { StageBracket } from "./runProgressReporter";

// Recording stage bracket: captures the order in which fine stages open and close, so a
// test asserts per-call bracketing (U1) WITHOUT a reporter or database. A throw records
// `${name}:err` so the fail path is observable.
function recordingStage() {
  const opened: string[] = [];
  const closed: string[] = [];
  const maxConcurrentByName = new Map<string, number>();
  const liveByName = new Map<string, number>();
  const stage: StageBracket = async (name, fn) => {
    opened.push(name);
    const live = (liveByName.get(name) ?? 0) + 1;
    liveByName.set(name, live);
    maxConcurrentByName.set(name, Math.max(maxConcurrentByName.get(name) ?? 0, live));
    try {
      const result = await fn();
      closed.push(name);
      liveByName.set(name, (liveByName.get(name) ?? 1) - 1);
      return result;
    } catch (error) {
      closed.push(`${name}:err`);
      liveByName.set(name, (liveByName.get(name) ?? 1) - 1);
      throw error;
    }
  };
  return { stage, opened, closed, maxConcurrentByName: () => maxConcurrentByName };
}

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
    const anchor = input.context.kind === "scaffolded_anchor" ? input.context.anchor : undefined;
    return {
      groundingOrigin: "llm_grounded",
      definitions: [{ passageType: "definition", text: `${input.canonicalLabel} explained.`, groundingOrigin: "llm_grounded", headingPath: [], locator: {}, verbatimCheck: { disposition: "not_applicable_by_grounding", rationale: "generated" } }],
      mentions: [],
      groundingAnchorReferences: anchor ? [anchor.reference] : [],
      generatingModel: "mock-gen",
      rationale: `scaffolds ${anchor?.canonicalLabel}`
    };
  }
};

function recordingGrounder(calls: string[]): GroundingGenerationPort {
  return {
    model: "mock-gen",
    async generate(input) {
      calls.push(input.canonicalLabel);
      return grounder.generate(input);
    }
  };
}

function mention(label: string, runId: string): NonCoreRescueCandidate {
  return {
    runId,
    declaredDomain: "software engineering",
    candidateKey: label.toLowerCase(),
    canonicalLabel: label,
    normalizedLabel: label.toLowerCase(),
    aliases: [label],
    tier: "reject",
    definitions: [],
    mentions: [{ sourceResourceId: "src", sourceBlockId: `blk-${runId}`, evidenceQuote: `${label} is mentioned.`, blockText: `${label} is mentioned somewhere.`, headingPath: [], locator: {} }]
  };
}

// An `optional`-tier rescue candidate carrying a verbatim Definition Passage in addition
// to a mention — the reuse case the seam fix rescues instead of re-minting (U2).
function definitionBearing(label: string, runId: string): NonCoreRescueCandidate {
  return {
    runId,
    declaredDomain: "software engineering",
    candidateKey: label.toLowerCase(),
    canonicalLabel: label,
    normalizedLabel: label.toLowerCase(),
    aliases: [label],
    tier: "optional",
    definitions: [{ sourceResourceId: "src", sourceBlockId: `def-${runId}`, evidenceQuote: `${label} is the memory requested at runtime.`, blockText: `${label} is the memory requested at runtime.`, headingPath: [], locator: {} }],
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
  assert.ok(mintedNodes[0].groundingBundle.groundingAnchorReferences.includes("a"));
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

test("a definition-bearing optional candidate is rescued with a definition + mention passage", async () => {
  counter = 0;
  const { rescuedNodes } = await assembleEnrichmentNodes({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [definitionBearing("Heap allocation", "run-1")],
    proposalPort: proposer({}),
    groundingPort: grounder,
    newNodeId
  });
  assert.equal(rescuedNodes.length, 1);
  assert.equal(rescuedNodes[0].groundingOrigin, "source_mentioned");
  const types = rescuedNodes[0].groundingPassages.map((p) => p.passageType);
  assert.deepEqual(types, ["definition", "mention"], "definition leads, mention follows");
  assert.equal(rescuedNodes[0].groundingPassages[0].evidenceQuote, "Heap allocation is the memory requested at runtime.");
});

test("a rescued optional concept suppresses redundant minting of the same label (R3)", async () => {
  counter = 0;
  const minted: string[] = [];
  const { rescuedNodes, mintedNodes } = await assembleEnrichmentNodes({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [definitionBearing("Heap allocation", "run-1")],
    // The minter tries to regenerate the very concept already rescued with a real definition.
    proposalPort: proposer({ a: [{ proposedLabel: "Heap allocation", rationale: "r" }] }),
    groundingPort: recordingGrounder(minted),
    newNodeId
  });
  assert.equal(rescuedNodes.length, 1, "the optional concept is rescued from its source definition");
  assert.equal(mintedNodes.length, 0, "and the minter does not regenerate it as an llm_grounded node");
  assert.deepEqual(minted, [], "grounding generation is never invoked for the rescued label");
});

test("two member runs of a definition-bearing concept merge definitions and mentions", async () => {
  counter = 0;
  const { rescuedNodes } = await assembleEnrichmentNodes({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [definitionBearing("Heap allocation", "run-1"), definitionBearing("Heap allocation", "run-2")],
    proposalPort: proposer({}),
    groundingPort: grounder,
    newNodeId
  });
  assert.equal(rescuedNodes.length, 1, "the concept collapses to one node across runs");
  const types = rescuedNodes[0].groundingPassages.map((p) => p.passageType).sort();
  assert.deepEqual(types, ["definition", "definition", "mention", "mention"], "both runs' definitions and mentions merge");
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

// A labeling judge (TODO #1) that re-names each candidate by its current label. A candidate
// absent from `proposalByLabel` keeps its own label (echoed back), mirroring the "may equal
// current" contract of the real whole-set step.
function relabelJudge(proposalByLabel: Record<string, string>): RescuedNodeLabelingPort {
  return {
    model: "kg-independent-judge",
    label: async (input) => ({
      labels: input.nodes.map((node, index) => ({
        nodeNumber: index + 1,
        conceptLabel: proposalByLabel[node.canonicalLabel] ?? node.canonicalLabel
      }))
    })
  };
}

test("Covers AE6: a sentence-shaped rescued node adopts the proposed concept label; the original survives as an alias", async () => {
  counter = 0;
  const sentence = "Memory is freed when the owner goes out of scope";
  const { rescuedNodes, rescueDispositions } = await assembleEnrichmentNodes({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [mention(sentence, "run-1")],
    proposalPort: proposer({}),
    groundingPort: grounder,
    rescueDurabilityJudge: acceptAllJudge,
    rescuedNodeLabelingJudge: relabelJudge({ [sentence]: "Ownership-based memory release" }),
    newNodeId
  });
  const node = rescuedNodes[0];
  assert.equal(node.canonicalLabel, "Ownership-based memory release");
  assert.equal(node.normalizedLabel, "ownership based memory release", "normalized form drives the reservation key");
  assert.ok(node.aliases.includes(sentence), "the original sentence survives as an alias");
  const disposition = rescueDispositions.find((d) => d.derivedNodeId === node.derivedNodeId);
  assert.equal(disposition?.relabeledFrom, sentence, "the disposition records the re-label");
  assert.equal(disposition?.canonicalLabel, "Ownership-based memory release");
});

test("a re-label proposal that collides with an anchor label in the domain keeps the original label", async () => {
  counter = 0;
  const sentence = "The owner is the single binding responsible for a value";
  const { rescuedNodes, rescueDispositions } = await assembleEnrichmentNodes({
    anchors: [anchor("a", "Ownership")],
    // The proposal normalizes to "ownership", already taken by the anchor.
    rescueCandidates: [mention(sentence, "run-1")],
    proposalPort: proposer({}),
    groundingPort: grounder,
    rescueDurabilityJudge: acceptAllJudge,
    rescuedNodeLabelingJudge: relabelJudge({ [sentence]: "Ownership" }),
    newNodeId
  });
  assert.equal(rescuedNodes[0].canonicalLabel, sentence, "a colliding proposal is discarded, original kept");
  assert.equal(rescueDispositions[0].relabeledFrom, undefined);
});

test("a re-labeled rescued node reserves its new label, blocking a later same-domain mint proposal", async () => {
  counter = 0;
  const sentence = "A move transfers ownership to a new binding";
  const { rescuedNodes, mintedNodes } = await assembleEnrichmentNodes({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [mention(sentence, "run-1")],
    // The proposer tries to mint the very concept label the rescued node adopted.
    proposalPort: proposer({ a: [{ proposedLabel: "Move semantics", rationale: "r" }] }),
    groundingPort: grounder,
    rescueDurabilityJudge: acceptAllJudge,
    rescuedNodeLabelingJudge: relabelJudge({ [sentence]: "Move semantics" }),
    newNodeId
  });
  assert.equal(rescuedNodes[0].canonicalLabel, "Move semantics");
  assert.equal(mintedNodes.some((n) => n.canonicalLabel === "Move semantics"), false, "the reserved re-label blocks the mint");
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

// --- U1 stage bracketing -----------------------------------------------------------

// Each LLM port call is wrapped in its fine STAGE_TAGS bracket so its wall-clock joins the
// cost the call already self-tags. Sequential `await` loop ⇒ one bracket of a name open at
// a time (KTD2), and a name brackets once per port call.
test("U1: each LLM port call brackets under its fine STAGE_TAGS name (one per call)", async () => {
  counter = 0;
  const { stage, opened, maxConcurrentByName } = recordingStage();
  const acceptMint: MintingDurabilityJudgmentPort = {
    model: "kg-independent-judge",
    judge: async () => ({ verdict: "durable", rationale: "foundation" })
  };
  await assembleEnrichmentNodes({
    anchors: [anchor("a", "Borrowing")],
    rescueCandidates: [mention("Pointer", "run-1")],
    proposalPort: proposer({ a: [{ proposedLabel: "Lifetime", rationale: "needed first" }] }),
    groundingPort: grounder,
    rescueDurabilityJudge: acceptAllJudge,
    mintingDurabilityJudge: acceptMint,
    newNodeId,
    stage
  });
  assert.ok(opened.includes(STAGE_TAGS.rescueDurability), "rescue durability judged under its fine name");
  assert.ok(opened.includes(STAGE_TAGS.missingPrerequisiteProposal), "proposal under its fine name");
  assert.ok(opened.includes(STAGE_TAGS.mintingDurability), "minting durability under its fine name");
  assert.ok(opened.includes(STAGE_TAGS.groundingGeneration), "grounding under its fine name");
  // The coarse composite name never appears — the join-alignment property.
  assert.ok(!opened.includes("rescue-mint"));
  // One proposal per anchor, one grounding per minted node; never overlapping (sequential).
  assert.equal(opened.filter((s) => s === STAGE_TAGS.missingPrerequisiteProposal).length, 1);
  assert.equal(opened.filter((s) => s === STAGE_TAGS.groundingGeneration).length, 1);
  for (const [, max] of maxConcurrentByName()) assert.equal(max, 1, "same-name brackets never overlap");
});

// Multiple minted nodes ⇒ one grounding bracket per node, each opened and closed in turn.
test("U1: grounding brackets once per minted node, sequentially", async () => {
  counter = 0;
  const { stage, opened, maxConcurrentByName } = recordingStage();
  const { mintedNodes } = await assembleEnrichmentNodes({
    anchors: [anchor("a", "Move Semantics")],
    rescueCandidates: [],
    proposalPort: proposer({ a: [
      { proposedLabel: "Stack allocation", rationale: "r" },
      { proposedLabel: "Heap allocation", rationale: "r" }
    ] }),
    groundingPort: grounder,
    bounds: { maxMintedPerAnchor: 2, maxMintedPerRun: 12 },
    newNodeId,
    stage
  });
  assert.equal(mintedNodes.length, 2);
  assert.equal(opened.filter((s) => s === STAGE_TAGS.groundingGeneration).length, 2);
  assert.equal(maxConcurrentByName().get(STAGE_TAGS.groundingGeneration), 1, "grounding never overlaps");
});

// A run with no judges and no minted nodes emits only the proposal bracket — the
// rescue/minting durability and grounding brackets sit out when their ports/work are absent.
test("U1: durability + grounding brackets are omitted when their work is absent", async () => {
  counter = 0;
  const { stage, opened } = recordingStage();
  await assembleEnrichmentNodes({
    anchors: [anchor("a", "Borrowing")],
    rescueCandidates: [],
    proposalPort: proposer({}),
    groundingPort: grounder,
    newNodeId,
    stage
  });
  assert.ok(opened.includes(STAGE_TAGS.missingPrerequisiteProposal));
  assert.ok(!opened.includes(STAGE_TAGS.rescueDurability));
  assert.ok(!opened.includes(STAGE_TAGS.mintingDurability));
  assert.ok(!opened.includes(STAGE_TAGS.groundingGeneration));
});

// A thrown port call closes its fine stage on the error path and propagates (the operation
// bracket upstream then marks the run failed — bracketStage owns that, U1).
test("U1: a thrown port call closes its fine stage on the error path", async () => {
  counter = 0;
  const { stage, closed } = recordingStage();
  const throwingGrounder: GroundingGenerationPort = {
    model: "mock-gen",
    async generate() {
      throw new Error("forced-tool budget exhausted");
    }
  };
  await assert.rejects(
    () =>
      assembleEnrichmentNodes({
        anchors: [anchor("a", "Borrowing")],
        rescueCandidates: [],
        proposalPort: proposer({ a: [{ proposedLabel: "Lifetime", rationale: "needed first" }] }),
        groundingPort: throwingGrounder,
        newNodeId,
        stage
      }),
    /budget exhausted/
  );
  assert.ok(closed.includes(`${STAGE_TAGS.groundingGeneration}:err`), "grounding stage closed on the error path");
});
