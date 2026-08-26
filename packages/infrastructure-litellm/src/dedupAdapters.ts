import type { NodeMergeAdjudication } from "@lrnki/domain-core";
import type { NodeEmbeddingPort, NodeMergeAdjudicationPort } from "@lrnki/ports";
import { LiteLlmEmbeddingClient } from "./LiteLlmEmbeddingClient";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { STAGE_TAGS } from "@lrnki/domain-core";
import { executeForcedToolStage, withModelOverride, type NeuralStageDescriptor } from "./forcedToolStage";
import { readPromptFile } from "./promptFile";
import {
  nodeMergeAdjudicationSchema,
  nodeMergeAdjudicationValidator,
  sourceMaterialClaimSupportSchema,
  sourceMaterialClaimSupportValidator
} from "./toolSchemas";

// Semantic-deduplication adapters (plan U1/U2, ADR-0012/0019). Two SEPARATE mechanisms
// per AGENTS rule 20: the embedding adapter only PROPOSES near-duplicate candidate pairs
// (recall), and the merge-adjudication adapter only DECIDES each proposed pair (precision).
// Raw cosine never merges; a separate cross-family LLM judge decides. Both route through
// LiteLLM (AGENTS rule 5) and never touch published Concept identity.

// Default embedding alias (wired in litellm/config.yaml → qwen3-embedding-8b). The
// propose-side signal for within-domain near-duplicate detection.
export const NODE_EMBEDDING_MODEL = "kg-node-embedding";
export const GENERATED_NODE_JUDGE_MODEL = "kg-generated-node-judge";

// Graph-layer identity is precision-first: the cheaper medium-reasoning semantic
// verifier sees every proposed pair, and an independent generated-node judge confirms
// only the irreversible `equivalent` outcome. Either model may keep a pair distinct;
// neither may merge alone. A transport/schema failure propagates to the application,
// whose dedup boundary already fails closed to no merge.
export const NODE_MERGE_CONSENSUS_POLICY = {
  proposal: "precision_verifier_first",
  directionalSupportDraws: 3,
  directionalSupport: "unanimous_supported_both_directions",
  confirmation: "independent_judge_on_equivalent_only",
  acceptance: "unanimous_equivalent",
  disagreement: "keep_distinct",
  unavailable: "keep_distinct"
} as const;

// Embedding propose adapter (U1). Returns one finite-number vector per derived-node text
// through the embedding transport, fail-closed on any shape mismatch (R13) so the dedup
// stage treats a malformed signal as UNAVAILABLE and skips dedup for that domain rather
// than proposing pairs from garbage. The vectors are inputs to within-domain cosine in
// the application stage; the adapter never decides similarity or merges.
export class LiteLlmNodeEmbeddingAdapter implements NodeEmbeddingPort {
  readonly model: string;
  constructor(private readonly client: LiteLlmEmbeddingClient, model: string = NODE_EMBEDDING_MODEL) {
    this.model = model;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const vectors = await this.client.embed({ model: this.model, texts, tags: [STAGE_TAGS.nodeEmbedding] });
    // Defensive re-assertion of the count invariant the client already enforces: a
    // vector must exist for every input text, or the propose step would mis-align nodes
    // to vectors. Throw so the caller fails closed (R13).
    if (vectors.length !== texts.length) {
      throw new Error(`node embedding: expected ${texts.length} vectors, got ${vectors.length}.`);
    }
    return vectors;
  }
}

type NodeMergeInput = {
  declaredDomain: string;
  a: { label: string; aliases: string[]; evidence: string[] };
  b: { label: string; aliases: string[]; evidence: string[] };
};

export const nodeMergeAdjudicationDescriptor: NeuralStageDescriptor<
  NodeMergeInput,
  NodeMergeAdjudication,
  NodeMergeAdjudication
> = {
  promptPath: "node-merge-adjudication.prompt",
  stageTag: STAGE_TAGS.nodeMergeAdjudication,
  schema: nodeMergeAdjudicationSchema,
  validator: nodeMergeAdjudicationValidator,
  sentinelInput: {
    declaredDomain: "sentinel domain",
    a: { label: "Sentinel A", aliases: [], evidence: ["A evidence."] },
    b: { label: "Sentinel B", aliases: [], evidence: ["B evidence."] }
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    conceptA: renderSide("Concept A", input.a),
    conceptB: renderSide("Concept B", input.b)
  }),
  mapResult: (result) => ({ relationship: result.relationship, rationale: result.rationale })
};

type NodeMergeDirectionalSupportInput = NodeMergeInput & {
  fromLabel: string;
  toLabel: string;
};

