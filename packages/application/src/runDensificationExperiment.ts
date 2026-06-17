import { randomUUID } from "node:crypto";
import type {
  DerivedGraphLayer,
  DerivedGraphNode,
  EnrichmentNode,
  GroundingVerbatimDisposition,
  InferredPrerequisiteEdge,
  PrerequisiteConceptContext,
  PrerequisiteJudgment
} from "@lrnki/domain-core";
import type { BridgeConceptProposalPort, DifficultyPort, GroundingGenerationPort, PrerequisiteJudgmentPort } from "@lrnki/ports";
import { cutWeakEdges, removeCycles, transitiveReduction } from "./prerequisiteDag";
import {
  connectivityMetrics,
  DEFAULT_SPARSE_REGION_BOUNDS,
  detectSparseRegions,
  type CandidateBridgeGap,
  type ConnectivityMetrics,
  type DeclinedPairDisposition,
  type SparseRegionBounds
} from "./sparseRegionDetection";
import { applyVerbatimFloorByGrounding } from "./verbatimFloorByGrounding";

export type DensificationExperimentConfig = {
  minEdgeConfidence: number;
  maxBridgesPerRun: number;
  sparseRegionBounds: SparseRegionBounds;
};

export const DEFAULT_DENSIFICATION_EXPERIMENT_CONFIG: DensificationExperimentConfig = {
  minEdgeConfidence: 0.5,
  maxBridgesPerRun: 6,
  sparseRegionBounds: DEFAULT_SPARSE_REGION_BOUNDS
};

export type DensificationBridgeRecord = {
  gap: CandidateBridgeGap;
  bridgeNode: Extract<EnrichmentNode, { groundingOrigin: "llm_grounded" }>;
  proposedEdges: InferredPrerequisiteEdge[];
};

export type DensificationExperimentResult = {
  baselineLayer: DerivedGraphLayer;
  densifiedLayer: DerivedGraphLayer;
  bridges: DensificationBridgeRecord[];
  before: ConnectivityMetrics;
  after: ConnectivityMetrics;
  groundingDispositions: GroundingVerbatimDisposition[];
};

export async function runDensificationExperiment(input: {
  experimentId: string;
  baselineLayer: DerivedGraphLayer;
  declinedPairs: DeclinedPairDisposition[];
  bridgeProposal: BridgeConceptProposalPort;
  groundingGeneration: GroundingGenerationPort;
  generatedPrerequisiteJudge: PrerequisiteJudgmentPort;
  difficulty: DifficultyPort;
  config?: Partial<DensificationExperimentConfig>;
  groundingTextsByNodeId?: Map<string, string[]>;
  newNodeId?: () => string;
  targetConceptId?: string;
}): Promise<DensificationExperimentResult> {
  const config = { ...DEFAULT_DENSIFICATION_EXPERIMENT_CONFIG, ...input.config };
  const newNodeId = input.newNodeId ?? randomUUID;
  const baselineLayer = cloneLayer(input.baselineLayer);
  const sparse = detectSparseRegions(baselineLayer, input.declinedPairs, config.sparseRegionBounds);
  const nodeById = new Map(baselineLayer.derivedNodes.map((node) => [node.derivedNodeId, node]));
  const existingLabels = new Set(baselineLayer.derivedNodes.map((node) => node.normalizedLabel));
  const bridgeNodes: Extract<EnrichmentNode, { groundingOrigin: "llm_grounded" }>[] = [];
  const bridgeRecords: DensificationBridgeRecord[] = [];
  const rawBridgeEdges: InferredPrerequisiteEdge[] = [];
  const groundingDispositions: GroundingVerbatimDisposition[] = [];

  for (const gap of sparse.candidateGaps) {
    if (bridgeNodes.length >= config.maxBridgesPerRun) break;
    const a = nodeById.get(gap.aConceptId);
    const b = nodeById.get(gap.bConceptId);
    if (!a || !b) continue;
    const remaining = config.maxBridgesPerRun - bridgeNodes.length;
    const proposals = await input.bridgeProposal.propose({
      declaredDomain: gap.declaredDomain,
      gap: {
        a: { conceptId: a.derivedNodeId, canonicalLabel: a.canonicalLabel, groundingTexts: groundingTexts(a, input.groundingTextsByNodeId) },
        b: { conceptId: b.derivedNodeId, canonicalLabel: b.canonicalLabel, groundingTexts: groundingTexts(b, input.groundingTextsByNodeId) },
        declinedRationale: gap.rationale
      },
      existingNodeLabels: [...existingLabels].sort((x, y) => x.localeCompare(y)),
      maxProposals: remaining
    });

    for (const proposal of proposals) {
      if (bridgeNodes.length >= config.maxBridgesPerRun) break;
      const normalized = proposal.proposedLabel.trim().toLowerCase();
      if (!normalized || existingLabels.has(normalized)) continue;
      existingLabels.add(normalized);
      const derivedNodeId = newNodeId();
      const groundingBundle = await input.groundingGeneration.generate({
        derivedNodeId,
        declaredDomain: gap.declaredDomain,
        nodeLabel: proposal.proposedLabel,
        scaffoldedAnchors: [
          { conceptId: a.derivedNodeId, canonicalLabel: a.canonicalLabel, definitionQuotes: groundingTexts(a, input.groundingTextsByNodeId) },
          { conceptId: b.derivedNodeId, canonicalLabel: b.canonicalLabel, definitionQuotes: groundingTexts(b, input.groundingTextsByNodeId) }
        ]
      });
      const bridgeNode: Extract<EnrichmentNode, { groundingOrigin: "llm_grounded" }> = {
        nodeKind: "enrichment",
        derivedNodeId,
        groundingOrigin: "llm_grounded",
        mintingReason: "densification",
        role: "prerequisite",
        layer: "derived",
        canonicalLabel: proposal.proposedLabel,
        normalizedLabel: normalized,
        declaredDomain: gap.declaredDomain,
        aliases: [],
        groundingBundle
      };
      const floored = applyVerbatimFloorByGrounding({ nodes: [bridgeNode], blockTextById: new Map() });
      const kept = floored.nodes[0];
      groundingDispositions.push(...floored.dispositions);
      if (!kept || kept.groundingOrigin !== "llm_grounded") continue;
      const proposedEdges = await judgeBridgeEdges({
        bridgeNode: kept,
        endpoints: [a, b],
        groundingTextsByNodeId: input.groundingTextsByNodeId,
        judge: input.generatedPrerequisiteJudge
      });
      bridgeNodes.push(kept);
      rawBridgeEdges.push(...proposedEdges);
      bridgeRecords.push({ gap, bridgeNode: kept, proposedEdges });
    }
  }

  const combinedRawEdges = [...baselineLayer.prerequisiteEdges, ...rawBridgeEdges];
  const uncertainEdges = combinedRawEdges.filter((edge) => edge.uncertain);
  const { kept: strongEdges } = cutWeakEdges(combinedRawEdges.filter((edge) => !edge.uncertain), config.minEdgeConfidence);
  const { edges: acyclicEdges } = removeCycles(strongEdges);
  const { edges: reducedEdges } = transitiveReduction(acyclicEdges);
  const prerequisiteEdges = [...reducedEdges, ...uncertainEdges];
  const derivedNodes = [...baselineLayer.derivedNodes, ...bridgeNodes];
  const difficulties = await input.difficulty.score({ nodeIds: derivedNodes.map((node) => node.derivedNodeId), prerequisiteEdges: reducedEdges });
  const densifiedLayer: DerivedGraphLayer = {
    ...baselineLayer,
    enrichmentId: input.experimentId,
    enrichmentConfigHash: `${baselineLayer.enrichmentConfigHash}:densification-experiment-v1`,
    derivedNodes,
    prerequisiteEdges,
    difficulties
  };

  return {
    baselineLayer,
    densifiedLayer,
    bridges: bridgeRecords,
    before: connectivityMetrics(baselineLayer, input.targetConceptId),
    after: connectivityMetrics(densifiedLayer, input.targetConceptId),
    groundingDispositions
  };
}

