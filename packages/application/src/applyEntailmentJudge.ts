import type { RunClaim } from "@lrnki/domain-core";
import type { ClaimEntailmentJudgmentPort } from "@lrnki/ports";

// Composed semantic-entailment stage (ADR-0020). Runs AFTER the pure
// deterministic `applyClaimPolicy`. A claim that survived the verbatim floor, the
// nature/direction self-report gates, and the aggregate structural gates arrives
// here as "verified" PENDING entailment. The judge re-checks, per claim, whether
// the verbatim evidence actually supports the claim. The judge can ONLY downgrade:
// a deterministically-rejected claim is never re-examined, so the verbatim floor
// and structural gates remain authoritative (AGENTS rule 16 — neural judgment
// replaces the heuristic veto, but the provable guarantees stay deterministic).
//
// BOTH claim shapes are judged. Concept-to-concept claims are checked for the
// typed relation in the stated direction (`judge`). Literal `defined-as` claims
// are checked for definition entailment (`judgeDefinition`): the extractor
// PARAPHRASES the definition, so the old deterministic lexical-definition gate was
// a false-negative machine (AGENTS rule 16) — only entailment, not a surface
// matcher, can verify a paraphrased definition against the verbatim evidence.
export async function applyEntailmentJudge(input: {
  claims: RunClaim[];
  declaredDomain: string;
  conceptsByKey: Map<string, { canonicalLabel: string; aliases: string[] }>;
  judge: ClaimEntailmentJudgmentPort;
  concurrency?: number;
}): Promise<RunClaim[]> {
  const pendingIndexes = input.claims.flatMap((claim, index) =>
    claim.validationOutcome === "verified" ? [index] : []
  );
  if (pendingIndexes.length === 0) return input.claims;

  const result = [...input.claims];
  await mapWithConcurrency(pendingIndexes, input.concurrency ?? 4, async (index) => {
    const claim = input.claims[index];
    const subject = input.conceptsByKey.get(claim.subjectCandidateKey);
    // Missing labels should not happen for core-admitted endpoints, but fail
    // closed if they do — an unjudgeable claim is not promoted.
    if (!subject) {
      result[index] = downgrade(claim, "entailment_judge_missing_endpoint_labels");
      return;
    }
    const evidenceQuotes = claim.evidence.map((item) => item.evidenceQuote);
    try {
      if (claim.object.kind === "concept") {
        const object = input.conceptsByKey.get(claim.object.candidateKey);
        if (!object) {
          result[index] = downgrade(claim, "entailment_judge_missing_endpoint_labels");
          return;
        }
        const judgment = await input.judge.judge({
          declaredDomain: input.declaredDomain,
          subject,
          predicate: claim.predicate,
          object,
          evidenceQuotes
        });
        if (!judgment.entailed) result[index] = downgrade(claim, "evidence_does_not_entail_relation");
      } else {
        const judgment = await input.judge.judgeDefinition({
          declaredDomain: input.declaredDomain,
          subject,
          definition: claim.object.value,
          evidenceQuotes
        });
        if (!judgment.entailed) result[index] = downgrade(claim, "evidence_does_not_entail_definition");
      }
    } catch {
      // Fail closed: a judge transport failure must not silently promote a claim.
      result[index] = downgrade(claim, "entailment_judge_unavailable");
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
