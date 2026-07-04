"use client";

import { BookCheckIcon } from "lucide-react";
import type { StudyItemGroundingProvenance } from "@lrnki/domain-core";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { learnerTerm } from "./vocabulary";

export function GroundedBadge({
  provenance,
  isSourceCited
}: Readonly<{ provenance: StudyItemGroundingProvenance; isSourceCited?: boolean }>) {
  if (!isSourceCited && provenance !== "source_cep" && provenance !== "source_mentioned") return null;
  const label = learnerTerm("groundedTooltip");
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          aria-label={label}
          className="inline-flex size-7 items-center justify-center rounded-full bg-[color:var(--journal-gem-soft)] text-[color:var(--journal-ink)]"
        >
          <BookCheckIcon />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
