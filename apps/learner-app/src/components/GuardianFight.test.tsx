import { useState } from "react";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { PortalHost } from "@rn-primitives/portal";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { RecallChallengeView, StudyItemView } from "@lrnki/application/projection";
import { GuardianFight } from "./GuardianFight";
import {
  answerChallengeMatchingPairAction,
  answerChallengeSelectionAction,
  challengeLifecycleAction,
  createChallengeAction,
  refreshLearnerExpedition
} from "@/lib/actions";
import { learnerTerm } from "@/learn/vocabulary";

const mockShuffleIds = jest.fn((ids: readonly unknown[]) => [...ids]);
jest.mock("@/learn/shuffle", () => ({
  shuffleIds: (ids: readonly unknown[]) => mockShuffleIds(ids)
}));

jest.mock("@/lib/actions", () => ({
  answerChallengeSelectionAction: jest.fn(),
  answerChallengeMatchingPairAction: jest.fn(),
  challengeLifecycleAction: jest.fn(() => Promise.resolve({ applied: true, view: {} })),
  createChallengeAction: jest.fn(),
  refreshLearnerExpedition: jest.fn(() => Promise.resolve())
}));

const answerMock = answerChallengeSelectionAction as jest.Mock;
const pairMock = answerChallengeMatchingPairAction as jest.Mock;
const lifecycleMock = challengeLifecycleAction as jest.Mock;
const createMock = createChallengeAction as jest.Mock;
const refreshMock = refreshLearnerExpedition as jest.Mock;

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 }
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function optionItem(id: string, question: string): StudyItemView {
  return {
    kind: "option_select",
    item: {
      studyItemId: id,
      derivedNodeId: "n1",
      question,
      explanation: "Because the tide follows the moon.",
      groundingProvenance: "generated",
      options: [
        { optionId: "o-right", text: `Right answer for ${id}`, provenance: "generated" },
        { optionId: "o-wrong", text: `Wrong answer for ${id}`, provenance: "generated" }
      ],
      explorableTerms: []
    }
  };
}

function impostorItem(id: string): StudyItemView {
  return {
    kind: "impostor",
    item: {
      studyItemId: id,
      derivedNodeId: "n2",
      question: "Which statement is the fake?",
      groundingProvenance: "generated",
      statements: [
        { statementId: "s-true", text: "A true statement", provenance: "source" },
        { statementId: "s-lie", text: "The impostor statement", provenance: "generated" }
      ],
      reveal: "The fake claimed the opposite.",
      lieSource: "generated",
      explorableTerms: []
    }
  };
}

function matchingItem(id: string): StudyItemView {
  return {
    kind: "matching",
    item: {
      studyItemId: id,
      derivedNodeId: "n3",
      question: "Match each term.",
      groundingProvenance: "generated",
      prompts: [
        { promptId: "p1", text: "Clue one" },
        { promptId: "p2", text: "Clue two" }
      ],
      matches: [
        { matchId: "m1", text: "Match one" },
        { matchId: "m2", text: "Match two" }
      ],
      explorableTerms: []
    }
  };
}

type ActiveView = Extract<RecallChallengeView, { state: "active" | "recovery" }>;

function activeView(overrides: Partial<ActiveView> = {}): ActiveView {
  return {
    state: "active",
    challengeId: "c1",
    enrichmentId: "e1",
    scopeKind: "section",
    anchorDerivedNodeId: "anchor-1",
    wardTotal: 3,
    unresolvedItemCount: 3,
    resolvedItemCount: 0,
    remainingMissBuffer: 3,
    missBufferTotal: 3,
    retreated: false,
    currentItem: optionItem("q1", "What raises the tide?"),
    matchingProgress: null,
    ...overrides
  };
}

function wonView(): RecallChallengeView {
  return {
    state: "won",
    challengeId: "c1",
    enrichmentId: "e1",
    scopeKind: "section",
    anchorDerivedNodeId: "anchor-1",
    wardTotal: 3
  };
}

