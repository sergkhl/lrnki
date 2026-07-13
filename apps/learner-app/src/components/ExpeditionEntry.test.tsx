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
    started: [
      {
        status: "ready",
        learnerExpeditionId: "le1",
        enrichmentId: "e1",
        title: "Rust ownership",
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
        title: "Photosynthesis",
        declaredDomain: "biology",
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
  expect(screen.getAllByText("Reason about moves and borrows.").length).toBeGreaterThan(0);
});

test("beginning a candidate fires one action even under rapid presses", async () => {
  await renderEntry(journal());
  const begin = screen.getByLabelText("Begin");
  await fireEvent.press(begin);
  await fireEvent.press(begin);
  expect(chooseMock.mock.calls.length + setActiveMock.mock.calls.length).toBe(1);
});
