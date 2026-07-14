import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { PortalHost } from "@rn-primitives/portal";
import { JournalSplashCoordinator } from "./JournalSplashCoordinator";
import { boardFixture } from "./LeaderboardDialog.test";
import { readBoardSeen, writeBoardSeen } from "@/lib/navMemory";
import { learnerTerm } from "@/learn/vocabulary";
import type { LeaderboardView } from "@/lib/api";

jest.mock("@/lib/navMemory", () => ({
  readBoardSeen: jest.fn(() => Promise.resolve(null)),
  writeBoardSeen: jest.fn(() => Promise.resolve()),
  readGuardianArrivalSeen: jest.fn(() => Promise.resolve(false)),
  markGuardianArrivalSeen: jest.fn(() => Promise.resolve()),
  readFusedSections: jest.fn(() => Promise.resolve(null)),
  writeFusedSections: jest.fn(() => Promise.resolve())
}));

const readBoardSeenMock = readBoardSeen as jest.MockedFunction<typeof readBoardSeen>;

beforeEach(() => {
  jest.clearAllMocks();
  readBoardSeenMock.mockResolvedValue(null);
});

function renderCoordinator(input: { board: LeaderboardView | null }) {
  return render(
    <>
      <JournalSplashCoordinator learnerStateRef="scout" board={input.board} />
      <PortalHost />
    </>
  );
}

test("a scored first visit shows the rank splash; dismissing writes the board snapshot", async () => {
  await renderCoordinator({ board: boardFixture() });
  await screen.findByText(learnerTerm("splashRankUpTitle"));
  await fireEvent.press(screen.getByLabelText("Close"));
  await waitFor(() =>
    expect(writeBoardSeen).toHaveBeenCalledWith("scout", { weekKey: "2026-W28", rank: 5, points: 72 })
  );
});

test("a zero-point first visit stays silent and only refreshes the snapshot", async () => {
  await renderCoordinator({ board: boardFixture({ viewerPoints: 0, viewerRank: null }) });
  await waitFor(() => expect(writeBoardSeen).toHaveBeenCalled());
  expect(screen.queryByText(learnerTerm("splashRankUpTitle"))).toBeNull();
  expect(screen.queryByText(learnerTerm("splashNewWeekTitle"))).toBeNull();
});

test("a prior-week podium finish surfaces the podium splash (AE5)", async () => {
  await renderCoordinator({ board: boardFixture({ podiumEarnedForPreviousWeek: true }) });
  expect(await screen.findByText(learnerTerm("podiumTitle"))).toBeTruthy();
});

test("new week outranks rank change", async () => {
  readBoardSeenMock.mockResolvedValue({ weekKey: "2026-W27", rank: 9, points: 4 });
  await renderCoordinator({ board: boardFixture() });
  expect(await screen.findByText(learnerTerm("splashNewWeekTitle"))).toBeTruthy();
});
