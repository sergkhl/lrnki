import type {
  InferredPrerequisiteEdge,
  PairDirectionVote,
  PrerequisiteConceptContext,
  PrerequisiteOrderingTrace,
  WholeSetOrdering
} from "@lrnki/domain-core";
import type { PrerequisiteOrderingPort } from "@lrnki/ports";
import { mapWithConcurrency } from "./mapWithConcurrency";
import { cutWeakEdges, findCycleEdges } from "./prerequisiteDag";

export async function deriveConsensusOrdering(input: {
  domains: { declaredDomain: string; nodes: PrerequisiteConceptContext[] }[];
  prerequisiteOrdering: PrerequisiteOrderingPort;
  orderingSampleCount: number;
  directionContestMinorityFraction: number;
  minEdgeConfidence: number;
  maxDomainPromptChars: number;
}): Promise<{
  orderings: PrerequisiteOrderingTrace[];
  certainEdges: InferredPrerequisiteEdge[];
  uncertainEdges: InferredPrerequisiteEdge[];
  weakEdges: InferredPrerequisiteEdge[];
}> {
  const K = Math.max(1, Math.trunc(input.orderingSampleCount));
  const orderings: PrerequisiteOrderingTrace[] = [];
  const certainEdges: InferredPrerequisiteEdge[] = [];
  const uncertainEdges: InferredPrerequisiteEdge[] = [];
  const weakEdges: InferredPrerequisiteEdge[] = [];

  for (const domain of [...input.domains].sort((a, b) => a.declaredDomain.localeCompare(b.declaredDomain))) {
    const sorted = [...domain.nodes].sort((a, b) => a.derivedNodeId.localeCompare(b.derivedNodeId));
    if (sorted.length < 2) {
      orderings.push({
        declaredDomain: domain.declaredDomain,
        judgeModel: input.prerequisiteOrdering.model,
        nodeCount: sorted.length,
        k: 0,
        pairVotes: [],
        cycleRoutedEdges: []
      });
      continue;
    }

    const promptChars = estimatePromptChars(domain.declaredDomain, sorted);
    if (promptChars > input.maxDomainPromptChars) {
      throw new Error(`deriveConsensusOrdering: domain "${domain.declaredDomain}" assembled ordering prompt (~${promptChars} chars) exceeds the budget (${input.maxDomainPromptChars}); failing closed without a partial layer (R16).`);
    }

    const mapDraw = (ordering: WholeSetOrdering): DirectedDrawEdge[] =>
      ordering.edges.map((edge) => {
        const prerequisite = sorted[edge.prerequisiteNumber - 1];
        const dependent = sorted[edge.dependentNumber - 1];
        if (!prerequisite || !dependent) {
          throw new Error(`deriveConsensusOrdering: ordering edge cites a number outside the listed concepts of domain "${domain.declaredDomain}" (${edge.prerequisiteNumber} -> ${edge.dependentNumber}, of ${sorted.length}); failing closed (rule 6).`);
        }
        if (prerequisite.derivedNodeId === dependent.derivedNodeId) {
          throw new Error(`deriveConsensusOrdering: ordering edge names one concept as its own prerequisite in domain "${domain.declaredDomain}" (number ${edge.prerequisiteNumber}); failing closed (rule 6).`);
        }
        return {
          prerequisiteDerivedNodeId: prerequisite.derivedNodeId,
          dependentDerivedNodeId: dependent.derivedNodeId,
          rationale: edge.rationale
        };
      });

    const draws = await mapWithConcurrency(
      Array.from({ length: K }),
      K,
      () => input.prerequisiteOrdering.order({ declaredDomain: domain.declaredDomain, nodes: sorted }).then(mapDraw)
    );

    const tally = tallyDraws(draws);
    const pairVotes: PairDirectionVote[] = [];
    const certainCandidates: InferredPrerequisiteEdge[] = [];
    for (const key of [...tally.keys()].sort((a, b) => a.localeCompare(b))) {
      const t = tally.get(key)!;
      const majorityIsUtoV = t.uToV >= t.vToU;
      const forward = majorityIsUtoV ? t.uToV : t.vToU;
      const reverse = majorityIsUtoV ? t.vToU : t.uToV;
      const prerequisiteDerivedNodeId = majorityIsUtoV ? t.u : t.v;
      const dependentDerivedNodeId = majorityIsUtoV ? t.v : t.u;
      const consensusConfidence = forward / K;
      const contested = reverse / K >= input.directionContestMinorityFraction;
      const classification = contested ? "direction_contested" : "consensus";
      pairVotes.push({ prerequisiteDerivedNodeId, dependentDerivedNodeId, forward, reverse, k: K, consensusConfidence, classification });

      const winningRationale = (majorityIsUtoV ? t.uToVRationale ?? t.vToURationale : t.vToURationale ?? t.uToVRationale) ?? "";
      const judgmentRationale = `${winningRationale} [consensus ${forward}/${K} forward, ${reverse}/${K} reverse]`.trim();
      const edge: InferredPrerequisiteEdge = {
        prerequisiteDerivedNodeId,
        dependentDerivedNodeId,
        predicate: "inferred-prerequisite-of",
        confidence: consensusConfidence,
        uncertain: contested,
        provenance: { judgmentRationale }
      };
      (contested ? uncertainEdges : certainCandidates).push(edge);
    }

    const { kept: strong, cut: weak } = cutWeakEdges(certainCandidates, input.minEdgeConfidence);
    weakEdges.push(...weak);

    const cycleRoutedEdges: { prerequisiteDerivedNodeId: string; dependentDerivedNodeId: string }[] = [];
    let strongEdges = strong;
    for (;;) {
      const cycle = findCycleEdges(strongEdges);
      if (!cycle) break;
      const cycleKeys = new Set(cycle.map(edgeId));
      for (const edge of strongEdges) {
        if (cycleKeys.has(edgeId(edge))) {
          uncertainEdges.push({ ...edge, uncertain: true });
          cycleRoutedEdges.push({
            prerequisiteDerivedNodeId: edge.prerequisiteDerivedNodeId,
            dependentDerivedNodeId: edge.dependentDerivedNodeId
          });
        }
      }
      strongEdges = strongEdges.filter((edge) => !cycleKeys.has(edgeId(edge)));
    }
    certainEdges.push(...strongEdges);

    orderings.push({
      declaredDomain: domain.declaredDomain,
      judgeModel: input.prerequisiteOrdering.model,
      nodeCount: sorted.length,
      k: K,
      pairVotes,
      cycleRoutedEdges
    });
  }

  return { orderings, certainEdges, uncertainEdges, weakEdges };
}

