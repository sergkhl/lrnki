import type { NodeMergeAdjudication } from "@lrnki/domain-core";
import type { NodeEmbeddingPort, NodeMergeAdjudicationPort } from "@lrnki/ports";
import { LiteLlmEmbeddingClient } from "./LiteLlmEmbeddingClient";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { STAGE_TAGS } from "./stageTags";
import { nodeMergeAdjudicationSchema, nodeMergeAdjudicationValidator } from "./toolSchemas";

// Semantic-deduplication adapters (plan U1/U2, ADR-0012/0019). Two SEPARATE mechanisms
// per AGENTS rule 20: the embedding adapter only PROPOSES near-duplicate candidate pairs
// (recall), and the merge-adjudication adapter only DECIDES each proposed pair (precision).
// Raw cosine never merges; a separate cross-family LLM judge decides. Both route through
// LiteLLM (AGENTS rule 5) and never touch published Concept identity.

// Default embedding alias (wired in litellm/config.yaml → qwen3-embedding-8b). The
// propose-side signal for within-domain near-duplicate detection.
export const NODE_EMBEDDING_MODEL = "kg-node-embedding";

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

// Cross-family merge adjudicator (U2). Reuses the independent `kg-independent-judge`
// alias (gpt-oss-120b) so the DeepSeek extraction family never decides its own merges
// — the same cross-family discipline as the rescue-durability and admission-label
// judges. Goes through LiteLLM, never a raw provider.
export const NODE_MERGE_ADJUDICATION_MODEL = "kg-independent-judge";

// Merge-adjudication DECISION adapter (U2). A thin forced-tool caller: it presents both
// candidates SYMMETRICALLY (neither side privileged, A/B labels carry no ranking) with
// label + aliases + bounded verbatim evidence, validates the tool arguments, and returns
// the typed decision. It owns NO fail-closed policy: a transport/validation failure
// throws and the application dedup stage (U3) treats the pair as keep_distinct, exactly
// as applyRescueDurabilityJudge owns the fail-open grounding decision for its judge.
export class LiteLlmNodeMergeAdjudicationAdapter implements NodeMergeAdjudicationPort {
  readonly model: string;
  constructor(private readonly client: LiteLlmForcedToolClient, model: string = NODE_MERGE_ADJUDICATION_MODEL) {
    this.model = model;
  }

  async adjudicate(input: {
    declaredDomain: string;
    a: { label: string; aliases: string[]; evidence: string[] };
    b: { label: string; aliases: string[]; evidence: string[] };
  }): Promise<NodeMergeAdjudication> {
    const system = [
      "You decide whether two candidate labels from the SAME domain name the SAME underlying concept, for a learner-neutral concept graph.",
      "Two surface forms of one concept (a singular/possessive/abbreviated variant, or a paraphrase a learner would NOT study as a separate idea) should MERGE. Two genuinely distinct concepts — even closely related ones (a concept and a specialization of it, a part and its whole, two siblings, a general idea and one mechanism within it) — should stay KEEP_DISTINCT.",
      "Decide from the concepts' MEANING and the cited evidence ONLY, never from surface wordform overlap. The two are presented as A and B with NEITHER privileged; the A/B labeling carries no ranking and must not influence the decision.",
      "Precision-first: merging fuses two ideas in a learner's graph, so return 'merge' only on a clear judgment that they are one concept; when genuinely unsure, return 'keep_distinct'."
    ].join("\n");
    const renderSide = (role: string, side: { label: string; aliases: string[]; evidence: string[] }): string =>
      [
        `${role}: "${side.label}"${side.aliases.length ? ` (aka ${side.aliases.map((alias) => `"${alias}"`).join(", ")})` : ""}.`,
        "  Evidence:",
        ...(side.evidence.length ? side.evidence.map((quote, index) => `    [${index + 1}] "${quote}"`) : ["    (none)"])
      ].join("\n");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      "",
      renderSide("Concept A", input.a),
      "",
      renderSide("Concept B", input.b),
      "",
      "Call submit_node_merge_decision: are Concept A and Concept B the same domain concept (merge) or genuinely distinct (keep_distinct)?"
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_node_merge_decision",
      toolDescription: "Submit whether the two same-domain candidate concepts are one concept (merge) or distinct (keep_distinct).",
      parameters: nodeMergeAdjudicationSchema,
      validator: nodeMergeAdjudicationValidator,
      tags: [STAGE_TAGS.nodeMergeAdjudication]
    });

    return { decision: result.decision, rationale: result.rationale };
  }
}
