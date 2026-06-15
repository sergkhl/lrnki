"use client";

import { useMemo, useState } from "react";
import type { GraphSnapshot, PublishedEvidencePassage, PublishedTypedAssertion } from "@lrnki/domain-core";
import { FocusIcon, NetworkIcon, SearchIcon } from "lucide-react";
import {
  conceptLabel,
  filterConcepts,
  groupPassagesBySource,
  profileFor,
  summarizeSnapshot
} from "@/lib/publishedView";
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

// The published asserted layer is Concepts + Concept Evidence Profiles with ZERO
// asserted edges (ADR-0007 reset, R5). The published view is therefore a
// searchable master-detail Concept list whose primary surface is the evidence
// inspector — no Cytoscape canvas. Prerequisite edges appear only in a Derived
// Graph Layer (AE4), rendered by a separate view.

function PassageList({ title, passages }: Readonly<{ title: string; passages: PublishedEvidencePassage[] }>) {
  // Group by source so a multi-source CEP shows its provenance without losing
  // heading paths or locators (U6 test scenario 2).
  const bySource = groupPassagesBySource(passages);
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <Badge variant="secondary">{passages.length}</Badge>
      </div>
      {passages.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        bySource.map(({ sourceResourceId, passages: sourcePassages }) => (
          <div key={sourceResourceId} className="flex flex-col gap-2">
            <p className="font-mono text-[0.7rem] text-muted-foreground">{sourceResourceId}</p>
            {sourcePassages.map((passage, index) => (
              <blockquote key={`${passage.sourceBlockId}-${index}`} className="border-l-2 pl-3 text-xs text-muted-foreground">
                &ldquo;{passage.evidenceQuote}&rdquo;
                <span className="mt-1 block font-mono text-[0.7rem]">
                  {passage.headingPath.join(" / ") || "(root)"} · {passage.sourceBlockId}
                </span>
              </blockquote>
            ))}
          </div>
        ))
      )}
    </section>
  );
}

function AssertionList({ snapshot, assertions }: Readonly<{ snapshot: GraphSnapshot; assertions: PublishedTypedAssertion[] }>) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Optional typed assertions</h3>
        <Badge variant="secondary">{assertions.length}</Badge>
      </div>
      {assertions.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        <div className="flex flex-col gap-2">
          {assertions.map((assertion, index) => (
            <div key={index} className="rounded-lg border p-3">
              <p className="text-sm">
                <Badge variant="outline">{assertion.type}</Badge>{" "}
                <span className="font-medium">
                  {assertion.type === "defines" ? assertion.literalValue : conceptLabel(snapshot, assertion.objectConceptId)}
                </span>
              </p>
              {assertion.evidence.map((passage, evidenceIndex) => (
                <blockquote key={evidenceIndex} className="mt-2 border-l-2 pl-3 text-xs text-muted-foreground">
                  &ldquo;{passage.evidenceQuote}&rdquo;
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
  const [selectedId, setSelectedId] = useState(snapshot.concepts[0]?.conceptId);
  const [query, setQuery] = useState("");

  const selected = snapshot.concepts.find((concept) => concept.conceptId === selectedId);
  const matches = useMemo(() => filterConcepts(snapshot, query), [query, snapshot]);

  const selectedProfile = selected ? profileFor(snapshot, selected.conceptId) : undefined;

  const { passageCount } = summarizeSnapshot(snapshot);

  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
      <Card className="min-h-0 xl:max-h-[calc(100svh-7rem)]">
        <CardHeader className="border-b">
          <CardTitle>{snapshot.graphVersionId}</CardTitle>
          <CardDescription>Published graph version · Concepts + evidence profiles, no asserted edges</CardDescription>
          <CardAction className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant={live ? "default" : "secondary"}>{live ? "Live graph" : "Demo fallback"}</Badge>
            <Badge variant="outline">{snapshot.concepts.length} concepts</Badge>
            <Badge variant="outline">{passageCount} passages</Badge>
            <Badge variant="outline">0 edges</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          {!live ? (
            <Alert>
              <NetworkIcon />
              <AlertTitle>Demo graph</AlertTitle>
              <AlertDescription>
                No published graph is available. This fallback demonstrates the read-only evidence inspector.
              </AlertDescription>
            </Alert>
          ) : null}
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
          <ScrollArea className="min-h-0 flex-1 rounded-lg border">
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
        </CardContent>
      </Card>

      <Card className="min-h-0 xl:max-h-[calc(100svh-7rem)]">
        <CardHeader className="border-b">
          <CardTitle>Concept evidence profile</CardTitle>
          <CardDescription>Definitions, mentions, and guarded assertions with verbatim provenance.</CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
          {selected && selectedProfile ? (
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
                      Selected
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
                <PassageList title="Definition passages" passages={selectedProfile.definitions} />
                <PassageList title="Mention passages" passages={selectedProfile.mentions} />
                <AssertionList snapshot={snapshot} assertions={selectedProfile.assertions} />
              </div>
            </ScrollArea>
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><NetworkIcon /></EmptyMedia>
                <EmptyTitle>Select a concept</EmptyTitle>
                <EmptyDescription>Use the concept list to inspect its evidence profile.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
