"use client";

import { Badge } from "@/components/ui/badge";
import type { ConceptLessonView, ConceptLessonSectionView } from "@/components/study/studyView";

// The Concept Lesson reading surface (ADR-0031, R12). It TEACHES the concept before the
// learner is tested: an ordered set of honest, provenance-badged sections shown ahead of the
// study items. Reading is non-graded (R13) — this component has no answer callback and writes
// nothing. Per-section labels keep the learner's trust visible: a `source` section is grounded
// in the source material, a `generated` section is a synthesized aid. The card chrome and the
// collapse toggle are owned by the enclosing `StudySegmentSection`; this renders only the list.
//
// Every stored section renders in canonical teaching order. The lesson leads with its `gist`
// ("In a nutshell") — a framing hook that is distinct from the definition by generation (ADR-0031),
// so it is a genuine lead-in rather than a duplicate summary and is never suppressed.

// Friendly, domain-neutral header per section kind, in the canonical teaching order.
const SECTION_HEADERS: Record<ConceptLessonSectionView["kind"], string> = {
  gist: "In a nutshell",
  intuition: "Intuition",
  definition: "Definition",
  examples: "Examples",
  applications: "Where it connects",
  formulas: "Formulas & methods"
};

export function ConceptLessonCard({ lesson }: Readonly<{ lesson: ConceptLessonView }>) {
  if (lesson.sections.length === 0) return null;
  return (
    <div className="flex flex-col gap-4">
      {lesson.sections.map((section, index) => (
        <article key={`${section.kind}:${index}`} className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-medium">{SECTION_HEADERS[section.kind]}</h4>
            <ProvenanceBadge section={section} />
          </div>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{section.text}</p>
          {section.diagram ? (
            <p className="rounded-md border border-dashed px-2 py-1.5 text-xs text-muted-foreground">
              <span className="font-medium">Diagram:</span> {section.diagram.caption}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  );
}

// A `source` badge signals the section is grounded in source material; `generated` signals a
// synthesized teaching aid. For a source section the badge also shows grounding fidelity:
// `source · exact` (quoted byte-exact) vs `source · normalized` (matched only after formatting
// normalization) — so an operator sees quote fidelity, not just pass/fail.
function ProvenanceBadge({ section }: Readonly<{ section: ConceptLessonSectionView }>) {
  if (!section.isSourceCited) return <Badge variant="secondary">generated</Badge>;
  return section.matchKind === "normalized"
    ? <Badge variant="secondary" title="Matched after formatting normalization">source · normalized</Badge>
    : <Badge variant="outline" title="Byte-exact source quote">source · exact</Badge>;
}
