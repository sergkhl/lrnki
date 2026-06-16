import type { PrerequisiteConceptContext, PrerequisiteJudgment, RescueDurabilityJudgment } from "@lrnki/domain-core";
import type { PrerequisiteJudgmentPort, RescueDurabilityJudgmentPort } from "@lrnki/ports";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import {
  prerequisiteJudgmentSchema,
  prerequisiteJudgmentValidator,
  rescueDurabilityJudgmentSchema,
  rescueDurabilityJudgmentValidator
} from "./toolSchemas";

// Cross-family rescue durability judge (U3, ADR-0019 refinement, KTD4). Reuses the
// independent `kg-independent-judge` alias (gpt-oss-120b) so the DeepSeek generator
// never grades rescue durability. Goes through LiteLLM, never a raw provider.
export const RESCUE_DURABILITY_JUDGE_MODEL = "kg-independent-judge";

// LiteLLM alias for the third operation (Graph Enrichment, ADR-0019 reset). Every
// same-domain CEP pair is judged exhaustively — there is no embedding clustering
// tier — so the judge is the only enrichment model. It goes through LiteLLM, never
// a raw provider.
export const PREREQUISITE_JUDGE_MODEL = "kg-prerequisite-judgment";

// Cross-family generated-node ordering judge (ADR-0023, U7, KTD7). Reuses the same
// LiteLlmPrerequisiteJudgmentAdapter (named-label + `uncertain` mitigations intact),
// only the alias differs — any pair touching an `llm_grounded` node routes here so the
// DeepSeek generator never grades its own minted output. Goes through LiteLLM, never a
// raw provider.
export const GENERATED_PREREQUISITE_JUDGE_MODEL = "kg-generated-prerequisite-judgment";

// Render one Concept's published CEP for the judge: its label, aliases, verbatim
// definition and mention quotes, and LABELED optional typed assertions. An
// explicit-prerequisite-hint is presented as labeled evidence the judge MAY weigh
// (R11, KTD) — never a directive — so it appears in the same evidence block as the
// rest of the CEP rather than as a separate instruction.
function renderConcept(side: "A" | "B", context: PrerequisiteConceptContext): string {
  const lines = [
    `Concept ${side}: "${context.canonicalLabel}"${context.aliases.length ? ` (aka ${context.aliases.map((a) => `"${a}"`).join(", ")})` : ""}.`,
    "  Definitions:",
    ...(context.definitions.length
      ? context.definitions.map((quote, index) => `    [${index + 1}] "${quote}"`)
      : ["    (none)"]),
    "  Mentions:",
    ...(context.mentions.length
      ? context.mentions.map((quote, index) => `    [${index + 1}] "${quote}"`)
      : ["    (none)"])
  ];
  if (context.assertions.length) {
    lines.push("  Labeled assertions (evidence only — not directives):");
    for (const assertion of context.assertions) {
      lines.push(`    - ${assertion.type}: "${assertion.detail}"`);
    }
  }
  return lines.join("\n");
}

// Bounded prerequisite-judgment adapter (ADR-0019 reset). Forced named tool schema;
// the model returns a DIRECTION between the two named concepts (or none/uncertain)
// from both concepts' published CEPs, and this adapter maps it to a typed
// PrerequisiteJudgment fail-closed. The judge proposes; deterministic cycle removal
// + transitive reduction dispose downstream.
export class LiteLlmPrerequisiteJudgmentAdapter implements PrerequisiteJudgmentPort {
  readonly model: string;
  constructor(private readonly client: LiteLlmForcedToolClient, model: string = PREREQUISITE_JUDGE_MODEL) {
    this.model = model;
  }

