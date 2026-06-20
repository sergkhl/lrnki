import type { ConceptDifficulty, DifficultyNodeContext, InferredPrerequisiteEdge } from "@lrnki/domain-core";
import type { DifficultyPort, IntrinsicDifficultyJudgmentPort } from "@lrnki/ports";
import { dagDepthDifficulty, prerequisiteAncestors } from "./prerequisiteDag";

const METHOD = "intrinsic-fused-v1";

type StructuralTerms = {
  topoDepth: number;
  normalizedTopoDepth: number;
  transitiveAncestors: number;
  normalizedTransitiveAncestors: number;
  fanIn: number;
  normalizedFanIn: number;
  evidenceDensity: number;
  normalizedEvidenceDensity: number;
  dagDepthScore: number;
  structuralScore: number;
};

export function createIntrinsicDifficultyPort(judge: IntrinsicDifficultyJudgmentPort): DifficultyPort {
  return {
    method: METHOD,
    async score(input: { nodes: DifficultyNodeContext[]; prerequisiteEdges: InferredPrerequisiteEdge[] }): Promise<ConceptDifficulty[]> {
      const termsByNode = structuralTerms(input.nodes, input.prerequisiteEdges);
      const difficulties: ConceptDifficulty[] = [];
      for (const node of input.nodes) {
        const judgment = await judge.judge(node);
        if (!Number.isFinite(judgment.neuralScore) || judgment.neuralScore < 0 || judgment.neuralScore > 1) {
          throw new Error(`Intrinsic difficulty judge returned out-of-range score for ${node.derivedNodeId}.`);
        }
        const terms = termsByNode.get(node.derivedNodeId) ?? zeroTerms();
        const score = clamp01(0.55 * judgment.neuralScore + 0.45 * terms.structuralScore);
        difficulties.push({
          derivedNodeId: node.derivedNodeId,
          score,
          method: METHOD,
          // Carry the judge's free-text rationale through (R5). The fused score is
          // unchanged — this is a pure passthrough of an already-validated field that
          // the port previously dropped (R7; AGENTS rules 16/17).
          neuralRationale: judgment.rationale,
          components: {
            neuralScore: judgment.neuralScore,
            topoDepth: terms.topoDepth,
            normalizedTopoDepth: terms.normalizedTopoDepth,
            transitiveAncestors: terms.transitiveAncestors,
            normalizedTransitiveAncestors: terms.normalizedTransitiveAncestors,
            fanIn: terms.fanIn,
            normalizedFanIn: terms.normalizedFanIn,
            evidenceDensity: terms.evidenceDensity,
            normalizedEvidenceDensity: terms.normalizedEvidenceDensity,
            dagDepthScore: terms.dagDepthScore,
            structuralScore: terms.structuralScore
          }
        });
      }
      return difficulties;
    }
  };
}

function structuralTerms(nodes: DifficultyNodeContext[], edges: InferredPrerequisiteEdge[]): Map<string, StructuralTerms> {
  const nodeIds = nodes.map((node) => node.derivedNodeId);
  const dagById = new Map(dagDepthDifficulty(nodeIds, edges).map((difficulty) => [difficulty.derivedNodeId, difficulty] as const));
  const ancestorCounts = new Map(nodeIds.map((id) => [id, prerequisiteAncestors(id, edges).size] as const));
  const evidenceCounts = new Map(nodes.map((node) => [node.derivedNodeId, node.definitions.length + node.mentions.length] as const));
  const maxTopoDepth = Math.max(1, ...[...dagById.values()].map((difficulty) => difficulty.components.topoDepth ?? 0));
  const maxAncestors = Math.max(1, ...ancestorCounts.values());
  const maxFanIn = Math.max(1, ...[...dagById.values()].map((difficulty) => difficulty.components.fanIn ?? 0));
  const maxEvidenceDensity = Math.max(1, ...evidenceCounts.values());
  const terms = new Map<string, StructuralTerms>();
  for (const node of nodes) {
    const dag = dagById.get(node.derivedNodeId);
    const topoDepth = dag?.components.topoDepth ?? 0;
    const fanIn = dag?.components.fanIn ?? 0;
    const transitiveAncestors = ancestorCounts.get(node.derivedNodeId) ?? 0;
    const evidenceDensity = evidenceCounts.get(node.derivedNodeId) ?? 0;
    const normalizedTopoDepth = topoDepth / maxTopoDepth;
    const normalizedTransitiveAncestors = transitiveAncestors / maxAncestors;
    const normalizedFanIn = fanIn / maxFanIn;
    const normalizedEvidenceDensity = evidenceDensity / maxEvidenceDensity;
    const dagDepthScore = dag?.score ?? 0;
    const structuralScore = clamp01((normalizedTopoDepth + normalizedTransitiveAncestors + normalizedFanIn + normalizedEvidenceDensity) / 4);
    terms.set(node.derivedNodeId, {
      topoDepth,
      normalizedTopoDepth,
      transitiveAncestors,
      normalizedTransitiveAncestors,
      fanIn,
      normalizedFanIn,
      evidenceDensity,
      normalizedEvidenceDensity,
      dagDepthScore,
      structuralScore
    });
  }
  return terms;
}

function zeroTerms(): StructuralTerms {
  return {
    topoDepth: 0,
    normalizedTopoDepth: 0,
    transitiveAncestors: 0,
    normalizedTransitiveAncestors: 0,
    fanIn: 0,
    normalizedFanIn: 0,
    evidenceDensity: 0,
    normalizedEvidenceDensity: 0,
    dagDepthScore: 0,
    structuralScore: 0
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
