import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { PortalHost } from "@rn-primitives/portal";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StyleSheet } from "react-native";
import { CrystalVista } from "./CrystalVista";
import { buildTrailView } from "@lrnki/application/projection";
import { sessionFixture } from "@/learn/sessionFixture";
import { learnerTerm } from "@/learn/vocabulary";
import type { StudySession } from "@lrnki/application/projection";

jest.mock("@/lib/navMemory", () => ({
  readVistaSeenBindings: jest.fn(() => Promise.resolve([])),
  writeVistaSeenBindings: jest.fn(() => Promise.resolve()),
  readBoardSeen: jest.fn(() => Promise.resolve(null)),
  writeBoardSeen: jest.fn(() => Promise.resolve()),
  readGuardianArrivalSeen: jest.fn(() => Promise.resolve(true)),
  markGuardianArrivalSeen: jest.fn(() => Promise.resolve())
}));

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 }
};

beforeEach(() => {
  jest.clearAllMocks();
});

// Two concepts: n1 frontier (nameable) and n2 an ordinary locked mystery (not nameable —
// it is neither milestone nor summit; n1 carries both roles in the path fixture).
function twoNodeSession(): StudySession {
  const base = sessionFixture();
  return {
    ...base,
    detail: {
      ...base.detail,
      nodes: [
        base.detail.nodes[0],
        { ...base.detail.nodes[0], derivedNodeId: "n2", label: "Borrowing" }
      ]
    },
    classification: { stateByNode: { n1: "frontier", n2: "locked" }, selectedFrontierTarget: "n1" },
    expeditionPath: [
      { ...base.expeditionPath[0], isSummit: true, isMilestone: true },
      {
        ...base.expeditionPath[0],
        position: 1,
        derivedNodeId: "n2",
        state: "locked",
        isSummit: false,
        isMilestone: false,
        sectionPositionIndex: 1
      }
    ],
    sections: [{ ...base.sections[0], stepDerivedNodeIds: ["n1", "n2"] }]
  };
}

function renderVista(
  onExamine = jest.fn(),
  onOpenChange = jest.fn(),
  session = twoNodeSession(),
  metrics = SAFE_AREA_METRICS
) {
  const trail = buildTrailView(session);
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <CrystalVista session={session} trail={trail} open onOpenChange={onOpenChange} onExamine={onExamine} />
      <PortalHost />
    </SafeAreaProvider>
  ).then(() => ({ onExamine, onOpenChange }));
}

test("a nameable crystal has a native touch target that opens its memory door", async () => {
  const { onExamine } = await renderVista();
  const target = screen.getByLabelText(/^Ownership/);
  await fireEvent.press(target);
  expect(target.props.accessibilityState.selected).toBe(true);
  // The frontier crystal's sheet carries the existing memory and Examine navigation.
  expect(await screen.findByTestId("vista-memory-sheet")).toBeTruthy();
  const examine = await screen.findByLabelText(learnerTerm("examine"));
  await fireEvent.press(examine);
  expect(screen.queryByTestId("vista-memory-sheet")).toBeNull();
  await waitFor(() => expect(onExamine).toHaveBeenCalledWith("n1"));
});

test("an ordinary locked mystery crystal exposes no interactive semantics", async () => {
  await renderVista();
  expect(screen.queryByLabelText("Borrowing")).toBeNull();
});

test("a nameable guarded crystal opens the same sheet without an Examine action", async () => {
  const session = twoNodeSession();
  session.expeditionPath = session.expeditionPath.map((step) =>
    step.derivedNodeId === "n2" ? { ...step, isMilestone: true } : step
  );
  await renderVista(jest.fn(), jest.fn(), session);
  await fireEvent.press(screen.getByLabelText("Borrowing"));
  expect(await screen.findByText("Guarded by Leg 1.")).toBeTruthy();
  expect(screen.queryByLabelText(learnerTerm("examine"))).toBeNull();
});

