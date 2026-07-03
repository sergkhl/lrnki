"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { filterTargets, type TargetCandidate } from "@lrnki/application";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

export function QuestPicker({
  enrichmentId,
  recommended,
  candidates,
  currentTarget
}: Readonly<{ enrichmentId: string; recommended: TargetCandidate[]; candidates: TargetCandidate[]; currentTarget?: string }>) {
  const [query, setQuery] = useState("");
  const searchResults = useMemo(() => filterTargets(candidates, query), [candidates, query]);
  const recommendedIds = new Set(recommended.map((candidate) => candidate.derivedNodeId));
  const activeList = query.trim() ? searchResults : recommended;

  return (
    <div className="flex flex-col gap-4">
      {recommended.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Recommended quests</p>
            <Badge variant="outline">{recommended.length} shown</Badge>
          </div>
          <TargetList enrichmentId={enrichmentId} candidates={recommended} currentTarget={currentTarget} recommendedIds={recommendedIds} />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Search all target concepts</p>
        <InputGroup className="max-w-md">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by concept name or alias"
            aria-label="Search target concepts"
          />
        </InputGroup>
        {query.trim() ? (
          searchResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">No target concept matches &ldquo;{query}&rdquo;.</p>
          ) : (
            <TargetList enrichmentId={enrichmentId} candidates={activeList} currentTarget={currentTarget} recommendedIds={recommendedIds} />
          )
        ) : null}
      </div>
    </div>
  );
}

function TargetList({
  enrichmentId,
  candidates,
  currentTarget,
  recommendedIds
}: Readonly<{ enrichmentId: string; candidates: TargetCandidate[]; currentTarget?: string; recommendedIds: Set<string> }>) {
  return (
    <ul className="flex max-h-96 flex-col gap-1 overflow-auto">
      {candidates.map((candidate) => (
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
            <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
              {recommendedIds.has(candidate.derivedNodeId) ? <Badge variant="default">recommended</Badge> : null}
              {candidate.isFoundational ? (
                <Badge variant="outline">foundational</Badge>
              ) : (
                <Badge variant="secondary">{candidate.coneSize} prerequisites</Badge>
              )}
              {candidate.missingStudyItemCount > 0 ? (
                <Badge variant="outline">
                  {candidate.missingStudyItemCount} {candidate.missingStudyItemCount === 1 ? "node" : "nodes"} missing items
                </Badge>
              ) : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
