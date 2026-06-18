// Minimal ambient declaration: cytoscape-elk ships no published types
// (@types/cytoscape-elk does not exist). It exports a single registration
// function compatible with cytoscape.use(...), which is all we consume.
declare module "cytoscape-elk" {
  import type { Ext } from "cytoscape";
  const extension: Ext;
  export default extension;
}
