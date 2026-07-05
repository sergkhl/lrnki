import { STAGE_TAGS } from "@lrnki/domain-core";
import type { DeclaredDomainInferencePort } from "@lrnki/ports";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { declaredDomainInferenceSchema, declaredDomainInferenceValidator } from "./toolSchemas";

export const DECLARED_DOMAIN_INFERENCE_MODEL = "kg-domain-inference";

export const DECLARED_DOMAIN_INFERENCE_SYSTEM_PROMPT = [
  "You infer a concise Declared Domain for a learner's topic.",
  "Return a short field-of-study label that would help scope a learner-neutral concept graph.",
  "Prefer established academic, professional, technical, or practical fields over vague categories.",
  "Do not include explanations, learning advice, curriculum plans, or topic restatements.",
  "When the topic spans fields, choose the most useful primary field for organizing concepts."
].join("\n");

export class LiteLlmDeclaredDomainInferenceAdapter implements DeclaredDomainInferencePort {
  readonly model: string;

  constructor(private readonly client: LiteLlmForcedToolClient, model: string = DECLARED_DOMAIN_INFERENCE_MODEL) {
    this.model = model;
  }

  async infer(input: { topic: string }): Promise<{ declaredDomain: string }> {
    const topic = input.topic.trim();
    const result = await this.client.call({
      model: this.model,
      messages: [
        { role: "system", content: DECLARED_DOMAIN_INFERENCE_SYSTEM_PROMPT },
        { role: "user", content: `Learner topic:\n${topic}\n\nCall submit_declared_domain with the best Declared Domain.` }
      ],
      toolName: "submit_declared_domain",
      toolDescription: "Submit a concise Declared Domain inferred from one learner topic.",
      parameters: declaredDomainInferenceSchema,
      validator: declaredDomainInferenceValidator,
      tags: [STAGE_TAGS.declaredDomainInference]
    });

    return { declaredDomain: result.declaredDomain };
  }
}
