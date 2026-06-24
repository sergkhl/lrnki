import type { DifficultyNodeContext } from "@lrnki/domain-core";
import type { IntrinsicDifficultyJudgmentPort } from "@lrnki/ports";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { STAGE_TAGS } from "./stageTags";
import { intrinsicDifficultySchema, intrinsicDifficultyValidator } from "./toolSchemas";

export const INTRINSIC_DIFFICULTY_JUDGE_MODEL = "kg-independent-judge";

export const INTRINSIC_DIFFICULTY_SYSTEM_PROMPT = [
  "You judge learner-neutral intrinsic difficulty for one concept in a concept graph.",
  "Use only generic difficulty factors: abstraction level, technical density, implied background or prerequisite load, and whether the evidence requires integrating multiple ideas.",
  "Do not score popularity, document order, learner preference, or whether the concept happens to be central in the source.",
  "Use lower scores for concrete concepts explained directly by the evidence; use higher scores for abstract, dense, prerequisite-heavy concepts.",
  "Set neuralScore honestly in [0,1] and provide a terse rationale grounded in the provided evidence."
].join("\n");

export class LiteLlmIntrinsicDifficultyJudgmentAdapter implements IntrinsicDifficultyJudgmentPort {
  readonly model: string;

  constructor(private readonly client: LiteLlmForcedToolClient, model: string = INTRINSIC_DIFFICULTY_JUDGE_MODEL) {
    this.model = model;
  }

  async judge(input: DifficultyNodeContext): Promise<{ neuralScore: number; rationale: string }> {
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Concept: "${input.canonicalLabel}"${input.aliases.length ? ` (aka ${input.aliases.map((a) => `"${a}"`).join(", ")})` : ""}.`,
      `Grounding origin: ${input.groundingOrigin}.`,
      "Definitions:",
      ...renderQuotes(input.definitions),
      "Mentions:",
      ...renderQuotes(input.mentions),
      "",
      "Call submit_intrinsic_difficulty with the intrinsic difficulty subscore and rationale."
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: INTRINSIC_DIFFICULTY_SYSTEM_PROMPT }, { role: "user", content: user }],
      toolName: "submit_intrinsic_difficulty",
      toolDescription: "Submit a learner-neutral intrinsic difficulty judgment for one concept.",
      parameters: intrinsicDifficultySchema,
      validator: intrinsicDifficultyValidator,
      tags: [STAGE_TAGS.intrinsicDifficulty]
    });

    return { neuralScore: result.neuralScore, rationale: result.rationale };
  }
}

function renderQuotes(quotes: string[]): string[] {
  return quotes.length ? quotes.map((quote, index) => `  [${index + 1}] "${quote}"`) : ["  (none)"];
}