test("backdrop or close dismisses only the memory sheet and clears selection", async () => {
  const onOpenChange = jest.fn();
  await renderVista(jest.fn(), onOpenChange);
  const crystal = screen.getByLabelText(/^Ownership/);
  await fireEvent.press(crystal);
  expect(await screen.findByTestId("vista-memory-sheet")).toBeTruthy();
  await fireEvent(screen.getByTestId("bottom-sheet"), "close");
  await waitFor(() => expect(screen.queryByTestId("vista-memory-sheet")).toBeNull());
  expect(onOpenChange).not.toHaveBeenCalled();
  expect(screen.getByLabelText(/^Ownership/).props.accessibilityState.selected).toBe(false);

  await fireEvent.press(screen.getByLabelText(/^Ownership/));
  await fireEvent.press(await screen.findByLabelText("Close"));
  await waitFor(() => expect(screen.queryByTestId("vista-memory-sheet")).toBeNull());
  expect(onOpenChange).not.toHaveBeenCalled();
});

test("the Examine action clears the home-indicator inset plus 16px content spacing", async () => {
  const metrics = {
    ...SAFE_AREA_METRICS,
    insets: { ...SAFE_AREA_METRICS.insets, bottom: 34 }
  };
  await renderVista(jest.fn(), jest.fn(), twoNodeSession(), metrics);
  await fireEvent.press(screen.getByLabelText(/^Ownership/));
  const safeArea = StyleSheet.flatten(screen.getByTestId("bottom-sheet-safe-area").props.style);
  const content = StyleSheet.flatten(screen.getByTestId("vista-memory-sheet").props.style);
  expect(safeArea.paddingBottom).toBe(34);
  expect(content.paddingBottom).toBe(16);
  expect(safeArea.paddingBottom + content.paddingBottom).toBe(50);
});

test("the formation header and its close control clear the status bar", async () => {
  const metrics = { ...SAFE_AREA_METRICS, insets: { ...SAFE_AREA_METRICS.insets, top: 47, bottom: 34 } };
  await renderVista(jest.fn(), jest.fn(), twoNodeSession(), metrics);
  // The reported defect: the Gem icon, title, and Return-to-trail control painted under the
  // transparent status bar because this surface carried no inset of its own. The inset now
  // belongs to FullScreenDialog, so the header can never be the one caller that forgets it.
  const surface = StyleSheet.flatten(screen.getByTestId("fullscreen-content").props.style);
  expect(surface.paddingTop).toBe(47);
  expect(surface.paddingBottom).toBe(34);
  expect(screen.getByLabelText(learnerTerm("returnToTrail"))).toBeTruthy();
});

test("touch targets never drop below the 44px minimum", async () => {
  await renderVista();
  const target = screen.getByLabelText(/^Ownership/);
  const style = Array.isArray(target.props.style) ? Object.assign({}, ...target.props.style.flat().filter(Boolean)) : target.props.style;
  expect(style.width).toBeGreaterThanOrEqual(44);
  expect(style.height).toBeGreaterThanOrEqual(44);
});

test("closing the vista clears selection and reports the change", async () => {
  const { onOpenChange } = await renderVista();
  await fireEvent.press(screen.getByLabelText(learnerTerm("returnToTrail")));
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
});

test("an unseen bound Leg contextualizes once and records the complete displayed reward snapshot", async () => {
  const base = twoNodeSession();
  const session: StudySession = {
    ...base,
    classification: { stateByNode: { n1: "mastered", n2: "mastered" }, selectedFrontierTarget: null },
    expeditionPath: base.expeditionPath.map((step) => ({ ...step, state: "mastered" as const })),
    recallScopes: [
      {
        scopeKind: "section",
        anchorDerivedNodeId: "n1",
        anchorLabel: "Ownership",
        sectionIndex: 0,
        eligibleItemCount: 2,
        state: "won",
        wonChallengeId: "first-win"
      }
    ]
  };
  const trail = buildTrailView(session);
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <CrystalVista session={session} trail={trail} open onOpenChange={jest.fn()} onExamine={jest.fn()} />
      <PortalHost />
    </SafeAreaProvider>
  );
  expect(await screen.findByText("Leg 1 settles into the Crystal Formation.")).toBeTruthy();
  const { writeVistaSeenBindings } = jest.requireMock("@/lib/navMemory") as { writeVistaSeenBindings: jest.Mock };
  await waitFor(() => expect(writeVistaSeenBindings).toHaveBeenCalledWith("learner", "e1", ["leg:0"]));
});
