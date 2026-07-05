import type { ConceptDifficulty, DifficultyBandEntry, DifficultyNodeContext } from "@lrnki/domain-core";
import type { DifficultyPort, IntrinsicDifficultyJudgmentPort } from "@lrnki/ports";
import { mapWithConcurrency } from "./mapWithConcurrency";

const METHOD = "intrinsic-banded-v2";

// The modal band must hold at least this share of the K draws to count as consensus;
// below it the concept's band is CONTESTED and routed to bounded pairwise calibration.
// Dispersion is signal, not noise (ADR-0028): a concept the judge cannot place stably
// relative to its set is exactly the concept whose band needs a second look.
const CONTEST_MODAL_SHARE = 0.6;

// Comparative banded intrinsic difficulty (ADR-0024). Replaces the pointwise absolute
// judge + structural fusion: pointwise LLM-as-judge scoring has no reference frame, so
// scale-use bias let abstract-SOUNDING, evidence-thin labels score high — the same
// pointwise→listwise pivot this project made for prerequisite ordering. Per Declared
// Domain, ONE banding call places every concept 1–5 relative to that domain's set; the
// call is K-sampled (draws through the same adapter; MoE non-determinism supplies the
// dispersion), consensus is the modal band (tie → LOWER band: prefer under-claiming
// difficulty), and a contested concept (modal share < 0.6) is resolved by at most two
// "which is harder" comparisons against uncontested anchors of its extreme candidate
// bands. The persisted score is (band − 1) / 4 — the exact inverse of the diamond
// mapping round(score × 4) + 1, so the UI is untouched. Structural terms (topo depth,
// ancestors, fan-in, evidence density) were deleted: they re-encode the prerequisite
// structure that already gates the path, and hand-weighted fusion of an unvalidated
// feature vector is the deterministic-proxy pattern ADR-0028 rejects. The learner-data
// posterior (Elo/IRT) stays deferred; `method` + the banded components are its seam.
export function createIntrinsicDifficultyPort(judge: IntrinsicDifficultyJudgmentPort, sampleCount: number): DifficultyPort {
  // Fail loudly at composition time: a non-finite K would silently produce ZERO draws
  // and persist band-0 garbage (observed once during the U1 baseline; never again).
  if (!Number.isFinite(sampleCount) || Math.trunc(sampleCount) < 1) {
    throw new Error(`createIntrinsicDifficultyPort: difficultySampleCount must be a positive integer, got ${sampleCount}.`);
  }
  const K = Math.trunc(sampleCount);
  return {
    method: METHOD,
    async score(input: { nodes: DifficultyNodeContext[] }): Promise<ConceptDifficulty[]> {
      const byDomain = new Map<string, DifficultyNodeContext[]>();
      for (const node of input.nodes) {
        const existing = byDomain.get(node.declaredDomain);
        if (existing) existing.push(node);
        else byDomain.set(node.declaredDomain, [node]);
      }

      const difficulties: ConceptDifficulty[] = [];
      for (const declaredDomain of [...byDomain.keys()].sort((a, b) => a.localeCompare(b))) {
        // Deterministic node order so number → derivedNodeId is stable across draws —
        // the same positional contract as whole-set prerequisite ordering.
        const sorted = [...byDomain.get(declaredDomain)!].sort((a, b) => a.derivedNodeId.localeCompare(b.derivedNodeId));
        const draws = await mapWithConcurrency(
          Array.from({ length: K }),
          K,
          () => judge.bandDomainSet({ declaredDomain, nodes: sorted }).then((entries) => mapDrawByPosition(declaredDomain, sorted, entries))
        );
        difficulties.push(...await bandConsensus({ judge, declaredDomain, nodes: sorted, draws, k: K }));
      }
      return difficulties;
    }
  };
}

type PositionedDraw = { band: number; rationale: string }[];

