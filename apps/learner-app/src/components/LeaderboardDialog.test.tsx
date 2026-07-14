import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { PortalHost } from "@rn-primitives/portal";
import { LeaderboardDialog } from "./LeaderboardDialog";
import type { LeaderboardView } from "@/lib/api";
import { learnerTerm } from "@/learn/vocabulary";

export function boardFixture(overrides: Partial<LeaderboardView> = {}): LeaderboardView {
  return {
    weekKey: "2026-W28",
    entries: Array.from({ length: 10 }, (_, index) => ({
      id: `entry-${index}`,
      rank: index + 1,
      name: index === 4 ? "scout" : `Rival ${index}`,
      isViewer: index === 4,
      points: 100 - index * 7,
      badges: { podiums: index === 1 ? 1 : 0 }
    })),
    chase: { name: "Rival 3", direction: "behind", gap: 7 },
    viewerPoints: 72,
    viewerRank: 5,
    masteredCrystalCount: 12,
    podiumEarnedForPreviousWeek: false,
    ...overrides
  } as LeaderboardView;
}

test("the Board dialog renders the 10-row cohort under the Trophy header and closes cleanly", async () => {
  const onOpenChange = jest.fn();
  await render(
    <>
      <LeaderboardDialog open onOpenChange={onOpenChange} board={boardFixture()} />
      <PortalHost />
    </>
  );
  expect(screen.getByText(learnerTerm("leaderboardTitle"))).toBeTruthy();
  expect(screen.getAllByText(/Rival /).length).toBeGreaterThanOrEqual(9);
  expect(screen.getByText(`(${learnerTerm("leaderboardYou")})`, { exact: false })).toBeTruthy();
  expect(screen.getByText(/2026-W28/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Close"));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("celebration copy overrides the default header", async () => {
  await render(
    <>
      <LeaderboardDialog
        open
        onOpenChange={() => {}}
        board={boardFixture()}
        title={learnerTerm("podiumTitle")}
        description={learnerTerm("podiumBody")}
      />
      <PortalHost />
    </>
  );
  expect(screen.getByText(learnerTerm("podiumTitle"))).toBeTruthy();
  expect(screen.getByText(learnerTerm("podiumBody"))).toBeTruthy();
});
