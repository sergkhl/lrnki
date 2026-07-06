import type { DifficultyBandEntry, DifficultyNodeContext } from "@lrnki/domain-core";
import type { IntrinsicDifficultyJudgmentPort } from "@lrnki/ports";
import { renderConcept } from "./enrichmentAdapters";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { STAGE_TAGS } from "@lrnki/domain-core";
import { buildDifficultyBandsSchema, buildDifficultyBandsValidator, difficultyComparisonSchema, difficultyComparisonValidator } from "./toolSchemas";

export const INTRINSIC_DIFFICULTY_JUDGE_MODEL = "kg-independent-judge";

// Comparative banded difficulty (ADR-0024). ONE call bands EVERY concept of a Declared
// Domain 1–5 RELATIVE to that set. The relative-to-set frame is the fix for pointwise
// scale-use bias: with no reference frame, an abstract-SOUNDING label scores high on an
// absolute scale regardless of its evidence. Rubric factors stay generic (AGENTS rule 17).
export const DIFFICULTY_BANDING_SYSTEM_PROMPT = [
  "You band a set of domain concepts by learner-neutral intrinsic difficulty for a concept graph.",
  "You are given ALL concepts from one domain. Assign every concept a band from 1 to 5 RELATIVE TO THIS SET: 1 = the most accessible concepts of the set, 5 = the most demanding. Compare the concepts against each other, not against an absolute scale.",
  "Use only generic difficulty factors: abstraction level, technical density, implied background or prerequisite load, and how much the evidence requires integrating multiple ideas.",
  "Band each concept from the evidence shown for it. A label's abstract or broad-sounding phrasing is NOT evidence of difficulty: a concept whose evidence explains it directly and concretely belongs in a low band no matter how abstract its name sounds, and thin evidence never justifies a high band by itself.",
  "Do not band popularity, document order, learner preference, or whether the concept happens to be central in the source.",
  "Each concept is shown with a 1-based number (\"Concept 1\", \"Concept 2\", ...). Band every listed number exactly once, and give each a terse rationale grounded in its shown evidence."
].join("\n");

// Bounded pairwise calibration for a CONTESTED band: one "which is harder" judgment
// between the contested concept and an uncontested anchor. The bracket placement
// (which anchors, when to stop) lives in the application, never here.
export const DIFFICULTY_COMPARISON_SYSTEM_PROMPT = [
  "You compare two domain concepts by learner-neutral intrinsic difficulty for a concept graph.",
  "Decide which of the two concepts is harder for a learner to master, using only generic difficulty factors: abstraction level, technical density, implied background or prerequisite load, and how much the evidence requires integrating multiple ideas.",
  "Judge from each concept's shown evidence. A label's abstract or broad-sounding phrasing is NOT evidence of difficulty.",
  "Do not judge popularity, document order, learner preference, or source centrality."
].join("\n");

export class LiteLlmIntrinsicDifficultyJudgmentAdapter implements IntrinsicDifficultyJudgmentPort {
  readonly model: string;

  constructor(private readonly client: LiteLlmForcedToolClient, model: string = INTRINSIC_DIFFICULTY_JUDGE_MODEL) {
    this.model = model;
  }

  // ONE banding draw over a whole Declared Domain set. The application K-samples this
  // call and owns consensus; this adapter is a thin LLM caller: it renders the numbered
  // node menu, validates exact coverage fail-closed (every listed number exactly once,
  // band in 1..5) with bounded corrective re-prompts, and returns the number-cited entries.
  // Number → derivedNodeId mapping by position lives in the application (rule 6).
  async bandDomainSet(input: { declaredDomain: string; nodes: DifficultyNodeContext[] }): Promise<DifficultyBandEntry[]> {
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      "",
      "Concepts to band:",
      ...input.nodes.map((node, index) => ["", renderNode(`Concept ${index + 1}`, node)].join("\n")),
      "",
      "Call submit_difficulty_bands with one band per listed concept, each cited by its listed number. Band 1–5 relative to this set, from each concept's shown evidence."
    ].join("\n");

    const n = input.nodes.length;
    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: DIFFICULTY_BANDING_SYSTEM_PROMPT }, { role: "user", content: user }],
      toolName: "submit_difficulty_bands",
      toolDescription: "Submit one relative intrinsic-difficulty band (1-5) per listed domain concept.",
      parameters: buildDifficultyBandsSchema(n),
      validator: buildDifficultyBandsValidator(n),
      tags: [STAGE_TAGS.intrinsicDifficulty],
      maxRetries: 2
    });

    return result.bands;
  }

  async compareHarder(input: { declaredDomain: string; first: DifficultyNodeContext; second: DifficultyNodeContext }): Promise<{ harder: "first" | "second" }> {
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      "",
      renderNode("First concept", input.first),
      "",
      renderNode("Second concept", input.second),
      "",
      "Call submit_difficulty_comparison: which of the two concepts is harder for a learner to master?"
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: DIFFICULTY_COMPARISON_SYSTEM_PROMPT }, { role: "user", content: user }],
      toolName: "submit_difficulty_comparison",
      toolDescription: "Submit which of the two listed concepts is intrinsically harder to master.",
      parameters: difficultyComparisonSchema,
      validator: difficultyComparisonValidator,
      tags: [STAGE_TAGS.intrinsicDifficulty]
    });

    return { harder: result.harder };
  }
}

function renderNode(role: string, node: DifficultyNodeContext): string {
  // Difficulty contexts carry no labeled assertions; the shared renderer skips its
  // assertions section on an empty list, so both whole-domain-set prompts keep one
  // quote format that cannot drift.
  return renderConcept(role, { ...node, assertions: [] });
}
