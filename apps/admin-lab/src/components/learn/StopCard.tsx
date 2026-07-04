import { CheckIcon, LockIcon, MapPinIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TrailStop } from "./trailView";
import { learnerTerm } from "./vocabulary";

export function StopCard({ stop, onSelect }: Readonly<{ stop: TrailStop; onSelect: (stopId: string) => void }>) {
  const Icon = stop.state === "complete" ? CheckIcon : stop.state === "locked" ? LockIcon : MapPinIcon;
  const disabled = stop.state === "locked";
  return (
    <button
      type="button"
      disabled={disabled}
      data-next={stop.isNext || undefined}
      data-fogged={stop.isFogged || undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-md border border-[color:var(--journal-line)] bg-background/70 p-3 text-left transition hover:bg-background data-[next]:ring-2 data-[next]:ring-[color:var(--journal-frontier)] data-[fogged]:opacity-55",
        disabled ? "cursor-not-allowed" : "cursor-pointer"
      )}
      onClick={() => {
        if (!disabled) onSelect(stop.stopId);
      }}
    >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--journal-gem-soft)] text-[color:var(--journal-ink)]">
          <Icon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{labelForStop(stop)}</p>
          <p className="truncate text-xs text-muted-foreground">{stop.label}</p>
        </div>
        {stop.isNext ? <Badge>{learnerTerm("nextStop")}</Badge> : <Badge variant="outline">{stop.state}</Badge>}
    </button>
  );
}

function labelForStop(stop: TrailStop): string {
  if (stop.kind === "theory") return learnerTerm("theoryStop");
  if (stop.kind === "option_select") return "Question";
  if (stop.kind === "impostor") return "Spot the fake";
  return learnerTerm("capstone");
}
