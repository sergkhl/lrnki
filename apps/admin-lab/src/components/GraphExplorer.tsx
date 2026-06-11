"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { type Core } from "cytoscape";
import type { GraphSnapshot, PublishedClaim } from "@lrnki/domain-core";
import {
  FocusIcon,
  Maximize2Icon,
  NetworkIcon,
  RotateCcwIcon,
  SearchIcon
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

type GraphExplorerProps = Readonly<{ snapshot: GraphSnapshot; live: boolean }>;

function focusNeighborhood(cy: Core, selectedId: string, animate: boolean) {
  const focused = cy.getElementById(selectedId);
  if (focused.empty()) return;

  const neighbors = focused.neighborhood("node");
  const center = focused.position();
  const radius = Math.max(140, neighbors.length * 19);

  cy.batch(() => {
    cy.elements().removeClass("focused neighbor neighborhood");
    focused.addClass("focused");
    neighbors.addClass("neighbor");
    focused.connectedEdges().addClass("neighborhood");
    neighbors.forEach((node, index) => {
      const angle = (index / Math.max(neighbors.length, 1)) * Math.PI * 2 - Math.PI / 2;
      node.position({
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle)
      });
    });
  });

  if (animate) {
    cy.animate({
      fit: { eles: focused.closedNeighborhood(), padding: 72 },
      duration: 260
    });
  } else {
    cy.fit(focused.closedNeighborhood(), 72);
  }
}

function conceptLabel(snapshot: GraphSnapshot, conceptId: string): string {
  return snapshot.concepts.find((concept) => concept.conceptId === conceptId)?.canonicalLabel ?? conceptId;
}

function claimObjectLabel(snapshot: GraphSnapshot, claim: PublishedClaim): string {
  return claim.object.kind === "concept"
    ? conceptLabel(snapshot, claim.object.conceptId)
    : String(claim.object.value);
}

