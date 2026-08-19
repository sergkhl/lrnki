import assert from "node:assert/strict";
import { test } from "node:test";
import type { GeneratedGroundingBundle, NonCoreRescueCandidate, MissingPrerequisiteProposal } from "@lrnki/domain-core";
import type {
  MintingDurabilityJudgmentPort,
  MissingPrerequisiteProposalPort,
  RescueDurabilityJudgmentPort,
  RescuedNodeLabelingPort
} from "@lrnki/ports";
import { assembleEnrichmentNodes, type MintingAnchor } from "./enrichmentNodeMinting";
import type {
  GroundingAdmissionCandidate,
  GroundingAdmissionOutcome,
  SourceLessGroundingAdmission
} from "./sourceLessGroundingAdmission";

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

function admittedBundle(candidate: GroundingAdmissionCandidate): GeneratedGroundingBundle {
  const anchor = candidate.context.kind === "scaffolded_anchor" ? candidate.context.anchor : undefined;
  return {
    groundingOrigin: "llm_grounded",
    definitions: [{ passageType: "definition", text: `${candidate.canonicalLabel} explained.`, groundingOrigin: "llm_grounded", headingPath: [], locator: {}, verbatimCheck: { disposition: "not_applicable_by_grounding", rationale: "generated" } }],
    mentions: [],
    groundingAnchorReferences: anchor ? [anchor.reference] : [],
    generatingModel: "mock-gen",
    rationale: `scaffolds ${anchor?.canonicalLabel}`
  };
}

function admittedOutcome(candidate: GroundingAdmissionCandidate): GroundingAdmissionOutcome {
  return {
    candidateKey: candidate.candidateKey,
    disposition: "admitted",
    probe: { disposition: "core_knowledge", agreementScore: 1, rationale: "stable" },
    bundle: admittedBundle(candidate)
  };
}

function admissionWith(
  decide: (candidate: GroundingAdmissionCandidate) => GroundingAdmissionOutcome = admittedOutcome,
  batches: GroundingAdmissionCandidate[][] = []
): SourceLessGroundingAdmission {
  return {
    forOperation() {
      return {
        async admitBatch(candidates) {
          batches.push([...candidates]);
          return candidates.map(decide);
        }
      };
    }
  };
}

function recordingAdmission(labels: string[]): SourceLessGroundingAdmission {
  return admissionWith((candidate) => {
    labels.push(candidate.canonicalLabel);
    return admittedOutcome(candidate);
  });
}

const admission = admissionWith();
const acceptAllMintingJudge: MintingDurabilityJudgmentPort = {
  model: "kg-independent-judge",
  judge: async () => ({ verdict: "durable", rationale: "foundation" })
};

type AssemblyInput = Parameters<typeof assembleEnrichmentNodes>[0];

function assemble(
  input: Omit<AssemblyInput, "mintingDurabilityJudge"> & {
    mintingDurabilityJudge?: MintingDurabilityJudgmentPort;
  }
) {
  const { mintingDurabilityJudge = acceptAllMintingJudge, ...rest } = input;
  return assembleEnrichmentNodes({ ...rest, mintingDurabilityJudge });
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
  const { rescuedNodes } = await assemble({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [mention("Pointer", "run-1")],
    proposalPort: proposer({}),
    sourceLessGroundingAdmission: admission,
    newNodeId
  });
  assert.equal(rescuedNodes.length, 1);
  assert.equal(rescuedNodes[0].groundingOrigin, "source_mentioned");
  assert.equal(rescuedNodes[0].role, "prerequisite");
  assert.equal(rescuedNodes[0].groundingPassages[0].evidenceQuote, "Pointer is mentioned.");
});

test("an anchor yields llm_grounded minted nodes within the per-anchor cap", async () => {
  counter = 0;
  const { mintedNodes } = await assemble({
    anchors: [anchor("a", "Move Semantics")],
    rescueCandidates: [],
    proposalPort: proposer({ a: [
      { proposedLabel: "Stack allocation", rationale: "r" },
      { proposedLabel: "Heap allocation", rationale: "r" },
      { proposedLabel: "Pointers", rationale: "r" }
    ] }),
    sourceLessGroundingAdmission: admission,
    bounds: { maxMintedPerAnchor: 2, maxMintedPerRun: 12 },
    newNodeId
  });
  assert.equal(mintedNodes.length, 2, "per-anchor cap honored");
  assert.ok(mintedNodes.every((node) => node.groundingOrigin === "llm_grounded"));
  assert.ok(mintedNodes[0].groundingBundle.groundingAnchorReferences.includes("a"));
});

