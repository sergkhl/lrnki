import { expect, test } from "@jest/globals";
import { styled } from "nativewind";
import { Pressable } from "react-native";
import Animated from "react-native-reanimated";
import { Button } from "./actions";
import { AnimatedView } from "./motion";

test("passes class styles through class-bearing Reanimated surfaces", () => {
  // This locks the shared wiring rather than pretending Jest can render NativeWind styles.
  // The physical Android gate remains the authority for the resulting pixels and worklets.
  expect(styled).toHaveBeenCalledWith(Animated.View, { className: "style" }, { passThrough: true });
  expect(styled).toHaveBeenCalledWith(Pressable, { className: "style" }, { passThrough: true });
  expect(AnimatedView).toBe(Animated.View);
  expect(Button).toBeDefined();
});
