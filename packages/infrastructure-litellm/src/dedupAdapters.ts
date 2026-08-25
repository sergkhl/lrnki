import type { NodeMergeAdjudication } from "@lrnki/domain-core";
import type { NodeEmbeddingPort, NodeMergeAdjudicationPort } from "@lrnki/ports";
import { LiteLlmEmbeddingClient } from "./LiteLlmEmbeddingClient";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { STAGE_TAGS } from "@lrnki/domain-core";
import { executeForcedToolStage, withModelOverride, type NeuralStageDescriptor } from "./forcedToolStage";
import { readPromptFile } from "./promptFile";
import { nodeMergeAdjudicationSchema, nodeMergeAdjudicationValidator } from "./toolSchemas";

// Semantic-deduplication adapters (plan U1/U2, ADR-0012/0019). Two SEPARATE mechanisms
// per AGENTS rule 20: the embedding adapter only PROPOSES near-duplicate candidate pairs
// (recall), and the merge-adjudication adapter only DECIDES each proposed pair (precision).
// Raw cosine never merges; a separate cross-family LLM judge decides. Both route through
// LiteLLM (AGENTS rule 5) and never touch published Concept identity.

// Default embedding alias (wired in litellm/config.yaml → qwen3-embedding-8b). The
// propose-side signal for within-domain near-duplicate detection.
export const NODE_EMBEDDING_MODEL = "kg-node-embedding";
export const GENERATED_NODE_JUDGE_MODEL = "kg-generated-node-judge";

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

function renderSide(role: string, side: { label: string; aliases: string[]; evidence: string[] }): string {
  return [
    `${role}: "${side.label}"${side.aliases.length ? ` (aka ${side.aliases.map((alias) => `"${alias}"`).join(", ")})` : ""}.`,
    "  Evidence:",
    ...(side.evidence.length ? side.evidence.map((quote, index) => `    [${index + 1}] "${quote}"`) : ["    (none)"])
  ].join("\n");
}
