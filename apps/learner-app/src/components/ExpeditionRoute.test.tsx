import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

const mockSetParams = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseQuery = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    setParams: mockSetParams,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false
  }),
  useLocalSearchParams: () => mockUseLocalSearchParams()
}));

jest.mock("@tanstack/react-query", () => ({
  ...jest.requireActual<typeof import("@tanstack/react-query")>("@tanstack/react-query"),
  useQuery: () => mockUseQuery()
}));

jest.mock("@/components/CheckpointPath", () => ({ CheckpointPath: () => null }));

jest.mock("@/components/QuestHeader", () => ({
  QuestHeader: ({ onOpenVista }: { onOpenVista: () => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Button } = require("@/ui") as typeof import("@/ui");
    return <Button label="Open mocked Vista" onPress={onOpenVista} />;
  }
}));

jest.mock("@/components/CrystalVista", () => ({
  CrystalVista: ({
    open,
    onOpenChange,
    onIntentConsumed,
    explicitFocus
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onIntentConsumed?: () => void;
    explicitFocus: { kind: string; sectionIndex?: number } | null;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Button, Text } = require("@/ui") as typeof import("@/ui");
    return (
      <>
        <Text>{open ? `Vista open ${explicitFocus?.kind ?? "default"}:${explicitFocus?.sectionIndex ?? ""}` : "Vista closed"}</Text>
        {open ? (
          <Button
            label="Close mocked Vista"
            onPress={() => {
              onIntentConsumed?.();
              onOpenChange(false);
            }}
          />
        ) : null}
      </>
    );
  }
}));

import ExpeditionPage, { parseVistaFocus } from "@/app/expedition/[enrichmentId]";
import { sessionFixture } from "@/learn/sessionFixture";

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 }
};

function renderPage() {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ExpeditionPage />
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseQuery.mockReturnValue({
    isPending: false,
    isError: false,
    data: { session: sessionFixture(), expedition: null }
  });
});

test("ordinary Expedition render keeps Vista closed until the learner explicitly opens it", async () => {
  mockUseLocalSearchParams.mockReturnValue({ enrichmentId: "e1" });
  await renderPage();
  expect(screen.getByText("Vista closed")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Open mocked Vista"));
  expect(screen.getByText("Vista open default:")).toBeTruthy();
});

test("reward route intent opens once at its focus and closing consumes both parameters", async () => {
  mockUseLocalSearchParams.mockReturnValue({ enrichmentId: "e1", vista: "1", formationFocus: "leg:1" });
  await renderPage();
  expect(screen.getByText("Vista open leg:1")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Close mocked Vista"));
  expect(mockSetParams).toHaveBeenCalledWith({ vista: undefined, formationFocus: undefined });
  expect(screen.getByText("Vista closed")).toBeTruthy();
});

test("Vista focus route parsing rejects malformed intent", () => {
  expect(parseVistaFocus("summit")).toEqual({ kind: "summit" });
  expect(parseVistaFocus("leg:2")).toEqual({ kind: "leg", sectionIndex: 2 });
  expect(parseVistaFocus("leg:-1")).toBeNull();
  expect(parseVistaFocus("other")).toBeNull();
});
