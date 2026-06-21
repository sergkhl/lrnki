import { randomUUID } from "node:crypto";
import {
  evidenceQuoteMatches,
  type OptionSelectItem,
  type OptionSelectItemDraft,
  type StudyItemCitation,
  type StudyItemGroundingProvenance,
  type StudyItemOption
} from "@lrnki/domain-core";

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

// The build-time context the guard needs to assemble a persistable OptionSelectItem: the
// item identity + grounding provenance, plus the passages the correct answer must trace
// to. Built by the fan-out (U5) from the node's selected grounding.
export type OptionSelectGrounding = {
  studyItemId: string;
  graphVersionId: string;
  enrichmentId: string;
  derivedNodeId: string;
  groundingProvenance: StudyItemGroundingProvenance;
  generatingModel: string;
  configHash: string;
  passages: OptionSelectGroundingPassage[];
};

export type OptionSelectGuardResult =
  | { ok: true; item: OptionSelectItem }
  | { ok: false; reason: string };

const REQUIRED_OPTION_COUNT = 4;

// Conservative normalization: collapse internal whitespace and lowercase. Intentionally
// minimal so "Heap" / "  heap " collapse to a duplicate while "heap" / "stack" stay
// distinct — over-aggressive normalization would silently drop valid items (rule 16).
function normalizeOptionText(text: string): string {
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

  // (4) the correct option's citation verifies verbatim against a grounding passage under
  // the provenance contract. The resolved provenance is taken from the MATCHED passage
  // (authoritative), never trusted from the draft's claim — fail-closed labeling.
  if (!correct.citation) {
    return { ok: false, reason: "option-select correct option carries no grounding citation" };
  }
  const citationDraft = correct.citation;
  const match = grounding.passages.find(
    (passage) => passage.passageId === citationDraft.passageId && evidenceQuoteMatches(passage.text, citationDraft.evidenceQuote)
  );
  if (!match) {
    return { ok: false, reason: "option-select correct option citation does not verify against grounding" };
  }
  const citation: StudyItemCitation =
    "sourceResourceId" in match
      ? {
          provenance: "source",
          sourceResourceId: match.sourceResourceId,
          sourceBlockId: match.sourceBlockId,
          evidenceQuote: citationDraft.evidenceQuote
        }
      : { provenance: "generated", derivedNodeId: grounding.derivedNodeId, passageText: citationDraft.evidenceQuote };

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
      question: draft.question,
      options: builtOptions
    }
  };
}
