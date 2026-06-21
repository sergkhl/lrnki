"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { type Core } from "cytoscape";
import { GitForkIcon, ListTreeIcon } from "lucide-react";
import type { AdaptedNodeClassification, AdaptedNodeState } from "@lrnki/application";
import { applyElkLayeredLayout, recenterOnFocus } from "@/lib/cytoscapeElkLayout";
import { buildDerivedGraphView, frontierNeighborhood, nodeRenderAttrs, type DerivedGraphDetail, type DerivedGraphMode } from "@/lib/derivedGraph";
import { graphNodeFillToken } from "@/lib/graphNodeStyles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";

type DerivedGraphExplorerProps = Readonly<{
  detail: DerivedGraphDetail;
  adapted?: AdaptedNodeClassification;
  // Optional node-tap handler for the Study surface (U5). When present, tapping a node
  // reports its derivedNodeId so the caller can open the state-gated side sheet. Absent on
  // the neutral enrichment page, so that render keeps its read-only behavior unchanged.
  onNodeSelect?: (derivedNodeId: string) => void;
}>;

// Difficulty maps to node diameter (R7/KTD3): a bounded range so an operator can spot
// ordering defects at a glance. A null-difficulty node renders at the base size rather
// than collapsing to the minimum, so "no score" reads differently from "easiest".
const BASE_NODE_SIZE = 26;
const MIN_NODE_SIZE = 18;
const MAX_NODE_SIZE = 48;
function nodeSize(difficulty: number | null): number {
  if (difficulty === null) return BASE_NODE_SIZE;
  const clamped = Math.max(0, Math.min(1, difficulty));
  return MIN_NODE_SIZE + (MAX_NODE_SIZE - MIN_NODE_SIZE) * clamped;
}

// Adapted-overlay copy + textual badge variant for each learner state.
const ADAPTED_STATE_COPY: Record<AdaptedNodeState, string> = {
  mastered: "mastered",
  frontier: "frontier",
  locked: "locked"
};
const ADAPTED_STATE_BADGE: Record<AdaptedNodeState, "default" | "secondary" | "outline"> = {
  mastered: "default",
  frontier: "secondary",
  locked: "outline"
};

