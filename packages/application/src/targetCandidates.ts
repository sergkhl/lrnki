import type { DerivedGraphDetail, DerivedGraphEdge, DerivedNodeKind } from "@lrnki/ports";
import { prerequisiteAncestors } from "./prerequisiteDag";

export type TargetCandidate = {
  derivedNodeId: string;
  label: string;
  aliases: string[];
  declaredDomain: string;
  nodeKind: DerivedNodeKind;
  hasStudyItem: boolean;
  coneSize: number;
  questNodeCount: number;
  readyNodeCount: number;
  missingStudyItemCount: number;
  isFullyReady: boolean;
  isFoundational: boolean;
};

type CandidateDetail = Pick<DerivedGraphDetail, "nodes" | "edges">;
type CandidateEdge = Pick<DerivedGraphEdge, "prerequisiteDerivedNodeId" | "dependentDerivedNodeId" | "uncertain">;

function trustedEdges(edges: CandidateEdge[]): CandidateEdge[] {
  return edges.filter((edge) => !edge.uncertain);
}

function compareTargetCandidates(a: TargetCandidate, b: TargetCandidate): number {
  const aReadyFraction = a.questNodeCount === 0 ? 0 : a.readyNodeCount / a.questNodeCount;
  const bReadyFraction = b.questNodeCount === 0 ? 0 : b.readyNodeCount / b.questNodeCount;
  return Number(b.isFullyReady) - Number(a.isFullyReady) ||
    bReadyFraction - aReadyFraction ||
    b.coneSize - a.coneSize ||
    a.label.localeCompare(b.label) ||
    a.derivedNodeId.localeCompare(b.derivedNodeId);
}

export function buildTargetCandidates(detail: CandidateDetail): TargetCandidate[] {
  const edges = trustedEdges(detail.edges);
  const nodeById = new Map(detail.nodes.map((node) => [node.derivedNodeId, node] as const));
  return detail.nodes
    .map((node) => {
      const ancestors = prerequisiteAncestors(node.derivedNodeId, edges);
      const questScope = new Set([node.derivedNodeId, ...ancestors]);
      const readyNodeCount = [...questScope].filter((derivedNodeId) => nodeById.get(derivedNodeId)?.hasStudyItem === true).length;
      const questNodeCount = questScope.size;
      const missingStudyItemCount = questNodeCount - readyNodeCount;
      const coneSize = ancestors.size;
      return {
        derivedNodeId: node.derivedNodeId,
        label: node.label,
        aliases: node.aliases,
        declaredDomain: node.declaredDomain,
        nodeKind: node.nodeKind,
        hasStudyItem: node.hasStudyItem,
        coneSize,
        questNodeCount,
        readyNodeCount,
        missingStudyItemCount,
        isFullyReady: missingStudyItemCount === 0,
        isFoundational: coneSize === 0
      };
    })
    .sort(compareTargetCandidates);
}

export function recommendedTargets(candidates: TargetCandidate[], detail: Pick<DerivedGraphDetail, "edges">, limit = 8): TargetCandidate[] {
  const trusted = trustedEdges(detail.edges);
  const prerequisiteIds = new Set(trusted.map((edge) => edge.prerequisiteDerivedNodeId));
  const milestoneIds = new Set(
    candidates
      .filter((candidate) => candidate.coneSize > 0 && !prerequisiteIds.has(candidate.derivedNodeId))
      .map((candidate) => candidate.derivedNodeId)
  );
  const milestones = candidates.filter((candidate) => milestoneIds.has(candidate.derivedNodeId)).sort(compareTargetCandidates);
  const selected = [...milestones];

  if (selected.length < 3) {
    const seen = new Set(selected.map((candidate) => candidate.derivedNodeId));
    for (const candidate of candidates.filter((candidate) => !seen.has(candidate.derivedNodeId)).sort(compareTargetCandidates)) {
      selected.push(candidate);
      seen.add(candidate.derivedNodeId);
      if (selected.length >= 3) break;
    }
  }

  return selected.slice(0, limit);
}

export function filterTargets(candidates: TargetCandidate[], query: string): TargetCandidate[] {
  const q = query.trim().toLowerCase();
  const matches = (candidate: TargetCandidate): boolean =>
    q.length === 0 ||
    candidate.label.toLowerCase().includes(q) ||
    candidate.aliases.some((alias) => alias.toLowerCase().includes(q));
  return candidates.filter(matches).sort(compareTargetCandidates);
}
