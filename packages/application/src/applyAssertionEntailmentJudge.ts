import type { BlockEvidence, RunEvidenceProfile, RunTypedAssertion } from "@lrnki/domain-core";
import type { AssertionEntailmentJudgmentPort } from "@lrnki/ports";
import { gateByJudgment } from "./gateByJudgment";

// Composed semantic-entailment stage for optional typed assertions (ADR-0007
// reset). Runs AFTER the deterministic `applyEvidenceProfilePolicy`. Each surviving
// `defines` assertion already cleared the verbatim floor; here the independent
// judge re-checks, per assertion, whether the evidence ACTUALLY states the
// definition. The judge can only REJECT:
// a rejected assertion is dropped but its underlying verified passage is preserved
// as an untyped mention (R: never lose grounded evidence). Definition and mention
// passages are NOT judged — they face the deterministic floor alone. Fail closed:
// a judge transport failure rejects the assertion (its passage still survives as a
// mention), never silently promotes it.
//
// The gate's unit is one neural call, and this judge makes one call per assertion, so
// it flattens to assertion granularity (KTD4): every assertion of every profile becomes
// one Measured Judge Gate item (rule 16, gateByJudgment). `skip` rejects a subject-less
// assertion with no neural call (R6); `onUnavailable` rejects on a judge failure — both
// keep the passage. Outcomes regroup by profile index into the same accept/demote fold
// as before, preserving object identity when a profile is unchanged.
export async function applyAssertionEntailmentJudge(input: {
  profiles: RunEvidenceProfile[];
  declaredDomain: string;
  conceptsByKey: Map<string, { canonicalLabel: string; aliases: string[] }>;
  judge: AssertionEntailmentJudgmentPort;
  concurrency?: number;
}): Promise<RunEvidenceProfile[]> {
  type FlatAssertion = {
    profileIndex: number;
    subject: { canonicalLabel: string; aliases: string[] } | undefined;
    assertion: RunTypedAssertion;
  };
  const flat: FlatAssertion[] = input.profiles.flatMap((profile, profileIndex) =>
    profile.assertions.map((assertion) => ({
      profileIndex,
      subject: input.conceptsByKey.get(profile.candidateKey),
      assertion
    }))
  );

  const outcomes = await gateByJudgment(flat, {
    concurrency: input.concurrency,
    skip: (item) =>
      item.subject ? undefined : { profileIndex: item.profileIndex, assertion: item.assertion, entailed: false },
    judge: (item) =>
      input.judge.judgeDefinition({
        declaredDomain: input.declaredDomain,
        subject: item.subject!, // skip filtered subject-less items: subject is defined here
        definition: item.assertion.literalValue,
        evidenceQuotes: item.assertion.evidence.map((evidence) => evidence.evidenceQuote)
      }),
    onVerdict: (item, judgment) => ({
      profileIndex: item.profileIndex,
      assertion: item.assertion,
      entailed: judgment.entailed
    }),
    onUnavailable: (item) => ({ profileIndex: item.profileIndex, assertion: item.assertion, entailed: false })
  });

  // Regroup by profile, preserving assertion order within each profile (the flat list
  // was built in profile/assertion order and the gate keeps results index-aligned).
  const acceptedByProfile = new Map<number, RunTypedAssertion[]>();
  const demotedByProfile = new Map<number, BlockEvidence[]>();
  for (const outcome of outcomes) {
    if (outcome.entailed) {
      const accepted = acceptedByProfile.get(outcome.profileIndex) ?? [];
      accepted.push(outcome.assertion);
      acceptedByProfile.set(outcome.profileIndex, accepted);
    } else {
      const demoted = demotedByProfile.get(outcome.profileIndex) ?? [];
      demoted.push(...outcome.assertion.evidence);
      demotedByProfile.set(outcome.profileIndex, demoted);
    }
  }

  return input.profiles.map((profile, profileIndex) => {
    const accepted = acceptedByProfile.get(profileIndex) ?? [];
    const demotedPassages = demotedByProfile.get(profileIndex) ?? [];
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
