import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { PortalHost } from "@rn-primitives/portal";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ActivitySheet } from "./ActivitySheet";
import { requestScaffoldDetour, submitLearnerOptionSelect } from "@/lib/actions";
import { sessionFixture } from "@/learn/sessionFixture";
import { learnerTerm } from "@/learn/vocabulary";

jest.mock("@/lib/actions", () => ({
  markLearnerLessonRead: jest.fn(() => Promise.resolve()),
  refreshLearnerExpedition: jest.fn(() => Promise.resolve()),
  submitLearnerOptionSelect: jest.fn(),
  submitLearnerImpostor: jest.fn(),
  submitLearnerMatching: jest.fn(),
  validateLearnerMatchingAttempt: jest.fn(),
  requestScaffoldDetour: jest.fn(),
  retryScaffoldDetour: jest.fn(() => Promise.resolve()),
  hideScaffoldDetour: jest.fn(() => Promise.resolve())
}));

const submitMock = submitLearnerOptionSelect as jest.Mock;
const requestScaffoldMock = requestScaffoldDetour as jest.Mock;

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 }
};

beforeEach(() => {
  jest.clearAllMocks();
});

function renderSheet(stopId: string, onOpenChange = jest.fn()) {
  const session = sessionFixture();
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ActivitySheet session={session} stopId={stopId} open onOpenChange={onOpenChange} />
      <PortalHost />
    </SafeAreaProvider>
  ).then(() => onOpenChange);
}

test("an option-select stop opens under its own question header (AE3)", async () => {
  await renderSheet("n1:option_select:i1");
  // Header title is the concept label; the description is the kind label the trail used.
  expect(screen.getAllByText(learnerTerm("question")).length).toBeGreaterThan(0);
  expect(screen.getByText("What moves ownership?")).toBeTruthy();
});

test("grading blocks explicit close until the request settles, then one result is shown", async () => {
  let release: (value: unknown) => void = () => {};
  submitMock.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  const onOpenChange = await renderSheet("n1:option_select:i1");
  await fireEvent.press(screen.getByLabelText("Assignment"));
  expect(submitMock).toHaveBeenCalledTimes(1);
  // While pending: close control is disabled and dismissal is refused.
  await fireEvent.press(screen.getByLabelText("Close"));
  expect(onOpenChange).not.toHaveBeenCalled();
  release({ kind: "selection", graded: true, correct: true, chosenId: "o1", keyedCorrectId: "o1" });
  await waitFor(() => expect(screen.getByText("Correct.")).toBeTruthy());
  await fireEvent.press(screen.getByLabelText("Close"));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("a directly opened mastered capstone renders the settled shared Leg scene with no entrance or haptic (AE2)", async () => {
  const session = sessionFixture({
    expeditionPath: [{ ...sessionFixture().expeditionPath[0], state: "mastered" }],
    classification: { stateByNode: { n1: "mastered" }, selectedFrontierTarget: null },
    lessonReadByNode: { n1: true },
    latestOutcomeByStudyItemId: { i1: "correct", i2: "correct" }
  });
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ActivitySheet session={session} stopId="n1:capstone:main" open onOpenChange={jest.fn()} />
      <PortalHost />
    </SafeAreaProvider>
  );
  // The capstone card is a focused crop of the SHARED Leg scene (U3, R16) — settled:
  // the collected specimen is static, nothing enters, and no mastery haptic fires.
  expect(screen.getAllByTestId("cavern-cell-collected").length).toBeGreaterThan(0);
  expect(screen.queryAllByTestId("leg-slot-entering")).toHaveLength(0);
  expect(screen.getByText("This crystal now sits in its leg's formation.")).toBeTruthy();
  const haptics = jest.requireMock("expo-haptics") as { notificationAsync: jest.Mock; impactAsync: jest.Mock; selectionAsync: jest.Mock };
  expect(haptics.notificationAsync).not.toHaveBeenCalled();
  expect(haptics.impactAsync).not.toHaveBeenCalled();
});

test("a known-skipped capstone stays a ghost scene and never assembles a mineral", async () => {
  const session = sessionFixture({
    expeditionPath: [{ ...sessionFixture().expeditionPath[0], state: "mastered" }],
    classification: { stateByNode: { n1: "mastered" }, selectedFrontierTarget: null },
    verdictByNode: { n1: "known" }
  });
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ActivitySheet session={session} stopId="n1:capstone:main" open onOpenChange={jest.fn()} />
      <PortalHost />
    </SafeAreaProvider>
  );
  expect(screen.getAllByTestId("cavern-cell-known").length).toBeGreaterThan(0);
  expect(screen.queryAllByTestId("leg-slot-entering")).toHaveLength(0);
  expect(screen.getByText("Known ground is complete, but no crystal is collected.")).toBeTruthy();
});

