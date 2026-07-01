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
  isFoundational: boolean;
};

type CandidateDetail = Pick<DerivedGraphDetail, "nodes" | "edges">;
type CandidateEdge = Pick<DerivedGraphEdge, "prerequisiteDerivedNodeId" | "dependentDerivedNodeId" | "uncertain">;

function trustedEdges(edges: CandidateEdge[]): CandidateEdge[] {
  return edges.filter((edge) => !edge.uncertain);
}

function compareTargetCandidates(a: TargetCandidate, b: TargetCandidate): number {
  return b.coneSize - a.coneSize || a.label.localeCompare(b.label) || a.derivedNodeId.localeCompare(b.derivedNodeId);
}

export function buildTargetCandidates(detail: CandidateDetail): TargetCandidate[] {
  const edges = trustedEdges(detail.edges);
  return detail.nodes
    .map((node) => {
      const coneSize = prerequisiteAncestors(node.derivedNodeId, edges).size;
      return {
        derivedNodeId: node.derivedNodeId,
        label: node.label,
        aliases: node.aliases,
        declaredDomain: node.declaredDomain,
        nodeKind: node.nodeKind,
        hasStudyItem: node.hasStudyItem,
        coneSize,
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
