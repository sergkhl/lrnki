// Motion policy (KTD6, R14, R16): every timed transform in the learner app reads its
// duration here, and every animated surface consults the SAME reduced-motion source.
// Reduced motion swaps presentation only — state transitions and completion callbacks
// never ride on an animation finishing.
import {
  createElement,
  forwardRef,
  type ComponentPropsWithRef,
  type ElementType,
  type ForwardRefExoticComponent,
  type PropsWithoutRef,
  type RefAttributes
} from "react";
import { type StyleProp, type View, type ViewStyle } from "react-native";
import Animated, { type AnimatedStyle, useReducedMotion as useReanimatedReducedMotion } from "react-native-reanimated";
import { styled } from "nativewind";

type StyledAnimatedProps<Component extends ElementType> = Omit<ComponentPropsWithRef<Component>, "className" | "style"> &
  Readonly<{
    className?: string;
    style?: StyleProp<ViewStyle>;
    animatedStyle?: AnimatedStyle<ViewStyle>;
  }>;

type StyledAnimatedComponent<Component extends ElementType> = ForwardRefExoticComponent<
  PropsWithoutRef<StyledAnimatedProps<Component>> & RefAttributes<View>
>;

// NativeWind resolves className plus ordinary inline style on the outer wrapper. The bridge keeps
// Reanimated's opaque handle out of that resolver, then combines both entries only at the terminal
// animated component. Static styles therefore retain normal NativeWind precedence while worklets
// exclusively own the dynamic properties they return.
export function createStyledAnimatedComponent<Component extends ElementType>(
  component: Component
): StyledAnimatedComponent<Component> {
  type Props = StyledAnimatedProps<Component>;

  const SplitStyleBridge = forwardRef<View, Props>(function SplitStyleBridge(incomingProps, ref) {
    const { animatedStyle, style: resolvedStaticStyle, ...rest } = incomingProps as Props;
    return createElement(component, {
      ...rest,
      ref,
      style: [resolvedStaticStyle, animatedStyle]
    } as ComponentPropsWithRef<Component>);
  });

  return styled(SplitStyleBridge) as unknown as StyledAnimatedComponent<Component>;
}

export const AnimatedView = createStyledAnimatedComponent(Animated.View);

/** Durations in ms. `press` is the press-in acknowledgement; `standard` covers
 * disclosures and small layout reveals; `overlay` is dialog/sheet entrance;
 * `celebration` paces facet assembly steps; `emphasis` is the one-shot next-stop halo. */
export const MOTION = {
  press: 90,
  standard: 200,
  overlay: 220,
  nudge: 70,
  celebration: 340,
  emphasis: 900
} as const;

/** Press-in scale for PressableSurface — restrained and layout-stable (AE1). */
export const PRESS_SCALE = 0.97;

/** The one shared reduced-motion policy (R16): the OS/browser preference via Reanimated.
 * There is deliberately no app-specific motion setting. */
export function useReducedMotion(): boolean {
  return useReanimatedReducedMotion();
}
