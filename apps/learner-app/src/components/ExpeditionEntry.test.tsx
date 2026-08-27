import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ExpeditionEntry } from "./ExpeditionEntry";
import { chooseCandidateExpedition, setActiveExpedition } from "@/lib/actions";
import type { JournalView } from "@/lib/queries";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false })
}));
jest.mock("@/lib/actions", () => ({
  chooseCandidateExpedition: jest.fn(() => new Promise(() => {})),
  setActiveExpedition: jest.fn(() => new Promise(() => {})),
  startTopicExpedition: jest.fn(),
  retryTopicExpedition: jest.fn()
}));

const chooseMock = chooseCandidateExpedition as jest.Mock;
const setActiveMock = setActiveExpedition as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 }
};

function renderEntry(entry: JournalView) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ExpeditionEntry learnerStateRef="scout" entry={entry} />
    </SafeAreaProvider>
  );
}

function journal(overrides: Partial<JournalView> = {}): JournalView {
  return {
    capabilities: {
      syntheticTopicGeneration: {
        status: "paused",
        message: "New topic scouting is paused while source-backed generation is checked. Choose a ready expedition in Explore."
      }
    },
    started: [
      {
        status: "ready",
        learnerExpeditionId: "le1",
        enrichmentId: "e1",
        title: "Rust ownership",
        teaser: "Build intuition for moves and borrows.",
        declaredDomain: "software engineering",
        active: true,
        layerPurpose: "Reason about moves and borrows.",
        progress: { itemsPassed: 2, itemsTotal: 8, itemsAttempted: 3, lessonsRead: 1 }
      }
    ],
    yours: [],
    shared: [
      {
        enrichmentId: "e2",
        catalogKey: "critical-thinking",
        title: "Critical Thinking",
        teaser: "Build stronger arguments and weigh evidence.",
        declaredDomain: "biology",
        sortOrder: 1,
        totalStopCount: 7,
        searchTerms: []
      }
    ],
    ...overrides
  } as JournalView;
}

test("journal sections render Continue, Your expeditions, Explore in order", async () => {
  await renderEntry(journal());
  const headings = ["Continue", "Your expeditions", "Explore"].map((title) => screen.getByText(title));
  expect(headings).toHaveLength(3);
  expect(screen.getByLabelText("Browse all →")).toBeTruthy();
  expect(screen.getByText("Exploring as scout")).toBeTruthy();
  // The started expedition surfaces its purpose teaser and progress.
  expect(screen.getAllByText("Rust ownership").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Build intuition for moves and borrows.").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Reason about moves and borrows.").length).toBeGreaterThan(0);
});

test("a paused capability hides topic planning while preserving source-backed Explore", async () => {
  await renderEntry(journal());
  expect(screen.queryByLabelText("Plan a new expedition")).toBeNull();
  expect(screen.getByText("New topic scouting is paused")).toBeTruthy();
  expect(screen.getByText(/Choose a ready expedition in Explore/)).toBeTruthy();
  expect(screen.getByLabelText("Begin")).toBeTruthy();
});

test("the retained available capability still exposes the topic planning sheet", async () => {
  await renderEntry(journal({
    capabilities: { syntheticTopicGeneration: { status: "available" } }
  }));
  expect(screen.getByLabelText("Plan a new expedition")).toBeTruthy();
  expect(screen.queryByText("New topic scouting is paused")).toBeNull();
});

test("paused generated rows expose no stale retry affordance", async () => {
  await renderEntry(journal({
    yours: [{
      status: "failed",
      learnerExpeditionId: "le-failed",
      title: "Ocean currents",
      declaredDomain: null,
      failureMessage: "Scouting failed.",
      generation: {
        queued: false,
        stalled: false,
        completed: 4,
        total: 19,
        fraction: 4 / 19,
        indeterminate: false,
        currentStage: "grounding-generation"
      }
    }]
  }));
  expect(screen.getByText("Scouting paused")).toBeTruthy();
  expect(screen.queryByLabelText("Retry")).toBeNull();
});

test("beginning a candidate fires one action even under rapid presses", async () => {
  await renderEntry(journal());
  const begin = screen.getByLabelText("Begin");
  await fireEvent.press(begin);
  await fireEvent.press(begin);
  expect(chooseMock.mock.calls.length + setActiveMock.mock.calls.length).toBe(1);
});

test("an accepted candidate renders only catalog title, teaser, playable count, and Begin", async () => {
  await renderEntry(journal());
  expect(screen.getByText("Critical Thinking")).toBeTruthy();
  expect(screen.getByText("Build stronger arguments and weigh evidence.")).toBeTruthy();
  expect(screen.getByText("7 playable stops")).toBeTruthy();
  expect(screen.getByLabelText("Begin")).toBeTruthy();
  expect(screen.queryByText("Biology")).toBeNull();
  expect(screen.queryByText("Expedition: Critical Thinking")).toBeNull();
});