// The route feeds committed views back in as the next `view` prop (via the query cache);
// this harness mirrors that loop so the component under test stays controlled.
function Harness({
  initial,
  onCommit,
  onExit,
  onVictoryReady
}: Readonly<{ initial: RecallChallengeView; onCommit: jest.Mock; onExit: jest.Mock; onVictoryReady: jest.Mock }>) {
  const [view, setView] = useState(initial);
  return (
    <GuardianFight
      view={view}
      onCommit={(next) => {
        onCommit(next);
        setView(next);
      }}
      onExit={onExit}
      onVictoryReady={onVictoryReady}
    />
  );
}

async function renderFight(view: RecallChallengeView) {
  const onCommit = jest.fn();
  const onExit = jest.fn();
  const onVictoryReady = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <Harness initial={view} onCommit={onCommit} onExit={onExit} onVictoryReady={onVictoryReady} />
      <PortalHost />
    </SafeAreaProvider>
  );
  return { onCommit, onExit, onVictoryReady };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockShuffleIds.mockImplementation((ids) => [...ids]);
  lifecycleMock.mockImplementation(() => Promise.resolve({ applied: true, view: activeView() }));
});

test("a correct option answer posts through the challenge endpoint, reveals the ward break, and continues to the server's next item (AE2)", async () => {
  const next = activeView({ unresolvedItemCount: 2, resolvedItemCount: 1, currentItem: impostorItem("q2") });
  answerMock.mockImplementation(() =>
    Promise.resolve({
      answered: true,
      replayed: false,
      feedback: { kind: "selection", correct: true, chosenId: "o-right", keyedCorrectId: "o-right" },
      view: next
    })
  );
  const { onCommit } = await renderFight(activeView());
  expect(screen.getByText("What raises the tide?")).toBeTruthy();
  await fireEvent.press(screen.getByText("Right answer for q1"));
  await waitFor(() => expect(screen.getByText(learnerTerm("guardianWardBroken"))).toBeTruthy());
  expect(answerMock).toHaveBeenCalledTimes(1);
  const call = answerMock.mock.calls[0][0] as { challengeId: string; attemptRef: string; studyItemId: string; chosenId: string; responseDurationMs: number };
  expect(call.challengeId).toBe("c1");
  expect(call.studyItemId).toBe("q1");
  expect(call.chosenId).toBe("o-right");
  expect(call.attemptRef).toMatch(UUID_PATTERN);
  expect(call.responseDurationMs).toBeGreaterThanOrEqual(0);
  expect(onCommit).toHaveBeenCalledWith(next);
  // The reveal shows the ANSWERED item's corrective card until the learner continues.
  expect(screen.getByText("Because the tide follows the moon.")).toBeTruthy();
  await fireEvent.press(screen.getByText(learnerTerm("guardianContinue")));
  expect(screen.getByText("Which statement is the fake?")).toBeTruthy();
});

test("a miss keeps the ward, cracks the shield, and Last Stand appears when the server enters recovery (AE3)", async () => {
  const recovery = activeView({ state: "recovery", remainingMissBuffer: 0, currentItem: optionItem("q1", "What raises the tide?") });
  answerMock.mockImplementation(() =>
    Promise.resolve({
      answered: true,
      replayed: false,
      feedback: { kind: "selection", correct: false, chosenId: "o-wrong", keyedCorrectId: "o-right" },
      view: recovery
    })
  );
  await renderFight(activeView({ remainingMissBuffer: 1 }));
  await fireEvent.press(screen.getByText("Wrong answer for q1"));
  await waitFor(() => expect(screen.getByText(learnerTerm("guardianWardHolds"))).toBeTruthy());
  expect(screen.queryByTestId("guardian-obelisk-frame")).toBeNull();
  expect(screen.queryAllByTestId("shield-intact")).toHaveLength(0);
  expect(screen.queryAllByTestId("shield-spent")).toHaveLength(0);
  await fireEvent.press(screen.getByText(learnerTerm("guardianContinue")));
  expect(screen.getByText(learnerTerm("guardianLastStand"))).toBeTruthy();
  expect(screen.getByText(learnerTerm("guardianLastStandBody"))).toBeTruthy();
  expect(
    screen.getByText(
      `${learnerTerm("guardianWardsRemainingTemplate").replace("{count}", "3")} · ${learnerTerm("guardianShield")} 0/3`
    )
  ).toBeTruthy();
  expect(screen.queryAllByTestId("shield-intact")).toHaveLength(0);
  expect(screen.queryAllByTestId("shield-spent")).toHaveLength(3);
});