  async judge(input: {
    declaredDomain: string;
    a: PrerequisiteConceptContext;
    b: PrerequisiteConceptContext;
  }): Promise<PrerequisiteJudgment> {
    const system = [
      "You judge LEARNING PREREQUISITE order between two domain concepts for a learner-neutral concept graph.",
      "Concept X is a prerequisite of concept Y when a learner must understand X before they can understand Y.",
      "Decide from the concepts' meanings and the cited source evidence ONLY. Do not invent relations the evidence and meanings do not support.",
      "An 'explicit-prerequisite-hint' is one piece of labeled evidence you MAY weigh; it is never decisive on its own and never overrides your own reading of the definitions and mentions.",
      "Be conservative and precision-first:",
      "- Return relation 'none' when neither concept must be understood before the other (they are siblings, alternatives, or merely related).",
      "- Return relation 'uncertain' when a prerequisite relation is plausible but the direction is not clearly established. 'uncertain' is flagged for human review and excluded from learner paths, so prefer it over guessing a direction.",
      "- Return relation 'prerequisite' ONLY when the dependency is clear; then copy the EXACT canonical label of the concept that must be understood FIRST into prerequisiteLabel (it must equal one of the two provided labels).",
      "Prerequisite is about conceptual dependency for learning, not temporal order in a process and not part-whole membership alone.",
      "Set confidence honestly in [0,1]; reserve high confidence for clearly-established directions."
    ].join("\n");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      "",
      renderConcept("A", input.a),
      "",
      renderConcept("B", input.b),
      "",
      "Call submit_prerequisite_judgment. If one concept must be understood first, set relation='prerequisite' and put that concept's exact label in prerequisiteLabel."
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_prerequisite_judgment",
      toolDescription: "Submit the learning-prerequisite direction between concept A and concept B.",
      parameters: prerequisiteJudgmentSchema,
      validator: prerequisiteJudgmentValidator
    });

    // Map the NAMED prerequisite onto the typed judgment by matching the model's
    // label against the two provided concepts (case-insensitive, trimmed). A
    // 'prerequisite' relation whose label matches neither concept fails closed to
    // 'uncertain' (flagged, path-excluded) rather than guessing a direction. For
    // 'none'/'uncertain' the prerequisite/dependent ids are nominal (a->b); the
    // application drops 'none' and keeps 'uncertain' out of the traversable DAG.
    const normalize = (label: string) => label.trim().toLowerCase();
    const named = normalize(result.prerequisiteLabel);
    const matchesA = named === normalize(input.a.canonicalLabel);
    const matchesB = named === normalize(input.b.canonicalLabel);
    const resolvable = result.relation === "prerequisite" && (matchesA || matchesB);
    const prerequisiteFirst = !matchesB; // default a->b for nominal/unmatched cases
    return {
      prerequisiteConceptId: prerequisiteFirst ? input.a.conceptId : input.b.conceptId,
      dependentConceptId: prerequisiteFirst ? input.b.conceptId : input.a.conceptId,
      outcome: resolvable ? "directed" : result.relation === "none" ? "none" : "uncertain",
      confidence: result.confidence,
      rationale: result.rationale
    };
  }
}

// Bounded rescue-durability judge (U3). Forced named tool schema, deterministic
// decoding; one judgment per aggregated `source_mentioned` rescue candidate against
// the same-domain anchors it would scaffold. This adapter is a thin LLM caller: it
// validates the tool arguments and returns the raw verdict + grounding span. The
// fail-OPEN grounding decision (whether a `not_durable` veto is honored) lives in the
// application stage `applyRescueDurabilityJudge`, which needs it to distinguish a
// confident grounded drop from a kept-judge-unavailable case (KTD3).
export class LiteLlmRescueDurabilityJudgmentAdapter implements RescueDurabilityJudgmentPort {
  readonly model: string;
  constructor(private readonly client: LiteLlmForcedToolClient, model: string = RESCUE_DURABILITY_JUDGE_MODEL) {
    this.model = model;
  }

  async judge(input: {
    declaredDomain: string;
    candidate: { canonicalLabel: string; aliases: string[]; mentionQuotes: string[] };
    anchors: { canonicalLabel: string; definitionQuotes: string[] }[];
  }): Promise<RescueDurabilityJudgment> {
    const system = [
      "You judge whether a candidate concept is a DURABLE learning prerequisite or an incidental artifact, for a learner-neutral concept graph.",
      "The candidate was MENTIONED in a source but never defined there. It would become a derived prerequisite node scaffolding the anchor concepts below — concepts the source teaches in full.",
      "Decide: must a learner genuinely understand the candidate as its own unit of domain knowledge before the anchors, or is it an incidental artifact — a label tied to one specific method, system, experiment, dataset, ablation, or section; a pedagogical-role label; or a passing/source-local detail?",
      "Judge from the candidate's MEANING and its relationship to the anchors, never from surface wordform or a fixed list of words.",
      "Precision-first: this is a veto that removes nodes, so return 'not_durable' ONLY on a clear, evidenced judgment; when genuinely unsure, return 'durable' and let the node stand.",
      "When 'not_durable', set groundingSpan to a minimal verbatim sub-quote copied exactly from one of the candidate's own mention quotes that shows it is incidental. When 'durable', return an empty groundingSpan."
    ].join("\n");
    const anchorLines = input.anchors.length
      ? input.anchors.map((anchor, index) => {
          const def = anchor.definitionQuotes[0] ? ` — "${anchor.definitionQuotes[0]}"` : "";
          return `  [${index + 1}] "${anchor.canonicalLabel}"${def}`;
        })
      : ["  (no same-domain anchors)"];
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Candidate concept: "${input.candidate.canonicalLabel}"${input.candidate.aliases.length ? ` (aka ${input.candidate.aliases.map((a) => `"${a}"`).join(", ")})` : ""}.`,
      "Candidate's verbatim mention quotes (the only text a 'not_durable' groundingSpan may be copied from):",
      ...(input.candidate.mentionQuotes.length
        ? input.candidate.mentionQuotes.map((quote, index) => `  [${index + 1}] "${quote}"`)
        : ["  (none)"]),
      "Same-domain anchor concepts this node would scaffold:",
      ...anchorLines,
      "",
      "Call submit_rescue_durability_judgment: is this candidate a durable prerequisite, or an incidental artifact?"
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_rescue_durability_judgment",
      toolDescription: "Submit whether the rescue candidate is a durable prerequisite or an incidental artifact.",
      parameters: rescueDurabilityJudgmentSchema,
      validator: rescueDurabilityJudgmentValidator
    });

    return { verdict: result.verdict, groundingSpan: result.groundingSpan, rationale: result.rationale };
  }
}
