"use client";

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { SwordsIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { markDuelUnlockSeen, readDuelUnlockSeen } from "./seenState";
import { learnerTerm } from "./vocabulary";

// The one-time Crystal Duel unlock splash (R7, KTD5). Fires once, at the mastery beat that first
// satisfies the threshold, by comparing the server's `unlocked` flag to a client-local seen mark.
// Dismissing (or entering the arena) records the mark so it never re-fires.
export function DuelUnlockSplash({ learnerRef, unlocked }: { learnerRef: string; unlocked: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Post-mount read of the client-local seen store (SSR has no localStorage), so this
    // synchronous set from an external store is deliberate and hydration-safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (unlocked && !readDuelUnlockSeen(learnerRef)) setOpen(true);
  }, [learnerRef, unlocked]);

  if (!open) return null;

  const close = () => {
    markDuelUnlockSeen(learnerRef);
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-border bg-card p-8 text-center shadow-xl">
        <SwordsIcon className="size-10 text-amber-500" aria-hidden />
        <h2 className="text-xl font-semibold">{learnerTerm("duelUnlockTitle")}</h2>
        <p className="text-sm text-muted-foreground">{learnerTerm("duelUnlockBody")}</p>
        <div className="flex gap-2">
          <Link to="/duel" className={buttonVariants({})} onClick={() => markDuelUnlockSeen(learnerRef)}>
            {learnerTerm("duelStart")}
          </Link>
          <Button variant="ghost" onClick={close}>
            {learnerTerm("splashDismiss")}
          </Button>
        </div>
      </div>
    </div>
  );
}
