import type { ConceptLessonSection } from "@lrnki/domain-core";
import type { ConceptLessonSectionView } from "./studySessionProjection";

// The single Concept Lesson SECTION → view mapping (rule 18), in a leaf module so the neutral
// projection (`studySessionProjection`) and the learner-scoped Scaffold Detour composition
// (`studySessionTrail`) both consume it WITHOUT a runtime import cycle: this module's only edge to
// `studySessionProjection` is a type-only (erased) import of the view shape. A section is
// `source`-cited only when its authoritative provenance is a source kind (the assembler already
// re-derived this); a generated scaffold micro-lesson section is always `generated`, so it maps to
// `isSourceCited: false` with no citation/diagram fields.
export function conceptLessonSectionToView(section: ConceptLessonSection): ConceptLessonSectionView {
  return {
    kind: section.kind,
    text: section.text,
    ...(section.items?.length ? { items: section.items } : {}),
    groundingProvenance: section.groundingProvenance,
    isSourceCited: section.citation?.provenance === "source",
    ...(section.citation?.provenance === "source" ? { matchKind: section.citation.matchKind } : {}),
    ...(section.diagram ? { diagram: section.diagram } : {})
  };
}
