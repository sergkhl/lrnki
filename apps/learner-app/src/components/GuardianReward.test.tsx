import { act } from "react";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { impactAsync, ImpactFeedbackStyle } from "expo-haptics";
import { useReducedMotion } from "react-native-reanimated";
import type { RecallScopeStatus, StudySession } from "@lrnki/application/projection";
import { sessionFixture } from "@/learn/sessionFixture";
import { learnerTerm } from "@/learn/vocabulary";
import {
  GuardianReward,
  guardianRewardPreview,
  type GuardianRewardPreview,
  type WonGuardianView
} from "./GuardianReward";

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 }
};

function challenge(over: Partial<WonGuardianView> = {}): WonGuardianView {
  return {
    state: "won",
    challengeId: "first-win",
    enrichmentId: "e1",
    scopeKind: "section",
    anchorDerivedNodeId: "n1",
    wardTotal: 2,
    ...over
  };
}

function scope(over: Partial<RecallScopeStatus> = {}): RecallScopeStatus {
  return {
    scopeKind: "section",
    anchorDerivedNodeId: "n1",
    anchorLabel: "Ownership",
    sectionIndex: 0,
    eligibleItemCount: 2,
    state: "won",
    wonChallengeId: "first-win",
    ...over
  };
}

function wonSession(recallScope: RecallScopeStatus = scope()): StudySession {
  return sessionFixture({
    classification: { stateByNode: { n1: "mastered" }, selectedFrontierTarget: null },
    recallScopes: [recallScope]
  });
}

async function renderReward(
  preview: GuardianRewardPreview,
  options: { transitionToken?: string | null; challenge?: WonGuardianView } = {}
) {
  const onContinue = jest.fn();
  const onExplore = jest.fn();
  const onRetry = jest.fn();
  const result = await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <GuardianReward
        challenge={options.challenge ?? challenge()}
        preview={preview}
        transitionToken={options.transitionToken ?? null}
        onContinue={onContinue}
        onExplore={onExplore}
        onRetry={onRetry}
      />
    </SafeAreaProvider>
  );
  return { ...result, onContinue, onExplore, onRetry };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.mocked(useReducedMotion).mockReturnValue(false);
});

afterEach(() => { jest.useRealTimers(); });

test("classifies only a matching durable won scope as first or rematch", () => {
  expect(guardianRewardPreview(challenge(), wonSession())).toMatchObject({ status: "ready", rewardKind: "first", focus: { kind: "leg", sectionIndex: 0 } });
  expect(guardianRewardPreview(challenge({ challengeId: "rematch" }), wonSession())).toMatchObject({ status: "ready", rewardKind: "rematch" });
  expect(guardianRewardPreview(challenge(), wonSession(scope({ wonChallengeId: undefined, state: "available" })))).toEqual({ status: "inconsistent" });
  expect(guardianRewardPreview(challenge({ anchorDerivedNodeId: "other" }), wonSession())).toEqual({ status: "inconsistent" });
});

test("a mounted first Leg win binds once, gates actions, and emits one fusion haptic", async () => {
  const preview = guardianRewardPreview(challenge(), wonSession());
  const rendered = await renderReward(preview, { transitionToken: "win-event" });
  expect(screen.getByText(learnerTerm("guardianRewardFirstLegTitle"))).toBeTruthy();
  expect(screen.getByTestId("leg-binding-event")).toBeTruthy();
  await fireEvent.press(screen.getByText(learnerTerm("guardianRewardContinue")));
  expect(rendered.onContinue).not.toHaveBeenCalled();

  await act(async () => { jest.advanceTimersByTime(560); });
  expect(impactAsync).toHaveBeenCalledWith(ImpactFeedbackStyle.Medium);
  await act(async () => { jest.advanceTimersByTime(500); });
  await fireEvent.press(screen.getByText(learnerTerm("guardianRewardContinue")));
  expect(rendered.onContinue).toHaveBeenCalledTimes(1);

  await rendered.rerender(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <GuardianReward
        challenge={challenge()}
        preview={preview}
        transitionToken="win-event"
        onContinue={rendered.onContinue}
        onExplore={rendered.onExplore}
        onRetry={rendered.onRetry}
      />
    </SafeAreaProvider>
  );
  await act(async () => { jest.advanceTimersByTime(1200); });
  expect(impactAsync).toHaveBeenCalledTimes(1);
});

test("a rematch uses endurance copy and never emits a reward haptic", async () => {
  const current = challenge({ challengeId: "rematch" });
  const rendered = await renderReward(guardianRewardPreview(current, wonSession()), {
    challenge: current,
    transitionToken: "rematch-event"
  });
  expect(screen.getByText(learnerTerm("guardianRewardRematchTitle"))).toBeTruthy();
  expect(screen.queryByTestId("leg-binding-event")).toBeNull();
  await act(async () => { jest.advanceTimersByTime(400); });
  expect(impactAsync).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText(learnerTerm("guardianRewardExplore")));
  expect(rendered.onExplore).toHaveBeenCalledWith({ kind: "leg", sectionIndex: 0 });
});

test("a mounted first summit win emits one unlock haptic and seats the crown", async () => {
  const summitChallenge = challenge({
    challengeId: "summit-first",
    scopeKind: "enrichment",
    anchorDerivedNodeId: "n1"
  });
  const summitSession = wonSession(scope({
    scopeKind: "enrichment",
    sectionIndex: null,
    wonChallengeId: "summit-first"
  }));
  await renderReward(guardianRewardPreview(summitChallenge, summitSession), {
    challenge: summitChallenge,
    transitionToken: "summit-event"
  });
  expect(screen.getByText(learnerTerm("guardianRewardFirstSummitTitle"))).toBeTruthy();
  expect(screen.getByTestId("formation-summit-crown")).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(560); });
  expect(impactAsync).toHaveBeenCalledWith(ImpactFeedbackStyle.Heavy);
  await act(async () => { jest.advanceTimersByTime(700); });
  expect(impactAsync).toHaveBeenCalledTimes(1);
});

test("direct won loads and reduced motion expose settled actions without haptics", async () => {
  const preview = guardianRewardPreview(challenge(), wonSession());
  const direct = await renderReward(preview);
  await fireEvent.press(screen.getByText(learnerTerm("guardianRewardContinue")));
  expect(direct.onContinue).toHaveBeenCalledTimes(1);
  expect(impactAsync).not.toHaveBeenCalled();
  await direct.unmount();

  jest.mocked(useReducedMotion).mockReturnValue(true);
  const reduced = await renderReward(preview, { transitionToken: "reduced-event" });
  // R20: the final sealed scene renders directly — no binding overlay, no light sweep.
  expect(screen.queryByTestId("leg-binding-event")).toBeNull();
  expect(screen.queryByTestId("guardian-reward-sweep")).toBeNull();
  await fireEvent.press(screen.getByText(learnerTerm("guardianRewardContinue")));
  expect(reduced.onContinue).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(1200); });
  expect(impactAsync).not.toHaveBeenCalled();
});

test("preview failures preserve victory and Continue while Retry is preview-only", async () => {
  const rendered = await renderReward({ status: "error" });
  expect(screen.getByText(learnerTerm("guardianRewardError"))).toBeTruthy();
  await fireEvent.press(screen.getByText(learnerTerm("guardianRewardRetry")));
  await fireEvent.press(screen.getByText(learnerTerm("guardianRewardContinue")));
  expect(rendered.onRetry).toHaveBeenCalledTimes(1);
  expect(rendered.onContinue).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(learnerTerm("guardianRewardRematchTitle"))).toBeNull();
});