test("a selection reveal preserves the submitted option order instead of reshuffling the learner's choice", async () => {
  mockShuffleIds
    .mockImplementationOnce((ids) => [...ids].reverse())
    .mockImplementationOnce((ids) => [...ids]);
  const recovery = activeView({ state: "recovery", remainingMissBuffer: 0, currentItem: optionItem("q1", "What raises the tide?") });
  answerMock.mockImplementation(() =>
    Promise.resolve({
      answered: true,
      replayed: false,
      feedback: { kind: "selection", correct: false, chosenId: "o-wrong", keyedCorrectId: "o-right" },
      view: recovery
    })
  );
  await renderFight(activeView({ remainingMissBuffer: 1 }));
  const submittedOrder = screen.getAllByTestId("study-choice").map((choice) => choice.props.accessibilityLabel as string);
  await fireEvent.press(screen.getByText("Wrong answer for q1"));
  await waitFor(() => expect(screen.getByText(learnerTerm("guardianWardHolds"))).toBeTruthy());
  const revealedOrder = screen.getAllByTestId("study-choice").map((choice) => choice.props.accessibilityLabel as string);
  expect(revealedOrder).toEqual(submittedOrder);
});

test("matching pairs post individually and a dirty completed round presents the reshuffle message (KTD6)", async () => {
  const afterDirtyRound = activeView({
    remainingMissBuffer: 2,
    currentItem: matchingItem("q3"),
    matchingProgress: null
  });
  pairMock.mockImplementation(() =>
    Promise.resolve({
      answered: true,
      replayed: false,
      feedback: {
        kind: "matching_pair",
        correct: true,
        promptId: "p2",
        chosenMatchId: "m2",
        keyedMatchId: "m2",
        roundComplete: true,
        roundClean: false
      },
      view: afterDirtyRound
    })
  );
  await renderFight(activeView({ currentItem: matchingItem("q3"), matchingProgress: { matchedPromptIds: ["p1"], roundIndex: 0 } }));
  // The server's mid-board progress locks the already-matched clue on resume.
  expect(screen.getByText("1 of 2 matched. Tap a clue on the left, then its match on the right.")).toBeTruthy();
  await fireEvent.press(screen.getByText("Clue two"));
  await fireEvent.press(screen.getByText("Match two"));
  await waitFor(() => expect(pairMock).toHaveBeenCalledTimes(1));
  const call = pairMock.mock.calls[0][0] as { promptId: string; chosenMatchId: string; attemptRef: string };
  expect(call.promptId).toBe("p2");
  expect(call.chosenMatchId).toBe("m2");
  expect(call.attemptRef).toMatch(UUID_PATTERN);
  await waitFor(() => expect(screen.getByText(learnerTerm("guardianRecoveryReshuffle"))).toBeTruthy());
  expect(screen.queryByTestId("guardian-obelisk-frame")).toBeNull();
  expect(screen.queryAllByTestId("shield-intact")).toHaveLength(0);
  expect(screen.queryAllByTestId("shield-spent")).toHaveLength(0);
  await fireEvent.press(screen.getByText(learnerTerm("guardianContinue")));
  expect(
    screen.getByText(
      `${learnerTerm("guardianWardsRemainingTemplate").replace("{count}", "3")} · ${learnerTerm("guardianShield")} 2/3`
    )
  ).toBeTruthy();
  expect(screen.queryAllByTestId("shield-intact")).toHaveLength(2);
  expect(screen.queryAllByTestId("shield-spent")).toHaveLength(1);
});