// Read-only Cytoscape rendering of a PERSISTED Derived Graph Layer (ADR-0011,
// ADR-0019, rule 12) — independent of any learner path. Cytoscape is reserved for
// derived-graph visualization; the published asserted layer never gets a canvas
// because it has zero edges (AE4). Every rendered graph carries an equivalent
// textual node-and-edge representation for non-visual inspection (U6 scenario 8).
//
// With `adapted` present (U2), the panel shows an internal neutral ↔ adapted segmented
// control over ONE pinned layout: ELK runs once over the neutral topology, and switching
// mode restyles nodes only (mastered / frontier / locked recolor, frontier target ringed)
// via `cy.batch()` — never re-running layout, so positions stay fixed for blink
// comparison (R11, KTD2). Without `adapted` there is no control and the render is neutral
// — node-kind / grounding coloring exactly as before, plus the difficulty-as-size
// encoding (R7). The textual node/edge panel re-renders for the active mode (R14).
export function DerivedGraphExplorer({ detail, adapted, onNodeSelect }: DerivedGraphExplorerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cytoscapeRef = useRef<Core | null>(null);
  // Held in a ref so the tap handler is bound ONCE in the layout effect (keyed on topology)
  // without re-running layout when the callback identity changes each render.
  const onNodeSelectRef = useRef(onNodeSelect);
  onNodeSelectRef.current = onNodeSelect;
  // The learner's working region (KTD2): the frontier target's 1-hop closed neighborhood,
  // or undefined when there's no classification (neutral enrichment page → fit-to-all).
  // Recomputed only when the target or topology changes.
  const focusNodeIds = useMemo(
    () => (adapted?.selectedFrontierTarget ? frontierNeighborhood(adapted.selectedFrontierTarget, detail.edges) : undefined),
    [adapted?.selectedFrontierTarget, detail.edges]
  );
  // Read in the layout effect (keyed on topology only) without making it a dependency, so a
  // frontier advance never re-runs ELK — it recenters via the viewport-only effect below.
  const focusRef = useRef(focusNodeIds);
  focusRef.current = focusNodeIds;
  // Guards the recenter effect: the async ELK pass resolves after first paint, so until it
  // does, initial framing is owned by the focus-fit at the end of the layout pass.
  const layoutReadyRef = useRef(false);
  const hasClassification = adapted != null;
  // The adapted view is the informative one, so default to it when a classification is
  // available; the enrichment page (no classification) is always neutral.
  const [mode, setMode] = useState<DerivedGraphMode>(hasClassification ? "adapted" : "neutral");
  const isAdaptedMode = hasClassification && mode === "adapted";

  // Topology view drives the ONE-TIME layout (stable across mode swaps); the textual
  // view re-renders for the active mode so the non-visual listing matches the canvas (R14).
  const layoutView = useMemo(() => buildDerivedGraphView(detail), [detail]);
  const view = useMemo(() => buildDerivedGraphView(detail, isAdaptedMode ? adapted : undefined), [detail, adapted, isAdaptedMode]);

  // Layout effect — runs ONCE per topology (KTD2). It builds the instance and runs ELK;
  // node positions become Cytoscape-owned state. Mode-dependent attrs start at the neutral
  // baseline and are set by the restyle effect below — never here, so a mode swap cannot
  // recreate the instance or re-fit the layout.
  useEffect(() => {
    if (!containerRef.current) return;
    let stale = false;
    layoutReadyRef.current = false;
    const styles = getComputedStyle(containerRef.current);
    const colorCanvas = document.createElement("canvas");
    colorCanvas.width = 1;
    colorCanvas.height = 1;
    const colorContext = colorCanvas.getContext("2d", { willReadFrequently: true });
    const color = (name: string) => {
      const value = styles.getPropertyValue(name).trim();
      if (!colorContext) return value;
      colorContext.clearRect(0, 0, 1, 1);
      colorContext.fillStyle = value;
      colorContext.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = colorContext.getImageData(0, 0, 1, 1).data;
      return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
    };

    const cy = cytoscape({
      container: containerRef.current,
      elements: [
        ...layoutView.cytoscape.nodes.map((node) => ({
          data: {
            id: node.id,
            label: node.label,
            domain: node.domain,
            nodeKind: node.nodeKind,
            groundingOrigin: node.groundingOrigin,
            size: nodeSize(node.difficulty),
            // Neutral baseline; the restyle effect overrides these on the active mode.
            adaptedState: "none",
            frontierTarget: "no",
            cardless: node.cardless ? "yes" : "no"
          }
        })),
        ...layoutView.cytoscape.edges.map((edge) => ({
          data: { id: edge.id, source: edge.source, target: edge.target, uncertain: edge.uncertain }
        }))
      ],
      layout: { name: "preset" },
      minZoom: 0.2,
      maxZoom: 3,
      style: [
        {
          selector: "node",
          style: {
            "background-color": color("--primary"),
            "border-color": color("--border"),
            "border-width": 1.5,
            color: color("--foreground"),
            label: "data(label)",
            "font-size": 10,
            "text-max-width": "120px",
            "text-wrap": "wrap",
            "text-valign": "bottom",
            "text-margin-y": 6,
            height: "data(size)",
            width: "data(size)"
          }
        },
        {
          // Enrichment nodes (minted/rescued) are visually distinct from anchors
          // (R15): a rounded rectangle in the dedicated graph-enrichment fill (KTD1) so an
          // operator never confuses a derived node with an asserted anchor — and so it
          // reads on the near-white canvas instead of vanishing into it.
          selector: "node[nodeKind = 'enrichment']",
          style: {
            shape: "round-rectangle",
            "background-color": color(graphNodeFillToken("enrichment")),
            "border-color": color("--ring")
          }
        },
        {
          // Minted llm_grounded nodes carry a dashed border — their grounding is
          // generated, not source-verbatim (the non-verbatim trust contract, R9).
          // Kept in adapted mode too: grounding still means what it means (R6).
          selector: "node[groundingOrigin = 'llm_grounded']",
          style: {
            "border-style": "dashed",
            "border-width": 2
          }
        },
        // --- Adapted overlay (U4, R2) ----------------------------------------
        // These match only when a learner classification is present (otherwise every
        // node carries adaptedState='none' and the neutral coloring above stands). They
        // come AFTER node-kind/grounding so the learner state wins the fill, while shape
        // and the dashed grounding border survive.
        {
          // Mastered — green (chart-1): the learner is at/above the ≈0.7 threshold.
          selector: "node[adaptedState = 'mastered']",
          style: { "background-color": color(graphNodeFillToken("mastered")), "border-color": color(graphNodeFillToken("mastered")) }
        },
        {
          // Frontier — amber (chart-4): unmastered but every direct prerequisite met.
          selector: "node[adaptedState = 'frontier']",
          style: { "background-color": color(graphNodeFillToken("frontier")), "border-color": color(graphNodeFillToken("frontier")) }
        },
        {
          // Locked — dedicated cool gray (KTD1): a direct prerequisite is still unmastered.
          // Reads as "inactive" yet stays visible on the canvas, unlike the old --muted fill
          // that collided with both the background and the enrichment fill.
          selector: "node[adaptedState = 'locked']",
          style: { "background-color": color(graphNodeFillToken("locked")), "border-color": color("--border"), color: color("--muted-foreground") }
        },
        {
          // The single selected frontier target — the hardest ready unmastered node the
          // adaptive path is working toward. A stronger ring marks it apart from the
          // other frontier nodes; border-style is left untouched so a generated
          // frontier target keeps its dashed grounding cue.
          selector: "node[frontierTarget = 'yes']",
          style: { "border-color": color("--foreground"), "border-width": 4 }
        },
        {
          selector: "edge",
          style: {
            // Taxi (orthogonal) routing keeps edges off the nodes in the top-down
            // ELK layout — straight bezier lines were cutting through depth-skipping
            // chains. Edges leave the bottom of a prerequisite and enter the top of
            // its dependent.
            "curve-style": "taxi",
            "taxi-direction": "downward",
            "taxi-turn": 18,
            "line-color": color("--muted-foreground"),
            "target-arrow-color": color("--muted-foreground"),
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.9,
            opacity: 0.8,
            width: 1.5
          }
        },
        {
          selector: "edge[uncertain = 'yes']",
          style: {
            "line-style": "dashed",
            opacity: 0.45
          }
        }
      ]
    });
    cytoscapeRef.current = cy;
    // Node-tap → caller (U5). Reads the ref so the handler always calls the latest callback.
    cy.on("tap", "node", (event) => onNodeSelectRef.current?.(event.target.id()));
    void applyElkLayeredLayout(cy, () => stale, focusRef.current)
      .then(() => {
        // Layout has positioned nodes and framed the initial focus; advances may now recenter.
        if (!stale) layoutReadyRef.current = true;
      })
      .catch((error: unknown) => {
        if (!stale) console.error("Failed to lay out derived graph", error);
      });
    return () => {
      stale = true;
      cy.destroy();
      cytoscapeRef.current = null;
    };
  }, [layoutView]);

  // Restyle effect — runs on every (mode, classification) change, AND once after the
  // layout effect (re)builds the instance. It is restyle-ONLY: it mutates each node's
  // `adaptedState` / `frontierTarget` data via `cy.batch()` and never calls
  // `cy.layout().run()` or `cy.fit()`, so positions from the one-time ELK pass survive
  // the swap untouched (R11). This is the structural guard the side-by-side pair lacked.
  useEffect(() => {
    const cy = cytoscapeRef.current;
    if (!cy || cy.destroyed()) return;
    cy.batch(() => {
      for (const node of layoutView.cytoscape.nodes) {
        const element = cy.getElementById(node.id);
        if (element.empty()) continue;
        const attrs = nodeRenderAttrs(mode, adapted, node.id);
        element.data("adaptedState", attrs.adaptedState);
        element.data("frontierTarget", attrs.frontierTarget);
      }
    });
  }, [layoutView, mode, adapted]);

  // Advance-recenter effect (KTD3) — keyed on the classification's frontier target, so it
  // fires on a FRONTIER ADVANCE, never on the neutral↔adapted mode toggle (which is local
  // `mode` state, absent from the deps). VIEWPORT-ONLY: it re-frames on the new working
  // region via `recenterOnFocus` and never re-runs ELK, so pinned positions survive (R11).
  // Skipped until the one-time layout pass has resolved — initial framing is the focus-fit
  // at the end of that pass, not this effect.
  useEffect(() => {
    const cy = cytoscapeRef.current;
    if (!cy || cy.destroyed() || !layoutReadyRef.current) return;
    if (!focusNodeIds || focusNodeIds.length === 0) return;
    recenterOnFocus(cy, focusNodeIds);
  }, [focusNodeIds]);

  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <Card className="min-h-[38rem]">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <GitForkIcon className="size-4" />
            Derived prerequisite DAG
            {isAdaptedMode ? <Badge variant="secondary">learner-adapted</Badge> : null}
          </CardTitle>
          <CardDescription>
            {isAdaptedMode
              ? "Nodes recolored by learner state (mastered / frontier / locked); the frontier target is ringed. "
              : null}
            Inferred prerequisite edges over published version{" "}
            <span className="font-mono text-xs">{detail.summary.graphVersionId}</span> · judge {detail.summary.judgeModel}
          </CardDescription>
          <CardAction className="flex flex-wrap items-center justify-end gap-2">
            {hasClassification ? (
              // Segmented control over the ONE pinned layout (R10): switching mode
              // restyles nodes only — positions never move (R11). Rendered only when a
              // learner classification is present; the neutral enrichment page has none.
              <div role="group" aria-label="Graph view mode" className="flex items-center rounded-md border p-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "neutral" ? "secondary" : "ghost"}
                  aria-pressed={mode === "neutral"}
                  className="h-7 px-2.5"
                  onClick={() => setMode("neutral")}
                >
                  Neutral
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "adapted" ? "secondary" : "ghost"}
                  aria-pressed={mode === "adapted"}
                  className="h-7 px-2.5"
                  onClick={() => setMode("adapted")}
                >
                  Adapted
                </Button>
              </div>
            ) : null}
            <Badge variant="outline">{detail.summary.conceptCount} concepts</Badge>
            <Badge variant="default">{detail.summary.certainEdgeCount} edges</Badge>
            <Badge variant="secondary">{detail.summary.uncertainEdgeCount} uncertain</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Arrows point from prerequisite to dependent. Dashed = uncertain inferred edges (excluded
            from learner paths). Scroll to zoom, drag to pan.
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full border" />
              <span className="inline-block size-3 rounded-full border" />
              node size ∝ intrinsic difficulty
            </span>
            {isAdaptedMode ? (
              <>
                <LegendSwatch token={graphNodeFillToken("mastered")} label="mastered" />
                <LegendSwatch token={graphNodeFillToken("frontier")} label="frontier" />
                <LegendSwatch token={graphNodeFillToken("locked")} label="locked" />
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-3 rounded-full" style={{ border: "2px solid var(--foreground)" }} />
                  frontier target
                </span>
              </>
            ) : null}
          </div>
          {view.cytoscape.nodes.length > 0 ? (
            <div
              ref={containerRef}
              role="img"
              aria-label={`Derived prerequisite graph with ${detail.summary.conceptCount} concepts and ${detail.summary.edgeCount} inferred edges`}
              className="min-h-[31rem] flex-1 rounded-lg border bg-muted/30"
            />
          ) : (
            <Empty className="min-h-[31rem] border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><GitForkIcon /></EmptyMedia>
                <EmptyTitle>No concepts in this version</EmptyTitle>
                <EmptyDescription>The enriched graph version has no published Concepts.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Card className="min-h-0 xl:max-h-[calc(100svh-7rem)]">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <ListTreeIcon className="size-4" />
            Nodes and edges
          </CardTitle>
          <CardDescription>Equivalent textual representation of the rendered DAG.</CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 flex-1">
          <ScrollArea className="h-full max-h-[30rem]">
            <div className="flex flex-col gap-4 pr-3">
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Nodes (anchors + enrichment)</h3>
                <ul className="flex flex-col gap-1">
                  {view.textual.nodes.map((node) => (
                    <li key={`${node.domain}-${node.label}`} className="flex flex-col gap-1.5 rounded-md border px-2 py-1.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{node.label}</span>
                          <span className="block truncate text-xs text-muted-foreground">{node.domain}</span>
                        </span>
                        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                          {node.adaptedState ? (
                            <Badge variant={ADAPTED_STATE_BADGE[node.adaptedState]}>{ADAPTED_STATE_COPY[node.adaptedState]}</Badge>
                          ) : null}
                          {node.isFrontierTarget ? <Badge variant="default">frontier target</Badge> : null}
                          {node.cardless ? <Badge variant="outline" title="no recall card exists for this node">no card</Badge> : null}
                          <Badge variant={node.nodeKind === "anchor" ? "default" : "secondary"}>{node.nodeKind === "anchor" ? "anchor" : "enrichment"}</Badge>
                          <Badge variant="outline">{node.difficulty === null ? "—" : node.difficulty.toFixed(2)}</Badge>
                        </span>
                      </div>
                      {node.difficultyRationale ? (
                        <div className="rounded-sm bg-muted/40 px-2 py-1 text-xs">
                          <span className="text-muted-foreground">difficulty rationale (generated): </span>
                          <span className="text-muted-foreground italic">{node.difficultyRationale}</span>
                        </div>
                      ) : null}
                      {node.grounding ? (
                        <div className="flex flex-col gap-1 rounded-sm bg-muted/40 px-2 py-1.5 text-xs">
                          <span className="flex flex-wrap items-center gap-1">
                            <Badge variant="outline">{node.groundingOrigin}</Badge>
                            <Badge variant={node.grounding.verbatimDisposition === "not_applicable_by_grounding" ? "secondary" : "outline"}>
                              verbatim: {node.grounding.verbatimDisposition}
                            </Badge>
                            {node.grounding.generatingModel ? <span className="text-muted-foreground">via {node.grounding.generatingModel}</span> : null}
                          </span>
                          {node.grounding.rationale ? <span className="text-muted-foreground italic">{node.grounding.rationale}</span> : null}
                          {node.grounding.passages.map((passage, index) => (
                            <span key={index} className="block">
                              <span className="text-muted-foreground">{passage.passageType}: </span>
                              <span>{passage.text}</span>
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Prerequisite edges</h3>
                {view.textual.edges.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {view.textual.edges.map((edge, index) => (
                      <li key={index} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm">
                        <span className="min-w-0 truncate">
                          <span className="font-medium">{edge.prerequisiteLabel}</span>
                          <span className="text-muted-foreground"> → </span>
                          <span className="font-medium">{edge.dependentLabel}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          {edge.uncertain ? <Badge variant="secondary">uncertain</Badge> : null}
                          <Badge variant="outline" title="judge model">{edge.judgeModel}</Badge>
                          <Badge variant="outline">{edge.confidence.toFixed(2)}</Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No inferred prerequisite edges.</p>
                )}
              </section>
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Origin counts by domain</h3>
                <ul className="flex flex-col gap-1">
                  {detail.originCounts.map((counts) => (
                    <li key={counts.domain} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm">
                      <span className="min-w-0 truncate font-medium">{counts.domain}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        <Badge variant="default" title="document_anchored">anchor {counts.anchor}</Badge>
                        <Badge variant="secondary" title="source_mentioned">rescued {counts.sourceMentioned}</Badge>
                        <Badge variant="outline" title="llm_grounded">generated {counts.llmGrounded}</Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Rescue durability dispositions</h3>
                {detail.rescueDispositions.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {detail.rescueDispositions.map((disposition) => (
                      <li key={disposition.derivedNodeId} className="flex flex-col gap-1 rounded-md border px-2 py-1.5 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate font-medium">{disposition.canonicalLabel}</span>
                          <Badge variant={disposition.disposition === "dropped" ? "destructive" : disposition.disposition === "accepted" ? "default" : "secondary"}>
                            {disposition.disposition}
                          </Badge>
                        </div>
                        {disposition.rationale ? <span className="text-xs text-muted-foreground italic">{disposition.rationale}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No rescue candidates were durability-judged in this run.</p>
                )}
              </section>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// One learner-state legend entry: a filled swatch in the same theme token the canvas
// uses for that state, so the legend can never drift from the rendered fill.
function LegendSwatch({ token, label }: Readonly<{ token: string; label: string }>) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block size-3 rounded-full border" style={{ backgroundColor: `var(${token})` }} />
      {label}
    </span>
  );
}
