// Pure, JSX-free view-model for the Derived Graph Layer (ADR-0019). A Derived
// Graph Layer is the inferred prerequisite DAG of one Enrichment Run over a
// published version — kept SEPARATE from the published asserted layer (which has
// zero edges, AE4) and from learner paths. These helpers are unit-testable under
// `tsx --test` and feed both the Cytoscape render and its required equivalent
// textual node-and-edge representation (U6 test scenario 8).

import { prerequisiteAncestors, type AdaptedNodeClassification, type AdaptedNodeState } from "@lrnki/application";
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

export function labelFor(detail: Pick<DerivedGraphDetail, "nodes">, derivedNodeId: string): string {
  return detail.nodes.find((node) => node.derivedNodeId === derivedNodeId)?.label ?? derivedNodeId;
}

// --- Goal-first picker helpers (U4, R1/R2/R3) ------------------------------

// One goal candidate for the goal-first study start. `journeySize` is how many concepts
// must be learned before this goal — its TRUSTED (certain-edge) prerequisite-ancestor
// count (R2). A zero-journey goal is foundational (R3).
export interface GoalCandidate {
  derivedNodeId: string;
  label: string;
  aliases: string[];
  declaredDomain: string;
  nodeKind: DerivedNodeKind;
  hasStudyItem: boolean;
  journeySize: number;
}

// Journey size = the count of trusted prerequisite ancestors (R2). Uncertain edges are
// excluded, matching the readiness/down-closure trust model. Pure and unit-testable.
export function journeySize(
  targetDerivedNodeId: string,
  edges: Pick<DerivedGraphEdge, "prerequisiteDerivedNodeId" | "dependentDerivedNodeId" | "uncertain">[]
): number {
  return prerequisiteAncestors(targetDerivedNodeId, edges.filter((edge) => !edge.uncertain)).size;
}

// Build goal candidates from a graph detail, each tagged with its journey size (R1/R2).
export function goalCandidates(detail: Pick<DerivedGraphDetail, "nodes" | "edges">): GoalCandidate[] {
  return detail.nodes.map((node) => ({
    derivedNodeId: node.derivedNodeId,
    label: node.label,
    aliases: node.aliases,
    declaredDomain: node.declaredDomain,
    nodeKind: node.nodeKind,
    hasStudyItem: node.hasStudyItem,
    journeySize: journeySize(node.derivedNodeId, detail.edges)
  }));
}

// Filter + order goal candidates for the picker (R1/R2): a case-insensitive substring
// match on the label OR any alias; larger journeys first, ties broken by label. An empty
// query matches everything. Pure, unit-testable; the page wiring is inspected in U8.
export function filterAndOrderGoals(candidates: GoalCandidate[], query: string): GoalCandidate[] {
  const q = query.trim().toLowerCase();
  const matches = (candidate: GoalCandidate): boolean =>
    q.length === 0 ||
    candidate.label.toLowerCase().includes(q) ||
    candidate.aliases.some((alias) => alias.toLowerCase().includes(q));
  return candidates
    .filter(matches)
    .sort((a, b) => b.journeySize - a.journeySize || a.label.localeCompare(b.label));
}

// A zero-journey goal is foundational — studied directly, no prerequisite cone (R3).
export function isFoundationalGoal(candidate: Pick<GoalCandidate, "journeySize">): boolean {
  return candidate.journeySize === 0;
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
