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

export async function applyElkLayeredLayout(cy: Core, isStale: () => boolean): Promise<void> {
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
    cy.fit(cy.elements(), 28);
  } finally {
    try {
      elk.terminateWorker();
    } catch {
      // The bundled browser worker used by elkjs can lack a terminate hook.
    }
  }
}