test("retreat records the lifecycle edge and returns to the trail with the fight preserved (F3)", async () => {
  const { onExit } = await renderFight(activeView());
  await fireEvent.press(screen.getByText(learnerTerm("guardianRetreat")));
  expect(onExit).toHaveBeenCalledTimes(1);
  expect(lifecycleMock).toHaveBeenCalledWith("retreat", expect.objectContaining({ challengeId: "c1" }));
  const operationRef = (lifecycleMock.mock.calls[0][1] as { operationRef: string }).operationRef;
  expect(operationRef).toMatch(UUID_PATTERN);
  expect(refreshMock).toHaveBeenCalledWith({ enrichmentId: "e1" });
});

test("a fresh start requires confirmation, then abandons and creates a new challenge on the same scope (KTD7)", async () => {
  const fresh = activeView({ challengeId: "c2", currentItem: optionItem("q9", "A fresh lineup question?") });
  createMock.mockImplementation(() => Promise.resolve({ created: true, view: fresh }));
  const { onCommit } = await renderFight(activeView());
  await fireEvent.press(screen.getByText(learnerTerm("guardianAbandonAction")));
  expect(await screen.findByText(learnerTerm("guardianAbandonBody"))).toBeTruthy();
  await fireEvent.press(screen.getByText(learnerTerm("guardianAbandonConfirm")));
  await waitFor(() => expect(onCommit).toHaveBeenCalledWith(fresh));
  expect(lifecycleMock).toHaveBeenCalledWith("abandon", expect.objectContaining({ challengeId: "c1" }));
  expect(createMock).toHaveBeenCalledWith({ enrichmentId: "e1", scopeKind: "section", anchorDerivedNodeId: "anchor-1" });
});

test("a direct won fight hands off statically without rendering the superseded Guardian victory panel", async () => {
  const { onVictoryReady } = await renderFight(wonView());
  expect(screen.getByText(learnerTerm("guardianVictoryCommitted"))).toBeTruthy();
  await fireEvent.press(screen.getByText(learnerTerm("guardianSeeFormation")));
  expect(onVictoryReady).toHaveBeenCalledWith(null);
  expect(refreshMock).not.toHaveBeenCalled();
});

test("the final selection reveal survives the committed won view until See your formation", async () => {
  answerMock.mockImplementation(() => Promise.resolve({
    answered: true,
    replayed: false,
    feedback: { kind: "selection", correct: true, chosenId: "o-right", keyedCorrectId: "o-right" },
    view: wonView()
  }));
  const { onVictoryReady } = await renderFight(activeView({ unresolvedItemCount: 1, resolvedItemCount: 2 }));
  await fireEvent.press(screen.getByText("Right answer for q1"));
  await waitFor(() => expect(screen.getByText("Because the tide follows the moon.")).toBeTruthy());
  expect(onVictoryReady).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText(learnerTerm("guardianSeeFormation")));
  expect(onVictoryReady).toHaveBeenCalledWith(expect.stringMatching(UUID_PATTERN));
});

test("even an unexpected final incorrect selection keeps its keyed reveal ahead of a won view", async () => {
  answerMock.mockImplementation(() => Promise.resolve({
    answered: true,
    replayed: false,
    feedback: { kind: "selection", correct: false, chosenId: "o-wrong", keyedCorrectId: "o-right" },
    view: wonView()
  }));
  const { onVictoryReady } = await renderFight(activeView({ unresolvedItemCount: 1, resolvedItemCount: 2 }));
  await fireEvent.press(screen.getByText("Wrong answer for q1"));
  await waitFor(() => expect(screen.getByText(learnerTerm("guardianWardHolds"))).toBeTruthy());
  expect(screen.getByText("Because the tide follows the moon.")).toBeTruthy();
  expect(onVictoryReady).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText(learnerTerm("guardianSeeFormation")));
  expect(onVictoryReady).toHaveBeenCalledTimes(1);
});

