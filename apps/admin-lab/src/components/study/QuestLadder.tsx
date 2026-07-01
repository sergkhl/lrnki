"use client";

import { CheckCircle2Icon, CircleDotIcon, FlagIcon, LockIcon } from "lucide-react";
import type { AdaptedNodeState, StatefulLearnerPathStep } from "@lrnki/application";
import { groupStepsByTier, displayStatefulPathSteps, type DisplayStatefulPathStep } from "@/components/study/studyView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATE_BADGE: Record<AdaptedNodeState, "default" | "secondary" | "outline"> = {
  mastered: "default",
  frontier: "secondary",
  locked: "outline"
};

const STATE_ICON = {
  mastered: CheckCircle2Icon,
  frontier: CircleDotIcon,
  locked: LockIcon
} satisfies Record<AdaptedNodeState, typeof CheckCircle2Icon>;

export function QuestLadder({
  steps,
  adaptedHiddenNodeIds,
  labelByNode,
  selectedFrontierTarget,
  onOpenNode
}: Readonly<{
  steps: StatefulLearnerPathStep[];
  adaptedHiddenNodeIds: ReadonlySet<string>;
  labelByNode: Map<string, string>;
  selectedFrontierTarget: string | null;
  onOpenNode: (derivedNodeId: string) => void;
}>) {
  const displayed = displayStatefulPathSteps(steps, adaptedHiddenNodeIds);
  const tiers = groupStepsByTier(displayed);

  return (
    <div className="flex flex-col gap-3">
      {tiers.map((tier) => (
        <section key={tier.topologicalDepth} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">Wave {tier.topologicalDepth + 1}</p>
            <Badge variant="outline">{tier.steps.length} step{tier.steps.length === 1 ? "" : "s"}</Badge>
          </div>
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {tier.steps.map((step) => (
              <li key={step.derivedNodeId}>
                <StepButton
                  step={step}
                  label={labelByNode.get(step.derivedNodeId) ?? step.derivedNodeId}
                  isFrontierTarget={selectedFrontierTarget === step.derivedNodeId}
                  onOpen={() => onOpenNode(step.derivedNodeId)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function StepButton({
  step,
  label,
  isFrontierTarget,
  onOpen
}: Readonly<{ step: DisplayStatefulPathStep; label: string; isFrontierTarget: boolean; onOpen: () => void }>) {
  const Icon = step.isTarget ? FlagIcon : STATE_ICON[step.state];
  return (
    <Button
      type="button"
      variant={isFrontierTarget ? "default" : "outline"}
      className={cn(
        "h-auto min-h-16 w-full justify-start whitespace-normal px-3 py-2 text-left",
        step.collapsed ? "opacity-60" : null
      )}
      onClick={onOpen}
    >
      <Icon data-icon="inline-start" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate">{label}</span>
        <span className="flex flex-wrap items-center gap-1">
          <Badge variant={STATE_BADGE[step.state]}>{step.state}</Badge>
          {step.isTarget ? <Badge variant="outline">target</Badge> : null}
          {isFrontierTarget ? <Badge variant="secondary">next</Badge> : null}
          {step.collapsed ? <Badge variant="outline">known</Badge> : null}
        </span>
      </span>
    </Button>
  );
}
