import type { ConceptLessonDraft, ConceptLessonSectionDraft } from "@lrnki/domain-core";
import type { ConceptLessonGenerationPort } from "@lrnki/ports";
import { STAGE_TAGS } from "@lrnki/domain-core";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { EVIDENCE_PROFILE_MODEL } from "./extractionAdapters";
import { conceptLessonSchema, conceptLessonValidator } from "./toolSchemas";

// Concept Lesson generation stays DeepSeek-family (AGENTS rule 5): the lesson is a
// learner-neutral teaching artifact generated from provenance-tagged grounding plus
// directional graph neighbors (ADR-0031). The prompt uses domain-neutral rubric language
// (rule 17) and names no section as mandatory (R4); tool arguments validate fail-closed
// (rule 6). Provenance honesty (which sections are truly source-cited) is re-derived
// authoritatively by the pure assembler (U6) — this adapter only relays the draft.
export const CONCEPT_LESSON_GENERATION_MODEL = EVIDENCE_PROFILE_MODEL;

type GroundingPassage =
  | { passageId: string; kind: "definition" | "mention"; text: string; sourceResourceId: string; sourceBlockId: string }
  | { passageId: string; kind: "definition" | "mention"; text: string; derivedNodeId: string };

type NeighborGroup = { label: string; snippet: string }[];

function renderPassages(passages: GroundingPassage[]): string {
  return passages.map((passage) => `- [${passage.passageId}] (${passage.kind}) "${passage.text}"`).join("\n") || "(none)";
}

function renderNeighbors(neighbors: NeighborGroup): string {
  return neighbors.length
    ? neighbors.map((neighbor) => `- ${neighbor.label}${neighbor.snippet ? `: "${neighbor.snippet}"` : ""}`).join("\n")
    : "(none provided)";
}

export class LiteLlmConceptLessonGenerationAdapter implements ConceptLessonGenerationPort {
  readonly model: string;

  constructor(private readonly client: LiteLlmForcedToolClient, model: string = CONCEPT_LESSON_GENERATION_MODEL) {
    this.model = model;
  }

  async generate(input: {
    declaredDomain: string;
    node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
    groundingProvenance: "source_cep" | "source_mentioned" | "generated";
    groundingPassages: GroundingPassage[];
    neighbors: { parents: NeighborGroup; children: NeighborGroup; siblings: NeighborGroup };
    retryFeedback?: string;
  }): Promise<ConceptLessonDraft> {
    const system = [
      "You write ONE ordered teaching lesson for a single learning node, conditioned ONLY on the provided grounding passages and neighbor concepts.",
      "A lesson is an ordered set of independently optional sections. The default compact shape is: a one-sentence gist, one precise substantive section (definition, examples, or formulas), and a short applications bridge to the neighbor concepts.",
      "The gist is a framing hook, not a summary. In one sentence, orient the learner with the concept's core idea — the problem it solves, why it matters, or the tension it resolves — so they know what to attend to before the details. It must NOT restate the definition's formal 'what it is'; the gist and the definition carry different information, and a gist that paraphrases the definition is wrong.",
      "Emit intuition only when the grounding supports a genuinely distinct mental model that is not already covered by the gist or substantive section. Do not use repetitive analogy templates such as 'Think of...' unless the analogy is necessary and specifically grounded.",
      "Length budgets: gist is one sentence; definition, examples, formulas, and applications are at most two short sentences each.",
      "For examples and applications sections, emit 2-4 short items as list structure. Keep the section text as a lead-in line. For every other section, emit an empty items array.",
      "Never assume a section applies. Emit a section ONLY when the provided grounding supports it; omit any section that does not apply rather than writing a placeholder.",
      "For a section that restates source-supported or generated-grounding content (typically definition, examples, or formulas), cite the grounding passage it derives from by its exact passageId and quote a substring of that passage; for source-grounded passages the quote must be verbatim. Leave gist and intuition uncited. Cite applications only when they directly restate one provided grounding passage; otherwise leave them synthesized.",
      "Every definition, examples, or formulas section must carry both citation fields. Use one cited grounding passage per section; do not combine multiple passages into a single cited section. If no single passage supports the section, omit that section.",
      "Stay within the Declared Domain. Write domain-neutral, learner-facing prose; never reference 'the passage' or 'the source'."
    ].join(" ");

    const aliasText = input.node.aliases.length ? ` (aliases: ${input.node.aliases.join(", ")})` : "";
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Learning node: "${input.node.canonicalLabel}"${aliasText}.`,
      `Grounding provenance: ${input.groundingProvenance}.`,
      "Grounding passages (cite source-supported sections by passageId):",
      renderPassages(input.groundingPassages),
      "",
      "Graph neighbors for the applications section — concepts a learner understands BEFORE this one (prerequisites):",
      renderNeighbors(input.neighbors.parents),
      "Concepts that BUILD ON this one (dependents):",
      renderNeighbors(input.neighbors.children),
      "Sibling concepts in the same domain:",
      renderNeighbors(input.neighbors.siblings),
      ...(input.retryFeedback ? ["", "Retry feedback from the previous rejected draft:", input.retryFeedback] : []),
      "",
      "Call submit_concept_lesson with the ordered sections this grounding supports."
    ].join("\n");

    const args = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_concept_lesson",
      toolDescription: "Submit one ordered teaching lesson for a learning node: independently optional sections, each source-cited where the grounding supports it.",
      parameters: conceptLessonSchema,
      validator: conceptLessonValidator,
      tags: [STAGE_TAGS.conceptLessonGeneration]
    });

    // Translate the flat wire shape (nullable citation/diagram scalars) into the domain
    // draft (nested optionals). A section is carried with a draft citation only when BOTH
    // the passageId and the quote are present; the assembler verifies it verbatim and
    // re-derives provenance, so a partial or absent citation simply marks it synthesized.
    const sections: ConceptLessonSectionDraft[] = args.sections.map((section) => {
      const draft: ConceptLessonSectionDraft = { kind: section.kind, text: section.text };
      if (section.items?.length) draft.items = section.items;
      if (section.citationPassageId && section.citationEvidenceQuote) {
        draft.citation = { passageId: section.citationPassageId, evidenceQuote: section.citationEvidenceQuote };
      }
      if (section.diagramCaption && section.diagramSpec) {
        draft.diagram = { caption: section.diagramCaption, spec: section.diagramSpec };
      }
      return draft;
    });

    return { sections };
  }
}
