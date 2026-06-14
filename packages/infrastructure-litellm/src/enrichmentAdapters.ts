import type { PrerequisiteJudgment, SourceBlock } from "@lrnki/domain-core";
import type { EmbeddingPort, PrerequisiteJudgmentPort } from "@lrnki/ports";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { prerequisiteJudgmentSchema, prerequisiteJudgmentValidator } from "./toolSchemas";

// LiteLLM aliases for the third operation (Graph Enrichment, ADR-0019). The
// embedding tier is propose-only contextual clustering (ADR-0012); the judge is
// the bounded prerequisite proposer. Both go through LiteLLM, never a raw provider.
export const EMBEDDING_MODEL = "kg-concept-embedding";
export const PREREQUISITE_JUDGE_MODEL = "kg-prerequisite-judgment";

type LiteLlmEmbeddingResponse = {
  data?: Array<{ embedding?: number[]; index?: number }>;
};

// Contextual-embedding adapter (ADR-0012 tier 2). Embeds concept definition +
// evidence text via LiteLLM's OpenAI-compatible /v1/embeddings surface. Output is
// used ONLY to cluster/gate prerequisite pairs — never to merge concepts. Returns
// vectors aligned to the input order (re-sorted by `index` defensively).
export class LiteLlmEmbeddingAdapter implements EmbeddingPort {
  readonly model: string;
  constructor(
    private readonly options: { baseUrl: string; apiKey: string; timeoutMs: number },
    model: string = EMBEDDING_MODEL
  ) {
    this.model = model;
  }

  async embed(input: { texts: string[] }): Promise<number[][]> {
    if (input.texts.length === 0) return [];
    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, "")}/v1/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.options.apiKey}` },
      signal: AbortSignal.timeout(this.options.timeoutMs),
      body: JSON.stringify({ model: this.model, input: input.texts })
    });
    if (!response.ok) throw new Error(`LiteLLM embedding request failed with ${response.status}.`);
    const payload = (await response.json()) as LiteLlmEmbeddingResponse;
    const data = payload.data ?? [];
    if (data.length !== input.texts.length) {
      throw new Error(`Embedding count mismatch: expected ${input.texts.length}, got ${data.length}.`);
    }
    // Re-order by index so vectors line up with the request even if the provider reorders.
    const ordered = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return ordered.map((item, position) => {
      const vector = item.embedding;
      if (!vector || vector.length === 0) throw new Error(`Empty embedding vector at position ${position}.`);
      return vector;
    });
  }
}

function renderEvidence(blocks: SourceBlock[]): string {
  if (blocks.length === 0) return "(no source evidence available for either concept)";
  return blocks.map((block, index) => `[${index + 1}] "${block.text}"`).join("\n");
}

// Bounded prerequisite-judgment adapter (ADR-0019). Forced named tool schema; the
// model returns a DIRECTION between the two named concepts (or none/uncertain),
// and this adapter maps it to a typed PrerequisiteJudgment fail-closed. The judge
// proposes; deterministic cycle removal + transitive reduction dispose downstream.
export class LiteLlmPrerequisiteJudgmentAdapter implements PrerequisiteJudgmentPort {
  readonly model: string;
  constructor(private readonly client: LiteLlmForcedToolClient, model: string = PREREQUISITE_JUDGE_MODEL) {
    this.model = model;
  }

  async judge(input: {
    declaredDomain: string;
    a: { conceptId: string; canonicalLabel: string; definition?: string };
    b: { conceptId: string; canonicalLabel: string; definition?: string };
    evidencePacket: SourceBlock[];
  }): Promise<PrerequisiteJudgment> {
    const system = [
      "You judge LEARNING PREREQUISITE order between two domain concepts for a learner-neutral concept graph.",
      "Concept X is a prerequisite of concept Y when a learner must understand X before they can understand Y.",
      "Decide the direction from the concepts' meanings and the cited source evidence ONLY. Do not invent relations the evidence and meanings do not support.",
      "Be conservative and precision-first:",
      "- Return 'none' when neither concept must be understood before the other (they are siblings, alternatives, or merely related).",
      "- Return 'uncertain' when a prerequisite relation is plausible but the direction is not clearly established. 'uncertain' is flagged for human review and excluded from learner paths, so prefer it over guessing a direction.",
      "- Only return a direction ('a-is-prerequisite-of-b' or 'b-is-prerequisite-of-a') when the dependency is clear.",
      "Prerequisite is about conceptual dependency for learning, not temporal order in a process and not part-whole membership alone.",
      "Set confidence honestly in [0,1]; reserve high confidence for clearly-established directions."
    ].join("\n");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Concept A: "${input.a.canonicalLabel}"${input.a.definition ? ` — defined as: "${input.a.definition}"` : ""}.`,
      `Concept B: "${input.b.canonicalLabel}"${input.b.definition ? ` — defined as: "${input.b.definition}"` : ""}.`,
      "",
      "Source evidence (verbatim quotes about A and/or B):",
      renderEvidence(input.evidencePacket),
      "",
      "Call submit_prerequisite_judgment with the prerequisite direction between A and B."
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_prerequisite_judgment",
      toolDescription: "Submit the learning-prerequisite direction between concept A and concept B.",
      parameters: prerequisiteJudgmentSchema,
      validator: prerequisiteJudgmentValidator
    });

    // Map the model's A/B direction onto the typed judgment. For 'none'/'uncertain'
    // the prerequisite/dependent ids are nominal (a->b); the application drops
    // 'none' and keeps 'uncertain' flagged and out of the traversable DAG.
    const directed = result.outcome === "a-is-prerequisite-of-b" || result.outcome === "b-is-prerequisite-of-a";
    const prerequisiteFirst = result.outcome !== "b-is-prerequisite-of-a";
    return {
      prerequisiteConceptId: prerequisiteFirst ? input.a.conceptId : input.b.conceptId,
      dependentConceptId: prerequisiteFirst ? input.b.conceptId : input.a.conceptId,
      outcome: directed ? "directed" : result.outcome === "uncertain" ? "uncertain" : "none",
      confidence: result.confidence,
      rationale: result.rationale
    };
  }
}
