"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import cytoscape, { type Core } from "cytoscape";
import { ChevronRightIcon, GitForkIcon, ListTreeIcon } from "lucide-react";
import type { AdaptedNodeClassification, AdaptedNodeState } from "@lrnki/application";
import { applySphereGridLayout, recenterOnFocus } from "@/lib/cytoscapeSphereGrid";
import type { SphereGridFlaggedLoop } from "@/lib/sphereGridLayout";
import { buildDerivedGraphView, distinctDomains, frontierNeighborhood, nodeRenderAttrs, type DerivedGraphDetail, type DerivedGraphMode } from "@/lib/derivedGraph";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

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
// control over ONE pinned layout: spiral placement runs once over the neutral topology, and switching
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
  // frontier advance never re-runs layout — it recenters via the viewport-only effect below.
  const focusRef = useRef(focusNodeIds);
  focusRef.current = focusNodeIds;
  // Guards the recenter effect: initial framing is owned by the focus-fit at the end of the
  // layout pass, and later frontier advances are viewport-only.
  const layoutReadyRef = useRef(false);
  const hasClassification = adapted != null;
  // The adapted view is the informative one, so default to it when a classification is
  // available; the enrichment page (no classification) is always neutral.
  const [mode, setMode] = useState<DerivedGraphMode>(hasClassification ? "adapted" : "neutral");
  const isAdaptedMode = hasClassification && mode === "adapted";
  // Loops the sphere-grid geometry could not embed crossing-free (R10). Populated by the
  // one-time layout pass and surfaced to the operator below — fail loud, never silent-cross.
  const [flaggedLoops, setFlaggedLoops] = useState<SphereGridFlaggedLoop[]>([]);
  // The "Nodes and edges" textual listing lives in a right slide-over drawer, closed by
  // default so the canvas owns the full width. Summoned from the graph toolbar (item 1).
  const [panelOpen, setPanelOpen] = useState(false);

  // Topology view drives the ONE-TIME layout (stable across mode swaps); the textual
  // view re-renders for the active mode so the non-visual listing matches the canvas (R14).
  const layoutView = useMemo(() => buildDerivedGraphView(detail), [detail]);
  const view = useMemo(() => buildDerivedGraphView(detail, isAdaptedMode ? adapted : undefined), [detail, adapted, isAdaptedMode]);

  // Domain-focus selector (item 2): the distinct domain regions plus an "all" sentinel.
  // Manual, viewport-only pan — picking a domain frames its region; "all" fits the whole
  // graph. A later frontier advance still recenters on the working neighborhood by design.
  const domains = useMemo(() => distinctDomains(layoutView.cytoscape.nodes), [layoutView]);
  const [focusedDomain, setFocusedDomain] = useState<string>("all");

  // Imperative viewport-only recenter shared by the domain selector (item 2) and the
  // textual-row clicks (item 3). Reuses `recenterOnFocus` (zoom-clamped fit/center) and
  // guards a destroyed instance, so it never re-runs layout — pinned positions survive (R11).
  const focusGraphOn = (nodeIds: string[]) => {
    const cy = cytoscapeRef.current;
    if (!cy || cy.destroyed()) return;
    recenterOnFocus(cy, nodeIds);
  };

  const onFocusDomain = (value: string | null) => {
    const domain = value ?? "all";
    setFocusedDomain(domain);
    if (domain === "all") {
      focusGraphOn([]); // empty focus → recenterOnFocus fits all elements
      return;
    }
    focusGraphOn(layoutView.cytoscape.nodes.filter((node) => node.domain === domain).map((node) => node.id));
  };

  // Layout effect — runs ONCE per topology (KTD2). It builds the instance and runs spiral placement;
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
        // One compound parent per declared domain = one FFX learning-loop region (R2). The
        // box + domain label come from Cytoscape core and auto-bound the packed children;
        // styled by the `node:parent` selector, excluded from every concept-node selector.
        ...distinctDomains(layoutView.cytoscape.nodes).map((domain) => ({
          data: { id: `region:${domain}`, label: domain, regionKind: "loop" }
        })),
        ...layoutView.cytoscape.nodes.map((node) => ({
          data: {
            id: node.id,
            label: node.label,
            domain: node.domain,
            // Membership in the domain's region parent. Same-domain edges only, so no edge
            // ever crosses a region boundary.
            parent: `region:${node.domain}`,
            difficulty: node.difficulty,
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
          // Region parents (R2): one bordered, labeled box per domain/learning loop. A
          // subtle dashed border + faint fill reads as an FFX cluster without competing with
          // the concept nodes; `node:parent` matches ONLY compound parents, never concepts.
          selector: "node:parent",
          style: {
            label: "data(label)",
            shape: "round-rectangle",
            "background-color": color("--muted"),
            "background-opacity": 0.2,
            "border-color": color("--border"),
            "border-width": 1.5,
            "border-style": "dashed",
            padding: "26px",
            "text-valign": "top",
            "text-halign": "center",
            "text-margin-y": -4,
            "font-size": 12,
            "font-weight": 600,
            color: color("--muted-foreground")
          }
        },
        {
          // Concept nodes only (`:childless`) — a region parent must never pick up the
          // concept fill, the difficulty-driven `data(size)`, or the leaf label position.
          selector: "node:childless",
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
          style: { "background-color": color(graphNodeFillToken("locked")), "border-color": color("--border"), color: color("--muted-foreground"), opacity: 0.5 }
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
          // Right-angle FFX "track" edges (R3): Cytoscape-core taxi routing, configured to
          // turn at the segment midpoint and stay monotone within each edge's bounding box,
          // so the orthogonal rendering cannot introduce a crossing the pure straight-segment
          // model (sphereGridLayout) lacks.
          selector: "edge",
          style: {
            "curve-style": "taxi",
            "taxi-direction": "auto",
            "taxi-turn": "50%",
            "taxi-turn-min-distance": "5px",
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
    // Node-tap → caller (U5). Scoped to `:childless` so tapping a region parent never
    // reports a non-concept id. Reads the ref so the handler always calls the latest callback.
    cy.on("tap", "node:childless", (event) => onNodeSelectRef.current?.(event.target.id()));
    const layout = applySphereGridLayout(cy, () => stale, focusRef.current);
    if (!stale) {
      layoutReadyRef.current = true;
      // Surface any loop the geometry could not embed crossing-free (R10) — never render a
      // crossing as if clean. Empty on the sparse near-trees this canvas draws today.
      setFlaggedLoops(layout?.flaggedLoops ?? []);
    }
    return () => {
      stale = true;
      cy.destroy();
      cytoscapeRef.current = null;
    };
  }, [layoutView]);

  // Restyle effect — runs on every (mode, classification) change, AND once after the
  // layout effect (re)builds the instance. It is restyle-ONLY: it mutates each node's
  // `adaptedState` / `frontierTarget` data via `cy.batch()` and never calls
  // `cy.layout().run()` or `cy.fit()`, so positions from the one-time layout pass survive
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
  // region via `recenterOnFocus` and never re-runs layout, so pinned positions survive (R11).
  // Skipped until the one-time layout pass has resolved — initial framing is the focus-fit
  // at the end of that pass, not this effect.
  useEffect(() => {
    const cy = cytoscapeRef.current;
    if (!cy || cy.destroyed() || !layoutReadyRef.current) return;
    if (!focusNodeIds || focusNodeIds.length === 0) return;
    recenterOnFocus(cy, focusNodeIds);
  }, [focusNodeIds]);

  return (
    <div className="flex min-h-0 flex-col gap-4">
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
            {/* Domain / learning-loop focus (item 2). Present in BOTH the study and read-only
                enrichment renders — it's a viewport pan, independent of any classification. */}
            <Select value={focusedDomain} onValueChange={onFocusDomain}>
              <SelectTrigger size="sm" className="h-7" aria-label="Focus a domain region">
                {/* Function child resolves the label without the lazy portal options being
                    mounted — otherwise a closed trigger shows the raw "all" value, not the
                    "All domains" label. Domain values are their own labels. */}
                <SelectValue>{(value) => (value === "all" || value == null ? "All domains" : value)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All domains</SelectItem>
                {domains.map((domain) => (
                  <SelectItem key={domain} value={domain}>
                    {domain}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasClassification ? (
              // Segmented control over the ONE pinned layout (R10): switching mode
              // restyles nodes only — positions never move (R11). Rendered only when a
              // learner classification is present; the neutral enrichment page has none.
              <div role="group" aria-label="Graph view mode" className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "neutral" ? "default" : "outline"}
                  aria-pressed={mode === "neutral"}
                  className="h-7 px-2.5"
                  onClick={() => setMode("neutral")}
                >
                  Neutral
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "adapted" ? "default" : "outline"}
                  aria-pressed={mode === "adapted"}
                  className="h-7 px-2.5"
                  onClick={() => setMode("adapted")}
                >
                  Adapted
                </Button>
              </div>
            ) : null}
            {/* Non-interactive metadata: bordered/light tag pills (KTD5). Kept off the solid
                `default` register so nothing inert mimics the solid active segmented button. */}
            <Badge variant="outline">{detail.summary.conceptCount} concepts</Badge>
            <Badge variant="secondary">{detail.summary.certainEdgeCount} edges</Badge>
            <Badge variant="outline">{detail.summary.uncertainEdgeCount} uncertain</Badge>
            {/* Summons the textual node/edge listing as a right slide-over (item 1). Kept in
                the toolbar so it reads as a graph affordance, not a separate panel. */}
            <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => setPanelOpen(true)}>
              <ListTreeIcon className="size-4" />
              Nodes and edges
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Right-angle tracks point from prerequisite to dependent; each dashed-bordered region is
            one domain (a learning loop), and no edge crosses between regions. Dashed edges = uncertain
            inferred edges (excluded from learner paths). Scroll to zoom, drag to pan.
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-[3px] border border-dashed" />
              domain / learning loop
            </span>
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
          {flaggedLoops.length > 0 ? (
            // R10: a loop whose reconvergent edges force a crossing is surfaced, not hidden.
            <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {flaggedLoops.length === 1 ? "1 loop" : `${flaggedLoops.length} loops`} could not be drawn crossing-free:{" "}
              {flaggedLoops.map((loop) => `${loop.domain} (${loop.crossings})`).join(", ")}. Edges in these regions may overlap.
            </div>
          ) : null}
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

      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent side="right" className="w-[30rem] sm:max-w-[30rem] flex flex-col gap-0 p-0">
          <SheetHeader className="border-b">
            <SheetTitle className="flex items-center gap-2">
              <ListTreeIcon className="size-4" />
              Nodes and edges
            </SheetTitle>
            <SheetDescription>Equivalent textual representation of the rendered DAG.</SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-full flex-1">
            <div className="flex flex-col gap-4 p-4">
              <CollapsibleSection title="Nodes (anchors + enrichment)">
                <ul className="flex flex-col gap-1">
                  {view.textual.nodes.map((node) => (
                    <li key={node.derivedNodeId}>
                      {/* Row → recenter the canvas on this node AND open the state-gated side
                          sheet (item 3), reusing the same `onNodeSelect` callback the canvas tap
                          uses. On the enrichment page `onNodeSelect` is absent, so the row just
                          recenters — no sheet — which is correct. */}
                      <button
                        type="button"
                        onClick={() => {
                          focusGraphOn([node.derivedNodeId]);
                          onNodeSelect?.(node.derivedNodeId);
                          // Close our drawer so the recentered canvas is visible and we don't
                          // stack two right sheets (the study page's node-detail sheet is also right).
                          setPanelOpen(false);
                        }}
                        className="flex w-full flex-col gap-1.5 rounded-md border px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
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
                          {node.cardless ? <Badge variant="outline" title="no study item exists for this node">no item</Badge> : null}
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
                      </button>
                    </li>
                  ))}
                </ul>
              </CollapsibleSection>
              <CollapsibleSection title="Prerequisite edges">
                {view.textual.edges.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {view.textual.edges.map((edge, index) => (
                      <li key={index}>
                        {/* Edge row → frame BOTH endpoints (item 3). No sheet: an edge has no
                            single node to study. */}
                        <button
                          type="button"
                          onClick={() => focusGraphOn([edge.prerequisiteDerivedNodeId, edge.dependentDerivedNodeId])}
                          className="flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
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
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No inferred prerequisite edges.</p>
                )}
              </CollapsibleSection>
              <CollapsibleSection title="Origin counts by domain">
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
              </CollapsibleSection>
              <CollapsibleSection title="Rescue durability dispositions">
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
              </CollapsibleSection>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// One collapsible textual section (item 3): the section's `<h3>` becomes the trigger, with a
// chevron that rotates open. Collapsed by default so the crowded cross-domain panel opens
// quiet; the operator expands only the sections they're inspecting.
function CollapsibleSection({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <Collapsible defaultOpen={false} className="flex flex-col gap-2">
      <CollapsibleTrigger className="group flex items-center gap-1.5 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-sm">
        <ChevronRightIcon className="size-3.5 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" />
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-2">{children}</CollapsibleContent>
    </Collapsible>
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
