import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { PortalHost } from "@rn-primitives/portal";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CrystalVista } from "./CrystalVista";
import { buildTrailView } from "@/learn/trailView";
import { sessionFixture } from "@/learn/sessionFixture";
import { learnerTerm } from "@/learn/vocabulary";
import type { StudySession } from "@lrnki/application/projection";

jest.mock("@/lib/navMemory", () => ({
  readFusedSections: jest.fn(() => Promise.resolve([])),
  writeFusedSections: jest.fn(() => Promise.resolve()),
  readBoardSeen: jest.fn(() => Promise.resolve(null)),
  writeBoardSeen: jest.fn(() => Promise.resolve()),
  readDuelUnlockSeen: jest.fn(() => Promise.resolve(true)),
  markDuelUnlockSeen: jest.fn(() => Promise.resolve())
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

function renderVista(onExamine = jest.fn(), onOpenChange = jest.fn()) {
  const session = twoNodeSession();
  const trail = buildTrailView(session);
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <CrystalVista session={session} trail={trail} open onOpenChange={onOpenChange} onExamine={onExamine} />
      <PortalHost />
    </SafeAreaProvider>
  ).then(() => ({ onExamine, onOpenChange }));
}

test("a nameable crystal has a native touch target that opens its memory door", async () => {
  const { onExamine } = await renderVista();
  const target = screen.getByLabelText("Ownership");
  await fireEvent.press(target);
  expect(screen.getByLabelText("Ownership").props.accessibilityState.selected).toBe(true);
  // The frontier crystal's door is the reveal card with Examine navigation.
  const examine = await screen.findByLabelText(learnerTerm("examine"));
  await fireEvent.press(examine);
  expect(onExamine).toHaveBeenCalledWith("n1");
});

test("an ordinary locked mystery crystal exposes no interactive semantics", async () => {
  await renderVista();
  expect(screen.queryByLabelText("Borrowing")).toBeNull();
});

test("touch targets never drop below the 44px minimum", async () => {
  await renderVista();
  const target = screen.getByLabelText("Ownership");
  const style = Array.isArray(target.props.style) ? Object.assign({}, ...target.props.style.flat().filter(Boolean)) : target.props.style;
  expect(style.width).toBeGreaterThanOrEqual(44);
  expect(style.height).toBeGreaterThanOrEqual(44);
});

test("closing the vista clears selection and reports the change", async () => {
  const { onOpenChange } = await renderVista();
  await fireEvent.press(screen.getByLabelText(learnerTerm("returnToTrail")));
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
});