type NodeMergeDirectionalSupportResult = {
  disposition: "supported" | "unsupported" | "unclear";
  reason: string;
};

export const nodeMergeDirectionalSupportDescriptor: NeuralStageDescriptor<
  NodeMergeDirectionalSupportInput,
  NodeMergeDirectionalSupportResult,
  NodeMergeDirectionalSupportResult
> = {
  promptPath: "node-merge-directional-support.prompt",
  stageTag: STAGE_TAGS.nodeMergeAdjudication,
  schema: sourceMaterialClaimSupportSchema,
  validator: sourceMaterialClaimSupportValidator,
  maxRetries: 3,
  sentinelInput: {
    declaredDomain: "sentinel domain",
    a: { label: "Sentinel A", aliases: [], evidence: ["A sentinel A is a sentinel B."] },
    b: { label: "Sentinel B", aliases: [], evidence: ["A sentinel A is a sentinel B."] },
    fromLabel: "Sentinel A",
    toLabel: "Sentinel B"
  },
  templateData: (input) => ({
    declaredDomain: input.declaredDomain,
    fromLabel: input.fromLabel,
    toLabel: input.toLabel,
    conceptA: renderSide("Concept A", input.a),
    conceptB: renderSide("Concept B", input.b)
  }),
  mapResult: (result) => result
};

export function createNodeMergeAdjudicationPort(
  client: LiteLlmForcedToolClient,
  modelOverride?: string
): NodeMergeAdjudicationPort {
  const descriptor = withModelOverride(nodeMergeAdjudicationDescriptor, modelOverride);
  return {
    model: modelOverride ?? readPromptFile(nodeMergeAdjudicationDescriptor.promptPath).model,
    adjudicate: (input) => executeForcedToolStage(client, descriptor, input)
  };
}

export function createConsensusNodeMergeAdjudicationPort(
  client: LiteLlmForcedToolClient,
  confirmationModel: string = GENERATED_NODE_JUDGE_MODEL
): NodeMergeAdjudicationPort {
  const verifier = createNodeMergeAdjudicationPort(client);
  const directionalSupport = {
    model: readPromptFile(nodeMergeDirectionalSupportDescriptor.promptPath).model,
    verify: (input: NodeMergeDirectionalSupportInput) =>
      executeForcedToolStage(client, nodeMergeDirectionalSupportDescriptor, input)
  };
  const confirmer = createNodeMergeAdjudicationPort(client, confirmationModel);
  return {
    model: `${verifier.model} + bidirectional ${directionalSupport.model} + ${confirmer.model}`,
    adjudicate: async (input) => {
      const proposal = await verifier.adjudicate(input);
      if (proposal.relationship !== "equivalent") {
        return {
          relationship: proposal.relationship,
          rationale: `Precision verifier kept the identities distinct: ${proposal.rationale}`
        };
      }

      for (const [fromLabel, toLabel] of [
        [input.a.label, input.b.label],
        [input.b.label, input.a.label]
      ] as const) {
        for (let draw = 0; draw < NODE_MERGE_CONSENSUS_POLICY.directionalSupportDraws; draw += 1) {
          const support = await directionalSupport.verify({ ...input, fromLabel, toLabel });
          if (support.disposition !== "supported") {
            return {
              relationship: "unrelated_or_unclear",
              rationale: `Identity refused: directional substitution ${JSON.stringify(fromLabel)} -> ${JSON.stringify(toLabel)} returned ${support.disposition} on draw ${draw + 1}/${NODE_MERGE_CONSENSUS_POLICY.directionalSupportDraws}: ${support.reason}`
            };
          }
        }
      }

      const confirmation = await confirmer.adjudicate(input);
      if (confirmation.relationship !== "equivalent") {
        return {
          relationship: confirmation.relationship,
          rationale: `Precision verifier proposed equivalence; independent confirmer kept the identities distinct as ${confirmation.relationship}: ${confirmation.rationale}`
        };
      }

      return {
        relationship: "equivalent",
        rationale: `Unanimous equivalence. Precision verifier: ${proposal.rationale} Independent confirmer: ${confirmation.rationale}`
      };
    }
  };
}

function renderSide(role: string, side: { label: string; aliases: string[]; evidence: string[] }): string {
  return [
    `${role}: "${side.label}"${side.aliases.length ? ` (aka ${side.aliases.map((alias) => `"${alias}"`).join(", ")})` : ""}.`,
    "  Evidence:",
    ...(side.evidence.length ? side.evidence.map((quote, index) => `    [${index + 1}] "${quote}"`) : ["    (none)"])
  ].join("\n");
}
