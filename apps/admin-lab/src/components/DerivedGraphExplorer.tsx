"use client";

import { useEffect, useMemo, useRef } from "react";
import cytoscape, { type Core } from "cytoscape";
import { GitForkIcon, ListTreeIcon } from "lucide-react";
import { buildDerivedGraphView, type DerivedGraphDetail } from "@/lib/derivedGraph";
import { Badge } from "@/components/ui/badge";
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

type DerivedGraphExplorerProps = Readonly<{ detail: DerivedGraphDetail }>;

// Read-only Cytoscape rendering of a PERSISTED Derived Graph Layer (ADR-0011,
// ADR-0019, rule 12) — independent of any learner path. Cytoscape is reserved for
// derived-graph visualization; the published asserted layer never gets a canvas
// because it has zero edges (AE4). Every rendered graph carries an equivalent
// textual node-and-edge representation for non-visual inspection (U6 scenario 8).
export function DerivedGraphExplorer({ detail }: DerivedGraphExplorerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cytoscapeRef = useRef<Core | null>(null);
  const view = useMemo(() => buildDerivedGraphView(detail), [detail]);

  useEffect(() => {
    if (!containerRef.current) return;
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
        ...view.cytoscape.nodes.map((node) => ({
          data: { id: node.id, label: node.label, domain: node.domain }
        })),
        ...view.cytoscape.edges.map((edge) => ({
          data: { id: edge.id, source: edge.source, target: edge.target, uncertain: edge.uncertain }
        }))
      ],
      layout: {
        // Prerequisites above dependents — the natural reading of a prerequisite DAG.
        name: "breadthfirst",
        directed: true,
        spacingFactor: 1.3,
        padding: 28,
        fit: true
      },
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
            height: 26,
            width: 26
          }
        },
        {
          selector: "edge",
          style: {
            "curve-style": "bezier",
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
    return () => {
      cy.destroy();
      cytoscapeRef.current = null;
    };
  }, [view]);

  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <Card className="min-h-[38rem]">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <GitForkIcon className="size-4" />
            Derived prerequisite DAG
          </CardTitle>
          <CardDescription>
            Inferred prerequisite edges over published version{" "}
            <span className="font-mono text-xs">{detail.summary.graphVersionId}</span> · judge {detail.summary.judgeModel}
          </CardDescription>
          <CardAction className="flex flex-wrap items-center justify-end gap-2">
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
                <h3 className="text-sm font-medium">Concepts</h3>
                <ul className="flex flex-col gap-1">
                  {view.textual.nodes.map((node) => (
                    <li key={`${node.domain}-${node.label}`} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{node.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">{node.domain}</span>
                      </span>
                      <Badge variant="outline">{node.difficulty === null ? "—" : `difficulty ${node.difficulty.toFixed(2)}`}</Badge>
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
                          <Badge variant="outline">{edge.confidence.toFixed(2)}</Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No inferred prerequisite edges.</p>
                )}
              </section>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
