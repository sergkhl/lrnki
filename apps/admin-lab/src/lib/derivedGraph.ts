// Pure, JSX-free view-model for the Derived Graph Layer (ADR-0019). A Derived
// Graph Layer is the inferred prerequisite DAG of one Enrichment Run over a
// published version — kept SEPARATE from the published asserted layer (which has
// zero edges, AE4) and from learner paths. These helpers are unit-testable under
// `tsx --test` and feed both the Cytoscape render and its required equivalent
// textual node-and-edge representation (U6 test scenario 8).

import { labelFor, type AdaptedNodeClassification, type AdaptedNodeState } from "@lrnki/application";
import type {
  DerivedGraphDetail,
  DerivedGraphEdge,
  DerivedGraphNode,
  DerivedGroundingOrigin,
  DerivedNodeKind,
  MintingDispositionView,
  NodeGroundingView,
  NodeMergeView
} from "@lrnki/ports";
export type {
  DerivedGraphDetail,
  DerivedGraphEdge,
  DerivedGraphNode,
  DerivedGroundingOrigin,
  DerivedNodeKind,
  DomainOriginCounts,
  EnrichmentSummary,
  GroundingPassageView,
  MintingDispositionView,
  NodeGroundingView,
  NodeMergeView,
  RescueDispositionView
} from "@lrnki/ports";

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
    // `derivedNodeId` / the per-edge endpoint ids are threaded so a textual row can drive a
    // canvas recenter (and, for a node, the state-gated side sheet) without a parallel id map —
    // these are the one source of truth for the row→graph link (AGENTS rule 18).
    nodes: (DerivedGraphViewNode & { derivedNodeId: string; label: string; domain: string; grounding: NodeGroundingView | null })[];
    edges: {
      prerequisiteDerivedNodeId: string;
      dependentDerivedNodeId: string;
      prerequisiteLabel: string;
      dependentLabel: string;
      confidence: number;
      uncertain: boolean;
      judgeModel: string;
    }[];
    // The semantic merges (U5), surfaced in the equivalent textual readout so a
    // non-visual reader (or a test) can see each canonical ← absorbed collapse with its
    // proposing signal + score.
    mintingDispositions: MintingDispositionView[];
    merges: NodeMergeView[];
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

export function filterDetailToVisible(detail: DerivedGraphDetail, hiddenNodeIds: ReadonlySet<string>): DerivedGraphDetail {
  const nodes = detail.nodes.filter((node) => !hiddenNodeIds.has(node.derivedNodeId));
  const visibleNodeIds = new Set(nodes.map((node) => node.derivedNodeId));
  const edges: DerivedGraphEdge[] = [];
  let certainEdgeCount = 0;
  let uncertainEdgeCount = 0;
  for (const edge of detail.edges) {
    if (!visibleNodeIds.has(edge.prerequisiteDerivedNodeId) || !visibleNodeIds.has(edge.dependentDerivedNodeId)) continue;
    edges.push(edge);
    if (edge.uncertain) uncertainEdgeCount += 1;
    else certainEdgeCount += 1;
  }

  return {
    ...detail,
    summary: {
      ...detail.summary,
      conceptCount: nodes.length,
      edgeCount: edges.length,
      certainEdgeCount,
      uncertainEdgeCount
    },
    nodes,
    edges,
    originCounts: summarizeDomainOrigins(nodes)
  };
}

function summarizeDomainOrigins(nodes: DerivedGraphNode[]) {
  const byDomain = new Map<string, { anchor: number; sourceMentioned: number; llmGrounded: number }>();
  for (const node of nodes) {
    const counts = byDomain.get(node.declaredDomain) ?? { anchor: 0, sourceMentioned: 0, llmGrounded: 0 };
    if (node.nodeKind === "anchor") counts.anchor += 1;
    else if (node.groundingOrigin === "source_mentioned") counts.sourceMentioned += 1;
    else if (node.groundingOrigin === "llm_grounded") counts.llmGrounded += 1;
    byDomain.set(node.declaredDomain, counts);
  }
  return [...byDomain.entries()]
    .map(([domain, counts]) => ({ domain, ...counts }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
}

// The distinct declared domains present on the canvas, sorted deterministically. Each
// becomes one FFX learning-loop region — a Cytoscape compound parent node wrapping that
// domain's concepts (U3, R2). A single-domain graph yields exactly one region. Pure so
// the grouping is unit-testable independently of Cytoscape.
export function distinctDomains(nodes: ReadonlyArray<{ domain: string }>): string[] {
  return [...new Set(nodes.map((node) => node.domain))].sort((a, b) => a.localeCompare(b));
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
export type NodeRenderAttrs = { adaptedState: AdaptedNodeState | "none"; frontierTarget: "yes" | "no"; hidden: "yes" | "no" };

export function nodeRenderAttrs(
  mode: DerivedGraphMode,
  classification: AdaptedNodeClassification | undefined,
  derivedNodeId: string,
  hiddenNodeIds: ReadonlySet<string> = new Set()
): NodeRenderAttrs {
  if (mode === "neutral" || !classification) return { adaptedState: "none", frontierTarget: "no", hidden: "no" };
  return {
    adaptedState: classification.stateByNode[derivedNodeId] ?? "none",
    frontierTarget: classification.selectedFrontierTarget === derivedNodeId ? "yes" : "no",
    hidden: hiddenNodeIds.has(derivedNodeId) ? "yes" : "no"
  };
}

export function regionHiddenAttr(
  mode: DerivedGraphMode,
  domain: string,
  nodes: ReadonlyArray<{ id: string; domain: string }>,
  hiddenNodeIds: ReadonlySet<string> = new Set()
): "yes" | "no" {
  const children = nodes.filter((node) => node.domain === domain);
  return mode === "adapted" && children.length > 0 && children.every((node) => hiddenNodeIds.has(node.id)) ? "yes" : "no";
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
        derivedNodeId: node.derivedNodeId,
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
        prerequisiteDerivedNodeId: edge.prerequisiteDerivedNodeId,
        dependentDerivedNodeId: edge.dependentDerivedNodeId,
        prerequisiteLabel: labelFor(detail, edge.prerequisiteDerivedNodeId),
        dependentLabel: labelFor(detail, edge.dependentDerivedNodeId),
        confidence: edge.confidence,
        uncertain: edge.uncertain,
        judgeModel: edge.judgeModel
      })),
      mintingDispositions: detail.mintingDispositions,
      merges: detail.merges
    }
  };
}