test("the final matching-round reveal survives the committed won view until See your formation", async () => {
  pairMock.mockImplementation(() => Promise.resolve({
    answered: true,
    replayed: false,
    feedback: {
      kind: "matching_pair",
      correct: true,
      promptId: "p2",
      chosenMatchId: "m2",
      keyedMatchId: "m2",
      roundComplete: true,
      roundClean: true
    },
    view: wonView()
  }));
  const { onVictoryReady } = await renderFight(activeView({
    unresolvedItemCount: 1,
    resolvedItemCount: 2,
    currentItem: matchingItem("q3"),
    matchingProgress: { matchedPromptIds: ["p1"], roundIndex: 0 }
  }));
  await fireEvent.press(screen.getByText("Clue two"));
  await fireEvent.press(screen.getByText("Match two"));
  await waitFor(() => expect(screen.getByText(learnerTerm("guardianWardBroken"))).toBeTruthy());
  expect(onVictoryReady).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText(learnerTerm("guardianSeeFormation")));
  expect(onVictoryReady).toHaveBeenCalledWith(expect.stringMatching(UUID_PATTERN));
});

test("opening a retreated challenge fires the resume state-edge exactly once (KTD2)", async () => {
  await renderFight(activeView({ retreated: true }));
  await waitFor(() => expect(lifecycleMock).toHaveBeenCalledWith("resume", expect.objectContaining({ challengeId: "c1" })));
  expect(lifecycleMock).toHaveBeenCalledTimes(1);
});

test("a failed submission offers Retry that re-posts with the SAME attemptRef (KTD2 idempotency)", async () => {
  answerMock.mockImplementationOnce(() => Promise.reject(new Error("network")));
  const next = activeView({ unresolvedItemCount: 2, resolvedItemCount: 1 });
  answerMock.mockImplementationOnce(() =>
    Promise.resolve({
      answered: true,
      replayed: false,
      feedback: { kind: "selection", correct: true, chosenId: "o-right", keyedCorrectId: "o-right" },
      view: next
    })
  );
  await renderFight(activeView());
  await fireEvent.press(screen.getByText("Right answer for q1"));
  await waitFor(() => expect(screen.getByText(learnerTerm("guardianAnswerError"))).toBeTruthy());
  await fireEvent.press(screen.getByText(learnerTerm("guardianRetry")));
  await waitFor(() => expect(answerMock).toHaveBeenCalledTimes(2));
  const first = answerMock.mock.calls[0][0] as { attemptRef: string };
  const second = answerMock.mock.calls[1][0] as { attemptRef: string };
  expect(second.attemptRef).toBe(first.attemptRef);
});

test("a duplicate tap while a submission is in flight cannot double-answer (KTD2)", async () => {
  let resolveAnswer: (value: unknown) => void = () => {};
  answerMock.mockImplementation(() => new Promise((resolve) => { resolveAnswer = resolve; }));
  await renderFight(activeView());
  await fireEvent.press(screen.getByText("Right answer for q1"));
  await fireEvent.press(screen.getByText("Right answer for q1"));
  await fireEvent.press(screen.getByText("Wrong answer for q1"));
  resolveAnswer({
    answered: true,
    replayed: false,
    feedback: { kind: "selection", correct: true, chosenId: "o-right", keyedCorrectId: "o-right" },
    view: activeView({ unresolvedItemCount: 2 })
  });
  await waitFor(() => expect(screen.getByText(learnerTerm("guardianWardBroken"))).toBeTruthy());
  expect(answerMock).toHaveBeenCalledTimes(1);
});

test("a server refusal ends the fight safely instead of synthesizing local state (KTD7)", async () => {
  answerMock.mockImplementation(() => Promise.resolve({ answered: false, refused: "challenge_not_active" }));
  await renderFight(activeView());
  await fireEvent.press(screen.getByText("Right answer for q1"));
  await waitFor(() => expect(screen.getByText(learnerTerm("guardianOverTitle"))).toBeTruthy());
  expect(screen.getByText(learnerTerm("returnToTrail"))).toBeTruthy();
});

test("the guardian stage announces wards and shield as text, never color alone (AE9)", async () => {
  await renderFight(activeView({ unresolvedItemCount: 2, resolvedItemCount: 1, remainingMissBuffer: 2 }));
  expect(
    screen.getByText(
      `${learnerTerm("guardianWardsRemainingTemplate").replace("{count}", "2")} · ${learnerTerm("guardianShield")} 2/3`
    )
  ).toBeTruthy();
});
