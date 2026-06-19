import type {
  BlockEvidence,
  CandidateTier,
  ExtractedEvidenceProfile,
  RunEvidenceProfile,
  RunTypedAssertion
} from "@lrnki/domain-core";
import { evidenceQuoteMatches } from "@lrnki/domain-core";

// Deterministic Concept Evidence Profile policy (ADR-0007 reset). Runs at the
// application boundary over ONE admitted Concept's raw extractor output, BEFORE
// the neural assertion-entailment stage. It enforces only provable properties
// (AGENTS rule 16) — verbatim grounding, deduplication, candidate membership of
// hint targets, and the configured mention bound — and never applies a lexical
// semantic veto to a well-formed passage.
//
// Definition and mention passages clear the verbatim floor (`evidenceQuoteMatches`)
// and are deduplicated by (blockId, normalized quote). Mentions are kept in the
// extractor's NEURAL SALIENCE ORDER and truncated to maxMentionsPerConceptPerSource
// (R4) — no lexical re-ranking or composite score. Optional typed assertions are
// kept only when structurally valid and verbatim-grounded; their SEMANTIC
// acceptance is decided later by `applyAssertionEntailmentJudge`, so this stage
// leaves them pending. `complete` is true only when a verified definition passage
// survives (R1).
export function applyEvidenceProfilePolicy(input: {
  candidateKey: string;
  tier: CandidateTier;
  profile: ExtractedEvidenceProfile;
  admittedKeys: Set<string>;
  blockText: Map<string, string>;
  maxMentionsPerConceptPerSource: number;
}): RunEvidenceProfile {
  const verifiable = (evidence: BlockEvidence): boolean => {
    const text = input.blockText.get(evidence.blockId);
    return text !== undefined && evidenceQuoteMatches(text, evidence.evidenceQuote);
  };

  const definitions = dedupePassages(input.profile.definitions.filter(verifiable));
  const mentions = dedupePassages(input.profile.mentions.filter(verifiable));

  const assertions: RunTypedAssertion[] = [];
  for (const assertion of input.profile.assertions) {
    const evidence = dedupePassages(assertion.evidence.filter(verifiable));
    if (evidence.length === 0) continue; // ungrounded assertion: drop fail-closed
    if (assertion.type === "defines") {
      if (assertion.literalValue.trim() === "") continue;
      assertions.push({ type: "defines", literalValue: assertion.literalValue, evidence });
    }
  }

  return {
    candidateKey: input.candidateKey,
    tier: input.tier,
    definitions,
    // Bound applied last so neural order is preserved and only DISTINCT verified
    // passages count toward the limit.
    mentions: mentions.slice(0, Math.max(0, input.maxMentionsPerConceptPerSource)),
    assertions,
    complete: definitions.length >= 1
  };
}

// Stable dedup preserving first-seen (salience) order. The key tolerates the same
// formatting noise the verbatim floor normalizes away, so a quote and its
// markdown-decorated twin collapse to one passage.
function dedupePassages(passages: BlockEvidence[]): BlockEvidence[] {
  const seen = new Set<string>();
  const result: BlockEvidence[] = [];
  for (const passage of passages) {
    const key = `${passage.blockId}::${normalizeKey(passage.evidenceQuote)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(passage);
  }
  return result;
}

function normalizeKey(quote: string): string {
  return quote.replace(/\s+/g, " ").trim().toLowerCase();
}
