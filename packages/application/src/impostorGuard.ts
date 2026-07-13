import { randomUUID } from "node:crypto";
import {
  type ImpostorItem,
  type ImpostorItemDraft,
  type ImpostorStatement,
  type ImpostorTruthStatement
} from "@lrnki/domain-core";
import { normalizeOptionText, resolveGroundingCitation, type StudyItemGuardGrounding } from "./optionSelectGuard";
import { validateItemExplorableTerms } from "./explorableTerms";

// Deterministic impostor guard (U4, R1/R5/R6/R8, ADR-0026). Promotes an impostor draft to a
// persistable item ONLY when it satisfies provable structural and provenance guarantees, and
// rejects with a distinct reason otherwise. This is the rule-16-permitted veto: it enforces
// checkable properties — exactly one keyed lie, three truths that each trace verbatim to the
// node's grounding, and a `generated` impostor that carries NO source citation — never a
// lexical opinion about whether the lie READS as plausible or the reveal TEACHES. That
// semantic quality is judged only by the rule-14 human pass (U8). The guard mutates nothing
// and imports no graph/enrichment write port (R13). Failing it is NOT a run failure: the node
// is simply recorded impostor-absent (R9, U5).

// The build-time context the guard needs to assemble a persistable ImpostorItem: the item
// identity + grounding provenance, plus the passages each true statement must trace to. Shared
// with option-select and matching (rule 18). Built by the fan-out (U5).
export type ImpostorGrounding = StudyItemGuardGrounding;

export type ImpostorGuardResult =
  | { ok: true; item: ImpostorItem }
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

  // (2) a non-empty reveal (R6 — a wrong guess must never leave a misconception unresolved).
  if (!draft.lie.reveal.trim()) {
    return { ok: false, reason: "impostor carries no reveal" };
  }

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
  for (const statement of truths) {
    if (!statement.citation) {
      return { ok: false, reason: "impostor true statement carries no grounding citation" };
    }
    const citationDraft = statement.citation;
    const citation = resolveGroundingCitation(grounding.passages, citationDraft, grounding.derivedNodeId);
    if (!citation) {
      return { ok: false, reason: "impostor true statement citation does not verify against grounding" };
    }
    builtTruths.push({ statementId: newStatementId(), ordinal: 0, text: statement.text, isImpostor: false, provenance: citation.provenance, citation });
  }

  const lie: ImpostorStatement = {
    statementId: newStatementId(),
    ordinal: 0,
    text: draft.lie.text,
    isImpostor: true,
    provenance: "generated",
    reveal: draft.lie.reveal,
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
      explorableTerms: validateItemExplorableTerms(draft.explorableTerms ?? [], draft.question, grounding.canonicalLabel),
      question: draft.question,
      statements: built
    }
  };
}
