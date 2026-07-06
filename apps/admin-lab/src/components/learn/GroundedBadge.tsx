"use client";

import { BookCheckIcon } from "lucide-react";
import type { StudyItemGroundingProvenance } from "@lrnki/domain-core";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { learnerTerm } from "./vocabulary";

export function GroundedBadge({
  provenance,
  isSourceCited
}: Readonly<{ provenance: StudyItemGroundingProvenance; isSourceCited?: boolean }>) {
  if (!isSourceCited && provenance !== "source_cep" && provenance !== "source_mentioned") return null;
  const label = learnerTerm("groundedBadge");
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--journal-gem-soft)] text-[color:var(--journal-ink)]"
          />
        }
      >
        <BookCheckIcon />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-auto border-border bg-card px-3 py-2 text-sm"
      >
        {label}
      </PopoverContent>
    </Popover>
  );
}
