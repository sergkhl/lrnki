import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { Text as RNText } from "react-native";
import { Button, IconButton, PressableSurface } from "./actions";

beforeEach(() => {
  jest.clearAllMocks();
});

test("an enabled PressableSurface enters pressed state on press-in and fires once on release", async () => {
  const onPress = jest.fn();
  await render(
    <PressableSurface testID="surface" accessibilityLabel="Go" onPress={onPress} pressedClassName="bg-muted-panel">
      {({ pressed }) => <RNText>{pressed ? "pressed" : "idle"}</RNText>}
    </PressableSurface>
  );
  const surface = screen.getByTestId("surface");
  await fireEvent(surface, "pressIn");
  expect(screen.getByText("pressed")).toBeTruthy();
  await fireEvent(surface, "pressOut");
  await fireEvent.press(surface);
  expect(screen.getByText("idle")).toBeTruthy();
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("a disabled surface announces disabled state and never invokes action or haptic", async () => {
  const onPress = jest.fn();
  await render(
    <PressableSurface testID="surface" accessibilityLabel="Go" disabled haptic="selection" onPress={onPress}>
      <RNText>content</RNText>
    </PressableSurface>
  );
  const surface = screen.getByTestId("surface");
  expect(surface.props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(surface);
  expect(onPress).not.toHaveBeenCalled();
  expect(Haptics.selectionAsync).not.toHaveBeenCalled();
});

test("a busy button blocks duplicate actions, announces busy, and keeps its label mounted", async () => {
  const onPress = jest.fn();
  await render(<Button testID="button" label="Continue" busy onPress={onPress} />);
  const button = screen.getByTestId("button");
  expect(button.props.accessibilityState.busy).toBe(true);
  await fireEvent.press(button);
  expect(onPress).not.toHaveBeenCalled();
  // The label keeps its footprint (hidden, not unmounted) so dimensions stay stable.
  expect(screen.getByText("Continue")).toBeTruthy();
});

test("a haptic intent fires exactly once per accepted press", async () => {
  const onPress = jest.fn();
  await render(<Button testID="button" label="Pick" haptic="selection" onPress={onPress} />);
  await fireEvent.press(screen.getByTestId("button"));
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
});

test("selected and expanded surface states are exposed to accessibility", async () => {
  await render(
    <PressableSurface testID="surface" accessibilityLabel="Row" selected expanded onPress={() => {}}>
      <RNText>row</RNText>
    </PressableSurface>
  );
  const state = screen.getByTestId("surface").props.accessibilityState;
  expect(state.selected).toBe(true);
  expect(state.expanded).toBe(true);
});

test("IconButton requires an accessible name and meets the minimum target box", async () => {
  await render(<IconButton testID="icon" icon={<RNText>x</RNText>} accessibilityLabel="Close" onPress={() => {}} />);
  const icon = screen.getByLabelText("Close");
  expect(icon).toBeTruthy();
  // h-target/w-target map to the 44px token; the class contract is what keeps the box.
  expect(screen.getByTestId("icon").props.className ?? "").toContain("h-target");
  expect(screen.getByTestId("icon").props.className ?? "").toContain("w-target");
});
