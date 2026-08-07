import type { ImpostorItem, OptionSelectItem, StudyItemCandidateVerdict, StudyItemClaimVerdict } from "@lrnki/domain-core";
import type { StudyItemGroundingPassage, StudyItemKeyVerificationPort } from "@lrnki/ports";
import { gateByJudgment } from "./gateByJudgment";
import { mapWithConcurrency } from "./mapWithConcurrency";
import type { CitationRung } from "./optionSelectGuard";

// Study Item Key Verification (plan 2026-08-05-001 D2/D5/D7, amending ADR-0026). The shared
// batched phase behind BOTH verified item types: one cross-family judgment per guarded item
// classifies every candidate answer, a type-specific deterministic rule then decides whether
// the answer key is unique, and a vetoed item gets exactly one judge-informed regeneration.
//
// Why a phase rather than a call inside each node's generation loop (D7): it migrates the one
// divergent judge caller into `gateByJudgment` — the single rule-16 home — and puts peak
// independent-judge load under one explicit knob, which matters because the shared free-tier
// deployment throttles on concurrent brackets rather than on single requests.
//
// The uniqueness RULE is the caller's; this module owns the control flow the two types share.

// Both verified brackets read this one constant, so the option-select and impostor phases
// cannot drift apart. They can overlap in wall-clock, so peak judge load is up to twice this
// value — that is the knob's meaning, not a bug to correct with a second constant.
export const DEFAULT_KEY_VERIFICATION_CONCURRENCY = 4;

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
  // The ONE informed regeneration for this subject, closed over the node's generation context
  // where that context already exists. Returning a fresh subject (not just an item) is what
  // lets the second verification pass judge the NEW candidates rather than the vetoed ones.
  regenerate: (feedback: string) => Promise<KeyVerificationRegeneration<TItem>>;
};

export type KeyVerificationRegeneration<TItem> =
  | { ok: true; subject: KeyVerificationSubject<TItem> }
  | { ok: false; reason: string };

export type KeyVerificationOutcome<TItem> =
  | { admitted: true; item: TItem }
  | { admitted: false; reason: string };

export type KeyVerificationSpec<TItem> = {
  verifier: StudyItemKeyVerificationPort;
  concurrency?: number;
  // The type's answer-key uniqueness rule. Returns null to admit, or the veto reason — which
  // becomes both the rejected-row reason and the regeneration's feedback, so it must name the
  // offending candidate, not merely state that something was wrong.
  vetoReason: (subject: KeyVerificationSubject<TItem>, verdicts: readonly StudyItemCandidateVerdict[]) => string | null;
  // Disposition when NO verdict resolved. Deliberately per-type and asymmetric (D5, ADR-0026):
  // harm decides, not symmetry.
  onUnavailable: (subject: KeyVerificationSubject<TItem>, error: unknown) => KeyVerificationOutcome<TItem>;
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
): Promise<KeyVerificationOutcome<TItem>[]> {
  const concurrency = spec.concurrency ?? DEFAULT_KEY_VERIFICATION_CONCURRENCY;
  const first = await verifyOnce(subjects, spec, concurrency);

  // Only vetoed subjects get a second round, and each gets exactly one. Regeneration runs
  // inside this stage's wall-clock bracket but tags its spend with its own GENERATION stage
  // (the descriptor's `stageTag` travels with the call), so the cost report still separates
  // "what generation cost" from "what verification cost".
  const retryIndices = first.flatMap((result, index) => (result.status === "vetoed" ? [index] : []));
  if (retryIndices.length === 0) return first.map(settled);

  const regenerated = await mapWithConcurrency(retryIndices, concurrency, async (index) => {
    const vetoed = first[index];
    if (vetoed.status !== "vetoed") throw new Error("verifyStudyItemKeys: retry index is not vetoed");
    return { index, result: await subjects[index].regenerate(vetoed.reason) };
  });

  const reverified = await verifyOnce(
    regenerated.flatMap((entry) => (entry.result.ok ? [entry.result.subject] : [])),
    spec,
    concurrency
  );

  const outcomes = first.map(settled);
  let reverifiedCursor = 0;
  for (const entry of regenerated) {
    if (!entry.result.ok) {
      outcomes[entry.index] = { admitted: false, reason: entry.result.reason };
      continue;
    }
    // The second pass has no third round: a veto here is final, and an unavailable judge here
    // takes the same per-type disposition it would have taken on the first pass.
    outcomes[entry.index] = settled(reverified[reverifiedCursor]);
    reverifiedCursor += 1;
  }
  return outcomes;
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

type PassResult<TItem> =
  | { status: "admitted"; item: TItem }
  | { status: "vetoed"; reason: string }
  | { status: "unavailable"; outcome: KeyVerificationOutcome<TItem> };

async function verifyOnce<TItem>(
  subjects: readonly KeyVerificationSubject<TItem>[],
  spec: KeyVerificationSpec<TItem>,
  concurrency: number
): Promise<PassResult<TItem>[]> {
  // `onVerdict` is unreachable when the judge throws (gateByJudgment's load-bearing
  // invariant), so `vetoReason` — the only thing that can subtract an item — only ever sees
  // verdicts the judge actually resolved.
  return gateByJudgment<KeyVerificationSubject<TItem>, StudyItemCandidateVerdict[], PassResult<TItem>>(subjects, {
    concurrency,
    judge: (subject) => spec.verifier.verify(subject.request),
    onVerdict: (subject, verdicts) => {
      const reason = spec.vetoReason(subject, verdicts);
      return reason === null ? { status: "admitted", item: subject.item } : { status: "vetoed", reason };
    },
    onUnavailable: (subject, error) => ({ status: "unavailable", outcome: spec.onUnavailable(subject, error) })
  });
}

function settled<TItem>(result: PassResult<TItem>): KeyVerificationOutcome<TItem> {
  if (result.status === "admitted") return { admitted: true, item: result.item };
  if (result.status === "unavailable") return result.outcome;
  return { admitted: false, reason: result.reason };
}