test("the per-run cap bounds total minting across anchors", async () => {
  counter = 0;
  const { mintedNodes } = await assemble({
    anchors: [anchor("a", "A"), anchor("b", "B"), anchor("c", "C")],
    rescueCandidates: [],
    proposalPort: proposer({
      a: [{ proposedLabel: "p1", rationale: "r" }, { proposedLabel: "p2", rationale: "r" }],
      b: [{ proposedLabel: "p3", rationale: "r" }, { proposedLabel: "p4", rationale: "r" }],
      c: [{ proposedLabel: "p5", rationale: "r" }, { proposedLabel: "p6", rationale: "r" }]
    }),
    sourceLessGroundingAdmission: admission,
    bounds: { maxMintedPerAnchor: 2, maxMintedPerRun: 3 },
    newNodeId
  });
  assert.equal(mintedNodes.length, 3, "per-run cap caps total minted nodes");
});

test("rescue dedupes a concept appearing in two member runs into one node", async () => {
  counter = 0;
  const { rescuedNodes } = await assemble({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [mention("Pointer", "run-1"), mention("Pointer", "run-2")],
    proposalPort: proposer({}),
    sourceLessGroundingAdmission: admission,
    newNodeId
  });
  assert.equal(rescuedNodes.length, 1, "the duplicate concept collapses to a single node");
  assert.equal(rescuedNodes[0].groundingPassages.length, 2, "both runs' mentions are merged onto the node");
});

