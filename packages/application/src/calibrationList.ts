import type { GroundingPassageView } from "@lrnki/ports";
import type { ReadinessEdge } from "./adaptivePathProjection";
import { pruneClosure } from "./calibrationClosure";
import { prerequisiteAncestors } from "./prerequisiteDag";

export type CalibrationDescriptor = {
  text: string;
  provenance: "verbatim" | "generated";
};

export type CalibrationListNode = {
  derivedNodeId: string;
  label: string;
  difficulty: number | null;
  grounding?: {
    passages: GroundingPassageView[];
  } | null;
};

export type CalibrationListRow = {
  derivedNodeId: string;
  label: string;
  descriptor: CalibrationDescriptor | null;
  difficulty: number | null;
  known: boolean;
};

export type CalibrationListProjection = {
  rows: CalibrationListRow[];
  knownClosure: Set<string>;
};

export type CalibrationSessionProjection = {
  enrichmentId: string;
  learnerStateRef: string;
  target: { derivedNodeId: string; label: string };
  rows: CalibrationListRow[];
  knownClosure: string[];
};

export function projectCalibrationList(input: {
  targetDerivedNodeId: string;
  edges: ReadinessEdge[];
  nodes: CalibrationListNode[];
  knownVerdictNodeIds: Iterable<string>;
}): CalibrationListProjection {
  const trustedEdges = input.edges.filter((edge) => !edge.uncertain);
  const cone = prerequisiteAncestors(input.targetDerivedNodeId, trustedEdges);
  cone.add(input.targetDerivedNodeId);

  const directlyKnown = new Set([...input.knownVerdictNodeIds].filter((derivedNodeId) => cone.has(derivedNodeId)));
  const knownClosure = pruneClosure(directlyKnown, trustedEdges);
  const nodeById = new Map(input.nodes.map((node) => [node.derivedNodeId, node]));

  const rows = [...cone]
    .filter((derivedNodeId) => !knownClosure.has(derivedNodeId) || directlyKnown.has(derivedNodeId))
    .map((derivedNodeId): CalibrationListRow => {
      const node = nodeById.get(derivedNodeId);
      return {
        derivedNodeId,
        label: node?.label ?? derivedNodeId,
        descriptor: neutralDescriptor(node?.grounding?.passages ?? []),
        difficulty: node?.difficulty ?? null,
        known: directlyKnown.has(derivedNodeId)
      };
    })
    .sort((a, b) => (b.difficulty ?? 0) - (a.difficulty ?? 0) || a.derivedNodeId.localeCompare(b.derivedNodeId));

  return { rows, knownClosure };
}

export function composeCalibrationSession(input: {
  enrichmentId: string;
  learnerStateRef: string;
  targetDerivedNodeId: string;
  edges: ReadinessEdge[];
  nodes: CalibrationListNode[];
  knownVerdictNodeIds: Iterable<string>;
}): CalibrationSessionProjection | undefined {
  const target = input.nodes.find((node) => node.derivedNodeId === input.targetDerivedNodeId);
  if (!target) return undefined;

  const projection = projectCalibrationList({
    targetDerivedNodeId: input.targetDerivedNodeId,
    edges: input.edges,
    nodes: input.nodes,
    knownVerdictNodeIds: input.knownVerdictNodeIds
  });

  return {
    enrichmentId: input.enrichmentId,
    learnerStateRef: input.learnerStateRef,
    target: { derivedNodeId: target.derivedNodeId, label: target.label },
    rows: projection.rows,
    knownClosure: [...projection.knownClosure].sort()
  };
}

export function neutralDescriptor(passages: GroundingPassageView[], options?: { maxChars?: number }): CalibrationDescriptor | null {
  const passage = passages.find((candidate) => candidate.passageType === "definition") ?? passages.find((candidate) => candidate.passageType === "mention");
  if (!passage) return null;

  const maxChars = options?.maxChars ?? 240;
  const text = trimDescriptor(passage.text, maxChars);
  if (text.length === 0) return null;

  return {
    text,
    provenance: passage.groundingOrigin === "llm_grounded" ? "generated" : "verbatim"
  };
}

function trimDescriptor(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  const sentenceEnd = normalized.match(/[.!?](?:\s|$)/);
  if (sentenceEnd && sentenceEnd.index !== undefined) {
    return normalized.slice(0, sentenceEnd.index + 1).trim();
  }

  if (normalized.length <= maxChars) return normalized;

  const clipped = normalized.slice(0, maxChars + 1);
  const lastSpace = clipped.lastIndexOf(" ");
  if (lastSpace > 0) return clipped.slice(0, lastSpace).trim();
  return normalized.slice(0, maxChars).trim();
}
