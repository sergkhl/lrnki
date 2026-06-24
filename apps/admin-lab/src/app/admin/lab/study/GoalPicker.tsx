"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { filterAndOrderGoals, isFoundationalGoal, type GoalCandidate } from "@/lib/derivedGraph";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

// Goal-first picker (U4, R1/R2/R3). The learner picks a GOAL concept first by searching
// label or alias; larger journeys (prerequisite cones) sort first; a zero-journey goal is
// tagged "foundational — studied directly" and stays selectable (never empty-calibration).
// Filtering/ordering is the pure `filterAndOrderGoals` helper; this client component only
// holds the query and links each goal to the session route via a target query param,
// preserving the server-rendered step pattern.
export function GoalPicker({
  enrichmentId,
  candidates,
  currentTarget
}: Readonly<{ enrichmentId: string; candidates: GoalCandidate[]; currentTarget?: string }>) {
  const [query, setQuery] = useState("");
  const ordered = useMemo(() => filterAndOrderGoals(candidates, query), [candidates, query]);

  return (
    <div className="flex flex-col gap-3">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search a goal concept by name or alias…"
        className="max-w-md"
        aria-label="Search goal concepts"
      />
      {ordered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No goal matches &ldquo;{query}&rdquo;.</p>
      ) : (
        <ul className="flex max-h-96 flex-col gap-1 overflow-auto">
          {ordered.map((candidate) => (
            <li key={candidate.derivedNodeId}>
              <Link
                href={`/admin/lab/study?enrichmentId=${encodeURIComponent(enrichmentId)}&target=${encodeURIComponent(candidate.derivedNodeId)}`}
                className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 ${candidate.derivedNodeId === currentTarget ? "border-primary" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{candidate.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {candidate.declaredDomain}
                    {candidate.aliases.length > 0 ? ` · aka ${candidate.aliases.join(", ")}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {isFoundationalGoal(candidate) ? (
                    <Badge variant="outline">foundational — studied directly</Badge>
                  ) : (
                    <Badge variant="secondary">journey: {candidate.journeySize}</Badge>
                  )}
                  {candidate.hasStudyItem ? null : <Badge variant="outline">no item</Badge>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
