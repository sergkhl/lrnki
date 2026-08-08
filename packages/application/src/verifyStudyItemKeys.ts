import type { ImpostorItem, OptionSelectItem, StudyItemCandidateVerdict, StudyItemClaimVerdict } from "@lrnki/domain-core";
import type { StudyItemGroundingPassage, StudyItemKeyVerificationPort } from "@lrnki/ports";
import type { CitationRung } from "./optionSelectGuard";
import {
  verifyGuardedItems,
  type VerificationOutcome,
  type VerificationRegeneration
} from "./verifyGuardedItems";

// Study Item Key Verification (plan 2026-08-05-001 D2/D5/D7, amending ADR-0026). One
// cross-family judgment per guarded item classifies every candidate answer, and a type-specific
// deterministic rule then decides whether the answer key is unique.
//
// The two-round control flow this phase runs is NOT owned here — `verifyGuardedItems` owns it
// for every verified item type (rule 18). What this module owns is the key-verification QUESTION
// (the port and its request shape) and the two answer-key uniqueness RULES.

export type KeyVerificationRequest = {
  itemType: "option_select" | "impostor";
  declaredDomain: string;
  node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
  question?: string;
  candidates: { ordinal: number; text: string }[];
  groundingPassages: StudyItemGroundingPassage[];
  siblings: { label: string; snippet: string }[];
};

export type KeyVerificationSubject<TItem> = {
  request: KeyVerificationRequest;
  item: TItem;
  // `generated_passage_fallback` = this item has no verbatim grounding anchor at all, so it
  // exists only because a judge is expected to check it (D6). Read by `onUnavailable`.
  citationRung: CitationRung;
  regenerate: (feedback: string) => Promise<VerificationRegeneration<KeyVerificationSubject<TItem>>>;
};

export type KeyVerificationSpec<TItem> = {
  verifier: StudyItemKeyVerificationPort;
  concurrency?: number;
  vetoReason: (subject: KeyVerificationSubject<TItem>, verdicts: readonly StudyItemCandidateVerdict[]) => string | null;
  onUnavailable: (subject: KeyVerificationSubject<TItem>, error: unknown) => VerificationOutcome<TItem>;
};

// A verdict the judge never returned for an ordinal is `unclear`, never an error and never a
// veto: a short or reordered response leaves that candidate unjudged, and "the judge did not
// say" is exactly as weak a guarantee as "the judge was unsure" (AGENTS rule 16).
export function claimVerdictFor(verdicts: readonly StudyItemCandidateVerdict[], ordinal: number): StudyItemClaimVerdict {
  return verdicts.find((verdict) => verdict.ordinal === ordinal)?.verdict ?? "unclear";
}

export function claimReasonFor(verdicts: readonly StudyItemCandidateVerdict[], ordinal: number): string {
  return verdicts.find((verdict) => verdict.ordinal === ordinal)?.reason.trim() || "no reason given";
}

export async function verifyStudyItemKeys<TItem>(
  subjects: readonly KeyVerificationSubject<TItem>[],
  spec: KeyVerificationSpec<TItem>
): Promise<VerificationOutcome<TItem>[]> {
  return verifyGuardedItems<KeyVerificationSubject<TItem>, StudyItemCandidateVerdict[], TItem>(subjects, {
    ...(spec.concurrency === undefined ? {} : { concurrency: spec.concurrency }),
    judge: (subject) => spec.verifier.verify(subject.request),
    vetoReason: spec.vetoReason,
    onUnavailable: spec.onUnavailable
  });
}

// --- The two answer-key uniqueness rules (D5) ---------------------------------------
//
// Both are deterministic functions of verdicts a judge confidently returned, which is what
// keeps them inside AGENTS rule 16: the neural half classifies claims, the veto half proves
// a property over those classifications.
//
// Read the asymmetry between them carefully, because it is deliberate and it is NOT
// "`unclear` vetoes for impostor". Option-select's rule is purely negative — it subtracts an
// item only on a confident OPPOSING verdict, so `unclear` anywhere admits. Impostor's rule
// carries one affirmative requirement — the planted lie must be *proven* false — which
// ADR-0026 already justified by harm long before this plan: a "lie" that is actually true
// teaches a falsehood, while a missing impostor item is the designed safe state. An
// `unclear` lie therefore fails to meet a standing requirement rather than being vetoed by
// the judge's uncertainty. Every NON-keyed candidate in both rules is negative-only.

export function optionSelectKeyVetoReason(
  item: OptionSelectItem,
  verdicts: readonly StudyItemCandidateVerdict[]
): string | null {
  const offenders: string[] = [];
  item.options.forEach((option, ordinal) => {
    const verdict = claimVerdictFor(verdicts, ordinal);
    if (option.isCorrect && verdict === "claim_false") {
      offenders.push(`the keyed correct answer "${option.text}" was judged false for this concept (${claimReasonFor(verdicts, ordinal)})`);
    }
    if (!option.isCorrect && verdict === "claim_true") {
      offenders.push(`distractor "${option.text}" was judged true for this concept (${claimReasonFor(verdicts, ordinal)})`);
    }
  });
  return offenders.length
    ? `option-select key verification rejected the item: ${offenders.join("; ")}. Rewrite so exactly one option is true of this concept.`
    : null;
}

export function impostorKeyVetoReason(
  item: ImpostorItem,
  verdicts: readonly StudyItemCandidateVerdict[]
): string | null {
  const offenders: string[] = [];
  for (const statement of item.statements) {
    const verdict = claimVerdictFor(verdicts, statement.ordinal);
    if (statement.isImpostor && verdict !== "claim_false") {
      offenders.push(`the planted lie "${statement.text}" was not judged false for this concept (${claimReasonFor(verdicts, statement.ordinal)})`);
    }
    if (!statement.isImpostor && verdict === "claim_false") {
      offenders.push(`the true statement "${statement.text}" was judged false for this concept (${claimReasonFor(verdicts, statement.ordinal)})`);
    }
  }
  return offenders.length
    ? `impostor key verification rejected the item: ${offenders.join("; ")}. Rewrite so exactly one statement is false of this concept.`
    : null;
}
