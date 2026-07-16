import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { RecallChallengeView } from "@lrnki/application/projection";

const mockUseQuery = jest.fn();
const mockGuardianRewardPreview = jest.fn();

jest.mock("@tanstack/react-query", () => ({
  ...jest.requireActual<typeof import("@tanstack/react-query")>("@tanstack/react-query"),
  useQuery: () => mockUseQuery()
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ challengeId: "c1" }),
  useRouter: () => ({ replace: jest.fn(), back: jest.fn(), canGoBack: () => false })
}));
jest.mock("@/lib/queries", () => ({
  challengeQuery: (id: string) => ({ queryKey: ["challenge", id] }),
  expeditionQuery: (id: string) => ({ queryKey: ["expedition", id] })
}));
jest.mock("@/components/GuardianFight", () => ({
  GuardianFight: ({ onVictoryReady }: { onVictoryReady: (token: string) => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Button } = require("@/ui") as typeof import("@/ui");
    return <Button label="Finish mocked reveal" onPress={() => onVictoryReady("route-win-token")} />;
  }
}));
jest.mock("@/components/GuardianReward", () => ({
  guardianRewardPreview: (...args: unknown[]) => mockGuardianRewardPreview(...args),
  guardianRewardSceneWidth: (windowWidth: number) => Math.min(420, Math.max(280, windowWidth - 56)),
  GuardianReward: ({
    preview,
    transitionToken,
    onRetry,
    onContinue,
    onExplore
  }: {
    preview: { status: string; focus?: { kind: "leg"; sectionIndex: number } };
    transitionToken: string | null;
    onRetry: () => void;
    onContinue: () => void;
    onExplore: (focus: { kind: "leg"; sectionIndex: number }) => void;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Button, Text } = require("@/ui") as typeof import("@/ui");
    return (
      <>
        <Text>{`reward:${preview.status}:${transitionToken ?? "static"}`}</Text>
        <Button label="Route retry" onPress={onRetry} />
        <Button label="Route continue" onPress={onContinue} />
        {preview.status === "ready" && preview.focus ? (
          <Button label="Route explore" onPress={() => onExplore(preview.focus!)} />
        ) : null}
      </>
    );
  }
}));

import { GuardianResolvedRoute, GuardianRewardRoute } from "@/app/guardian/[challengeId]";
import { queryClient } from "@/lib/api";

const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

function wonView(over: Partial<Extract<RecallChallengeView, { state: "won" }>> = {}) {
  return {
    state: "won" as const,
    challengeId: "c1",
    enrichmentId: "e1",
    scopeKind: "section" as const,
    anchorDerivedNodeId: "n1",
    wardTotal: 2,
    ...over
  };
}

function activeView(): Extract<RecallChallengeView, { state: "active" | "recovery" }> {
  return {
    state: "active",
    challengeId: "c1",
    enrichmentId: "e1",
    scopeKind: "section",
    anchorDerivedNodeId: "n1",
    wardTotal: 1,
    unresolvedItemCount: 1,
    resolvedItemCount: 0,
    remainingMissBuffer: 1,
    missBufferTotal: 1,
    retreated: false,
    matchingProgress: null,
    currentItem: {
      kind: "option_select",
      item: {
        studyItemId: "i1",
        derivedNodeId: "n1",
        question: "Question",
        explanation: "Explanation",
        groundingProvenance: "generated",
        options: [],
        explorableTerms: []
      }
    }
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGuardianRewardPreview.mockReturnValue({
    status: "ready",
    rewardKind: "first",
    focus: { kind: "leg", sectionIndex: 0 },
    layout: {}
  });
});

test("a direct won route renders static reward and refetches the Expedition projection", async () => {
  const refetch = jest.fn(() => Promise.resolve());
  mockUseQuery.mockReturnValue({ isFetchedAfterMount: true, isFetching: false, isError: false, data: { session: {} }, refetch });
  await render(
    <GuardianResolvedRoute
      view={wonView()}
      routeChallengeId="c1"
      onCommit={jest.fn()}
      onExit={jest.fn()}
      onReplace={jest.fn()}
    />
  );
  expect(screen.getByText("reward:ready:static")).toBeTruthy();
  await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["expedition", "e1"], refetchType: "none" }));
  expect(refetch).toHaveBeenCalledTimes(1);
});

test("the final reveal token survives the same-route transition into reward", async () => {
  mockUseQuery.mockReturnValue({ isFetchedAfterMount: false, isFetching: true, isError: false, data: null, refetch: jest.fn() });
  const { rerender } = await render(
    <GuardianResolvedRoute
      view={activeView()}
      routeChallengeId="c1"
      onCommit={jest.fn()}
      onExit={jest.fn()}
      onReplace={jest.fn()}
    />
  );
  await fireEvent.press(screen.getByText("Finish mocked reveal"));
  await rerender(
    <GuardianResolvedRoute
      view={wonView()}
      routeChallengeId="c1"
      onCommit={jest.fn()}
      onExit={jest.fn()}
      onReplace={jest.fn()}
    />
  );
  expect(screen.getByText("reward:loading:route-win-token")).toBeTruthy();
});

test("a pre-warmed cached expedition never classifies before the route's own refetch lands", async () => {
  // Regression: a trail visit leaves cached expedition data, so a rematch reward used to
  // classify ready from the STALE session before the controller's explicit refetch.
  mockUseQuery.mockReturnValue({ isFetchedAfterMount: false, isFetching: false, isError: false, data: { session: {} }, refetch: jest.fn() });
  const { rerender } = await render(
    <GuardianRewardRoute challenge={wonView()} transitionToken="event" onReplace={jest.fn()} />
  );
  expect(screen.getByText("reward:loading:event")).toBeTruthy();
  expect(mockGuardianRewardPreview).not.toHaveBeenCalled();

  mockUseQuery.mockReturnValue({ isFetchedAfterMount: true, isFetching: false, isError: false, data: { session: {} }, refetch: jest.fn() });
  await rerender(<GuardianRewardRoute challenge={wonView()} transitionToken="event" onReplace={jest.fn()} />);
  expect(screen.getByText("reward:ready:event")).toBeTruthy();
});

test("loading and error previews preserve plain Continue while Retry remains preview-only", async () => {
  const replace = jest.fn();
  const refetch = jest.fn();
  mockUseQuery.mockReturnValue({ isFetchedAfterMount: true, isFetching: false, isError: true, data: null, refetch });
  await render(<GuardianRewardRoute challenge={wonView()} transitionToken="event" onReplace={replace} />);
  expect(screen.getByText("reward:error:event")).toBeTruthy();
  await fireEvent.press(screen.getByText("Route retry"));
  await fireEvent.press(screen.getByText("Route continue"));
  expect(refetch).toHaveBeenCalled();
  expect(replace).toHaveBeenCalledWith("/expedition/e1");
});

test("Explore replaces the Guardian route with explicit Vista focus intent", async () => {
  const replace = jest.fn();
  mockUseQuery.mockReturnValue({ isFetchedAfterMount: true, isFetching: false, isError: false, data: { session: {} }, refetch: jest.fn() });
  await render(<GuardianRewardRoute challenge={wonView()} transitionToken={null} onReplace={replace} />);
  await fireEvent.press(screen.getByText("Route explore"));
  expect(replace).toHaveBeenCalledWith("/expedition/e1?vista=1&formationFocus=leg:0");
});
