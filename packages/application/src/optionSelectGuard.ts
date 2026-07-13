import { randomUUID } from "node:crypto";
import {
  classifyEvidenceMatch,
  type OptionSelectItem,
  type OptionSelectItemDraft,
  type StudyItemCitation,
  type StudyItemGroundingProvenance,
  type StudyItemOption
} from "@lrnki/domain-core";
import { validateItemExplorableTerms } from "./explorableTerms";

// Deterministic option-select guard (U2, R9/R10/R11, ADR-0026). Promotes an
// option-select draft to a persistable item ONLY when it satisfies provable structural
// guarantees, and rejects with a distinct reason otherwise. This is the rule-16-permitted
// veto: it enforces a checkable property (exactly one keyed-correct answer that traces to
// the node's grounding verbatim), never a lexical opinion about distractor SEMANTICS —
// distractor quality is judged only by the rule-14 human pass (U8). The guard mutates
// nothing and imports no graph/enrichment write port (R15). Failing it is NOT a run
// failure: the node simply lacks an option-select item and falls back to
// self-assessment-only / cardless-for-studying (R13).

// Grounding passages the correct option's citation may verify against — the same
// provenance-tagged passage shape the self-assessment generator consumes. Source-grounded
// passages carry source ids and require a verbatim source quote; generated passages carry
// generated text and no source ids.
export type OptionSelectGroundingPassage =
  | { passageId: string; text: string; sourceResourceId: string; sourceBlockId: string }
  | { passageId: string; text: string; derivedNodeId: string };

// The build-time context every guard (option-select, matching, impostor) needs to assemble
// a persistable item: the item identity + grounding provenance, plus the passages a citation
// must trace to. Built by the fan-out (U5) from the node's selected grounding. One shape
// shared by all three guards (rule 18) rather than three independently maintained copies.
export type StudyItemGuardGrounding = {
  studyItemId: string;
  graphVersionId: string | null;
  enrichmentId: string;
  derivedNodeId: string;
  // The node's canonical label, used only to exclude a term that merely repeats it from the
  // Explorable Term list (R2, plan 2026-07-12-002 U1). Shared by all three guards (rule 18).
  canonicalLabel: string;
  groundingProvenance: StudyItemGroundingProvenance;
  generatingModel: string;
  configHash: string;
  facet?: string;
  passages: OptionSelectGroundingPassage[];
};

export type OptionSelectGrounding = StudyItemGuardGrounding;

// Resolves a draft citation against the grounding passages: finds the cited passage, verifies
// the evidence quote against it, and re-derives provenance authoritatively from the MATCHED
// passage (never trusted from the draft's claim — fail-closed labeling). Returns null when the
// citation doesn't verify. Shared by every guard (option-select, matching, impostor) so a future
// change to citation verification lands in one place (rule 18).
export function resolveGroundingCitation(
  passages: OptionSelectGroundingPassage[],
  citationDraft: { passageId: string; evidenceQuote: string },
  derivedNodeId: string
): StudyItemCitation | null {
  const candidate = passages.find((passage) => passage.passageId === citationDraft.passageId);
  const matchKind = candidate ? classifyEvidenceMatch(candidate.text, citationDraft.evidenceQuote) : "none";
  if (!candidate || matchKind === "none") return null;
  return "sourceResourceId" in candidate
    ? { provenance: "source", sourceResourceId: candidate.sourceResourceId, sourceBlockId: candidate.sourceBlockId, evidenceQuote: citationDraft.evidenceQuote, matchKind }
    : { provenance: "generated", derivedNodeId, passageText: citationDraft.evidenceQuote };
}

export type OptionSelectGuardResult =
  | { ok: true; item: OptionSelectItem }
  | { ok: false; reason: string };

const REQUIRED_OPTION_COUNT = 4;

// Conservative normalization: collapse internal whitespace and lowercase. Intentionally
// minimal so "Heap" / "  heap " collapse to a duplicate while "heap" / "stack" stay
// distinct — over-aggressive normalization would silently drop valid items (rule 16).
// Shared by the impostor guard (U4) for its impostor-vs-truth distinctness check (rule 18).
export function normalizeOptionText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function validateOptionSelectItem(
  draft: OptionSelectItemDraft,
  grounding: OptionSelectGrounding,
  newOptionId: () => string = randomUUID
): OptionSelectGuardResult {
  const options = draft.options;

  // (1) exactly four options.
  if (options.length !== REQUIRED_OPTION_COUNT) {
    return { ok: false, reason: `option-select requires exactly ${REQUIRED_OPTION_COUNT} options, got ${options.length}` };
  }

  // (2) all four distinct after normalization.
  const normalized = options.map((option) => normalizeOptionText(option.text));
  if (new Set(normalized).size !== normalized.length) {
    return { ok: false, reason: "option-select has duplicate options after normalization" };
  }

  // (3) exactly one option flagged correct.
  const correctOptions = options.filter((option) => option.isCorrect);
  if (correctOptions.length !== 1) {
    return { ok: false, reason: `option-select requires exactly one correct option, got ${correctOptions.length}` };
  }
  const correct = correctOptions[0];
  const explanation = draft.explanation.trim();
  if (!explanation) {
    return { ok: false, reason: "option-select requires a non-empty explanation" };
  }

  // (4) the correct option's citation verifies verbatim against a grounding passage under
  // the provenance contract. The resolved provenance is taken from the MATCHED passage
  // (authoritative), never trusted from the draft's claim — fail-closed labeling.
  if (!correct.citation) {
    return { ok: false, reason: "option-select correct option carries no grounding citation" };
  }
  const citationDraft = correct.citation;
  const citation = resolveGroundingCitation(grounding.passages, citationDraft, grounding.derivedNodeId);
  if (!citation) {
    return { ok: false, reason: "option-select correct option citation does not verify against grounding" };
  }

  // (5) every non-correct option is labeled provenance 'generated' (R10).
  const mislabeledDistractor = options.some((option) => !option.isCorrect && option.provenance !== "generated");
  if (mislabeledDistractor) {
    return { ok: false, reason: "option-select distractor must be labeled provenance 'generated'" };
  }

  const builtOptions: StudyItemOption[] = options.map((option) =>
    option.isCorrect
      ? { optionId: newOptionId(), text: option.text, isCorrect: true, provenance: citation.provenance, citation }
      : { optionId: newOptionId(), text: option.text, isCorrect: false, provenance: "generated" }
  );

  return {
    ok: true,
    item: {
      itemType: "option_select",
      studyItemId: grounding.studyItemId,
      graphVersionId: grounding.graphVersionId,
      enrichmentId: grounding.enrichmentId,
      derivedNodeId: grounding.derivedNodeId,
      groundingProvenance: grounding.groundingProvenance,
      generatingModel: grounding.generatingModel,
      configHash: grounding.configHash,
      ...(grounding.facet ? { facet: grounding.facet } : {}),
      explorableTerms: validateItemExplorableTerms(draft.explorableTerms ?? [], draft.question, grounding.canonicalLabel),
      question: draft.question,
      explanation,
      options: builtOptions
    }
  };
}
