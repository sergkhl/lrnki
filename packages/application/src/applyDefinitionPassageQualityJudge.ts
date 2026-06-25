import type {
  BlockEvidence,
  DefinitionPassageDisposition,
  DefinitionPassageQualityJudgment,
  RunEvidenceProfile
} from "@lrnki/domain-core";
import type { DefinitionPassageQualityJudgmentPort } from "@lrnki/ports";

// Composed Definition-Passage quality stage (ADR-0007 extension). Runs AFTER the
// deterministic `applyEvidenceProfilePolicy` (the verbatim floor) and BEFORE
// `applyAssertionEntailmentJudge`. Every definition passage handed here is already
// verbatim-verified, so the judge checks MEANING, not grounding. The judge can only
// DROP: a passage vetoed as hollow (bare name, heading, title, citation) is removed
// entirely (KTD5 — unlike a rejected assertion it is low-value as a mention). Only
// `core`-tier profiles are judged (KTD2): optional profiles never gate publication on
// a complete definition, so judging them spends tokens for no disposition consequence.
//
// Pure transform around the port: it does NO grounding itself (the adapter already
// grounded each verdict fail-closed); it trusts `establishesMeaning`. Fail closed: a
// judge throw KEEPS every passage with a `kept_judge_unavailable` disposition, so a
// transport blip never shrinks the published core (D3). When a profile started with
// >=1 definition and ends with 0, its key joins `hollowDefinitionKeys`, which routes
// the demotion to the distinct hollow reason code in `reconcileUngroundableCores`.
export async function applyDefinitionPassageQualityJudge(input: {
  profiles: RunEvidenceProfile[];
  declaredDomain: string;
  conceptsByKey: Map<string, { canonicalLabel: string; aliases: string[] }>;
  blockContextById: Map<string, { blockType: string; headingPath: string[] }>;
  judge: DefinitionPassageQualityJudgmentPort;
  concurrency?: number;
}): Promise<{
  profiles: RunEvidenceProfile[];
  dispositions: DefinitionPassageDisposition[];
  hollowDefinitionKeys: Set<string>;
}> {
  const dispositions: DefinitionPassageDisposition[] = [];
  const hollowDefinitionKeys = new Set<string>();

  const judged = await mapWithConcurrency(input.profiles, input.concurrency ?? 4, async (profile) => {
    if (profile.tier !== "core" || profile.definitions.length === 0) {
      return { profile, dispositions: [] as DefinitionPassageDisposition[], hollow: false };
    }
    const subject = input.conceptsByKey.get(profile.candidateKey) ?? { canonicalLabel: profile.candidateKey, aliases: [] };
    const passages = profile.definitions.map((definition) => {
      const context = input.blockContextById.get(definition.blockId) ?? { blockType: "paragraph", headingPath: [] };
      return {
        sourceBlockId: definition.blockId,
        evidenceQuote: definition.evidenceQuote,
        blockType: context.blockType,
        headingPath: context.headingPath
      };
    });

    let verdicts: DefinitionPassageQualityJudgment[] | undefined;
    try {
      verdicts = await input.judge.judgeDefinitions({ declaredDomain: input.declaredDomain, subject, passages });
    } catch {
      // Fail closed = preserve recall: keep every passage, flag it (D3, rule 16).
      return {
        profile,
        dispositions: profile.definitions.map((definition) =>
          dispositionFor(profile.candidateKey, definition, "kept_judge_unavailable", "establishes_meaning", "judge transport failure: passage kept")
        ),
        hollow: false
      };
    }

    const survivors: BlockEvidence[] = [];
    const profileDispositions: DefinitionPassageDisposition[] = [];
    profile.definitions.forEach((definition, index) => {
      const verdict = verdicts?.[index];
      if (!verdict || verdict.establishesMeaning) {
        survivors.push(definition);
        profileDispositions.push(dispositionFor(profile.candidateKey, definition, "kept", "establishes_meaning", verdict?.rationale ?? "no verdict: passage kept"));
      } else {
        profileDispositions.push(dispositionFor(profile.candidateKey, definition, "vetoed", verdict.category, verdict.rationale));
      }
    });

    if (survivors.length === profile.definitions.length) {
      // Nothing dropped: preserve object identity (like reconcileUngroundableCores).
      return { profile, dispositions: profileDispositions, hollow: false };
    }
    const next: RunEvidenceProfile = { ...profile, definitions: survivors, complete: survivors.length >= 1 };
    return { profile: next, dispositions: profileDispositions, hollow: survivors.length === 0 };
  });

  const profiles = judged.map((result, index) => {
    dispositions.push(...result.dispositions);
    if (result.hollow) hollowDefinitionKeys.add(input.profiles[index].candidateKey);
    return result.profile;
  });

  return { profiles, dispositions, hollowDefinitionKeys };
}

function dispositionFor(
  candidateKey: string,
  definition: BlockEvidence,
  disposition: DefinitionPassageDisposition["disposition"],
  category: DefinitionPassageDisposition["category"],
  rationale: string
): DefinitionPassageDisposition {
  return { candidateKey, sourceBlockId: definition.blockId, evidenceQuote: definition.evidenceQuote, disposition, category, rationale };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) || 1 }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
