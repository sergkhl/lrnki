import { randomUUID } from "node:crypto";
import {
  classifyEvidenceMatch,
  type ImpostorItem,
  type ImpostorItemDraft,
  type ImpostorStatement,
  type StudyItemCitation,
  type StudyItemGroundingProvenance
} from "@lrnki/domain-core";
import { normalizeOptionText, type OptionSelectGroundingPassage } from "./optionSelectGuard";

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
// identity + grounding provenance, plus the passages each true statement must trace to. The
// passage shape is shared with option-select (rule 18). Built by the fan-out (U5).
export type ImpostorGrounding = {
  studyItemId: string;
  graphVersionId: string;
  enrichmentId: string;
  derivedNodeId: string;
  groundingProvenance: StudyItemGroundingProvenance;
  generatingModel: string;
  configHash: string;
  passages: OptionSelectGroundingPassage[];
};

export type ImpostorGuardResult =
  | { ok: true; item: ImpostorItem }
  | { ok: false; reason: string };

const REQUIRED_STATEMENT_COUNT = 4;

export function validateImpostorItem(
  draft: ImpostorItemDraft,
  grounding: ImpostorGrounding,
  newStatementId: () => string = randomUUID
): ImpostorGuardResult {
  const statements = draft.statements;

  // (1) exactly four statements.
  if (statements.length !== REQUIRED_STATEMENT_COUNT) {
    return { ok: false, reason: `impostor requires exactly ${REQUIRED_STATEMENT_COUNT} statements, got ${statements.length}` };
  }

  // (2) exactly one impostor.
  const impostorCount = statements.filter((statement) => statement.isImpostor).length;
  if (impostorCount !== 1) {
    return { ok: false, reason: `impostor requires exactly one impostor statement, got ${impostorCount}` };
  }

  // (3) a non-empty reveal (R6 — a wrong guess must never leave a misconception unresolved).
  if (!draft.reveal.trim()) {
    return { ok: false, reason: "impostor carries no reveal" };
  }

  // (4) lieSource present, with siblingLabel non-empty IFF the lie is sibling-sourced.
  const siblingLabel = draft.siblingLabel?.trim();
  if (draft.lieSource !== "sibling" && draft.lieSource !== "generated") {
    return { ok: false, reason: "impostor carries no lieSource" };
  }
  if (draft.lieSource === "sibling" && !siblingLabel) {
    return { ok: false, reason: "impostor lieSource 'sibling' requires a siblingLabel" };
  }
  if (draft.lieSource === "generated" && siblingLabel) {
    return { ok: false, reason: "impostor lieSource 'generated' must carry no siblingLabel" };
  }

  // (5) build each statement. Each truth verifies verbatim against a cited grounding passage;
  // its resolved provenance is taken from the MATCHED passage (authoritative), never the
  // draft's claim — fail-closed labeling. The impostor carries no citation, labeled
  // `generated` (a source-cited impostor is the honesty inversion this guard blocks).
  const built: ImpostorStatement[] = [];
  for (let ordinal = 0; ordinal < statements.length; ordinal += 1) {
    const statement = statements[ordinal];
    if (statement.isImpostor) {
      if (statement.citation) {
        return { ok: false, reason: "impostor statement must carry no grounding citation" };
      }
      built.push({ statementId: newStatementId(), ordinal, text: statement.text, isImpostor: true, provenance: "generated" });
      continue;
    }
    if (!statement.citation) {
      return { ok: false, reason: "impostor true statement carries no grounding citation" };
    }
    const citationDraft = statement.citation;
    const candidate = grounding.passages.find((passage) => passage.passageId === citationDraft.passageId);
    const matchKind = candidate ? classifyEvidenceMatch(candidate.text, citationDraft.evidenceQuote) : "none";
    if (!candidate || matchKind === "none") {
      return { ok: false, reason: "impostor true statement citation does not verify against grounding" };
    }
    const citation: StudyItemCitation =
      "sourceResourceId" in candidate
        ? {
            provenance: "source",
            sourceResourceId: candidate.sourceResourceId,
            sourceBlockId: candidate.sourceBlockId,
            evidenceQuote: citationDraft.evidenceQuote,
            matchKind
          }
        : { provenance: "generated", derivedNodeId: grounding.derivedNodeId, passageText: citationDraft.evidenceQuote };
    built.push({ statementId: newStatementId(), ordinal, text: statement.text, isImpostor: false, provenance: citation.provenance, citation });
  }

  // (6) the impostor is distinct from every truth after the shared normalization collapse.
  const impostor = built.find((statement) => statement.isImpostor)!;
  const impostorText = normalizeOptionText(impostor.text);
  if (built.some((statement) => !statement.isImpostor && normalizeOptionText(statement.text) === impostorText)) {
    return { ok: false, reason: "impostor statement is identical to a true statement after normalization" };
  }

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
      question: draft.question,
      statements: built,
      reveal: draft.reveal,
      lieSource: draft.lieSource,
      ...(draft.lieSource === "sibling" ? { siblingLabel: siblingLabel! } : {})
    }
  };
}
