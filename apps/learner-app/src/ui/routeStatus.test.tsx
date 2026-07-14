import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RouteStatus } from "./routeStatus";

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 }
};

function renderStatus(ui: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{ui}</SafeAreaProvider>);
}

test("a loading tone exposes an accessible progress state named by its title", async () => {
  await renderStatus(<RouteStatus tone="loading" title="Loading your journal…" />);
  // The title doubles as the ActivityIndicator's accessible label and the visible headline,
  // so a screen reader announces progress rather than an unlabeled spinner.
  expect(screen.getByLabelText("Loading your journal…")).toBeTruthy();
  expect(screen.getByText("Loading your journal…")).toBeTruthy();
});

test("an error tone renders title, message, and every recovery action", async () => {
  const retry = jest.fn();
  const signOut = jest.fn();
  await renderStatus(
    <RouteStatus
      tone="error"
      title="Your journal didn’t load"
      message="You’re still signed in."
      actions={[
        { label: "Retry", onPress: retry },
        { label: "Log out", variant: "outline", onPress: signOut }
      ]}
    />
  );
  expect(screen.getByText("Your journal didn’t load")).toBeTruthy();
  expect(screen.getByText("You’re still signed in.")).toBeTruthy();
  await fireEvent.press(screen.getByText("Retry"));
  await fireEvent.press(screen.getByText("Log out"));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(signOut).toHaveBeenCalledTimes(1);
});

test("an unavailable tone shows no spinner and a single way forward", async () => {
  const back = jest.fn();
  await renderStatus(
    <RouteStatus tone="unavailable" title="This expedition isn’t available." actions={[{ label: "Return to trail", onPress: back }]} />
  );
  expect(screen.getByText("This expedition isn’t available.")).toBeTruthy();
  // No accessible progress element for a settled unavailable state.
  expect(screen.queryByLabelText("This expedition isn’t available.")).toBeNull();
  await fireEvent.press(screen.getByText("Return to trail"));
  expect(back).toHaveBeenCalledTimes(1);
});