test("a definition-bearing optional candidate is rescued with a definition + mention passage", async () => {
  counter = 0;
  const { rescuedNodes } = await assemble({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [definitionBearing("Heap allocation", "run-1")],
    proposalPort: proposer({}),
    sourceLessGroundingAdmission: admission,
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
  const admitted: string[] = [];
  const { rescuedNodes, mintedNodes } = await assemble({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [definitionBearing("Heap allocation", "run-1")],
    // The minter tries to regenerate the very concept already rescued with a real definition.
    proposalPort: proposer({ a: [{ proposedLabel: "Heap allocation", rationale: "r" }] }),
    sourceLessGroundingAdmission: recordingAdmission(admitted),
    newNodeId
  });
  assert.equal(rescuedNodes.length, 1, "the optional concept is rescued from its source definition");
  assert.equal(mintedNodes.length, 0, "and the minter does not regenerate it as an llm_grounded node");
  assert.deepEqual(admitted, [], "admission is never invoked for the rescued label");
});

test("two member runs of a definition-bearing concept merge definitions and mentions", async () => {
  counter = 0;
  const { rescuedNodes } = await assemble({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [definitionBearing("Heap allocation", "run-1"), definitionBearing("Heap allocation", "run-2")],
    proposalPort: proposer({}),
    sourceLessGroundingAdmission: admission,
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
  const { rescuedNodes, rescueDispositions } = await assemble({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [mention("Pointer", "run-1"), mention("Lifetime", "run-1")],
    proposalPort: proposer({}),
    sourceLessGroundingAdmission: admission,
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
  const { rescuedNodes, rescueDispositions } = await assemble({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [mention(sentence, "run-1")],
    proposalPort: proposer({}),
    sourceLessGroundingAdmission: admission,
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
  const { rescuedNodes, rescueDispositions } = await assemble({
    anchors: [anchor("a", "Ownership")],
    // The proposal normalizes to "ownership", already taken by the anchor.
    rescueCandidates: [mention(sentence, "run-1")],
    proposalPort: proposer({}),
    sourceLessGroundingAdmission: admission,
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
  const { rescuedNodes, mintedNodes } = await assemble({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [mention(sentence, "run-1")],
    // The proposer tries to mint the very concept label the rescued node adopted.
    proposalPort: proposer({ a: [{ proposedLabel: "Move semantics", rationale: "r" }] }),
    sourceLessGroundingAdmission: admission,
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
  const { rescuedNodes, mintedNodes } = await assemble({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [mention("Pointer", "run-1")],
    // The proposer tries to mint the very label the judge dropped.
    proposalPort: proposer({ a: [{ proposedLabel: "Pointer", rationale: "r" }] }),
    sourceLessGroundingAdmission: admission,
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
  await assemble({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [mention("Pointer", "run-1"), mention("Pointer", "run-2")],
    proposalPort: proposer({}),
    sourceLessGroundingAdmission: admission,
    rescueDurabilityJudge: recordingJudge,
    newNodeId
  });
  assert.equal(seenMentionCount, 2, "the judge saw both member runs' mentions on the merged node");
});

test("omitting the judge accepts every rescue candidate with no dispositions (opt-in)", async () => {
  counter = 0;
  const { rescuedNodes, rescueDispositions } = await assemble({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [mention("Pointer", "run-1")],
    proposalPort: proposer({}),
    sourceLessGroundingAdmission: admission,
    newNodeId
  });
  assert.equal(rescuedNodes.length, 1);
  assert.deepEqual(rescueDispositions, []);
});

test("an accept-all judge records accepted dispositions and keeps every node", async () => {
  counter = 0;
  const { rescuedNodes, rescueDispositions } = await assemble({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [mention("Pointer", "run-1")],
    proposalPort: proposer({}),
    sourceLessGroundingAdmission: admission,
    rescueDurabilityJudge: acceptAllJudge,
    newNodeId
  });
  assert.equal(rescuedNodes.length, 1);
  assert.equal(rescueDispositions[0].disposition, "accepted");
});

test("a proposal duplicating an anchor or rescued label is dropped", async () => {
  counter = 0;
  const { mintedNodes } = await assemble({
    anchors: [anchor("a", "Ownership")],
    rescueCandidates: [mention("Pointer", "run-1")],
    // The proposer (incorrectly) re-proposes both an anchor and a rescued label.
    proposalPort: proposer({ a: [{ proposedLabel: "Ownership", rationale: "r" }, { proposedLabel: "Pointer", rationale: "r" }] }),
    sourceLessGroundingAdmission: admission,
    newNodeId
  });
  assert.equal(mintedNodes.length, 0, "duplicates of existing node labels are not minted");
});

test("minting durability drops not_durable proposals before source-less admission", async () => {
  counter = 0;
  const admissionCalls: string[] = [];
  const judge: MintingDurabilityJudgmentPort = {
    model: "kg-independent-judge",
    judge: async (input) =>
      input.proposal.proposedLabel === "Incidental Label"
        ? { verdict: "not_durable", rationale: "tangential" }
        : { verdict: "durable", rationale: "foundation" }
  };
  const { mintedNodes, mintingDispositions } = await assemble({
    anchors: [anchor("a", "Borrowing")],
    rescueCandidates: [],
    proposalPort: proposer({ a: [
      { proposedLabel: "Incidental Label", rationale: "named in passing" },
      { proposedLabel: "Lifetime", rationale: "needed first" }
    ] }),
    sourceLessGroundingAdmission: recordingAdmission(admissionCalls),
    mintingDurabilityJudge: judge,
    newNodeId
  });
  assert.deepEqual(mintedNodes.map((node) => node.canonicalLabel), ["Lifetime"]);
  assert.deepEqual(admissionCalls, ["Lifetime"], "dropped proposal spent no admission call");
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
  const { mintedNodes, mintingDispositions } = await assemble({
    anchors: [anchor("a", "Borrowing")],
    rescueCandidates: [],
    proposalPort: proposer({ a: [{ proposedLabel: "Lifetime", rationale: "needed first" }] }),
    sourceLessGroundingAdmission: admission,
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
  const { mintedNodes, mintingDispositions } = await assemble({
    anchors: [anchor("a", "Borrowing"), anchor("b", "Move Semantics")],
    rescueCandidates: [],
    proposalPort: proposer({
      a: [{ proposedLabel: "RAII", rationale: "first anchor proposes it" }],
      b: [{ proposedLabel: "RAII", rationale: "later anchor genuinely needs it" }]
    }),
    sourceLessGroundingAdmission: admission,
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
  const { mintedNodes, mintingDispositions } = await assemble({
    anchors: [anchor("a", "Borrowing"), anchor("b", "Move Semantics")],
    rescueCandidates: [],
    proposalPort: proposer({
      a: [{ proposedLabel: "RAII", rationale: "first anchor proposes it" }],
      b: [{ proposedLabel: "RAII", rationale: "later anchor proposes it too" }]
    }),
    sourceLessGroundingAdmission: admission,
    mintingDurabilityJudge: judge,
    newNodeId
  });
  assert.deepEqual(mintedNodes.map((node) => node.canonicalLabel), []);
  assert.deepEqual(mintingDispositions.map((item) => item.disposition), ["dropped", "dropped"]);
});

test("durability settles before one source-less admission batch per anchor", async () => {
  counter = 0;
  const events: string[] = [];
  const batches: GroundingAdmissionCandidate[][] = [];
  const judge: MintingDurabilityJudgmentPort = {
    model: "kg-independent-judge",
    judge: async (input) => {
      events.push(`durability:${input.anchor.canonicalLabel}:${input.proposal.proposedLabel}`);
      return { verdict: "durable", rationale: "foundation" };
    }
  };
  const sourceLessGroundingAdmission = admissionWith((candidate) => {
    events.push(`admission:${candidate.context.kind === "scaffolded_anchor" ? candidate.context.anchor.reference : "none"}:${candidate.canonicalLabel}`);
    return admittedOutcome(candidate);
  }, batches);

  await assemble({
    anchors: [anchor("a", "Borrowing"), anchor("b", "Move Semantics")],
    rescueCandidates: [],
    proposalPort: proposer({
      a: [
        { proposedLabel: "Lifetime", rationale: "needed first" },
        { proposedLabel: "Reference", rationale: "needed first" }
      ],
      b: [{ proposedLabel: "Transfer", rationale: "needed first" }]
    }),
    sourceLessGroundingAdmission,
    mintingDurabilityJudge: judge,
    newNodeId
  });

  assert.deepEqual(
    batches.map((batch) => batch.map((candidate) => candidate.canonicalLabel)),
    [["Lifetime", "Reference"], ["Transfer"]],
    "each anchor crosses the admission seam once as a batch"
  );
  for (const anchorId of ["a", "b"]) {
    const firstAdmission = events.findIndex((event) => event.startsWith(`admission:${anchorId}:`));
    const lastDurability = events.findLastIndex((event) => event.startsWith(`durability:${anchorId === "a" ? "Borrowing" : "Move Semantics"}:`));
    assert.ok(lastDurability >= 0 && lastDurability < firstAdmission, `anchor ${anchorId} finished durability before admission`);
  }
});

test("held-out and rejected outcomes create no nodes and consume no minted-node budget", async () => {
  counter = 0;
  const proposedAnchors: string[] = [];
  const proposalPort: MissingPrerequisiteProposalPort = {
    model: "mock-proposer",
    async propose(input) {
      proposedAnchors.push(input.anchor.conceptId);
      return input.anchor.conceptId === "a"
        ? [
            { proposedLabel: "Boundary concept", rationale: "uncertain" },
            { proposedLabel: "False concept", rationale: "unsupported" }
          ]
        : [
            { proposedLabel: `${input.anchor.canonicalLabel} base one`, rationale: "needed" },
            { proposedLabel: `${input.anchor.canonicalLabel} base two`, rationale: "needed" }
          ];
    }
  };
  const sourceLessGroundingAdmission = admissionWith((candidate) => {
    if (candidate.canonicalLabel === "Boundary concept") {
      return {
        candidateKey: candidate.candidateKey,
        disposition: "held_out",
        reason: "knowledge_boundary",
        probe: { disposition: "boundary", agreementScore: 0.4, rationale: "unstable" }
      };
    }
    if (candidate.canonicalLabel === "False concept") {
      return {
        candidateKey: candidate.candidateKey,
        disposition: "rejected",
        reason: "grounding_verification_exhausted",
        probe: { disposition: "core_knowledge", agreementScore: 1, rationale: "known" },
        rationale: "claims rejected"
      };
    }
    return admittedOutcome(candidate);
  });

  const { mintedNodes, groundingAdmissionDispositions } = await assemble({
    anchors: [anchor("a", "A"), anchor("b", "B"), anchor("c", "C")],
    rescueCandidates: [],
    proposalPort,
    sourceLessGroundingAdmission,
    bounds: { maxMintedPerAnchor: 2, maxMintedPerRun: 2 },
    newNodeId
  });

  assert.deepEqual(mintedNodes.map((node) => node.canonicalLabel), ["B base one", "B base two"]);
  assert.deepEqual(proposedAnchors, ["a", "b"], "the two non-admissions left both run-budget slots available to the next anchor");
  assert.deepEqual(groundingAdmissionDispositions.map((item) => item.disposition), ["held_out", "rejected", "admitted", "admitted"]);
});

test("a knowledge-boundary holdout reserves its label for later same-domain anchors", async () => {
  counter = 0;
  let labelsSeenBySecondAnchor: readonly string[] = [];
  const batches: GroundingAdmissionCandidate[][] = [];
  const proposalPort: MissingPrerequisiteProposalPort = {
    model: "mock-proposer",
    async propose(input) {
      if (input.anchor.conceptId === "a") return [{ proposedLabel: "RAII", rationale: "uncertain" }];
      labelsSeenBySecondAnchor = input.existingNodeLabels;
      return [
        { proposedLabel: "RAII", rationale: "retry" },
        { proposedLabel: "Ownership model", rationale: "needed" }
      ];
    }
  };
  const sourceLessGroundingAdmission = admissionWith((candidate) =>
    candidate.canonicalLabel === "RAII"
      ? {
          candidateKey: candidate.candidateKey,
          disposition: "held_out",
          reason: "knowledge_boundary",
          probe: { disposition: "boundary", agreementScore: 0.4, rationale: "unstable" }
        }
      : admittedOutcome(candidate), batches);

  const { mintedNodes } = await assemble({
    anchors: [anchor("a", "Borrowing"), anchor("b", "Move Semantics")],
    rescueCandidates: [],
    proposalPort,
    sourceLessGroundingAdmission,
    newNodeId
  });

  assert.ok(labelsSeenBySecondAnchor.includes("RAII"), "the held-out label remains visible to the next proposal call");
  assert.deepEqual(batches.map((batch) => batch.map((candidate) => candidate.canonicalLabel)), [["RAII"], ["Ownership model"]]);
  assert.deepEqual(mintedNodes.map((node) => node.canonicalLabel), ["Ownership model"]);
});

test("an exhausted factual rejection releases its label for a later anchor", async () => {
  counter = 0;
  let labelsSeenBySecondAnchor: readonly string[] = [];
  const batches: GroundingAdmissionCandidate[][] = [];
  const proposalPort: MissingPrerequisiteProposalPort = {
    model: "mock-proposer",
    async propose(input) {
      if (input.anchor.conceptId === "b") labelsSeenBySecondAnchor = input.existingNodeLabels;
      return [{ proposedLabel: "RAII", rationale: "needed" }];
    }
  };
  const sourceLessGroundingAdmission = admissionWith((candidate) => {
    const anchorReference = candidate.context.kind === "scaffolded_anchor" ? candidate.context.anchor.reference : "";
    return anchorReference === "a"
      ? {
          candidateKey: candidate.candidateKey,
          disposition: "rejected",
          reason: "grounding_verification_exhausted",
          probe: { disposition: "core_knowledge", agreementScore: 1, rationale: "known" },
          rationale: "claims rejected"
        }
      : admittedOutcome(candidate);
  }, batches);

  const { mintedNodes, groundingAdmissionDispositions } = await assemble({
    anchors: [anchor("a", "Borrowing"), anchor("b", "Move Semantics")],
    rescueCandidates: [],
    proposalPort,
    sourceLessGroundingAdmission,
    newNodeId
  });

  assert.equal(labelsSeenBySecondAnchor.includes("RAII"), false, "the rejected label is absent from the next anchor's reservations");
  assert.equal(batches.length, 2, "the same label crosses admission independently for each anchor");
  assert.deepEqual(groundingAdmissionDispositions.map((item) => item.disposition), ["rejected", "admitted"]);
  assert.deepEqual(mintedNodes.map((node) => node.canonicalLabel), ["RAII"]);
});

test("durability and grounding admission produce separate inspectable dispositions", async () => {
  counter = 0;
  const judge: MintingDurabilityJudgmentPort = {
    model: "kg-independent-judge",
    judge: async (input) => ({
      verdict: input.proposal.proposedLabel === "Incidental" ? "not_durable" : "durable",
      rationale: "measured"
    })
  };
  const sourceLessGroundingAdmission = admissionWith((candidate) =>
    candidate.canonicalLabel === "Boundary"
      ? {
          candidateKey: candidate.candidateKey,
          disposition: "held_out",
          reason: "knowledge_boundary",
          probe: { disposition: "boundary", agreementScore: 0.4, rationale: "unstable" }
        }
      : admittedOutcome(candidate));

  const result = await assemble({
    anchors: [anchor("a", "Borrowing")],
    rescueCandidates: [],
    proposalPort: proposer({
      a: [
        { proposedLabel: "Incidental", rationale: "tangential" },
        { proposedLabel: "Boundary", rationale: "uncertain" },
        { proposedLabel: "Lifetime", rationale: "needed" }
      ]
    }),
    sourceLessGroundingAdmission,
    mintingDurabilityJudge: judge,
    bounds: { maxMintedPerAnchor: 3, maxMintedPerRun: 3 },
    newNodeId
  });

  assert.deepEqual(result.mintingDispositions.map((item) => [item.proposedLabel, item.disposition]), [
    ["Incidental", "dropped"],
    ["Boundary", "accepted"],
    ["Lifetime", "accepted"]
  ]);
  assert.deepEqual(result.groundingAdmissionDispositions.map((item) => [item.proposedLabel, item.disposition]), [
    ["Boundary", "held_out"],
    ["Lifetime", "admitted"]
  ]);
  assert.deepEqual(result.mintedNodes.map((node) => node.canonicalLabel), ["Lifetime"]);
});

test("an admission dependency failure aborts node assembly", async () => {
  counter = 0;
  const failingAdmission: SourceLessGroundingAdmission = {
    forOperation() {
      return {
        async admitBatch() {
          throw new Error("verification dependency unavailable");
        }
      };
    }
  };
  await assert.rejects(
    () => assemble({
      anchors: [anchor("a", "Borrowing")],
      rescueCandidates: [],
      proposalPort: proposer({ a: [{ proposedLabel: "Lifetime", rationale: "needed" }] }),
      sourceLessGroundingAdmission: failingAdmission,
      newNodeId
    }),
    /verification dependency unavailable/
  );
});

test("admission result-count and ordering mismatches fail closed", async (t) => {
  counter = 0;
  const input = {
    anchors: [anchor("a", "Borrowing")],
    rescueCandidates: [],
    proposalPort: proposer({
      a: [
        { proposedLabel: "Lifetime", rationale: "needed" },
        { proposedLabel: "Reference", rationale: "needed" }
      ]
    }),
    newNodeId
  };

  await t.test("result count", async () => {
    const wrongCount: SourceLessGroundingAdmission = {
      forOperation() {
        return { async admitBatch() { return []; } };
      }
    };
    await assert.rejects(
      () => assemble({ ...input, sourceLessGroundingAdmission: wrongCount }),
      /result-count mismatch/
    );
  });

  await t.test("result order", async () => {
    const wrongOrder: SourceLessGroundingAdmission = {
      forOperation() {
        return {
          async admitBatch(candidates) {
            return [...candidates].reverse().map(admittedOutcome);
          }
        };
      }
    };
    await assert.rejects(
      () => assemble({ ...input, sourceLessGroundingAdmission: wrongOrder }),
      /out-of-order prerequisite outcome/
    );
  });
});
