import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { act } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { buildTrailView, type RecallScopeStatus } from "@lrnki/application/projection";
import { sessionFixture } from "@/learn/sessionFixture";

const mockPush = jest.fn();
const mockEnterGuardianScope = jest.fn<
  (...args: unknown[]) => Promise<{ entered: true; challengeId: string } | { entered: false }>
>();

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("@/lib/guardianEntry", () => ({ enterGuardianScope: (...args: unknown[]) => mockEnterGuardianScope(...args) }));
jest.mock("@/lib/navMemory", () => ({
  readGuardianArrivalSeen: jest.fn(() => Promise.resolve(true)),
  markGuardianArrivalSeen: jest.fn(() => Promise.resolve())
}));
jest.mock("./ActivitySheet", () => ({
  ActivitySheet: ({ open }: { open: boolean }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Text } = require("@/ui") as typeof import("@/ui");
    return open ? <Text>activity-sheet-open</Text> : null;
  }
}));
jest.mock("./CheckpointCircle", () => ({
  CheckpointCircle: ({ stop, onSelect }: { stop: { stopId: string }; onSelect: (id: string) => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Button } = require("@/ui") as typeof import("@/ui");
    return <Button label="Open activity" onPress={() => onSelect(stop.stopId)} />;
  }
}));
jest.mock("./GuardianTrailNode", () => ({
  GuardianTrailNode: ({ scope, onEnter }: { scope: RecallScopeStatus; onEnter: (scope: RecallScopeStatus) => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Button } = require("@/ui") as typeof import("@/ui");
    return <Button label="Enter Guardian" onPress={() => onEnter(scope)} />;
  }
}));
jest.mock("./ConceptMarker", () => ({ ConceptMarker: () => null }));
jest.mock("./GuardianArrivalDialog", () => ({ GuardianArrivalDialog: () => null }));
jest.mock("./SupportPathNode", () => ({ SupportPathNode: () => null }));
jest.mock("./SupportPathSheet", () => ({ SupportPathSheet: () => null }));
jest.mock("./SupportPathDialog", () => ({ SupportPathDialog: () => null, dialogStateForDetour: () => ({ kind: "idle" }) }));

import { CheckpointPath } from "./CheckpointPath";

const recallScope: RecallScopeStatus = {
  scopeKind: "section",
  anchorDerivedNodeId: "n1",
  anchorLabel: "Ownership",
  sectionIndex: 0,
  eligibleItemCount: 2,
  state: "available"
};

async function renderPath() {
  const session = sessionFixture({
    classification: { stateByNode: { n1: "mastered" }, selectedFrontierTarget: null },
    recallScopes: [recallScope]
  });
  return await render(<CheckpointPath session={session} view={buildTrailView(session)} />);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => { jest.useRealTimers(); });

test("successful Guardian entry closes the Activity Sheet before route push", async () => {
  mockEnterGuardianScope.mockResolvedValue({ entered: true, challengeId: "c1" });
  await renderPath();
  await fireEvent.press(screen.getAllByText("Open activity")[0]);
  expect(screen.getByText("activity-sheet-open")).toBeTruthy();
  await fireEvent.press(screen.getByText("Enter Guardian"));
  await waitFor(() => expect(screen.queryByText("activity-sheet-open")).toBeNull());
  expect(mockPush).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(mockPush).toHaveBeenCalledWith("/guardian/c1");
});

test("failed Guardian entry leaves the Activity Sheet open and pushes nothing", async () => {
  mockEnterGuardianScope.mockResolvedValue({ entered: false });
  await renderPath();
  await fireEvent.press(screen.getAllByText("Open activity")[0]);
  await fireEvent.press(screen.getByText("Enter Guardian"));
  await act(async () => {});
  expect(screen.getByText("activity-sheet-open")).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
});
