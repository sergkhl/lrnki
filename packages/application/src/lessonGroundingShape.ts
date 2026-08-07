import type { ConceptLesson } from "@lrnki/domain-core";
import { SUBSTANTIVE_KINDS } from "./assembleConceptLesson";
import { normalizeOptionText } from "./optionSelectGuard";
import type { GroundingPassage } from "./selectNodeGrounding";

// The SINGLE answer to "what grounding does this Concept Lesson yield?" (rule 18,
// plan 2026-08-05-001 D6/D10). Both consumers read this one function: the structural
// pre-gate counts these passages, and the option-select / matching / impostor generators
// are shown these passages. Before this owner existed, a separate fragment counter let the
// pre-gate promise grounding the generator was never given, and vice versa.
//
// Passage identity is POSITIONAL, never kind-derived: a lesson routinely carries two or
// three non-definition citations, and deriving the id from the section kind collapsed them
// onto one id — so a model quoting the second section correctly was rejected by a resolver
// whose `find` returned the first. `kind` stays on the passage because the prompt renders
// it; it no longer participates in identity.
//
//   section citation / section body   ->  `${derivedNodeId}:s${sectionIndex}`
//   bullet i of that section's items  ->  `${derivedNodeId}:s${sectionIndex}:i${i}`
//
// `sectionIndex` is the section's position in `lesson.sections`, which is the persisted
// order, so an id is stable for a given lesson.
//
// A bullet is ALWAYS emitted as `generated` grounding carrying the lesson's own node id and
// never inherits its parent section's source citation (D10): a model-written bullet is not
// source text, and labeling it as one is the provenance masquerade ADR-0026 forbids.
//
// Returns null when the lesson yields no passage at all.

export type LessonGroundingShape = {
  provenance: "source_cep" | "source_mentioned" | "generated";
  passages: GroundingPassage[];
};

export function lessonGroundingShape(lesson: ConceptLesson): LessonGroundingShape | null {
  const passages: GroundingPassage[] = [];
  // Distinctness is a property of the grounding, not of the counter (ADR-0026 asks for
  // *distinct* fragments). Deduplicating here keeps the pre-gate's count honest AND keeps
  // the same text from reaching the generator twice under two different ids.
  const seen = new Set<string>();
  const push = (passage: GroundingPassage): void => {
    const normalized = normalizeOptionText(passage.text);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    passages.push(passage);
  };
  let sourceProvenance: "source_cep" | "source_mentioned" | null = null;

  for (let sectionIndex = 0; sectionIndex < lesson.sections.length; sectionIndex += 1) {
    const section = lesson.sections[sectionIndex];
    const kind: "definition" | "mention" = section.kind === "definition" ? "definition" : "mention";
    const sectionPassageId = `${lesson.derivedNodeId}:s${sectionIndex}`;
    if (section.citation?.provenance === "source") {
      push({
        passageId: sectionPassageId,
        kind,
        text: section.citation.evidenceQuote,
        sourceResourceId: section.citation.sourceResourceId,
        sourceBlockId: section.citation.sourceBlockId
      });
      if (!sourceProvenance && (section.groundingProvenance === "source_cep" || section.groundingProvenance === "source_mentioned")) {
        sourceProvenance = section.groundingProvenance;
      }
    } else if (section.citation) {
      push({ passageId: sectionPassageId, kind, text: section.citation.passageText, derivedNodeId: section.citation.derivedNodeId });
    } else if (SUBSTANTIVE_KINDS.includes(section.kind)) {
      // An uncited substantive body is honestly generated grounding. Synthesized
      // gist/intuition/applications bodies never become grounding — only their bullets do.
      push({ passageId: sectionPassageId, kind, text: section.text, derivedNodeId: lesson.derivedNodeId });
    }
    const items = section.items ?? [];
    for (let bulletIndex = 0; bulletIndex < items.length; bulletIndex += 1) {
      push({
        passageId: `${sectionPassageId}:i${bulletIndex}`,
        kind,
        text: items[bulletIndex],
        derivedNodeId: lesson.derivedNodeId
      });
    }
  }

  if (passages.length === 0) return null;
  return { provenance: sourceProvenance ?? "generated", passages };
}
