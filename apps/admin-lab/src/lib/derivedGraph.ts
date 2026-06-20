// Pure, JSX-free view-model for the Derived Graph Layer (ADR-0019). A Derived
// Graph Layer is the inferred prerequisite DAG of one Enrichment Run over a
// published version — kept SEPARATE from the published asserted layer (which has
// zero edges, AE4) and from learner paths. These helpers are unit-testable under
// `tsx --test` and feed both the Cytoscape render and its required equivalent
// textual node-and-edge representation (U6 test scenario 8).

export type DerivedNodeKind = "anchor" | "enrichment";
export type DerivedGroundingOrigin = "document_anchored" | "source_mentioned" | "llm_grounded";

// One grounding passage of an enrichment node, as the inspector shows it: generated
// text for `llm_grounded`, verbatim source quote for `source_mentioned`.
export interface GroundingPassageView {
  passageType: "definition" | "mention";
  text: string;
  groundingOrigin: DerivedGroundingOrigin;
}

// The grounding bundle of one enrichment node (R8, R15) plus the recorded verbatim-
// floor disposition (R9, AE3). `verbatimDisposition` is `not_applicable_by_grounding`
// for a minted `llm_grounded` node and `verified` for a rescued `source_mentioned`
// node — surfaced, never silent.
export interface NodeGroundingView {
  generatingModel: string | null;
  rationale: string | null;
  passages: GroundingPassageView[];
  verbatimDisposition: string;
}

export interface DerivedGraphNode {
  derivedNodeId: string;
  label: string;
  declaredDomain: string;
  difficulty: number | null;
  // Anchor (a projection of an asserted Concept) vs enrichment (minted/rescued, R15).
  nodeKind: DerivedNodeKind;
  groundingOrigin: DerivedGroundingOrigin;
  role: "anchor" | "prerequisite";
  // Present only for enrichment nodes; anchors carry their CEP in the published view.
  grounding: NodeGroundingView | null;
}

export interface DerivedGraphEdge {
  prerequisiteDerivedNodeId: string;
  dependentDerivedNodeId: string;
  confidence: number;
  uncertain: boolean;
  // Which judge model ordered this pair (U5): the cross-family generated-node alias
  // for a pair touching an llm_grounded node, the validated DeepSeek alias otherwise.
  judgeModel: string;
}

// Per-Declared-Domain origin counts over the derived node space (U5/AE1): how many
// anchors, rescued `source_mentioned`, and minted `llm_grounded` nodes the layer
// holds in each domain — the provenance-pressure summary an operator reads first.
export interface DomainOriginCounts {
  domain: string;
  anchor: number;
  sourceMentioned: number;
  llmGrounded: number;
}

// One recorded rescue-durability disposition (U3/U5). `accepted` nodes are in the
// layer; `dropped` ones were vetoed (confident + grounded); `kept_judge_unavailable`
// ones were kept-and-flagged on judge failure. Surfaced so an operator can audit why
// each rescue candidate is (or is not) present.
export interface RescueDispositionView {
  derivedNodeId: string;
  canonicalLabel: string;
  declaredDomain: string;
  disposition: "accepted" | "dropped" | "kept_judge_unavailable";
  rationale: string;
  groundingSpan: string;
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
  // Per-domain provenance summary and the rescue-durability dispositions (U5). Both
  // are read from persisted artifacts; the UI never recomputes them (rule 12).
  originCounts: DomainOriginCounts[];
  rescueDispositions: RescueDispositionView[];
}

// Aggregate the derived node space into per-domain origin counts (U5/AE1). Pure and
// unit-testable; the loader computes it from the persisted nodes, the UI only renders.
export function summarizeOriginCounts(nodes: Pick<DerivedGraphNode, "declaredDomain" | "groundingOrigin">[]): DomainOriginCounts[] {
  const byDomain = new Map<string, DomainOriginCounts>();
  for (const node of nodes) {
    const counts = byDomain.get(node.declaredDomain) ?? { domain: node.declaredDomain, anchor: 0, sourceMentioned: 0, llmGrounded: 0 };
    if (node.groundingOrigin === "document_anchored") counts.anchor += 1;
    else if (node.groundingOrigin === "source_mentioned") counts.sourceMentioned += 1;
    else counts.llmGrounded += 1;
    byDomain.set(node.declaredDomain, counts);
  }
  return [...byDomain.values()].sort((a, b) => a.domain.localeCompare(b.domain));
}

// Cytoscape element model plus the equivalent textual representation. The textual
// form resolves both endpoints to labels so a non-visual reader (or a test) can
// inspect the same DAG the canvas draws.
export interface DerivedGraphView {
  cytoscape: {
    nodes: { id: string; label: string; domain: string; difficulty: number | null; nodeKind: DerivedNodeKind; groundingOrigin: DerivedGroundingOrigin }[];
    edges: { id: string; source: string; target: string; uncertain: "yes" | "no"; confidence: number }[];
  };
  textual: {
    nodes: { label: string; domain: string; difficulty: number | null; nodeKind: DerivedNodeKind; groundingOrigin: DerivedGroundingOrigin; grounding: NodeGroundingView | null }[];
    edges: { prerequisiteLabel: string; dependentLabel: string; confidence: number; uncertain: boolean; judgeModel: string }[];
  };
}

export function labelFor(detail: Pick<DerivedGraphDetail, "nodes">, derivedNodeId: string): string {
  return detail.nodes.find((node) => node.derivedNodeId === derivedNodeId)?.label ?? derivedNodeId;
}

export function buildDerivedGraphView(detail: DerivedGraphDetail): DerivedGraphView {
  return {
    cytoscape: {
      nodes: detail.nodes.map((node) => ({
        id: node.derivedNodeId,
        label: node.label,
        domain: node.declaredDomain,
        difficulty: node.difficulty,
        nodeKind: node.nodeKind,
        groundingOrigin: node.groundingOrigin
      })),
      edges: detail.edges.map((edge, index) => ({
        id: `e${index}`,
        source: edge.prerequisiteDerivedNodeId,
        target: edge.dependentDerivedNodeId,
        uncertain: edge.uncertain ? "yes" : "no",
        confidence: edge.confidence
      }))
    },
    textual: {
      nodes: detail.nodes.map((node) => ({ label: node.label, domain: node.declaredDomain, difficulty: node.difficulty, nodeKind: node.nodeKind, groundingOrigin: node.groundingOrigin, grounding: node.grounding })),
      edges: detail.edges.map((edge) => ({
        prerequisiteLabel: labelFor(detail, edge.prerequisiteDerivedNodeId),
        dependentLabel: labelFor(detail, edge.dependentDerivedNodeId),
        confidence: edge.confidence,
        uncertain: edge.uncertain,
        judgeModel: edge.judgeModel
      }))
    }
  };
}
