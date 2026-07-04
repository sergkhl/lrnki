"use client";

import { useEffect, useMemo, useRef } from "react";
import cytoscape from "cytoscape";
import type { StudySession } from "@/lib/learnerStudySession";

export type FogVisualState = "lit" | "outlined" | "fogged";

export function fogVisualState(state: "mastered" | "frontier" | "locked"): FogVisualState {
  if (state === "mastered") return "lit";
  if (state === "frontier") return "outlined";
  return "fogged";
}

export function SurveyMap({ session }: Readonly<{ session: StudySession }>) {
  const ref = useRef<HTMLDivElement | null>(null);
  const elements = useMemo(() => [
    ...session.detail.nodes.map((node) => ({
      data: {
        id: node.derivedNodeId,
        label: node.label,
        visualState: fogVisualState(session.classification.stateByNode[node.derivedNodeId] ?? "locked")
      }
    })),
    ...session.detail.edges.filter((edge) => !edge.uncertain).map((edge) => ({
      data: {
        id: `${edge.prerequisiteDerivedNodeId}:${edge.dependentDerivedNodeId}`,
        source: edge.prerequisiteDerivedNodeId,
        target: edge.dependentDerivedNodeId
      }
    }))
  ], [session]);

  useEffect(() => {
    if (!ref.current) return;
    const cy = cytoscape({
      container: ref.current,
      elements,
      layout: { name: "breadthfirst", directed: true, padding: 24, spacingFactor: 1.15 },
      style: [
        {
          selector: "node",
          style: {
            "background-color": "#8d887c",
            color: "#241f18",
            label: "data(label)",
            "font-size": 11,
            "text-wrap": "wrap",
            "text-max-width": "120px",
            "text-valign": "bottom",
            "text-margin-y": 8,
            opacity: 0.32,
            "border-width": 0
          }
        },
        { selector: 'node[visualState = "lit"]', style: { "background-color": "#2f8f83", opacity: 1 } },
        { selector: 'node[visualState = "outlined"]', style: { "background-color": "#f7f0de", "border-color": "#9c5f2b", "border-width": 3, opacity: 1 } },
        { selector: "edge", style: { width: 2, "line-color": "#b9ad92", "target-arrow-shape": "triangle", "target-arrow-color": "#b9ad92", "curve-style": "bezier" } }
      ]
    });
    return () => cy.destroy();
  }, [elements]);

  return <div ref={ref} className="h-[70svh] min-h-96 rounded-lg border border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]" data-survey-map />;
}