async function judgeBridgeEdges(input: {
  bridgeNode: Extract<EnrichmentNode, { groundingOrigin: "llm_grounded" }>;
  endpoints: DerivedGraphNode[];
  groundingTextsByNodeId?: Map<string, string[]>;
  judge: PrerequisiteJudgmentPort;
}): Promise<InferredPrerequisiteEdge[]> {
  const bridgeContext = contextOf(input.bridgeNode, input.groundingTextsByNodeId);
  const edges: InferredPrerequisiteEdge[] = [];
  for (const endpoint of [...input.endpoints].sort((a, b) => a.derivedNodeId.localeCompare(b.derivedNodeId))) {
    const judgment = await input.judge.judge({
      declaredDomain: endpoint.declaredDomain,
      a: bridgeContext,
      b: contextOf(endpoint, input.groundingTextsByNodeId)
    });
    if (judgment.outcome === "none") continue;
    edges.push(edgeFromJudgment(judgment));
  }
  return edges;
}

function edgeFromJudgment(judgment: PrerequisiteJudgment): InferredPrerequisiteEdge {
  return {
    prerequisiteConceptId: judgment.prerequisiteConceptId,
    dependentConceptId: judgment.dependentConceptId,
    predicate: "inferred-prerequisite-of",
    confidence: judgment.confidence,
    uncertain: judgment.outcome === "uncertain",
    provenance: { judgmentRationale: judgment.rationale }
  };
}

function contextOf(node: DerivedGraphNode, groundingTextsByNodeId?: Map<string, string[]>): PrerequisiteConceptContext {
  const texts = groundingTexts(node, groundingTextsByNodeId);
  return {
    conceptId: node.derivedNodeId,
    canonicalLabel: node.canonicalLabel,
    aliases: node.aliases,
    definitions: texts.slice(0, 2),
    mentions: texts.slice(2, 8),
    assertions: []
  };
}

function groundingTexts(node: DerivedGraphNode, groundingTextsByNodeId?: Map<string, string[]>): string[] {
  const supplied = groundingTextsByNodeId?.get(node.derivedNodeId);
  if (supplied?.length) return supplied;
  if (node.nodeKind === "anchor") return [];
  if (node.groundingOrigin === "source_mentioned") return node.groundingPassages.map((passage) => passage.evidenceQuote);
  return [
    ...node.groundingBundle.definitions.map((passage) => passage.text),
    ...node.groundingBundle.mentions.map((passage) => passage.text)
  ];
}

function cloneLayer(layer: DerivedGraphLayer): DerivedGraphLayer {
  return {
    ...layer,
    derivedNodes: layer.derivedNodes.map((node) => ({ ...node })),
    prerequisiteEdges: layer.prerequisiteEdges.map((edge) => ({ ...edge, provenance: { ...edge.provenance } })),
    difficulties: layer.difficulties.map((difficulty) => ({ ...difficulty, components: { ...difficulty.components } }))
  };
}
