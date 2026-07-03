import {
  classifyEvidenceMatch,
  evidenceQuoteMatches,
  type ConceptLesson,
  type ConceptLessonDraft,
  type ConceptLessonSection,
  type ConceptLessonSectionDraft,
  type ConceptLessonSectionKind,
  type LessonAbsentNode,
  type StudyItemCitation,
  type StudyItemGroundingProvenance
} from "@lrnki/domain-core";
import type { GroundingPassage, NodeGrounding } from "./selectNodeGrounding";

// Concept Lesson assembly (U6, R1/R3/R6/R7/R8/R9/R11, ADR-0031). PURE: it never trusts the
// generator's claimed provenance. For each draft section it RE-DERIVES provenance
// authoritatively — a section is `source`-cited ONLY when its quote verifies verbatim against
// the cited grounding passage (evidenceQuoteMatches); otherwise it is demoted to `generated`
// (a generated citation when the cited passage is generated grounding, no citation when the
// quote is unverifiable). It then enforces the R3 minimum (a gist, ≥1 application, and ≥1
// substantive section) and records a LessonAbsentNode when the draft cannot meet it (KTD4).
// No graph/enrichment write port is reachable from here (R9).

// The canonical teaching order. Sections are emitted in this order regardless of the order
// the generator returned them, and at most one section per kind survives (first wins).
const SECTION_ORDER: ConceptLessonSectionKind[] = ["gist", "intuition", "definition", "examples", "applications", "formulas"];
// Exported (rule 18): the study-item generation stage reuses this same "substantive" set to
// decide lesson-retry and item-grounding fallback eligibility (R8/R9).
export const SUBSTANTIVE_KINDS: ConceptLessonSectionKind[] = ["definition", "examples", "formulas"];

export type AssembleConceptLessonInput = {
  node: { derivedNodeId: string; canonicalLabel: string; graphVersionId: string | null; enrichmentId: string };
  generatingModel: string;
  configHash: string;
  grounding: NodeGrounding;
  draft: ConceptLessonDraft;
};

export type AssembleConceptLessonResult =
  | { kind: "lesson"; lesson: ConceptLesson }
  | { kind: "absent"; absent: LessonAbsentNode };

function isSourcePassage(passage: GroundingPassage): passage is Extract<GroundingPassage, { sourceResourceId: string }> {
  return "sourceResourceId" in passage;
}

// Re-derive a section's authoritative provenance + citation from the cited grounding passage.
// Returns the grounding provenance label and the verified citation, or `generated`/no-citation
// when the quote does not verify or the section is synthesized.
function citeVerifiedPassage(
  passage: GroundingPassage,
  evidenceQuote: string,
  grounding: NodeGrounding
): { provenance: StudyItemGroundingProvenance; citation: StudyItemCitation } {
  if (isSourcePassage(passage)) {
    // The grounding provenance (source_cep | source_mentioned) labels a verified source section.
    // The caller only reaches here on an established match, so classify is exact|normalized.
    const match = classifyEvidenceMatch(passage.text, evidenceQuote);
    return {
      provenance: grounding.provenance,
      citation: {
        provenance: "source",
        sourceResourceId: passage.sourceResourceId,
        sourceBlockId: passage.sourceBlockId,
        evidenceQuote,
        matchKind: match === "exact" ? "exact" : "normalized"
      }
    };
  }
  // A verified quote against generated grounding stays generated, carrying the generated arm.
  return {
    provenance: "generated",
    citation: { provenance: "generated", derivedNodeId: passage.derivedNodeId, passageText: passage.text }
  };
}

function deriveSectionGrounding(
  section: ConceptLessonSectionDraft,
  grounding: NodeGrounding
): { provenance: StudyItemGroundingProvenance; citation?: StudyItemCitation } {
  if (!section.citation) {
    // If a substantive section is itself a verbatim substring of one grounding passage, cite it
    // even when the model forgot the passage id. This is still a provable match; synthesized
    // teaching aids such as gist/intuition/applications remain uncited.
    if (SUBSTANTIVE_KINDS.includes(section.kind)) {
      const inferred = grounding.passages.find((candidate) => evidenceQuoteMatches(candidate.text, section.text));
      if (inferred) return citeVerifiedPassage(inferred, section.text, grounding);
    }
    return { provenance: "generated" };
  }
  const passage = grounding.passages.find((candidate) => candidate.passageId === section.citation!.passageId);
  if (!passage || !evidenceQuoteMatches(passage.text, section.citation.evidenceQuote)) {
    // Unverifiable or dangling citation → synthesized. Never leak it as a source quote (R8).
    return { provenance: "generated" };
  }
  return citeVerifiedPassage(passage, section.citation.evidenceQuote, grounding);
}

export function assembleConceptLesson(input: AssembleConceptLessonInput): AssembleConceptLessonResult {
  const { node, grounding, draft } = input;

  // De-duplicate by kind (first occurrence wins) and re-derive each section's provenance.
  const byKind = new Map<ConceptLessonSectionKind, ConceptLessonSection>();
  for (const section of draft.sections) {
    if (byKind.has(section.kind)) continue;
    if (section.text.trim().length === 0) continue;
    const grounded = deriveSectionGrounding(section, grounding);
    const assembled: ConceptLessonSection = {
      kind: section.kind,
      text: section.text,
      groundingProvenance: grounded.provenance
    };
    if (grounded.citation) assembled.citation = grounded.citation;
    if (section.diagram) assembled.diagram = section.diagram;
    byKind.set(section.kind, assembled);
  }

  const sections = SECTION_ORDER.filter((kind) => byKind.has(kind)).map((kind) => byKind.get(kind)!);

  // The R3 minimum: a gist, at least one application, and at least one substantive section.
  const hasGist = byKind.has("gist");
  const hasApplication = byKind.has("applications");
  const hasSubstantive = SUBSTANTIVE_KINDS.some((kind) => byKind.has(kind));
  if (!hasGist || !hasApplication || !hasSubstantive) {
    const missing = [
      hasGist ? null : "gist",
      hasApplication ? null : "applications",
      hasSubstantive ? null : "a substantive section (definition, examples, or formulas)"
    ].filter((part): part is string => part !== null);
    return {
      kind: "absent",
      absent: {
        derivedNodeId: node.derivedNodeId,
        canonicalLabel: node.canonicalLabel,
        reason: `lesson did not meet the minimum; missing ${missing.join(", ")}`
      }
    };
  }

  return {
    kind: "lesson",
    lesson: {
      derivedNodeId: node.derivedNodeId,
      graphVersionId: node.graphVersionId,
      enrichmentId: node.enrichmentId,
      generatingModel: input.generatingModel,
      configHash: input.configHash,
      canonicalLabel: node.canonicalLabel,
      sections
    }
  };
}
