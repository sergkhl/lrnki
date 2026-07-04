import { CheckIcon, LockIcon, MapPinIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { TrailStop } from "./trailView";
import { learnerTerm } from "./vocabulary";

export function StopCard({ stop }: Readonly<{ stop: TrailStop }>) {
  const Icon = stop.state === "complete" ? CheckIcon : stop.state === "locked" ? LockIcon : MapPinIcon;
  return (
    <Card data-next={stop.isNext || undefined} className="border-[color:var(--journal-line)] bg-background/70 data-[next]:ring-2 data-[next]:ring-[color:var(--journal-frontier)]">
      <CardContent className="flex items-center gap-3 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--journal-gem-soft)] text-[color:var(--journal-ink)]">
          <Icon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{labelForStop(stop)}</p>
          <p className="truncate text-xs text-muted-foreground">{stop.label}</p>
        </div>
        {stop.isNext ? <Badge>{learnerTerm("nextStop")}</Badge> : <Badge variant="outline">{stop.state}</Badge>}
      </CardContent>
    </Card>
  );
}

function labelForStop(stop: TrailStop): string {
  if (stop.kind === "theory") return learnerTerm("theoryStop");
  if (stop.kind === "option_select") return "Question";
  if (stop.kind === "impostor") return "Spot the fake";
  return learnerTerm("capstone");
}