// Map one draw's number-cited entries to node positions fail-closed (rule 6): every
// listed number exactly once, band within 1..5. The adapter's validator already
// enforces this with one corrective re-prompt; this boundary re-check is the
// application's own guarantee, mirroring deriveConsensusOrdering.
function mapDrawByPosition(declaredDomain: string, nodes: DifficultyNodeContext[], entries: DifficultyBandEntry[]): PositionedDraw {
  if (entries.length !== nodes.length) {
    throw new Error(`intrinsicDifficulty: banding draw returned ${entries.length} entries for ${nodes.length} concepts in domain "${declaredDomain}"; failing closed (rule 6).`);
  }
  const byPosition: ({ band: number; rationale: string } | undefined)[] = new Array(nodes.length);
  for (const entry of entries) {
    const index = entry.conceptNumber - 1;
    if (!Number.isInteger(entry.conceptNumber) || index < 0 || index >= nodes.length || byPosition[index]) {
      throw new Error(`intrinsicDifficulty: banding draw cites concept number ${entry.conceptNumber} outside or twice within the listed set of domain "${declaredDomain}" (${nodes.length} concepts); failing closed (rule 6).`);
    }
    if (!Number.isInteger(entry.band) || entry.band < 1 || entry.band > 5) {
      throw new Error(`intrinsicDifficulty: banding draw returned out-of-range band ${entry.band} in domain "${declaredDomain}"; failing closed (rule 6).`);
    }
    byPosition[index] = { band: entry.band, rationale: entry.rationale };
  }
  return byPosition as PositionedDraw;
}

async function bandConsensus(input: {
  judge: IntrinsicDifficultyJudgmentPort;
  declaredDomain: string;
  nodes: DifficultyNodeContext[];
  draws: PositionedDraw[];
  k: number;
}): Promise<ConceptDifficulty[]> {
  const { judge, declaredDomain, nodes, draws, k } = input;

  const consensus = nodes.map((node, index) => {
    const votes = draws.map((draw) => draw[index]);
    const counts = new Map<number, number>();
    for (const vote of votes) counts.set(vote.band, (counts.get(vote.band) ?? 0) + 1);
    // Modal band; a tie takes the LOWER band (conservative: prefer under-claiming
    // difficulty) and is contested by construction (tied modal share < 0.6 at K >= 2).
    let modalBand = 0;
    let modalCount = 0;
    for (const [band, count] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
      if (count > modalCount) {
        modalBand = band;
        modalCount = count;
      }
    }
    const modalShare = modalCount / k;
    return { node, votes, modalBand, modalShare, contested: modalShare < CONTEST_MODAL_SHARE };
  });

  // Anchors: per band, the UNCONTESTED same-domain concept with the highest modal
  // share (tie-break: label sort). Uncontested concepts keep their modal band, so
  // anchors are stable regardless of calibration order.
  const anchorByBand = new Map<number, DifficultyNodeContext>();
  for (const entry of [...consensus]
    .filter((candidate) => !candidate.contested)
    .sort((a, b) => b.modalShare - a.modalShare || a.node.canonicalLabel.localeCompare(b.node.canonicalLabel))) {
    if (!anchorByBand.has(entry.modalBand)) anchorByBand.set(entry.modalBand, entry.node);
  }

  const difficulties: ConceptDifficulty[] = [];
  for (const entry of consensus) {
    let finalBand = entry.modalBand;
    let pairwiseComparisons = 0;
    let calibrationUnresolved = 0;

    if (entry.contested) {
      // Two-comparison bracket against the extreme candidate bands the draws voted:
      // harder than H's anchor → band H; easier than L's anchor → band L; otherwise
      // the bracket confirms the middle → keep the modal band. A missing needed
      // anchor keeps the modal band and records calibrationUnresolved.
      const candidateBands = [...new Set(entry.votes.map((vote) => vote.band))].sort((a, b) => a - b);
      const low = candidateBands[0];
      const high = candidateBands[candidateBands.length - 1];
      const highAnchor = anchorByBand.get(high);
      const lowAnchor = anchorByBand.get(low);
      if (!highAnchor) {
        calibrationUnresolved = 1;
      } else {
        pairwiseComparisons += 1;
        const versusHigh = await judge.compareHarder({ declaredDomain, first: entry.node, second: highAnchor });
        if (versusHigh.harder === "first") {
          finalBand = high;
        } else if (!lowAnchor) {
          calibrationUnresolved = 1;
        } else {
          pairwiseComparisons += 1;
          const versusLow = await judge.compareHarder({ declaredDomain, first: entry.node, second: lowAnchor });
          if (versusLow.harder === "second") finalBand = low;
          // Otherwise the bracket confirms the middle: keep the modal band, resolved.
        }
      }
    }

    // The rationale of the first draw that voted the final band. The bracket only
    // ever selects a voted band, so one always exists.
    const rationale = entry.votes.find((vote) => vote.band === finalBand)?.rationale ?? "";
    difficulties.push({
      derivedNodeId: entry.node.derivedNodeId,
      score: (finalBand - 1) / 4,
      method: METHOD,
      neuralRationale: rationale,
      components: {
        band: finalBand,
        kDraws: k,
        modalShare: entry.modalShare,
        contested: entry.contested ? 1 : 0,
        pairwiseComparisons,
        calibrationUnresolved
      }
    });
  }
  return difficulties;
}
