// Pure, JSX-free view-model for the Derived Graph Layer (ADR-0019). A Derived
// Graph Layer is the inferred prerequisite DAG of one Enrichment Run over a
// published version — kept SEPARATE from the published asserted layer (which has
// zero edges, AE4) and from learner paths. These helpers are unit-testable under
// `tsx --test` and feed both the Cytoscape render and its required equivalent
// textual node-and-edge representation (U6 test scenario 8).

export interface DerivedGraphNode {
  conceptId: string;
  label: string;
  declaredDomain: string;
  difficulty: number | null;
}

export interface DerivedGraphEdge {
  prerequisiteConceptId: string;
  dependentConceptId: string;
  confidence: number;
  uncertain: boolean;
}

export interface EnrichmentSummary {
  enrichmentId: string;
  graphVersionId: string;
  enrichmentConfigHash: string;
  judgeModel: string;
  difficultyMethod: string;
  status: string;
  edgeCount: number;
  certainEdgeCount: number;
  uncertainEdgeCount: number;
  conceptCount: number;
  startedAt: string;
  completedAt: string | null;
}

export interface DerivedGraphDetail {
  summary: EnrichmentSummary;
  nodes: DerivedGraphNode[];
  edges: DerivedGraphEdge[];
}

// Cytoscape element model plus the equivalent textual representation. The textual
// form resolves both endpoints to labels so a non-visual reader (or a test) can
// inspect the same DAG the canvas draws.
export interface DerivedGraphView {
  cytoscape: {
    nodes: { id: string; label: string; domain: string; difficulty: number | null }[];
    edges: { id: string; source: string; target: string; uncertain: "yes" | "no"; confidence: number }[];
  };
  textual: {
    nodes: { label: string; domain: string; difficulty: number | null }[];
    edges: { prerequisiteLabel: string; dependentLabel: string; confidence: number; uncertain: boolean }[];
  };
}

export function labelFor(detail: Pick<DerivedGraphDetail, "nodes">, conceptId: string): string {
  return detail.nodes.find((node) => node.conceptId === conceptId)?.label ?? conceptId;
}

export function buildDerivedGraphView(detail: DerivedGraphDetail): DerivedGraphView {
  return {
    cytoscape: {
      nodes: detail.nodes.map((node) => ({
        id: node.conceptId,
        label: node.label,
        domain: node.declaredDomain,
        difficulty: node.difficulty
      })),
      edges: detail.edges.map((edge, index) => ({
        id: `e${index}`,
        source: edge.prerequisiteConceptId,
        target: edge.dependentConceptId,
        uncertain: edge.uncertain ? "yes" : "no",
        confidence: edge.confidence
      }))
    },
    textual: {
      nodes: detail.nodes.map((node) => ({ label: node.label, domain: node.declaredDomain, difficulty: node.difficulty })),
      edges: detail.edges.map((edge) => ({
        prerequisiteLabel: labelFor(detail, edge.prerequisiteConceptId),
        dependentLabel: labelFor(detail, edge.dependentConceptId),
        confidence: edge.confidence,
        uncertain: edge.uncertain
      }))
    }
  };
}
