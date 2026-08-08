import { gateByJudgment } from "./gateByJudgment";
import { mapWithConcurrency } from "./mapWithConcurrency";

// The shared post-guard verification phase (plan 2026-08-05-001 D7, generalized by
// 2026-08-07-001 U3). Every neurally verified Study Item type runs the SAME envelope:
//
//   one judgment per guarded item
//     -> a deterministic veto rule over verdicts the judge actually resolved
//     -> a vetoed item gets exactly ONE judge-informed regeneration
//     -> guard, verify once more, then settle — there is no third round
//     -> an unavailable judge takes the type's own disposition, never a veto
//
// What differs between the three verified types is the QUESTION (claim truth per candidate for
// option-select and impostor; assignment fit across the grid for matching), the veto RULE, and
// the unavailability disposition. All three are spec callbacks; none of them is control flow, so
// the control flow lives here once (AGENTS rule 18) rather than being re-proven per type.
//
// Why a phase rather than a call inside each node's generation loop: it keeps every judge caller
// inside `gateByJudgment` — the single rule-16 home — and puts peak judge load under one explicit
// knob, which matters because the shared free-tier deployment throttles on concurrent brackets
// rather than on single requests.

// Every verification bracket reads this one constant, so the three cannot drift apart. They can
// overlap in wall-clock, so peak judge load is up to three times this value — that is the knob's
// meaning, not a bug to correct with three constants. This is also the knob that moves if a gate
// sees 429s; production GENERATION concurrency is never lowered to make a gate pass.
export const DEFAULT_ITEM_VERIFICATION_CONCURRENCY = 4;

export type VerificationRegeneration<TSubject> =
  | { ok: true; subject: TSubject }
  | { ok: false; reason: string };

export type VerificationOutcome<TItem> =
  | { admitted: true; item: TItem }
  | { admitted: false; reason: string };

// The minimum a subject must carry for this phase. Concrete subjects add whatever their judge
// and disposition need — a rendered request, a citation rung — and the spec callbacks, typed at
// the call site, read those fields directly; the phase never looks at them.
//
// `regenerate` returns a fresh SUBJECT rather than an item, which is what lets the second pass
// judge the NEW candidates instead of re-judging the vetoed ones. That is why `TSubject` is
// F-bounded (`TSubject extends VerifiableSubject<TSubject, …>`): the regeneration of a subject
// is another subject of exactly its own type.
export type VerifiableSubject<TSubject, TItem> = {
  item: TItem;
  // The ONE informed regeneration for this subject, closed over the node's generation context
  // where that context already exists.
  regenerate: (feedback: string) => Promise<VerificationRegeneration<TSubject>>;
};

export type VerificationSpec<TSubject, TVerdict, TItem> = {
  concurrency?: number;
  // The ONE neural call per subject. May reject; a rejected call routes to `onUnavailable`.
  judge: (subject: TSubject) => Promise<TVerdict>;
  // The type's admission rule. Returns null to admit, or the veto reason — which becomes both
  // the rejected-row reason and the regeneration's feedback, so it must name the offending
  // candidate or cell, not merely state that something was wrong.
  vetoReason: (subject: TSubject, verdict: TVerdict) => string | null;
  // Disposition when NO verdict resolved. Deliberately per-type and asymmetric (ADR-0026):
  // harm decides, not symmetry.
  onUnavailable: (subject: TSubject, error: unknown) => VerificationOutcome<TItem>;
};

export async function verifyGuardedItems<TSubject extends VerifiableSubject<TSubject, TItem>, TVerdict, TItem>(
  subjects: readonly TSubject[],
  spec: VerificationSpec<TSubject, TVerdict, TItem>
): Promise<VerificationOutcome<TItem>[]> {
  const concurrency = spec.concurrency ?? DEFAULT_ITEM_VERIFICATION_CONCURRENCY;
  const first = await verifyOnce(subjects, spec, concurrency);

  // Only vetoed subjects get a second round, and each gets exactly one. Regeneration runs
  // inside this stage's wall-clock bracket but tags its spend with its own GENERATION stage
  // (the descriptor's `stageTag` travels with the call), so the cost report still separates
  // "what generation cost" from "what verification cost".
  const retryIndices = first.flatMap((result, index) => (result.status === "vetoed" ? [index] : []));
  if (retryIndices.length === 0) return first.map(settled);

  const regenerated = await mapWithConcurrency(retryIndices, concurrency, async (index) => {
    const vetoed = first[index];
    if (vetoed.status !== "vetoed") throw new Error("verifyGuardedItems: retry index is not vetoed");
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

type PassResult<TItem> =
  | { status: "admitted"; item: TItem }
  | { status: "vetoed"; reason: string }
  | { status: "unavailable"; outcome: VerificationOutcome<TItem> };

async function verifyOnce<TSubject extends VerifiableSubject<TSubject, TItem>, TVerdict, TItem>(
  subjects: readonly TSubject[],
  spec: VerificationSpec<TSubject, TVerdict, TItem>,
  concurrency: number
): Promise<PassResult<TItem>[]> {
  // `onVerdict` is unreachable when the judge throws (gateByJudgment's load-bearing
  // invariant), so `vetoReason` — the only thing that can subtract an item — only ever sees
  // verdicts the judge actually resolved.
  return gateByJudgment<TSubject, TVerdict, PassResult<TItem>>(subjects, {
    concurrency,
    judge: (subject) => spec.judge(subject),
    onVerdict: (subject, verdict) => {
      const reason = spec.vetoReason(subject, verdict);
      return reason === null ? { status: "admitted", item: subject.item } : { status: "vetoed", reason };
    },
    onUnavailable: (subject, error) => ({ status: "unavailable", outcome: spec.onUnavailable(subject, error) })
  });
}

function settled<TItem>(result: PassResult<TItem>): VerificationOutcome<TItem> {
  if (result.status === "admitted") return { admitted: true, item: result.item };
  if (result.status === "unavailable") return result.outcome;
  return { admitted: false, reason: result.reason };
}
