import type { AdaptedNodeState } from "@lrnki/application";

// Single source of truth for derived-graph node-state fills (KTD1, AGENTS rule 18).
// Both the Cytoscape style selectors and the legend swatches in DerivedGraphExplorer read
// this map, so the rendered fill and its legend can never drift. Each entry names a CSS
// custom property defined in `globals.css :root` — the component resolves it to a concrete
// color through its `color(token)` reader.
//
// `enrichment` is the neutral node-kind fill for a minted/rescued node (no learner overlay);
// `mastered` / `frontier` / `locked` are the learner-state overlay fills. The original bug
// was enrichment and locked both resolving to the same near-white token — so the distinctness
// of these token NAMES is the structural guard against that collision (graphNodeStyles.test.ts).
export type GraphNodeFillKey = AdaptedNodeState | "enrichment";

export const GRAPH_NODE_FILL_TOKENS: Record<GraphNodeFillKey, string> = {
  mastered: "--chart-1",
  frontier: "--chart-4",
  locked: "--graph-locked",
  enrichment: "--graph-enrichment"
};

export function graphNodeFillToken(key: GraphNodeFillKey): string {
  return GRAPH_NODE_FILL_TOKENS[key];
}
