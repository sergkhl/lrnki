import type {
  ImpostorItem,
  OptionSelectItem,
  StudyItemCandidateVerdict,
  StudyItemClaimVerdict
} from "@lrnki/domain-core";
import type {
  AnswerKeyGroundingPassage,
  AnswerKeyVerificationPort
} from "@lrnki/ports";
import type { CitationRung } from "./optionSelectGuard";
import {
  verifyGuardedItems,
  type VerificationOutcome,
  type VerificationRegeneration
} from "./verifyGuardedItems";

// Answer-Key Verification (ADR-0026, amended by plan 2026-08-19-001). The port asks one
// owner-neutral candidate-truth question. Neutral Study Items retain the shared two-round
// `verifyGuardedItems` envelope below; generated Support Steps call the exported one-shot
// option-select function from their own complete content-attempt envelope.

export type AnswerKeyVerificationRequest = Parameters<AnswerKeyVerificationPort["verify"]>[0];

export type AnswerKeyVerificationSubject<TItem> = {
  request: AnswerKeyVerificationRequest;
  item: TItem;
  // `generated_passage_fallback` = this neutral item has no verbatim grounding anchor at all,
  // so it exists only because a judge is expected to check it. Read by `onUnavailable`.
  citationRung: CitationRung;
  regenerate: (feedback: string) => Promise<VerificationRegeneration<AnswerKeyVerificationSubject<TItem>>>;
};

export type AnswerKeyVerificationSpec<TItem> = {
  verifier: AnswerKeyVerificationPort;
  concurrency?: number;
  vetoReason: (subject: AnswerKeyVerificationSubject<TItem>, verdicts: readonly StudyItemCandidateVerdict[]) => string | null;
  onUnavailable: (subject: AnswerKeyVerificationSubject<TItem>, error: unknown) => VerificationOutcome<TItem>;
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

export async function verifyAnswerKeys<TItem>(
  subjects: readonly AnswerKeyVerificationSubject<TItem>[],
  spec: AnswerKeyVerificationSpec<TItem>
): Promise<VerificationOutcome<TItem>[]> {
  return verifyGuardedItems<AnswerKeyVerificationSubject<TItem>, StudyItemCandidateVerdict[], TItem>(subjects, {
    ...(spec.concurrency === undefined ? {} : { concurrency: spec.concurrency }),
    judge: (subject) => spec.verifier.verify(subject.request),
    vetoReason: spec.vetoReason,
    onUnavailable: spec.onUnavailable
  });
}

type OptionForAnswerKey = Readonly<{ text: string; isCorrect: boolean }>;

type PresentedOption = Readonly<{
  ordinal: number;
  option: OptionForAnswerKey;
}>;

// Presentation ordinals are derived only from normalized candidate text. They do not depend on
// the server key, generator position, option id, or persisted order. The deterministic structural
// guard rejects normalized duplicates before either caller reaches this seam.
function presentOptions(options: readonly OptionForAnswerKey[]): PresentedOption[] {
  return [...options]
    .sort((left, right) => {
      const normalizedOrder = normalizeCandidateText(left.text).localeCompare(normalizeCandidateText(right.text), "en");
      return normalizedOrder || left.text.localeCompare(right.text, "en");
    })
    .map((option, ordinal) => ({ ordinal, option }));
}

export function answerKeyCandidates(options: readonly OptionForAnswerKey[]): { ordinal: number; text: string }[] {
  return presentOptions(options).map(({ ordinal, option }) => ({ ordinal, text: option.text }));
}

function normalizeCandidateText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLocaleLowerCase("en");
}

// The shared option-select veto is purely negative: confidently false key or confidently true
// distractor rejects. `unclear` never becomes a hard veto (AGENTS rule 16).
export function optionSelectKeyVetoReason(
  item: Pick<OptionSelectItem, "options"> | { options: readonly OptionForAnswerKey[] },
  verdicts: readonly StudyItemCandidateVerdict[]
): string | null {
  const offenders: string[] = [];
  for (const { ordinal, option } of presentOptions(item.options)) {
    const verdict = claimVerdictFor(verdicts, ordinal);
    if (option.isCorrect && verdict === "claim_false") {
      offenders.push(`the keyed correct answer "${option.text}" was judged false for this subject (${claimReasonFor(verdicts, ordinal)})`);
    }
    if (!option.isCorrect && verdict === "claim_true") {
      offenders.push(`distractor "${option.text}" was judged true for this subject (${claimReasonFor(verdicts, ordinal)})`);
    }
  }
  return offenders.length
    ? `option-select key verification rejected the item: ${offenders.join("; ")}. Rewrite so exactly one option is true of this subject.`
    : null;
}

// One-shot classification/veto seam for generated Support Steps. Required verifier failure is
// deliberately not caught here: it escapes the caller's content-attempt envelope unchanged.
export async function verifyOptionSelectAnswerKeyOnce(input: {
  verifier: AnswerKeyVerificationPort;
  declaredDomain: string;
  subject: { canonicalLabel: string; aliases: string[] };
  item: { question: string; options: readonly OptionForAnswerKey[] };
  groundingPassages: AnswerKeyGroundingPassage[];
  relatedConcepts: { label: string; snippet: string }[];
}): Promise<{ admitted: true } | { admitted: false; reason: string }> {
  const verdicts = await input.verifier.verify({
    itemType: "option_select",
    declaredDomain: input.declaredDomain,
    subject: input.subject,
    question: input.item.question,
    candidates: answerKeyCandidates(input.item.options),
    groundingPassages: input.groundingPassages,
    relatedConcepts: input.relatedConcepts
  });
  const reason = optionSelectKeyVetoReason(input.item, verdicts);
  return reason === null ? { admitted: true } : { admitted: false, reason };
}

// Impostor retains ADR-0026's standing affirmative requirement: its planted lie must be proven
// false, while non-keyed truths remain negative-only. The item already owns randomized statement
// ordinals, so the request and settlement correlate through those presentation ordinals.
export function impostorKeyVetoReason(
  item: ImpostorItem,
  verdicts: readonly StudyItemCandidateVerdict[]
): string | null {
  const offenders: string[] = [];
  for (const statement of item.statements) {
    const verdict = claimVerdictFor(verdicts, statement.ordinal);
    if (statement.isImpostor && verdict !== "claim_false") {
      offenders.push(`the planted lie "${statement.text}" was not judged false for this subject (${claimReasonFor(verdicts, statement.ordinal)})`);
    }
    if (!statement.isImpostor && verdict === "claim_false") {
      offenders.push(`the true statement "${statement.text}" was judged false for this subject (${claimReasonFor(verdicts, statement.ordinal)})`);
    }
  }
  return offenders.length
    ? `impostor key verification rejected the item: ${offenders.join("; ")}. Rewrite so exactly one statement is false of this subject.`
    : null;
}
