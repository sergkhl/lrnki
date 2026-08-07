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
// citation doesn't resolve. Shared by every guard (option-select, matching, impostor) so a
// change to citation verification lands in one place (rule 18).
//
// A deterministic resolution ladder, not an all-or-nothing string match (plan 2026-08-05-001 D9):
//
//   find(passageId)
//     |- not found ............................... reject (nothing to attribute the claim to)
//     |- found, quote verifies ................... cite it
//     |- found, quote verifies on ANOTHER
//     |    generated passage .................... cite THAT passage        (id repair)
//     |- found, source passage, quote fails ...... reject
//     `- found, generated passage, quote fails ... cite the WHOLE cited passage, but only
//                                                  when the caller opted in    (fallback)
//
// The id-repair rung is deterministic, not a threshold: the quote is still required to verify
// VERBATIM, just against a passage the model mis-addressed. Repair only ever lands on a
// GENERATED passage, so it can never mint a `source` citation from an id nobody cited, and no
// similarity heuristic appears anywhere (AGENTS rule 16).
//
// The fallback rung is the interlocked half of key verification (D6) and is admissible ONLY
// because of it. It forgives a paraphrased quote — the model wrote the lesson and then failed
// to copy its own sentence back, which on the frozen baseline destroyed half the bank — by
// attributing the claim to the passage the model cited rather than to a span it reproduced.
// That trades a mechanical guarantee for a semantic one, so it is offered only to the item
// types a judge actually verifies: option-select and impostor opt in, matching never does.
// SOURCE passages are never eligible under any opt-in; a source citation must still quote.
export type CitationRung = "verbatim" | "generated_passage_fallback";

export type ResolvedGroundingCitation = {
  citation: StudyItemCitation;
  // Which rung admitted it. `verbatim` spans rungs 0–2 — the quote was reproduced exactly,
  // possibly against a mis-addressed passage. `generated_passage_fallback` means the item
  // has NO verbatim anchor, which is what lets the D5 unavailability rule tell an item that
  // can survive an unresolved verdict from one that cannot.
  rung: CitationRung;
};

export function resolveGroundingCitation(
  passages: OptionSelectGroundingPassage[],
  citationDraft: { passageId: string; evidenceQuote: string },
  derivedNodeId: string,
  options: { generatedPassageFallback?: boolean } = {}
): ResolvedGroundingCitation | null {
  const candidate = passages.find((passage) => passage.passageId === citationDraft.passageId);
  if (!candidate) return null;
  const matchKind = classifyEvidenceMatch(candidate.text, citationDraft.evidenceQuote);
  if (matchKind !== "none") {
    return {
      rung: "verbatim",
      citation: "sourceResourceId" in candidate
        ? { provenance: "source", sourceResourceId: candidate.sourceResourceId, sourceBlockId: candidate.sourceBlockId, evidenceQuote: citationDraft.evidenceQuote, matchKind }
        : { provenance: "generated", derivedNodeId, passageText: citationDraft.evidenceQuote }
    };
  }
  const repaired = passages.some((passage) =>
    passage !== candidate
    && !("sourceResourceId" in passage)
    && classifyEvidenceMatch(passage.text, citationDraft.evidenceQuote) !== "none"
  );
  if (repaired) {
    return { rung: "verbatim", citation: { provenance: "generated", derivedNodeId, passageText: citationDraft.evidenceQuote } };
  }
  if (options.generatedPassageFallback && !("sourceResourceId" in candidate)) {
    // The whole cited passage, NOT the model's quote: the quote is the thing that failed to
    // verify, so persisting it would record a span that appears nowhere.
    return { rung: "generated_passage_fallback", citation: { provenance: "generated", derivedNodeId, passageText: candidate.text } };
  }
  return null;
}

export type OptionSelectGuardResult =
  // `citationRung` is transient build-time evidence, never persisted: it tells the key
  // verification phase whether this item still holds a verbatim anchor, which is the only
  // thing that distinguishes a pass-through from a drop when the judge is unavailable (D5).
  | { ok: true; item: OptionSelectItem; citationRung: CitationRung }
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
  // Option-select is a judge-verified type (D3), so it opts into the D9 fallback rung.
  const resolved = resolveGroundingCitation(grounding.passages, citationDraft, grounding.derivedNodeId, { generatedPassageFallback: true });
  if (!resolved) {
    return { ok: false, reason: "option-select correct option citation does not verify against grounding" };
  }
  const citation = resolved.citation;

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
    citationRung: resolved.rung,
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
