import type { LearnerAnswerSimulatorPort } from "@lrnki/ports";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { STAGE_TAGS } from "@lrnki/domain-core";
import { EVIDENCE_PROFILE_MODEL } from "./extractionAdapters";
import { learnerAnswerSimulationSchema, learnerAnswerSimulationValidator } from "./toolSchemas";

// The learner simulator stays DeepSeek-family (AGENTS rule 5). Its output is graded
// by the cross-family judge (U5), so the synthetic measurement path exercises the
// true grading pipeline rather than a stub (R14). EXPERIMENT_ONLY scaffolding.
export const LEARNER_SIMULATOR_MODEL = EVIDENCE_PROFILE_MODEL;

export class LiteLlmLearnerSimulatorAdapter implements LearnerAnswerSimulatorPort {
  readonly model: string;

  constructor(private readonly client: LiteLlmForcedToolClient, model: string = LEARNER_SIMULATOR_MODEL) {
    this.model = model;
  }

  async simulateAnswer(input: {
    declaredDomain: string;
    question: string;
    competence: "strong" | "weak";
  }): Promise<{ answer: string }> {
    const persona = input.competence === "strong"
      ? "a learner who understands this topic well and answers accurately and completely"
      : "a learner who is still struggling with this topic and answers partially, vaguely, or with a notable gap";
    const system = [
      "You role-play a learner answering a recall question from memory.",
      `Answer as ${persona}.`,
      "Do not look anything up and do not state that you are unsure of the format — just give the answer the persona would write.",
      "Keep it to a few sentences."
    ].join(" ");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Question: ${input.question}`,
      "",
      "Call submit_simulated_answer with the learner's written answer."
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_simulated_answer",
      toolDescription: "Submit a simulated learner's written answer to one recall question.",
      parameters: learnerAnswerSimulationSchema,
      validator: learnerAnswerSimulationValidator,
      tags: [STAGE_TAGS.learnerSimulation]
    });
    return { answer: result.answer };
  }
}
