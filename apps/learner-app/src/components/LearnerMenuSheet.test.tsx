import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { PortalHost } from "@rn-primitives/portal";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LearnerMenuSheet } from "./LearnerMenuSheet";
import { learnerTerm } from "@/learn/vocabulary";

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 }
};

const handlers = {
  onOpenChange: jest.fn(),
  onOpenBoard: jest.fn(),
  onLogout: jest.fn()
};

beforeEach(() => {
  jest.clearAllMocks();
});

function renderMenu(boardAvailable = true) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <LearnerMenuSheet
        open
        onOpenChange={handlers.onOpenChange}
        boardAvailable={boardAvailable}
        onOpenBoard={handlers.onOpenBoard}
        onLogout={handlers.onLogout}
      />
      <PortalHost />
    </SafeAreaProvider>
  );
}

test("the menu exposes Board and logout rows", async () => {
  await renderMenu();
  expect(screen.getByLabelText(learnerTerm("viewBoard"))).toBeTruthy();
  expect(screen.getByLabelText(learnerTerm("logoutAction"))).toBeTruthy();
});

test("opening the Board closes the menu first — no stacked overlays", async () => {
  await renderMenu();
  await fireEvent.press(screen.getByLabelText(learnerTerm("viewBoard")));
  expect(handlers.onOpenChange).toHaveBeenCalledWith(false);
  expect(handlers.onOpenBoard).toHaveBeenCalledTimes(1);
});

test("an unavailable board disables its row without hiding it", async () => {
  await renderMenu(false);
  const row = screen.getByLabelText(learnerTerm("viewBoard"));
  expect(row.props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(row);
  expect(handlers.onOpenBoard).not.toHaveBeenCalled();
});

test("logout hands off through the same close-first path", async () => {
  await renderMenu();
  await fireEvent.press(screen.getByLabelText(learnerTerm("logoutAction")));
  expect(handlers.onOpenChange).toHaveBeenCalledWith(false);
  expect(handlers.onLogout).toHaveBeenCalledTimes(1);
});
