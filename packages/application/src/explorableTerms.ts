import { normalizeConceptLabel, type ConceptLessonSectionKind, type ExplorableTerm } from "@lrnki/domain-core";

// Explorable Term validation (plan 2026-07-12-002 U1, R2/R3, KTD1). PURE and deterministic:
// it retains only the term candidates the plan proves server-authoritatively and drops the
// rest WITHOUT inventing a semantic veto (rule 16 — lexical heuristics cannot prove a term is
// "specialized enough", so semantic qualification stays neural in the prompt). The gates a
// candidate must pass:
//   1. 1-80 Unicode code points after trimming.
//   2. an EXACT substring of the authoritative body (a lesson section's text or a question
//      stem) — the request path re-verifies this same substring, so the affordance can never
//      point at text the learner is not looking at.
//   3. not the parent concept label (a term action to explore the concept you are already on
//      is noise, R2).
//   4. distinct after normalization — the first spelling wins; later duplicates drop.
// At most five survive (plan 2026-07-13-002 U1, R2); the generator is told not to fill the
// limit, and anything past the fifth valid term is dropped in emission order.

const MAX_TERMS = 5;
const MAX_CODE_POINTS = 80;

function codePointLength(value: string): number {
  return [...value].length;
}

// Accept one raw candidate against `body`, or return null when it fails any gate. `seen`
// accumulates normalized forms so distinctness holds across the whole list (first wins).
// The RETURNED string is the trimmed exact substring to store — normalization is only used
// for the distinctness and parent-label comparisons, never for what is persisted (the stored
// term must remain an exact substring of the rendered body so the UI highlights real text).
function acceptTerm(raw: string, body: string, parentNormalized: string, seen: Set<string>): string | null {
  const trimmed = raw.trim();
  const length = codePointLength(trimmed);
  if (length < 1 || length > MAX_CODE_POINTS) return null;
  if (!body.includes(trimmed)) return null;
  const normalized = normalizeConceptLabel(trimmed);
  if (normalized.length === 0) return null;
  if (normalized === parentNormalized) return null;
  if (seen.has(normalized)) return null;
  seen.add(normalized);
  return trimmed;
}

// Validate a Study Item's raw term candidates against ONLY its question stem (R3, test
// scenario 4 — never against options, pairs, statements, explanation, or reveal).
export function validateItemExplorableTerms(terms: readonly string[], question: string, parentLabel: string): string[] {
  const parentNormalized = normalizeConceptLabel(parentLabel);
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of terms) {
    if (kept.length >= MAX_TERMS) break;
    const accepted = acceptTerm(raw, question, parentNormalized, seen);
    if (accepted !== null) kept.push(accepted);
  }
  return kept;
}

export type ExplorableTermDraft = { term: string; sectionKind: ConceptLessonSectionKind };

// Validate a Concept Lesson's raw term candidates against the FINAL assembled sections. A
// candidate must name a section kind present in the lesson and match ONLY that section's body
// text (R3, test scenario 4 — not its list items). Section bodies are looked up from the
// assembled lesson, so a candidate anchored to a section the assembler dropped is discarded.
export function validateLessonExplorableTerms(
  drafts: readonly ExplorableTermDraft[],
  sections: readonly { kind: ConceptLessonSectionKind; text: string }[],
  parentLabel: string
): ExplorableTerm[] {
  const parentNormalized = normalizeConceptLabel(parentLabel);
  const bodyByKind = new Map<ConceptLessonSectionKind, string>();
  for (const section of sections) if (!bodyByKind.has(section.kind)) bodyByKind.set(section.kind, section.text);
  const seen = new Set<string>();
  const kept: ExplorableTerm[] = [];
  for (const draft of drafts) {
    if (kept.length >= MAX_TERMS) break;
    const body = bodyByKind.get(draft.sectionKind);
    if (body === undefined) continue;
    const accepted = acceptTerm(draft.term, body, parentNormalized, seen);
    if (accepted !== null) kept.push({ term: accepted, sectionKind: draft.sectionKind });
  }
  return kept;
}
