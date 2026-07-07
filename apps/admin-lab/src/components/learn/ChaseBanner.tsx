import { TargetIcon } from "lucide-react";
import type { ChaseTarget } from "./rivalSimulation";
import { learnerTerm } from "./vocabulary";

// The chase framing (R6): one highlighted rival rendered as a single banner. Pure copy assembly
// over the vocabulary templates — no new gameplay, no new state.
export function chaseMessage(chase: ChaseTarget): string {
  if (chase.direction === "behind") {
    return learnerTerm("chaseBehindTemplate").replace("{name}", chase.name).replace("{gap}", String(chase.gap));
  }
  const crystals = chase.gap <= 5 ? learnerTerm("chaseCrystalSingular") : learnerTerm("chaseCrystalPlural");
  return learnerTerm("chaseAheadTemplate").replace("{name}", chase.name).replace("{gap}", String(chase.gap)).replace("{crystals}", crystals);
}

export function ChaseBanner({ chase }: { chase: ChaseTarget | null }) {
  if (!chase) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
      <TargetIcon className="size-4 shrink-0 text-primary" aria-hidden />
      <span>{chaseMessage(chase)}</span>
    </div>
  );
}
