import type { RunClaim } from "@lrnki/domain-core";
import type { ClaimEntailmentJudgmentPort } from "@lrnki/ports";

// Composed semantic-entailment stage (ADR-0020). Runs AFTER the pure
// deterministic `applyClaimPolicy`. A concept claim that survived the verbatim
// floor, the nature/direction self-report gates, and the aggregate structural
// gates arrives here as "verified" PENDING entailment. The judge re-checks, per
// claim, whether the verbatim evidence actually asserts the typed relation in the
// stated direction. The judge can ONLY downgrade: a deterministically-rejected
// claim is never re-examined, so the verbatim floor and structural gates remain
// authoritative (AGENTS rule 16 — neural judgment replaces the heuristic veto,
// but the provable guarantees stay deterministic).
//
// Literal `defined-as` claims keep their deterministic verdict (the literal must
// already be copied from the quote, a far less brittle check). Only
// concept-to-concept claims are judged.
export async function applyEntailmentJudge(input: {
  claims: RunClaim[];
  declaredDomain: string;
  conceptsByKey: Map<string, { canonicalLabel: string; aliases: string[] }>;
  judge: ClaimEntailmentJudgmentPort;
  concurrency?: number;
}): Promise<RunClaim[]> {
  const pendingIndexes = input.claims.flatMap((claim, index) =>
    claim.validationOutcome === "verified" && claim.object.kind === "concept" ? [index] : []
  );
  if (pendingIndexes.length === 0) return input.claims;

  const result = [...input.claims];
  await mapWithConcurrency(pendingIndexes, input.concurrency ?? 4, async (index) => {
    const claim = input.claims[index];
    if (claim.object.kind !== "concept") return;
    const subject = input.conceptsByKey.get(claim.subjectCandidateKey);
    const object = input.conceptsByKey.get(claim.object.candidateKey);
    // Missing labels should not happen for core-admitted endpoints, but fail
    // closed if they do — an unjudgeable claim is not promoted.
    if (!subject || !object) {
      result[index] = downgrade(claim, "entailment_judge_missing_endpoint_labels");
      return;
    }
    let judgment;
    try {
      judgment = await input.judge.judge({
        declaredDomain: input.declaredDomain,
        subject,
        predicate: claim.predicate,
        object,
        evidenceQuotes: claim.evidence.map((item) => item.evidenceQuote)
      });
    } catch {
      // Fail closed: a judge transport failure must not silently promote a claim.
      result[index] = downgrade(claim, "entailment_judge_unavailable");
      return;
    }
    if (!judgment.entailed) {
      result[index] = downgrade(claim, "evidence_does_not_entail_relation");
    }
  });
  return result;
}

function downgrade(claim: RunClaim, reason: string): RunClaim {
  return {
    ...claim,
    validationOutcome: "rejected",
    boundaryReasonCodes: claim.boundaryReasonCodes.includes(reason)
      ? claim.boundaryReasonCodes
      : [...claim.boundaryReasonCodes, reason]
  };
}

async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await fn(items[index]);
    }
  });
  await Promise.all(workers);
}
