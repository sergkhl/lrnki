"use client";

import Link from "next/link";
import { LogOutIcon, MenuIcon, SwordsIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { LeaderboardDialogTrigger, type LeaderboardDialogView } from "./LeaderboardDialog";
import { learnerTerm } from "./vocabulary";

const menuItemClassName = "w-full justify-start";

// Collapses the three journal actions — Crystal Duel, View the board, Log out — behind one menu
// button. The leaderboard stays a self-contained Dialog nested inside the drawer popup.
export function LearnerMenuDrawer({ board }: Readonly<{ board: LeaderboardDialogView | null | undefined }>) {
  return (
    <Drawer>
      <DrawerTrigger render={<Button type="button" size="icon-sm" variant="ghost" aria-label="Menu" />}>
        <MenuIcon />
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Menu</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col gap-1 p-4 pt-2">
          <Link href="/learn/duel" className={cn(buttonVariants({ variant: "ghost" }), menuItemClassName)}>
            <SwordsIcon data-icon="inline-start" />
            {learnerTerm("duelEntry")}
          </Link>
          {board ? <LeaderboardDialogTrigger view={board} className={menuItemClassName} /> : null}
          <form action="/learn/session" method="post">
            <input type="hidden" name="intent" value="logout" />
            <Button type="submit" variant="ghost" className={menuItemClassName} aria-label={learnerTerm("logoutAction")}>
              <LogOutIcon data-icon="inline-start" />
              {learnerTerm("logoutAction")}
            </Button>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
