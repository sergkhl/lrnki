import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { createRef } from "react";
import { Text as RNText, type View as ViewType } from "react-native";
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
  expect(surface.props.className).toContain("bg-muted-panel");
  await fireEvent(surface, "pressOut");
  await fireEvent.press(surface);
  expect(screen.getByText("idle")).toBeTruthy();
  expect(screen.getByTestId("surface").props.className).not.toContain("bg-muted-panel");
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("keeps caller layout styles static while scale remains an opaque animated entry", async () => {
  const ref = createRef<ViewType>();
  const dimensions = { width: 72, height: 72 };
  await render(
    <PressableSurface ref={ref} testID="surface" accessibilityLabel="Checkpoint" style={dimensions} onPress={() => {}}>
      <RNText>checkpoint</RNText>
    </PressableSurface>
  );

  const surface = screen.getByTestId("surface");
  expect(surface.props.style[0]).toBe(dimensions);
  expect(surface.props.style[1]).toEqual({ transform: [{ scale: 1 }] });
  expect(surface.props.accessibilityState).toEqual({
    disabled: false,
    busy: false,
    selected: undefined,
    expanded: undefined
  });
  expect(ref.current).toBeTruthy();
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
  expect(Haptics.impactAsync).not.toHaveBeenCalled();
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

test.each([
  { variant: "primary" as const, shellClass: "bg-trail" },
  { variant: "secondary" as const, shellClass: "bg-gem-soft" },
  { variant: "outline" as const, shellClass: "border-line-strong" },
  { variant: "destructive" as const, shellClass: "bg-destructive" }
])("Button keeps its $variant semantic shell at the shared press surface", async ({ variant, shellClass }) => {
  await render(<Button testID="button" label="Continue" variant={variant} onPress={() => {}} />);
  const className = screen.getByTestId("button").props.className ?? "";
  expect(className).toContain("h-control");
  expect(className).toContain(shellClass);
});

test("a compact Button retains the shared minimum target class", async () => {
  await render(<Button testID="button" label="Continue" size="compact" onPress={() => {}} />);
  expect(screen.getByTestId("button").props.className ?? "").toContain("h-target");
});

test("a selection haptic fires one perceptible light impact per accepted press", async () => {
  const onPress = jest.fn();
  await render(<Button testID="button" label="Pick" haptic="selection" onPress={onPress} />);
  await fireEvent.press(screen.getByTestId("button"));
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.selectionAsync).not.toHaveBeenCalled();
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
