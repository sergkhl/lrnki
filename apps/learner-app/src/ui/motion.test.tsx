import { expect, jest, test } from "@jest/globals";
import { createRef } from "react";
import { render, screen } from "@testing-library/react-native";
import { styled } from "nativewind";
import { Pressable, type View as ViewType } from "react-native";
import Animated from "react-native-reanimated";
import { Button } from "./actions";
import { AnimatedView } from "./motion";

test("styles split bridges instead of inspecting Reanimated components directly", () => {
  const styledTargets = jest.mocked(styled).mock.calls.map(([target]) => target);
  expect(styledTargets).toContain(AnimatedView);
  expect(styledTargets).not.toContain(Animated.View);
  expect(styledTargets).not.toContain(Pressable);
  expect(AnimatedView).not.toBe(Animated.View);
  expect(Button).toBeDefined();
});

test("keeps resolved static and opaque animated styles separate at the terminal component", async () => {
  const staticStyle = { width: 72, height: 72 };
  const animatedStyle = { opacity: 0.5 };

  await render(
    <AnimatedView testID="split-surface" className="rounded-full bg-frontier" style={staticStyle} animatedStyle={animatedStyle} />
  );

  const terminal = screen.getByTestId("split-surface");
  expect(terminal.props.className).toContain("rounded-full");
  expect(terminal.props.style).toEqual([staticStyle, animatedStyle]);
});

test("supports static-only, animated-only, and layout-entrance-only surfaces", async () => {
  const staticStyle = { width: 64 };
  const staticSurface = await render(<AnimatedView testID="static-only" style={staticStyle} />);
  expect(screen.getByTestId("static-only").props.style).toEqual([staticStyle, undefined]);
  await staticSurface.unmount();

  const animatedStyle = { opacity: 0.75 };
  const animatedSurface = await render(<AnimatedView testID="animated-only" animatedStyle={animatedStyle} />);
  expect(screen.getByTestId("animated-only").props.style).toEqual([undefined, animatedStyle]);
  await animatedSurface.unmount();

  const entering = { direction: "down", duration: 220 };
  await render(<AnimatedView testID="entrance-only" entering={entering as never} />);
  expect(screen.getByTestId("entrance-only").props.entering).toBe(entering);
  expect(screen.getByTestId("entrance-only").props.style).toEqual([undefined, undefined]);
});

test("forwards refs through the styled split bridge", async () => {
  const ref = createRef<ViewType>();
  await render(<AnimatedView ref={ref} testID="ref-surface" />);
  expect(ref.current).toBeTruthy();
});