type DirectedDrawEdge = {
  prerequisiteDerivedNodeId: string;
  dependentDerivedNodeId: string;
  rationale: string;
};

type Tally = {
  u: string;
  v: string;
  uToV: number;
  vToU: number;
  uToVRationale?: string;
  vToURationale?: string;
};

function tallyDraws(draws: DirectedDrawEdge[][]): Map<string, Tally> {
  const tally = new Map<string, Tally>();
  for (const draw of draws) {
    const seen = new Set<string>();
    for (const edge of draw) {
      const directed = edgeId(edge);
      if (seen.has(directed)) continue;
      seen.add(directed);
      const forwardOriented = edge.prerequisiteDerivedNodeId < edge.dependentDerivedNodeId;
      const u = forwardOriented ? edge.prerequisiteDerivedNodeId : edge.dependentDerivedNodeId;
      const v = forwardOriented ? edge.dependentDerivedNodeId : edge.prerequisiteDerivedNodeId;
      const key = `${u}::${v}`;
      let t = tally.get(key);
      if (!t) {
        t = { u, v, uToV: 0, vToU: 0 };
        tally.set(key, t);
      }
      if (edge.prerequisiteDerivedNodeId === u) {
        t.uToV += 1;
        t.uToVRationale ??= edge.rationale;
      } else {
        t.vToU += 1;
        t.vToURationale ??= edge.rationale;
      }
    }
  }
  return tally;
}

function edgeId(edge: Pick<InferredPrerequisiteEdge, "prerequisiteDerivedNodeId" | "dependentDerivedNodeId">): string {
  return `${edge.prerequisiteDerivedNodeId}->${edge.dependentDerivedNodeId}`;
}

function estimatePromptChars(declaredDomain: string, contexts: PrerequisiteConceptContext[]): number {
  let chars = declaredDomain.length;
  for (const context of contexts) {
    chars += context.canonicalLabel.length;
    for (const alias of context.aliases) chars += alias.length;
    for (const definition of context.definitions) chars += definition.length;
    for (const mention of context.mentions) chars += mention.length;
    for (const assertion of context.assertions) chars += assertion.type.length + assertion.detail.length;
  }
  return chars;
}
