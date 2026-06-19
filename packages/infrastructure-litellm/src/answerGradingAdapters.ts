import type { JudgedOutcome } from "@lrnki/domain-core";
import type { AnswerGradingJudgePort } from "@lrnki/ports";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { answerGradingSchema, answerGradingValidator } from "./toolSchemas";

// Cross-family grading judge (ADR-0023): the card answer-keys are generated
// DeepSeek-family (U2), so the judge that grades a learner answer against the key
// must NOT be the generator grading its own homework — it runs on the independent
// `kg-independent-judge` alias, mirroring every other judge port.
export const ANSWER_GRADING_JUDGE_MODEL = "kg-independent-judge";

export const ANSWER_GRADING_SYSTEM_PROMPT = [
  "You grade a learner's free-form written answer against a provided answer-key for one recall question.",
  "Judge whether the learner's answer captures the essential meaning of the answer-key, not whether the wording matches.",
  "Mark 'correct' when the essential content is present, 'partial' when on-topic but incomplete or with a notable error, and 'incorrect' when it misses or contradicts the key.",
  "Do not reward fluent but empty answers, and do not penalize correct answers for using different words.",
  "Set score in [0,1] consistent with the outcome and give a terse rationale."
].join("\n");

export class LiteLlmAnswerGradingJudgeAdapter implements AnswerGradingJudgePort {
  readonly model: string;

  constructor(private readonly client: LiteLlmForcedToolClient, model: string = ANSWER_GRADING_JUDGE_MODEL) {
    this.model = model;
  }

  async grade(input: {
    declaredDomain: string;
    question: string;
    answerKey: string;
    submittedAnswer: string;
  }): Promise<{ outcome: JudgedOutcome; score: number; rationale: string }> {
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Question: ${input.question}`,
      `Answer-key: ${input.answerKey}`,
      `Learner's answer: ${input.submittedAnswer}`,
      "",
      "Call submit_answer_grade with the outcome, a [0,1] score, and a terse rationale."
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: ANSWER_GRADING_SYSTEM_PROMPT }, { role: "user", content: user }],
      toolName: "submit_answer_grade",
      toolDescription: "Grade one free-form learner answer against the provided answer-key.",
      parameters: answerGradingSchema,
      validator: answerGradingValidator
    });

    return { outcome: result.outcome, score: result.score, rationale: result.rationale };
  }
}
