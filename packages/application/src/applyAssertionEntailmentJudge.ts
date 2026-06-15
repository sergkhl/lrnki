import type { BlockEvidence, RunEvidenceProfile, RunTypedAssertion } from "@lrnki/domain-core";
import type { AssertionEntailmentJudgmentPort } from "@lrnki/ports";

// Composed semantic-entailment stage for optional typed assertions (ADR-0007
// reset). Runs AFTER the deterministic `applyEvidenceProfilePolicy`. Each surviving
// `defines` or `explicit-prerequisite-hint` assertion already cleared the verbatim
// floor; here the independent judge re-checks, per assertion, whether the evidence
// ACTUALLY states the definition / prerequisite hint. The judge can only REJECT:
// a rejected assertion is dropped but its underlying verified passage is preserved
// as an untyped mention (R: never lose grounded evidence). Definition and mention
// passages are NOT judged — they face the deterministic floor alone. Fail closed:
// a judge transport failure rejects the assertion (its passage still survives as a
// mention), never silently promotes it.
export async function applyAssertionEntailmentJudge(input: {
  profiles: RunEvidenceProfile[];
  declaredDomain: string;
  conceptsByKey: Map<string, { canonicalLabel: string; aliases: string[] }>;
  judge: AssertionEntailmentJudgmentPort;
  concurrency?: number;
}): Promise<RunEvidenceProfile[]> {
  return mapWithConcurrency(input.profiles, input.concurrency ?? 4, async (profile) => {
    if (profile.assertions.length === 0) return profile;
    const subject = input.conceptsByKey.get(profile.candidateKey);
    const accepted: RunTypedAssertion[] = [];
    const demotedPassages: BlockEvidence[] = [];
    for (const assertion of profile.assertions) {
      const entailed = subject ? await judgeAssertion(input, subject, assertion) : false;
      if (entailed) {
        accepted.push(assertion);
      } else {
        demotedPassages.push(...assertion.evidence);
      }
    }
    if (demotedPassages.length === 0 && accepted.length === profile.assertions.length) {
      return profile;
    }
    return {
      ...profile,
      assertions: accepted,
      // Preserve every rejected assertion's passage as a mention without exceeding
      // the existing distinct-passage set; appended at lowest salience.
      mentions: foldPassages(profile.mentions, demotedPassages)
    };
  });
}

async function judgeAssertion(
  input: {
    declaredDomain: string;
    conceptsByKey: Map<string, { canonicalLabel: string; aliases: string[] }>;
    judge: AssertionEntailmentJudgmentPort;
  },
  subject: { canonicalLabel: string; aliases: string[] },
  assertion: RunTypedAssertion
): Promise<boolean> {
  const evidenceQuotes = assertion.evidence.map((item) => item.evidenceQuote);
  try {
    if (assertion.type === "defines") {
      const judgment = await input.judge.judgeDefinition({
        declaredDomain: input.declaredDomain,
        subject,
        definition: assertion.literalValue,
        evidenceQuotes
      });
      return judgment.entailed;
    }
    const object = input.conceptsByKey.get(assertion.objectCandidateKey);
    if (!object) return false; // unjudgeable endpoint: fail closed
    const judgment = await input.judge.judgePrerequisiteHint({
      declaredDomain: input.declaredDomain,
      subject,
      object,
      evidenceQuotes
    });
    return judgment.entailed;
  } catch {
    return false; // judge transport failure: reject the assertion, keep the passage
  }
}

function foldPassages(existing: BlockEvidence[], added: BlockEvidence[]): BlockEvidence[] {
  const key = (passage: BlockEvidence) => `${passage.blockId}::${passage.evidenceQuote.replace(/\s+/g, " ").trim().toLowerCase()}`;
  const seen = new Set(existing.map(key));
  const result = [...existing];
  for (const passage of added) {
    const passageKey = key(passage);
    if (seen.has(passageKey)) continue;
    seen.add(passageKey);
    result.push(passage);
  }
  return result;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
