import type { DerivedGraphLayer, DerivedGraphNode } from "@lrnki/domain-core";

// Sibling context selection (U3, KTD3). Pure: picks up to N same-domain neighbor
// descriptors that FLAVOR option-select distractors so wrong answers read like real
// domain answers. Prompt-context only — a sibling-poor node still generates, just with
// thinner flavor (origin "Key Decisions"); it never degrades to no item. Ranks
// prerequisite-adjacent siblings first (the tightest neighbors), then other same-domain
// nodes, both in stable layer order so a given layer yields a deterministic context.

export type SiblingDescriptor = { derivedNodeId: string; label: string; snippet: string };

export const DEFAULT_MAX_SIBLINGS = 6;

// One grounding snippet per sibling, definition-preferred. Anchors carry no inline
// grounding on the node (their evidence lives in the CEP), so they contribute a
// label-only descriptor — still a same-domain register cue for the generator.
function siblingSnippet(node: DerivedGraphNode): string {
  if (node.nodeKind !== "enrichment") return "";
  if (node.groundingOrigin === "source_mentioned") {
    return node.groundingPassages[0]?.text ?? "";
  }
  return node.groundingBundle.definitions[0]?.text ?? node.groundingBundle.mentions[0]?.text ?? "";
}

export function selectSiblingContext(
  node: DerivedGraphNode,
  layer: DerivedGraphLayer,
  maxSiblings: number = DEFAULT_MAX_SIBLINGS
): SiblingDescriptor[] {
  const siblings = layer.derivedNodes.filter(
    (candidate) => candidate.derivedNodeId !== node.derivedNodeId && candidate.declaredDomain === node.declaredDomain
  );

  const adjacent = new Set<string>();
  for (const edge of layer.prerequisiteEdges) {
    if (edge.prerequisiteDerivedNodeId === node.derivedNodeId) adjacent.add(edge.dependentDerivedNodeId);
    if (edge.dependentDerivedNodeId === node.derivedNodeId) adjacent.add(edge.prerequisiteDerivedNodeId);
  }

  // Partition (not Array.sort) to keep ordering deterministic and stable within groups.
  const adjacentSiblings = siblings.filter((candidate) => adjacent.has(candidate.derivedNodeId));
  const otherSiblings = siblings.filter((candidate) => !adjacent.has(candidate.derivedNodeId));

  return [...adjacentSiblings, ...otherSiblings].slice(0, maxSiblings).map((candidate) => ({
    derivedNodeId: candidate.derivedNodeId,
    label: candidate.canonicalLabel,
    snippet: siblingSnippet(candidate)
  }));
}
