import type {
  BlockEvidence,
  DefinitionPassageDisposition,
  RunEvidenceProfile
} from "@lrnki/domain-core";
import type { DefinitionPassageQualityJudgmentPort } from "@lrnki/ports";
import { gateByJudgment } from "./gateByJudgment";

// Application-owned disposition behavior shared by Extraction and rescued Graph
// Enrichment. Both operation hashes include this closed value so a change in what
// happens after the semantic verdict cannot hide behind unchanged prompt identity.
export const DEFINITION_PASSAGE_DISPOSITION_POLICY = {
  establishesMeaning: "keep_definition",
  definesDifferentSubject: "reclassify_as_mention",
  structurallyHollow: "drop",
  judgeUnavailableOrUngrounded: "keep_definition"
} as const;

// Composed Definition-Passage quality stage (ADR-0007 extension). Runs AFTER the
// deterministic `applyEvidenceProfilePolicy` (the verbatim floor) and BEFORE
// `applyAssertionEntailmentJudge`. Every definition passage handed here is already
// verbatim-verified, so the judge checks MEANING, not grounding. The judge can only
// DROP from `definitions`: a wrong-subject passage is preserved as a deduplicated
// Mention Passage because it can still teach a relation involving the candidate; a
// bare name, heading, title, or citation is removed entirely as low-value mention text. Only
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

  // The Measured Judge Gate (rule 16, gateByJudgment) owns the control flow: `skip`
  // expresses the `core`-only / non-empty pre-filter with no neural call (R6);
  // `onVerdict` drops vetoed passages and rebuilds the profile (preserving object
  // identity when nothing drops); `onUnavailable` keeps every passage flagged
  // `kept_judge_unavailable` (fail closed = preserve recall, D3) so a transport blip
  // never shrinks the published core. Each outcome carries its per-profile `hollow`
  // flag for the post-gate fold.
  const judged = await gateByJudgment(input.profiles, {
    concurrency: input.concurrency,
    skip: (profile) =>
      profile.tier !== "core" || profile.definitions.length === 0
        ? { profile, dispositions: [] as DefinitionPassageDisposition[], hollow: false }
        : undefined,
    judge: (profile) => {
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
      return input.judge.judgeDefinitions({ declaredDomain: input.declaredDomain, subject, passages });
    },
    onVerdict: (profile, verdicts) => {
      const survivors: BlockEvidence[] = [];
      const reclassifiedMentions: BlockEvidence[] = [];
      const profileDispositions: DefinitionPassageDisposition[] = [];
      profile.definitions.forEach((definition, index) => {
        const verdict = verdicts?.[index];
        if (!verdict || verdict.establishesMeaning) {
          survivors.push(definition);
          profileDispositions.push(dispositionFor(profile.candidateKey, definition, "kept", "establishes_meaning", verdict?.rationale ?? "no verdict: passage kept"));
        } else {
          if (verdict.category === "defines_different_subject") reclassifiedMentions.push(definition);
          profileDispositions.push(dispositionFor(profile.candidateKey, definition, "vetoed", verdict.category, verdict.rationale));
        }
      });

      if (survivors.length === profile.definitions.length) {
        // Nothing dropped: preserve object identity (like reconcileUngroundableCores).
        return { profile, dispositions: profileDispositions, hollow: false };
      }
      const next: RunEvidenceProfile = {
        ...profile,
        definitions: survivors,
        mentions: dedupeEvidence([...reclassifiedMentions, ...profile.mentions]),
        complete: survivors.length >= 1
      };
      return { profile: next, dispositions: profileDispositions, hollow: survivors.length === 0 };
    },
    onUnavailable: (profile) => ({
      profile,
      dispositions: profile.definitions.map((definition) =>
        dispositionFor(profile.candidateKey, definition, "kept_judge_unavailable", "establishes_meaning", "judge transport failure: passage kept")
      ),
      hollow: false
    })
  });

  const profiles = judged.map((result, index) => {
    dispositions.push(...result.dispositions);
    if (result.hollow) hollowDefinitionKeys.add(input.profiles[index].candidateKey);
    return result.profile;
  });

  return { profiles, dispositions, hollowDefinitionKeys };
}

function dedupeEvidence(passages: BlockEvidence[]): BlockEvidence[] {
  const seen = new Set<string>();
  return passages.filter((passage) => {
    const key = `${passage.blockId}\u0000${passage.evidenceQuote}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
