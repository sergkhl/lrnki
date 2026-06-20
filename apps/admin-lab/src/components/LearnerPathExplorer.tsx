"use client";

import { useEffect, useRef } from "react";
import cytoscape, { type Core } from "cytoscape";
import { RouteIcon, TargetIcon } from "lucide-react";
import { applyElkLayeredLayout } from "@/lib/cytoscapeElkLayout";
import type { LearnerPathDetail } from "@/lib/learnerPaths";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

type LearnerPathExplorerProps = Readonly<{ detail: LearnerPathDetail }>;

// Per-step provenance badge (U5): distinguish an anchored asserted concept from a
// rescued source-mention and a generated prerequisite, so a learner-path reader can
// see which steps rest on the asserted core vs the derived layer.
function originBadge(groundingOrigin: string): { label: string; variant: "default" | "secondary" | "outline" } {
  if (groundingOrigin === "source_mentioned") return { label: "rescued", variant: "secondary" };
  if (groundingOrigin === "llm_grounded") return { label: "generated", variant: "outline" };
  return { label: "anchored", variant: "default" };
}

// Read-only Cytoscape rendering of a PERSISTED learner path highlighted over the
// inferred prerequisite DAG of its enrichment (ADR-0011, ADR-0019, rule 12). All
// ordering and inclusion were computed by the CLI; this view only renders.
export function LearnerPathExplorer({ detail }: LearnerPathExplorerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cytoscapeRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let stale = false;
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
        ...detail.nodes.map((node) => ({
          data: {
            id: node.derivedNodeId,
            label: node.inPath ? `${node.position! + 1}. ${node.label}` : node.label,
            inPath: node.inPath ? "yes" : "no",
            target: node.isTarget ? "yes" : "no"
          }
        })),
        ...detail.edges.map((edge, index) => ({
          data: {
            id: `e${index}`,
            source: edge.prerequisiteDerivedNodeId,
            target: edge.dependentDerivedNodeId,
            uncertain: edge.uncertain ? "yes" : "no",
            inPath: edge.inPath ? "yes" : "no"
          }
        }))
      ],
      layout: { name: "preset" },
      minZoom: 0.2,
      maxZoom: 3,
      style: [
        {
          selector: "node",
          style: {
            "background-color": color("--muted"),
            "border-color": color("--border"),
            "border-width": 1.5,
            color: color("--muted-foreground"),
            label: "data(label)",
            "font-size": 10,
            "text-max-width": "120px",
            "text-wrap": "wrap",
            "text-valign": "bottom",
            "text-margin-y": 6,
            height: 20,
            width: 20,
            opacity: 0.5
          }
        },
        {
          selector: "node[inPath = 'yes']",
          style: {
            "background-color": color("--primary"),
            "border-color": color("--primary"),
            color: color("--foreground"),
            "font-weight": 600,
            height: 30,
            width: 30,
            opacity: 1
          }
        },
        {
          selector: "node[target = 'yes']",
          style: {
            "background-color": color("--destructive"),
            "border-color": color("--destructive"),
            height: 38,
            width: 38
          }
        },
        {
          selector: "edge",
          style: {
            // Taxi (orthogonal) routing keeps prerequisite edges off the nodes in
            // the top-down ELK layout; edges leave the bottom of a prerequisite and
            // enter the top of its dependent.
            "curve-style": "taxi",
            "taxi-direction": "downward",
            "taxi-turn": 18,
            "line-color": color("--border"),
            "target-arrow-color": color("--border"),
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.8,
            opacity: 0.35,
            width: 1.25
          }
        },
        {
          selector: "edge[inPath = 'yes']",
          style: {
            "line-color": color("--primary"),
            "target-arrow-color": color("--primary"),
            opacity: 0.95,
            width: 2.5
          }
        },
        {
          selector: "edge[uncertain = 'yes']",
          style: {
            "line-style": "dashed",
            "line-color": color("--muted-foreground"),
            "target-arrow-color": color("--muted-foreground"),
            opacity: 0.5
          }
        }
      ]
    });
    cytoscapeRef.current = cy;
    void applyElkLayeredLayout(cy, () => stale).catch((error: unknown) => {
      if (!stale) console.error("Failed to lay out learner path graph", error);
    });
    return () => {
      stale = true;
      cy.destroy();
      cytoscapeRef.current = null;
    };
  }, [detail]);

  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <Card className="min-h-[38rem]">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <TargetIcon className="size-4 text-destructive" />
            {detail.summary.targetLabel}
          </CardTitle>
          <CardDescription>
            Prerequisite path to the target concept · {detail.summary.declaredDomain}
          </CardDescription>
          <CardAction className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="outline">{detail.summary.stepCount} steps</Badge>
            <Badge variant="secondary">{detail.summary.learnerStateRef}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Solid blue = path order (prerequisites first). Red = target. Dashed = uncertain inferred
            edges (excluded from the path). Scroll to zoom, drag to pan.
          </p>
          <div
            ref={containerRef}
            role="img"
            aria-label={`Learner path with ${detail.summary.stepCount} ordered concepts for ${detail.summary.targetLabel}`}
            className="min-h-[31rem] flex-1 rounded-lg border bg-muted/30"
          />
        </CardContent>
      </Card>

      <Card className="min-h-0 xl:max-h-[calc(100svh-7rem)]">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <RouteIcon className="size-4" />
            Ordered steps
          </CardTitle>
          <CardDescription>Difficulty-ordered, prerequisites first; the mock learner knows nothing, so none are pruned.</CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 flex-1">
          <ScrollArea className="h-full max-h-[30rem]">
            <ol className="flex flex-col gap-2 pr-3">
              {detail.steps.map((step) => (
                <li
                  key={step.derivedNodeId}
                  className={`flex items-center gap-3 rounded-lg border p-3 ${step.includedReason === "target" ? "border-destructive/50 bg-destructive/5" : ""}`}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {step.position + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{step.label}</span>
                    <span className="block text-xs text-muted-foreground">{step.includedReason}</span>
                  </span>
                  <Badge variant={originBadge(step.groundingOrigin).variant} title={step.groundingOrigin}>
                    {originBadge(step.groundingOrigin).label}
                  </Badge>
                  <Badge variant="outline">difficulty {step.difficulty.toFixed(2)}</Badge>
                </li>
              ))}
            </ol>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
