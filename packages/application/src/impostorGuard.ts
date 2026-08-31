import { randomUUID } from "node:crypto";
import {
  type ImpostorItem,
  type ImpostorItemDraft,
  type ImpostorStatement,
  type ImpostorTruthStatement
} from "@lrnki/domain-core";
import { normalizeOptionText, resolveGroundingCitation, type CitationRung, type StudyItemGuardGrounding } from "./optionSelectGuard";

// Deterministic impostor guard (U4, R1/R5/R6/R8, ADR-0026). Promotes an impostor draft to a
// persistable item ONLY when it satisfies provable structural and provenance guarantees, and
// rejects with a distinct reason otherwise. This is the rule-16-permitted veto: it enforces
// checkable properties — exactly one keyed lie, three truths that each trace verbatim to the
// node's grounding, a code-owned question, a correction copied from resolved grounding, and a
// `generated` impostor that carries NO source citation — never a lexical opinion about whether
// the lie READS as plausible or the correction TEACHES. That semantic quality stays with source
// support, answer-key verification, and direct real-use inspection. The guard mutates nothing and
// imports no graph/enrichment write port (R13). Failing it is NOT a run failure: the node is simply
// recorded impostor-absent (R9, U5).

// The build-time context the guard needs to assemble a persistable ImpostorItem: the item
// identity + grounding provenance, plus the passages each true statement must trace to. Shared
// with option-select and matching (rule 18). Built by the fan-out (U5).
export type ImpostorGrounding = StudyItemGuardGrounding;

export type ImpostorGuardResult =
  // `generated_passage_fallback` when ANY of the three truths lost its verbatim anchor —
  // the weakest link decides, since one unanchored truth is enough to make the item's
  // correctness rest wholly on the judge (D5).
  | { ok: true; item: ImpostorItem; citationRung: CitationRung }
  | { ok: false; reason: string };

const REQUIRED_STATEMENT_COUNT = 4;

export function validateImpostorItem(
  draft: ImpostorItemDraft,
  grounding: ImpostorGrounding,
  newStatementId: () => string = randomUUID,
  liePosition: () => number = () => Math.floor(Math.random() * REQUIRED_STATEMENT_COUNT)
): ImpostorGuardResult {
  const truths = draft.truths;

  // (1) exactly three truths plus one lie object.
  if (truths.length !== 3) {
    return { ok: false, reason: `impostor requires exactly 3 true statements, got ${truths.length}` };
  }

  // (2) a generation-selected target grounding PASSAGE becomes the learner-visible correction
  // itself (R6). The lie remains honestly uncited. The model's quote verifies its passage choice,
  // but cannot shorten the learner correction to an unhelpful fragment: the complete passage text
  // has one application-owned projection for source and generated groundings alike. Source
  // admission still judges whether that complete correction materially supports the item; the
  // model cannot append a second paraphrase or choose the learner-visible span.
  const selectedRevealPassage = grounding.passages.find(
    (passage) => passage.passageId === draft.lie.revealCitation.passageId
  );
  const resolvedReveal = resolveGroundingCitation(
    grounding.passages,
    draft.lie.revealCitation,
    grounding.derivedNodeId,
    { generatedPassageFallback: true }
  );
  if (!resolvedReveal) {
    return { ok: false, reason: "impostor reveal citation does not verify against grounding" };
  }
  if (!selectedRevealPassage) {
    return { ok: false, reason: "impostor reveal citation does not identify target grounding" };
  }
  const revealWitness = selectedRevealPassage.text;

  // (3) lieSource present, with siblingLabel non-empty IFF the lie is sibling-sourced.
  const siblingLabel = draft.lie.siblingLabel?.trim();
  if (draft.lie.lieSource !== "sibling" && draft.lie.lieSource !== "generated") {
    return { ok: false, reason: "impostor carries no lieSource" };
  }
  if (draft.lie.lieSource === "sibling" && !siblingLabel) {
    return { ok: false, reason: "impostor lieSource 'sibling' requires a siblingLabel" };
  }
  if (draft.lie.lieSource === "generated" && siblingLabel) {
    return { ok: false, reason: "impostor lieSource 'generated' must carry no siblingLabel" };
  }

  const insertedLiePosition = liePosition();
  if (!Number.isInteger(insertedLiePosition) || insertedLiePosition < 0 || insertedLiePosition >= REQUIRED_STATEMENT_COUNT) {
    return { ok: false, reason: "impostor lie position must be an integer from 0 to 3" };
  }

  // (4) build each truth. Each truth verifies verbatim against a cited grounding passage;
  // its resolved provenance is taken from the MATCHED passage (authoritative), never the
  // draft's claim — fail-closed labeling. The lie object carries no citation, labeled
  // `generated` (a source-cited impostor is the honesty inversion this guard blocks).
  const builtTruths: ImpostorTruthStatement[] = [];
  let citationRung: CitationRung = resolvedReveal.rung;
  for (const statement of truths) {
    if (!statement.citation) {
      return { ok: false, reason: "impostor true statement carries no grounding citation" };
    }
    const citationDraft = statement.citation;
    // Impostor is a judge-verified type (D3), so it opts into the D9 fallback rung.
    const resolved = resolveGroundingCitation(grounding.passages, citationDraft, grounding.derivedNodeId, { generatedPassageFallback: true });
    if (!resolved) {
      return { ok: false, reason: "impostor true statement citation does not verify against grounding" };
    }
    if (resolved.rung === "generated_passage_fallback") citationRung = "generated_passage_fallback";
    const citation = resolved.citation;
    builtTruths.push({ statementId: newStatementId(), ordinal: 0, text: statement.text, isImpostor: false, provenance: citation.provenance, citation });
  }

  const lie: ImpostorStatement = {
    statementId: newStatementId(),
    ordinal: 0,
    text: draft.lie.text,
    isImpostor: true,
    provenance: "generated",
    reveal: revealWitness,
    lieSource: draft.lie.lieSource,
    ...(draft.lie.lieSource === "sibling" ? { siblingLabel: siblingLabel! } : {})
  };

  // (5) the impostor is distinct from every truth after the shared normalization collapse.
  const impostorText = normalizeOptionText(lie.text);
  if (builtTruths.some((statement) => normalizeOptionText(statement.text) === impostorText)) {
    return { ok: false, reason: "impostor statement is identical to a true statement after normalization" };
  }
  const built: ImpostorStatement[] = [...builtTruths];
  built.splice(insertedLiePosition, 0, lie);
  built.forEach((statement, ordinal) => { statement.ordinal = ordinal; });

  return {
    ok: true,
    citationRung,
    item: {
      itemType: "impostor",
      studyItemId: grounding.studyItemId,
      graphVersionId: grounding.graphVersionId,
      enrichmentId: grounding.enrichmentId,
      derivedNodeId: grounding.derivedNodeId,
      groundingProvenance: grounding.groundingProvenance,
      generatingModel: grounding.generatingModel,
      configHash: grounding.configHash,
      ...(grounding.facet ? { facet: grounding.facet } : {}),
      // The stem has no generated clause and introduces no explorable term beyond the owning
      // Concept label, which is intentionally excluded from term affordances.
      explorableTerms: [],
      question: `Which statement about ${grounding.canonicalLabel} is false?`,
      statements: built
    }
  };
}