test("a theory stop shows lesson content and its continue action", async () => {
  await renderSheet("n1:theory:main");
  expect(screen.getAllByText(learnerTerm("theoryStop")).length).toBeGreaterThan(0);
  expect(screen.getByLabelText(learnerTerm("continueAction"))).toBeTruthy();
});

test("Covers F1: the panel action opens the dialog; Add support path stages the root handoff (KTD5)", async () => {
  requestScaffoldMock.mockImplementation(() => Promise.resolve({ created: true, detourId: "d9", status: "generating" }));
  const onOpenChange = jest.fn();
  const onScaffoldRequested = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ActivitySheet session={sessionFixture()} stopId="n1:option_select:i1" open onOpenChange={onOpenChange} onScaffoldRequested={onScaffoldRequested} />
      <PortalHost />
    </SafeAreaProvider>
  );
  // The fixture's option-select advertises "ownership" and "move semantics" — its panel sits
  // between the stem and the answers (R7) and its action opens the state-aware dialog (R9).
  await fireEvent.press(screen.getByTestId("support-path-add-ownership"));
  expect(screen.getByText(learnerTerm("supportAvailableBody"))).toBeTruthy();
  await fireEvent.press(screen.getByTestId("support-path-request"));
  await waitFor(() => expect(requestScaffoldMock).toHaveBeenCalledWith({ enrichmentId: "e1", source: { kind: "study_item", studyItemId: "i1" }, term: "ownership" }));
  // Staged handoff: the nested dialog and the activity close BEFORE the root opens state.
  await waitFor(() => expect(onScaffoldRequested).toHaveBeenCalledWith("d9"));
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(screen.queryByTestId("support-path-request")).toBeNull();
});

test("Covers AE3: an active term is absent from the panel but its dialog reflects the detour state", async () => {
  const session = sessionFixture();
  const segments = session.studySegmentsByNode.n1;
  if (segments[0].kind !== "option_select") throw new Error("fixture shape changed");
  segments[0].item.explorableTerms = [
    { term: "ownership", sectionKind: null, support: { kind: "generating", detourId: "d1", phase: "building" } },
    { term: "move semantics", sectionKind: null, support: { kind: "available" } }
  ];
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ActivitySheet session={session} stopId="n1:option_select:i1" open onOpenChange={jest.fn()} />
      <PortalHost />
    </SafeAreaProvider>
  );
  expect(screen.queryByTestId("support-path-add-ownership")).toBeNull();
  expect(screen.getByTestId("support-path-add-move semantics")).toBeTruthy();
});

test("Covers AE2/R5-R7: theory prose highlights a term, the panel follows the content, and both open the dialog", async () => {
  const session = sessionFixture();
  session.lessonByNode.n1 = {
    derivedNodeId: "n1",
    canonicalLabel: "Ownership",
    sections: [
      { kind: "gist", text: "Ownership transfers on assignment via move semantics.", groundingProvenance: "generated", isSourceCited: false }
    ],
    explorableTerms: [{ term: "move semantics", sectionKind: "gist", support: { kind: "available" } }]
  };
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ActivitySheet session={session} stopId="n1:theory:main" open onOpenChange={jest.fn()} />
      <PortalHost />
    </SafeAreaProvider>
  );
  expect(screen.getByTestId("support-paths-panel")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("theory-term-move semantics"));
  expect(screen.getByText(learnerTerm("supportAvailableBody"))).toBeTruthy();
  // Cancel restores reading focus: the dialog closes, the sheet stays open (KTD5).
  await fireEvent.press(screen.getByLabelText(learnerTerm("supportProgressClose")));
  await waitFor(() => expect(screen.queryByText(learnerTerm("supportAvailableBody"))).toBeNull());
  expect(screen.getByText(learnerTerm("theoryStop"))).toBeTruthy();
});
