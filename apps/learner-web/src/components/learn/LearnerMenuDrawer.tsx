"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import { LogOutIcon, MenuIcon, SwordsIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { logout } from "@/lib/session";
import { LeaderboardDialogTrigger, type LeaderboardDialogView } from "./LeaderboardDialog";
import { learnerTerm } from "./vocabulary";

const menuItemClassName = "w-full justify-start";

// Collapses the three journal actions — Crystal Duel, View the board, Log out — behind one menu
// button. The leaderboard stays a self-contained Dialog nested inside the drawer popup.
export function LearnerMenuDrawer({
  board,
  onLoggedOut
}: Readonly<{ board: LeaderboardDialogView | null | undefined; onLoggedOut: () => void }>) {
  const navigate = useNavigate();
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
          <Link to="/duel" className={cn(buttonVariants({ variant: "ghost" }), menuItemClassName)}>
            <SwordsIcon data-icon="inline-start" />
            {learnerTerm("duelEntry")}
          </Link>
          {board ? <LeaderboardDialogTrigger view={board} className={menuItemClassName} /> : null}
          <Button
            type="button"
            variant="ghost"
            className={menuItemClassName}
            aria-label={learnerTerm("logoutAction")}
            onClick={() => {
              void logout().then(() => {
                onLoggedOut();
                void navigate({ to: "/" });
              });
            }}
          >
            <LogOutIcon data-icon="inline-start" />
            {learnerTerm("logoutAction")}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
