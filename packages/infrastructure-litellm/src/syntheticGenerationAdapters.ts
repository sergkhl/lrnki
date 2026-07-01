import type { KnowledgeBoundaryProbeAnswer, SynthesizedConcept } from "@lrnki/domain-core";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type { ConceptSetSynthesisPort, KnowledgeBoundaryProbePort } from "@lrnki/ports";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import {
  conceptSetSynthesisSchema,
  conceptSetSynthesisValidator,
  knowledgeBoundaryProbeSchema,
  knowledgeBoundaryProbeValidator
} from "./toolSchemas";

// LiteLLM aliases (litellm/config.yaml router model_group_alias). Concept-set synthesis
// is the source-less analog of Candidate Discovery, so it stays DeepSeek-family like the
// rest of the generator stack (AGENTS rule 5). The knowledge-boundary probe is a
// dedicated SMALL cross-family alias, independent of the synthesizer (KTD4), so its
// K-sampled dispersion is a genuine second opinion rather than the synthesizer grading
// its own knowledge.
export const CONCEPT_SYNTHESIS_MODEL = "kg-concept-synthesis";
export const KNOWLEDGE_BOUNDARY_PROBE_MODEL = "kg-knowledge-boundary-probe";

export class LiteLlmConceptSetSynthesisAdapter implements ConceptSetSynthesisPort {
  readonly model: string;
  constructor(private readonly client: LiteLlmForcedToolClient, model: string = CONCEPT_SYNTHESIS_MODEL) {
    this.model = model;
  }

  async synthesize(input: { topic: string; declaredDomain: string }): Promise<SynthesizedConcept[]> {
    const system = [
      "You generate a bounded concept set for a learner-neutral concept graph from a topic and its Declared Domain, using only your own parametric knowledge — there is no source document.",
      "Surface the durable, independently-teachable concepts a learner would need to understand the topic within the Declared Domain: its central ideas, mechanisms, methods, structures, and distinctions.",
      "Name CONCEPTS (noun phrases), never propositions or full claims. Each concept is a unit a learner could study and be assessed on in its own right.",
      "Keep the set focused and non-redundant: prefer a small sufficient set that spans the topic's principal structure over an exhaustive enumeration. Do not decompose one idea into vocabulary-sized fragments.",
      "Stay within the Declared Domain. Do not introduce unrelated breadth or off-domain illustrative material."
    ].join(" ");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Topic: "${input.topic}".`,
      "",
      "Call submit_synthesized_concepts with the concept set, each with a stable conceptKey, a precise canonical label, and any exact aliases."
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_synthesized_concepts",
      toolDescription: "Submit the bounded set of durable, independently-teachable concepts for the topic.",
      parameters: conceptSetSynthesisSchema,
      validator: conceptSetSynthesisValidator,
      tags: [STAGE_TAGS.conceptSetSynthesis]
    });
    return result.concepts;
  }
}

export class LiteLlmKnowledgeBoundaryProbeAdapter implements KnowledgeBoundaryProbePort {
  readonly model: string;
  // The moderate probe temperature is a property of the injected client (constructed by
  // the worker), NOT this adapter: the adapter renders one pointed factual question and
  // returns one answer. The application drives K draws over the SAME input to expose
  // knowledge-boundary dispersion (U3, KTD4).
  constructor(private readonly client: LiteLlmForcedToolClient, model: string = KNOWLEDGE_BOUNDARY_PROBE_MODEL) {
    this.model = model;
  }

  async probe(input: { conceptLabel: string; declaredDomain: string }): Promise<KnowledgeBoundaryProbeAnswer> {
    const system = [
      "You answer a pointed factual question about a single concept in a Declared Domain, using only what you actually know.",
      "State the concept's core meaning and the one or two facts most central to it, in concise self-contained prose.",
      "Do not hedge, speculate, or add meta-commentary about your confidence; if you are unsure, answer as directly as you can with what you know."
    ].join(" ");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Concept: "${input.conceptLabel}".`,
      "",
      "Call submit_knowledge_boundary_answer with a single factual characterization of the concept."
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_knowledge_boundary_answer",
      toolDescription: "Submit a single factual characterization of the concept as understood in the Declared Domain.",
      parameters: knowledgeBoundaryProbeSchema,
      validator: knowledgeBoundaryProbeValidator,
      tags: [STAGE_TAGS.knowledgeBoundaryProbe]
    });
    return { answer: result.answer };
  }
}
