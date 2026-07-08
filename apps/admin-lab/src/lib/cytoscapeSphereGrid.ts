import type { Core } from "cytoscape";
import { layoutSphereGrid, type SphereGridLayout, type SphereGridNodeInput } from "@lrnki/application";

// The closest the focus-fit will zoom (KTD2): a sparse 1-2 node neighborhood would
// otherwise fit-to-fill at an absurd zoom. When the fit exceeds this, clamp the level and
// re-center on the focus so the working region stays framed without filling the viewport.
// (Carried over unchanged from the former spiral applier.)
const MAX_FOCUS_ZOOM = 1.3;

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
// — pan + zoom, never `cy.layout()` — so node positions from the one-time sphere-grid
// placement survive untouched. Falls back to fit-to-all when the focus is empty.
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

// Apply the pure FFX-sphere-grid layout to a live Cytoscape instance. Mirrors the former
// spiral applier contract: runs ONCE per topology, writes preset positions through
// `cy.batch()`, guards against a stale/destroyed instance, and frames on the focus region
// (or fit-to-all). Only CONCEPT nodes are positioned — compound region parents (U3) are
// excluded and auto-bound to their children by Cytoscape.
//
// Returns the computed layout so the caller can surface any non-embeddable loops to the
// operator (R10) — a crossing is never silently rendered as if clean.
export function applySphereGridLayout(cy: Core, isStale: () => boolean, focusNodeIds?: string[]): SphereGridLayout | null {
  const nodes = cy.nodes().toArray().filter((node) => !node.isParent());
  if (nodes.length === 0) return null;

  const layoutNodes: SphereGridNodeInput[] = nodes.map((node) => ({
    id: node.id(),
    label: String(node.data("label") ?? node.id()),
    // Single-domain canvases carry no `domain`; they collapse into one
    // loop/region. Same-domain edges guarantee no inter-region edge either way.
    domain: typeof node.data("domain") === "string" ? node.data("domain") : "",
    difficulty: typeof node.data("difficulty") === "number" ? node.data("difficulty") : null
  }));

  const edges = cy.edges().toArray().map((edge) => ({
    source: edge.source().id(),
    target: edge.target().id(),
    uncertain: edge.data("uncertain") === "yes" ? ("yes" as const) : ("no" as const)
  }));

  const layout = layoutSphereGrid(layoutNodes, edges);

  if (isStale() || cy.destroyed()) return layout;

  cy.batch(() => {
    for (const position of layout.positions) {
      const node = cy.getElementById(position.id);
      if (node.empty()) continue;
      node.position({ x: position.x, y: position.y });
    }
  });

  if (isStale() || cy.destroyed()) return layout;
  if (focusNodeIds && focusNodeIds.length > 0) recenterOnFocus(cy, focusNodeIds);
  else cy.fit(cy.elements(), 28);

  return layout;
}
