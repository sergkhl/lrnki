import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { PortalHost } from "@rn-primitives/portal";
import { JournalSplashCoordinator } from "./JournalSplashCoordinator";
import { boardFixture } from "./LeaderboardDialog.test";
import { markDuelUnlockSeen, readBoardSeen, readDuelUnlockSeen, writeBoardSeen } from "@/lib/navMemory";
import { learnerTerm } from "@/learn/vocabulary";
import type { LeaderboardView } from "@/lib/api";

jest.mock("@/lib/navMemory", () => ({
  readBoardSeen: jest.fn(() => Promise.resolve(null)),
  writeBoardSeen: jest.fn(() => Promise.resolve()),
  readDuelUnlockSeen: jest.fn(() => Promise.resolve(false)),
  markDuelUnlockSeen: jest.fn(() => Promise.resolve()),
  readFusedSections: jest.fn(() => Promise.resolve(null)),
  writeFusedSections: jest.fn(() => Promise.resolve())
}));

const readBoardSeenMock = readBoardSeen as jest.MockedFunction<typeof readBoardSeen>;
const readDuelSeenMock = readDuelUnlockSeen as jest.MockedFunction<typeof readDuelUnlockSeen>;

beforeEach(() => {
  jest.clearAllMocks();
  readBoardSeenMock.mockResolvedValue(null);
  readDuelSeenMock.mockResolvedValue(false);
});

function renderCoordinator(input: { board: LeaderboardView | null; duelUnlocked: boolean | null; onEnterDuel?: () => void }) {
  return render(
    <>
      <JournalSplashCoordinator
        learnerStateRef="scout"
        board={input.board}
        duelUnlocked={input.duelUnlocked}
        onEnterDuel={input.onEnterDuel ?? (() => {})}
      />
      <PortalHost />
    </>
  );
}

test("duel unlock outranks a simultaneous board event and consumes only duel memory (AE5)", async () => {
  await renderCoordinator({ board: boardFixture({ podiumEarnedForPreviousWeek: true }), duelUnlocked: true });
  const title = await screen.findByText(learnerTerm("duelUnlockTitle"));
  expect(title).toBeTruthy();
  expect(screen.queryByText(learnerTerm("podiumTitle"))).toBeNull();
  await fireEvent.press(screen.getByLabelText(learnerTerm("splashDismiss")));
  await waitFor(() => expect(markDuelUnlockSeen).toHaveBeenCalledWith("scout"));
  expect(writeBoardSeen).not.toHaveBeenCalled();
  // No second splash chains within this visit.
  expect(screen.queryByText(learnerTerm("podiumTitle"))).toBeNull();
});

test("entering the duel marks unlock seen before navigating", async () => {
  const onEnterDuel = jest.fn();
  await renderCoordinator({ board: null, duelUnlocked: true, onEnterDuel });
  await screen.findByText(learnerTerm("duelUnlockTitle"));
  await fireEvent.press(screen.getByLabelText(learnerTerm("duelStart")));
  expect(markDuelUnlockSeen).toHaveBeenCalledWith("scout");
  expect(onEnterDuel).toHaveBeenCalledTimes(1);
});

test("a scored first visit shows the rank splash; dismissing writes the board snapshot", async () => {
  readDuelSeenMock.mockResolvedValue(true);
  await renderCoordinator({ board: boardFixture(), duelUnlocked: true });
  await screen.findByText(learnerTerm("splashRankUpTitle"));
  await fireEvent.press(screen.getByLabelText("Close"));
  await waitFor(() =>
    expect(writeBoardSeen).toHaveBeenCalledWith("scout", { weekKey: "2026-W28", rank: 5, points: 72 })
  );
});

test("a zero-point first visit stays silent and only refreshes the snapshot", async () => {
  readDuelSeenMock.mockResolvedValue(true);
  await renderCoordinator({ board: boardFixture({ viewerPoints: 0, viewerRank: null }), duelUnlocked: false });
  await waitFor(() => expect(writeBoardSeen).toHaveBeenCalled());
  expect(screen.queryByText(learnerTerm("splashRankUpTitle"))).toBeNull();
  expect(screen.queryByText(learnerTerm("splashNewWeekTitle"))).toBeNull();
});

test("a previously seen higher-priority event lets the board event surface on a later visit", async () => {
  readDuelSeenMock.mockResolvedValue(true);
  await renderCoordinator({ board: boardFixture({ podiumEarnedForPreviousWeek: true }), duelUnlocked: true });
  expect(await screen.findByText(learnerTerm("podiumTitle"))).toBeTruthy();
});

test("new week outranks rank change", async () => {
  readDuelSeenMock.mockResolvedValue(true);
  readBoardSeenMock.mockResolvedValue({ weekKey: "2026-W27", rank: 9, points: 4 });
  await renderCoordinator({ board: boardFixture(), duelUnlocked: false });
  expect(await screen.findByText(learnerTerm("splashNewWeekTitle"))).toBeTruthy();
});
