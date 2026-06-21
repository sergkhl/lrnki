// Pure, JSX-free view-model for the Derived Graph Layer (ADR-0019). A Derived
// Graph Layer is the inferred prerequisite DAG of one Enrichment Run over a
// published version — kept SEPARATE from the published asserted layer (which has
// zero edges, AE4) and from learner paths. These helpers are unit-testable under
// `tsx --test` and feed both the Cytoscape render and its required equivalent
// textual node-and-edge representation (U6 test scenario 8).

import type { AdaptedNodeClassification, AdaptedNodeState } from "@lrnki/application";

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
  // The difficulty judge's generated rationale for this node's score (R6). `null` when
  // the node has no persisted difficulty row; empty string for a structural-only score.
  // Always labeled as a generated rationale in the UI, never as a source quote.
  difficultyRationale: string | null;
  // Anchor (a projection of an asserted Concept) vs enrichment (minted/rescued, R15).
  nodeKind: DerivedNodeKind;
  groundingOrigin: DerivedGroundingOrigin;
  role: "anchor" | "prerequisite";
  // Whether any study item exists for this derived node. An enrichment-level fact loaded
  // once in `getEnrichmentDetail`, so an itemless node is rendered and flagged.
  hasStudyItem: boolean;
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
// inspect the same DAG the canvas draws. `adaptedState` is `null` in neutral mode
// (no learner overlay); `cardless` is always carried so a no-card fact stays visible
// in BOTH panels (R6). `isFrontierTarget` marks the single selected frontier node (R2).
export interface DerivedGraphViewNode {
  difficulty: number | null;
  // Carried alongside `difficulty` through both panels (R6); most useful beside the
  // adapted size/color encoding. `null` is preserved (not coerced to "").
  difficultyRationale: string | null;
  nodeKind: DerivedNodeKind;
  groundingOrigin: DerivedGroundingOrigin;
  cardless: boolean;
  adaptedState: AdaptedNodeState | null;
  isFrontierTarget: boolean;
}

export interface DerivedGraphView {
  cytoscape: {
    nodes: (DerivedGraphViewNode & { id: string; label: string; domain: string })[];
    edges: { id: string; source: string; target: string; uncertain: "yes" | "no"; confidence: number }[];
  };
  textual: {
    nodes: (DerivedGraphViewNode & { label: string; domain: string; grounding: NodeGroundingView | null })[];
    edges: { prerequisiteLabel: string; dependentLabel: string; confidence: number; uncertain: boolean; judgeModel: string }[];
  };
}

// The frontier target's 1-hop CLOSED neighborhood (KTD2): the target plus its direct
// prerequisites and direct dependents, deduped. This is the learner's working region the
// study graph frames on — "about five nodes". Computed over RENDERED edges (certain AND
// uncertain, since the canvas draws both), so the framed region matches the visible graph;
// contrast U5's calibration, which walks only trusted edges. Pure and direction-agnostic:
// an isolated node returns just itself.
export function frontierNeighborhood(
  targetDerivedNodeId: string,
  edges: Pick<DerivedGraphEdge, "prerequisiteDerivedNodeId" | "dependentDerivedNodeId">[]
): string[] {
  const ids = new Set<string>([targetDerivedNodeId]);
  for (const edge of edges) {
    if (edge.dependentDerivedNodeId === targetDerivedNodeId) ids.add(edge.prerequisiteDerivedNodeId); // direct prerequisite (upstream)
    if (edge.prerequisiteDerivedNodeId === targetDerivedNodeId) ids.add(edge.dependentDerivedNodeId); // direct dependent (downstream)
  }
  return [...ids];
}

export function labelFor(detail: Pick<DerivedGraphDetail, "nodes">, derivedNodeId: string): string {
  return detail.nodes.find((node) => node.derivedNodeId === derivedNodeId)?.label ?? derivedNodeId;
}

// The neutral ↔ adapted display mode of the single pinned canvas (U2, KTD2). One
// pre-computed layout serves BOTH modes; switching mode restyles nodes only and
// never re-runs layout, so positions stay fixed for blink comparison (R11).
export type DerivedGraphMode = "neutral" | "adapted";

// The Cytoscape node `data` attributes that change between modes — and ONLY these.
// Everything else (id, label, size, nodeKind, grounding, cardless) is mode-invariant and
// owned by the one-time layout pass. The restyle effect feeds each node these two attrs
// via `cy.batch()` on a mode/classification change; the style selectors keyed on
// `adaptedState` / `frontierTarget` then recolor in place. "none"/"no" is the neutral
// baseline (matching the absent-classification render), so neutral mode is byte-identical
// to the enrichment-page view regardless of whether a classification is available.
export type NodeRenderAttrs = { adaptedState: AdaptedNodeState | "none"; frontierTarget: "yes" | "no" };

export function nodeRenderAttrs(mode: DerivedGraphMode, classification: AdaptedNodeClassification | undefined, derivedNodeId: string): NodeRenderAttrs {
  if (mode === "neutral" || !classification) return { adaptedState: "none", frontierTarget: "no" };
  return {
    adaptedState: classification.stateByNode[derivedNodeId] ?? "none",
    frontierTarget: classification.selectedFrontierTarget === derivedNodeId ? "yes" : "no"
  };
}

// Build the view-model, optionally overlaying a learner classification (U3, KTD2). With
// `adapted` absent the output is neutral — byte-equivalent to the enrichment-page render
// today, every node `adaptedState: null` / `isFrontierTarget: false`. With `adapted`
// present each node gains its mastered / frontier / locked state and the single frontier
// target is marked. `cardless` is derived from `hasStudyItem` in BOTH modes (R6).
export function buildDerivedGraphView(detail: DerivedGraphDetail, adapted?: AdaptedNodeClassification): DerivedGraphView {
  const overlayFor = (derivedNodeId: string): Pick<DerivedGraphViewNode, "adaptedState" | "isFrontierTarget"> => ({
    adaptedState: adapted ? adapted.stateByNode[derivedNodeId] ?? null : null,
    isFrontierTarget: adapted ? adapted.selectedFrontierTarget === derivedNodeId : false
  });

  return {
    cytoscape: {
      nodes: detail.nodes.map((node) => ({
        id: node.derivedNodeId,
        label: node.label,
        domain: node.declaredDomain,
        difficulty: node.difficulty,
        difficultyRationale: node.difficultyRationale,
        nodeKind: node.nodeKind,
        groundingOrigin: node.groundingOrigin,
        cardless: !node.hasStudyItem,
        ...overlayFor(node.derivedNodeId)
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
      nodes: detail.nodes.map((node) => ({
        label: node.label,
        domain: node.declaredDomain,
        difficulty: node.difficulty,
        difficultyRationale: node.difficultyRationale,
        nodeKind: node.nodeKind,
        groundingOrigin: node.groundingOrigin,
        grounding: node.grounding,
        cardless: !node.hasStudyItem,
        ...overlayFor(node.derivedNodeId)
      })),
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
