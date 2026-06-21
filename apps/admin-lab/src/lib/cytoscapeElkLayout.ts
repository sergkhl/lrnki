import type { Core, NodeSingular } from "cytoscape";
import ELK, { type ElkExtendedEdge, type ElkNode } from "elkjs/lib/elk.bundled.js";

// Shared ELK `layered` layout reused by both Admin Lab graph explorers
// (DerivedGraphExplorer + LearnerPathExplorer) so DAG layout quality lives in one
// place. ELK does the hard parts the old hand-rolled longest-path code skipped:
// crossing minimization, parent-aligned node placement, edge routing, and
// aspect-ratio-aware separation of disconnected components. Top-down direction
// puts prerequisites above dependents. We run ELK directly instead of the
// cytoscape-elk extension because that extension cannot cancel its async
// `layout().then(...)` callback; in React StrictMode / route transitions that
// callback can otherwise mutate a destroyed Cytoscape core.
const elkLayeredOptions = {
  algorithm: "layered",
  "elk.direction": "DOWN",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.separateConnectedComponents": "true",
  "elk.aspectRatio": "1.6",
  "elk.spacing.nodeNode": "80",
  "elk.layered.spacing.nodeNodeBetweenLayers": "70",
  "elk.spacing.componentComponent": "90",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.randomSeed": "1"
};

function elkNodeFor(node: NodeSingular): ElkNode {
  const dimensions = node.layoutDimensions({ nodeDimensionsIncludeLabels: false });
  return {
    id: node.id(),
    width: dimensions.w,
    height: dimensions.h
  };
}

// The closest the focus-fit will zoom (KTD2): a sparse 1-2 node neighborhood would
// otherwise fit-to-fill at an absurd zoom. When the fit exceeds this, clamp the level and
// re-center on the focus so the working region stays framed without filling the viewport.
export const MAX_FOCUS_ZOOM = 1.3;

// Build a Cytoscape collection from node ids, skipping any not present in the graph.
function collect(cy: Core, nodeIds: string[]) {
  let collection = cy.collection();
  for (const id of nodeIds) {
    const node = cy.getElementById(id);
    if (!node.empty()) collection = collection.union(node);
  }
  return collection;
}

// Frame the viewport on a focus collection with a max-zoom clamp (KTD2/KTD3). VIEWPORT-ONLY
// — pan + zoom, never `cy.layout()` — so node positions from the one-time ELK pass survive
// untouched (the blink-compare invariant, R11). Falls back to fit-to-all when the focus is
// empty or unresolvable. Reused by both the initial layout framing and the advance-recenter
// effect so the two can never diverge.
export function recenterOnFocus(cy: Core, focusNodeIds: string[]): void {
  const focus = collect(cy, focusNodeIds);
  if (focus.empty()) {
    cy.fit(cy.elements(), 28);
    return;
  }
  cy.fit(focus, 60);
  if (cy.zoom() > MAX_FOCUS_ZOOM) {
    cy.zoom(MAX_FOCUS_ZOOM);
    cy.center(focus);
  }
}

export async function applyElkLayeredLayout(cy: Core, isStale: () => boolean, focusNodeIds?: string[]): Promise<void> {
  const nodes = cy.nodes().toArray().filter((node) => !node.isParent());
  if (nodes.length === 0) return;

  const graph: ElkNode = {
    id: "root",
    layoutOptions: elkLayeredOptions,
    children: nodes.map((node) => elkNodeFor(node)),
    edges: cy.edges().toArray().map((edge): ElkExtendedEdge => ({
      id: edge.id(),
      sources: [edge.source().id()],
      targets: [edge.target().id()]
    }))
  };

  const elk = new ELK();
  try {
    const laidOutGraph = await elk.layout(graph);
    if (isStale() || cy.destroyed()) return;

    cy.batch(() => {
      for (const child of laidOutGraph.children ?? []) {
        const node = cy.getElementById(child.id);
        if (node.empty()) continue;
        node.position({
          x: (child.x ?? 0) + (child.width ?? 0) / 2,
          y: (child.y ?? 0) + (child.height ?? 0) / 2
        });
      }
    });

    if (isStale() || cy.destroyed()) return;
    // Initial framing: focus on the working region when given (study surface), else
    // fit-to-all (neutral enrichment page + learner-path explorer, byte-unchanged).
    if (focusNodeIds && focusNodeIds.length > 0) recenterOnFocus(cy, focusNodeIds);
    else cy.fit(cy.elements(), 28);
  } finally {
    try {
      elk.terminateWorker();
    } catch {
      // The bundled browser worker used by elkjs can lack a terminate hook.
    }
  }
}
