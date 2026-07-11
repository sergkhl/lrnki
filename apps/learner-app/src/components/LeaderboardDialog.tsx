import { ScrollView } from "react-native";
import { Trophy } from "lucide-react-native";
import type { LeaderboardView } from "@/lib/api";
import { ChaseBanner, LeaderboardBoard } from "./LeaderboardBoard";
import { Dialog, OverlayHeader, colors } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";

// The Board as a self-contained adaptive dialog (R12): opened from the journal menu or
// mounted once by the splash coordinator with celebration copy. The standalone
// /leaderboard route is gone; this dialog is the only board surface.
export function LeaderboardDialog({
  open,
  onOpenChange,
  board,
  title,
  description
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  board: LeaderboardView;
  title?: string;
  description?: string;
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <OverlayHeader
        icon={<Trophy size={20} color={colors.ink} />}
        title={title ?? learnerTerm("leaderboardTitle")}
        description={description ?? learnerTerm("leaderboardHint")}
        onClose={() => onOpenChange(false)}
      />
      <ScrollView contentContainerClassName="gap-3 p-4" className="max-h-96">
        <ChaseBanner chase={board.chase} />
        <LeaderboardBoard
          entries={board.entries}
          weekKey={board.weekKey}
          masteredCrystalCount={board.masteredCrystalCount}
        />
      </ScrollView>
    </Dialog>
  );
}