function ClaimList({
  title,
  claims,
  snapshot,
  direction
}: Readonly<{
  title: string;
  claims: PublishedClaim[];
  snapshot: GraphSnapshot;
  direction: "incoming" | "outgoing" | "literal";
}>) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <Badge variant="secondary">{claims.length}</Badge>
      </div>
      {claims.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        <div className="flex flex-col gap-2">
          {claims.map((claim) => (
            <div key={claim.claimId} className="rounded-lg border p-3">
              <p className="text-sm">
                {direction === "incoming" ? (
                  <>
                    <span className="font-medium">{conceptLabel(snapshot, claim.subjectConceptId)}</span>{" "}
                    <Badge variant="outline">{claim.predicate}</Badge>
                  </>
                ) : (
                  <>
                    <Badge variant="outline">{claim.predicate}</Badge>{" "}
                    <span className="font-medium">{claimObjectLabel(snapshot, claim)}</span>
                  </>
                )}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="secondary">{claim.trustTier.replaceAll("_", " ")}</Badge>
                <Badge variant="secondary">{claim.modelConfidence.toFixed(2)} confidence</Badge>
                {claim.contradictionState !== "none" ? (
                  <Badge variant="destructive">{claim.contradictionState} contradiction</Badge>
                ) : null}
              </div>
              {claim.evidence.map((evidence, index) => (
                <blockquote key={`${claim.claimId}-${index}`} className="mt-2 border-l-2 pl-3 text-xs text-muted-foreground">
                  &ldquo;{evidence.evidenceQuote}&rdquo;
                  <span className="mt-1 block font-mono text-[0.7rem]">
                    {evidence.sourceResourceId} / {evidence.sourceBlockId}
                  </span>
                </blockquote>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function GraphExplorer({ snapshot, live }: GraphExplorerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cytoscapeRef = useRef<Core | null>(null);
  const [selectedId, setSelectedId] = useState(snapshot.concepts[0]?.conceptId);
  const [query, setQuery] = useState("");

  const selected = snapshot.concepts.find((concept) => concept.conceptId === selectedId);
  const matches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return snapshot.concepts;
    return snapshot.concepts.filter(
      (concept) =>
        concept.canonicalLabel.toLowerCase().includes(normalizedQuery) ||
        concept.aliases.some((alias) => alias.toLowerCase().includes(normalizedQuery))
    );
  }, [query, snapshot.concepts]);

  const outgoingClaims = selected
    ? snapshot.claims.filter(
        (claim) => claim.subjectConceptId === selected.conceptId && claim.object.kind === "concept"
      )
    : [];
  const incomingClaims = selected
    ? snapshot.claims.filter(
        (claim) => claim.object.kind === "concept" && claim.object.conceptId === selected.conceptId
      )
    : [];
  const literalClaims = selected
    ? snapshot.claims.filter(
        (claim) => claim.subjectConceptId === selected.conceptId && claim.object.kind === "literal"
      )
    : [];

  useEffect(() => {
    if (!containerRef.current) return;

    const styles = getComputedStyle(containerRef.current);
    const colorCanvas = document.createElement("canvas");
    colorCanvas.width = 1;
    colorCanvas.height = 1;
    const colorContext = colorCanvas.getContext("2d");
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
        ...snapshot.concepts.map((concept) => ({
          data: { id: concept.conceptId, label: concept.canonicalLabel }
        })),
        ...snapshot.claims.flatMap((claim) =>
          claim.object.kind === "concept"
            ? [{
                data: {
                  id: claim.claimId,
                  source: claim.subjectConceptId,
                  target: claim.object.conceptId,
                  label: claim.predicate
                }
              }]
            : []
        )
      ],
      layout: {
        name: "cose",
        animate: false,
        fit: true,
        padding: 32,
        nodeRepulsion: () => 9000,
        idealEdgeLength: () => 90
      },
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.18,
      style: [
        {
          selector: "node",
          style: {
            "background-color": color("--muted"),
            "border-color": color("--border"),
            "border-width": 1.5,
            color: color("--muted-foreground"),
            label: "",
            "font-size": 10,
            "text-max-width": "90px",
            "text-wrap": "wrap",
            "text-valign": "bottom",
            "text-margin-y": 7,
            height: 18,
            opacity: 0.32,
            width: 18
          }
        },
        {
          selector: "edge",
          style: {
            "curve-style": "bezier",
            "line-color": color("--border"),
            "target-arrow-color": color("--border"),
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.75,
            opacity: 0.14,
            width: 1
          }
        },
        {
          selector: "node.neighbor",
          style: {
            "background-color": color("--secondary"),
            "border-color": color("--muted-foreground"),
            color: color("--foreground"),
            label: "data(label)",
            opacity: 1,
            height: 24,
            width: 24
          }
        },
        {
          selector: "node.focused",
          style: {
            "background-color": color("--primary"),
            "border-color": color("--primary"),
            color: color("--foreground"),
            "font-weight": 600,
            label: "data(label)",
            opacity: 1,
            height: 34,
            width: 34
          }
        },
        {
          selector: "edge.neighborhood",
          style: {
            color: color("--foreground"),
            label: "data(label)",
            "font-size": 8,
            "line-color": color("--muted-foreground"),
            "target-arrow-color": color("--muted-foreground"),
            "text-background-color": color("--background"),
            "text-background-opacity": 0.9,
            "text-background-padding": "2px",
            "text-rotation": "autorotate",
            opacity: 0.85,
            width: 1.75
          }
        }
      ]
    });

    cy.on("tap", "node", (event) => setSelectedId(event.target.id()));
    cytoscapeRef.current = cy;

    return () => {
      cy.destroy();
      cytoscapeRef.current = null;
    };
  }, [snapshot]);

  useEffect(() => {
    const cy = cytoscapeRef.current;
    if (!cy || !selectedId) return;
    focusNeighborhood(cy, selectedId, true);
  }, [selectedId]);

  const fitGraph = () => cytoscapeRef.current?.fit(undefined, 32);
  const resetGraph = () => {
    const cy = cytoscapeRef.current;
    if (!cy) return;
    cy.one("layoutstop", () => {
      if (selectedId) focusNeighborhood(cy, selectedId, false);
    });
    cy.layout({
      name: "cose",
      animate: true,
      animationDuration: 350,
      fit: false,
      padding: 32,
      nodeRepulsion: () => 9000,
      idealEdgeLength: () => 90
    }).run();
  };

  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_25rem]">
      <Card className="min-h-[38rem]">
        <CardHeader className="border-b">
          <CardTitle>{snapshot.graphVersionId}</CardTitle>
          <CardDescription>Published graph version</CardDescription>
          <CardAction className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant={live ? "default" : "secondary"}>{live ? "Live graph" : "Demo fallback"}</Badge>
            <Badge variant="outline">
              {snapshot.concepts.length} concepts / {snapshot.claims.length} claims
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          {!live ? (
            <Alert>
              <NetworkIcon />
              <AlertTitle>Demo graph</AlertTitle>
              <AlertDescription>
                No published graph is available. This fallback demonstrates the read-only explorer.
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Scroll to zoom, drag to pan, and drag nodes to adjust the view.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={fitGraph}>
                <Maximize2Icon data-icon="inline-start" />
                Fit
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={resetGraph}>
                <RotateCcwIcon data-icon="inline-start" />
                Reset layout
              </Button>
            </div>
          </div>
          <div
            ref={containerRef}
            role="img"
            aria-label={`Concept graph with ${snapshot.concepts.length} concepts and ${snapshot.claims.length} claims`}
            className="min-h-[31rem] flex-1 rounded-lg border bg-muted/30"
          />
        </CardContent>
      </Card>

      <Card className="min-h-0 xl:max-h-[calc(100svh-7rem)]">
        <CardHeader className="border-b">
          <CardTitle>Concept details</CardTitle>
          <CardDescription>Search remains the keyboard-accessible selection surface.</CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              placeholder="Filter concepts..."
              aria-label="Filter concepts"
              onChange={(event) => setQuery(event.target.value)}
            />
          </InputGroup>
          <ScrollArea className="h-40 rounded-lg border">
            <div className="flex flex-col gap-1 p-1.5">
              {matches.map((concept) => (
                <Button
                  key={concept.conceptId}
                  type="button"
                  variant={selectedId === concept.conceptId ? "secondary" : "ghost"}
                  className="h-auto justify-start px-2 py-1.5 text-left"
                  onClick={() => setSelectedId(concept.conceptId)}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{concept.canonicalLabel}</span>
                    <span className="block truncate text-xs font-normal text-muted-foreground">
                      {concept.declaredDomain}
                    </span>
                  </span>
                </Button>
              ))}
              {matches.length === 0 ? (
                <Empty className="min-h-32 border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><SearchIcon /></EmptyMedia>
                    <EmptyTitle>No concepts found</EmptyTitle>
                    <EmptyDescription>Try a label or alias from the published graph.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : null}
            </div>
          </ScrollArea>

          <Separator />
          {selected ? (
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-5 pr-3">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold">{selected.canonicalLabel}</h2>
                      <p className="text-sm text-muted-foreground">{selected.declaredDomain}</p>
                    </div>
                    <Badge variant="outline">
                      <FocusIcon data-icon="inline-start" />
                      Focused
                    </Badge>
                  </div>
                  <dl className="mt-4 grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">IRI</dt>
                    <dd className="break-all font-mono text-xs">{selected.iri}</dd>
                    <dt className="text-muted-foreground">Trust tier</dt>
                    <dd>{selected.trustTier.replaceAll("_", " ")}</dd>
                    <dt className="text-muted-foreground">Aliases</dt>
                    <dd>{selected.aliases.join(", ") || "None"}</dd>
                    <dt className="text-muted-foreground">Homograph</dt>
                    <dd>{selected.homograph ? "Yes" : "No"}</dd>
                  </dl>
                </div>
                <Separator />
                <ClaimList title="Outgoing claims" claims={outgoingClaims} snapshot={snapshot} direction="outgoing" />
                <ClaimList title="Incoming claims" claims={incomingClaims} snapshot={snapshot} direction="incoming" />
                <ClaimList title="Literal claims" claims={literalClaims} snapshot={snapshot} direction="literal" />
              </div>
            </ScrollArea>
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><NetworkIcon /></EmptyMedia>
                <EmptyTitle>Select a concept</EmptyTitle>
                <EmptyDescription>Use the concept list to inspect its neighborhood and evidence.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
