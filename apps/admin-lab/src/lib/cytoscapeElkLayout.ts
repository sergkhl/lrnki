import cytoscape, { type LayoutOptions } from "cytoscape";
import elk from "cytoscape-elk";

// Register the cytoscape-elk extension exactly once. cytoscape.use is idempotent
// in practice, but Next.js can re-evaluate client modules across HMR / fast-refresh,
// so we guard with a module-scoped flag to avoid noisy double-registration warnings.
let registered = false;
function registerElk(): void {
  if (registered) return;
  cytoscape.use(elk);
  registered = true;
}
registerElk();

// Shared ELK `layered` layout reused by both Admin Lab graph explorers
// (DerivedGraphExplorer + LearnerPathExplorer) so DAG layout quality lives in one
// place. ELK does the hard parts the old hand-rolled longest-path code skipped:
// crossing minimization, parent-aligned node placement, edge routing, and
// aspect-ratio-aware separation of disconnected components. Top-down direction puts
// prerequisites above dependents. Tuned by real-use inspection (AGENTS rule 14) —
// there is no neural output here, so no test asserts these values (rule 11).
export const elkLayeredLayout: LayoutOptions = {
  name: "elk",
  fit: true,
  padding: 28,
  elk: {
    algorithm: "layered",
    "elk.direction": "DOWN",
    "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
    "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
    "elk.separateConnectedComponents": true,
    "elk.aspectRatio": 1.6,
    "elk.spacing.nodeNode": 80,
    "elk.layered.spacing.nodeNodeBetweenLayers": 70,
    "elk.spacing.componentComponent": 90,
    "elk.edgeRouting": "ORTHOGONAL",
    "elk.randomSeed": 1
  }
} as LayoutOptions;
