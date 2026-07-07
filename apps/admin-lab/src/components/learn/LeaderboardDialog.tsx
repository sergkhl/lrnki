"use client";

import { TrophyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { ChaseBanner } from "./ChaseBanner";
import { LeaderboardBoard } from "./LeaderboardBoard";
import type { BoardEntry, ChaseTarget } from "./rivalSimulation";
import { learnerTerm } from "./vocabulary";

export type LeaderboardDialogView = {
  weekKey: string;
  entries: BoardEntry[];
  chase: ChaseTarget | null;
  masteredCrystalCount: number;
};

export function LeaderboardDialogContent({
  view,
  title = learnerTerm("leaderboardTitle"),
  description = learnerTerm("leaderboardHint")
}: {
  view: LeaderboardDialogView;
  title?: string;
  description?: string;
}) {
  return (
    <DialogContent className="learn-theme max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <ChaseBanner chase={view.chase} />
        {view.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{learnerTerm("leaderboardEmpty")}</p>
        ) : (
          <LeaderboardBoard entries={view.entries} weekKey={view.weekKey} masteredCrystalCount={view.masteredCrystalCount} />
        )}
      </div>
      <DialogFooter showCloseButton />
    </DialogContent>
  );
}

export function LeaderboardDialogTrigger({ view }: { view: LeaderboardDialogView }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button type="button" size="sm" variant="ghost" />}>
        <TrophyIcon data-icon="inline-start" />
        {learnerTerm("viewBoard")}
      </DialogTrigger>
      <LeaderboardDialogContent view={view} />
    </Dialog>
  );
}
