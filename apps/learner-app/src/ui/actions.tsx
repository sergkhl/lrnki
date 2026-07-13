// The one press surface (KTD3): buttons, tiles, circles, rows, and Vista targets all
// compose PressableSurface, so pressed / disabled / selected / expanded / busy state,
// focus visibility, haptic intent, and the restrained press transform live here once.
import { forwardRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  View,
  type AccessibilityRole,
  type GestureResponderEvent,
  type StyleProp,
  type View as ViewType,
  type ViewStyle
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { cssInterop } from "nativewind";
import { triggerHaptic, type HapticIntent } from "./feedback";
import { MOTION, PRESS_SCALE, useReducedMotion } from "./motion";
import { colors } from "./tokens";
import { AppText, type TextVariant } from "./foundation";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
// Custom animated components need explicit NativeWind registration or their className
// is dropped entirely (see the note in motion.ts).
cssInterop(AnimatedPressable, { className: "style" });

export type PressableSurfaceProps = Readonly<{
  onPress: () => void;
  children: ReactNode | ((state: { pressed: boolean }) => ReactNode);
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityHint?: string;
  disabled?: boolean;
  busy?: boolean;
  selected?: boolean;
  expanded?: boolean;
  haptic?: HapticIntent;
  className?: string;
  /** Extra classes applied only while pressed (surface-color / elevation change, AE1). */
  pressedClassName?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

/** Low-level interactive surface. Press-in scales down immediately (skipped under
 * reduced motion), the action fires once on release, and busy/disabled surfaces stay
 * still, announce their state, and never invoke the action or a haptic. */
export const PressableSurface = forwardRef<ViewType, PressableSurfaceProps>(function PressableSurface(
  {
    onPress,
    children,
    accessibilityLabel,
    accessibilityRole = "button",
    accessibilityHint,
    disabled = false,
    busy = false,
    selected,
    expanded,
    haptic,
    className,
    pressedClassName,
    style,
    testID
  },
  ref
) {
  const reduceMotion = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);
  const interactive = !disabled && !busy;

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const handlePressIn = () => {
    if (!interactive) return;
    setPressed(true);
    if (!reduceMotion) scale.set(withTiming(PRESS_SCALE, { duration: MOTION.press }));
  };
  const handlePressOut = () => {
    setPressed(false);
    scale.set(withTiming(1, { duration: MOTION.press }));
  };
  const handlePress = (event: GestureResponderEvent) => {
    void event;
    if (!interactive) return;
    if (haptic) triggerHaptic(haptic);
    onPress();
  };

  return (
    <AnimatedPressable
      ref={ref}
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !interactive, busy, selected, expanded }}
      aria-expanded={expanded}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      // Visible keyboard focus on web (R4) via :focus-visible only — pointer/touch
      // presses and persistent selection never draw the outline box.
      className={`web:focus-visible:outline web:focus-visible:outline-2 web:focus-visible:outline-offset-2 web:focus-visible:outline-frontier ${className ?? ""} ${pressed && pressedClassName ? pressedClassName : ""}`}
      style={[animatedStyle, style]}
    >
      {typeof children === "function" ? children({ pressed }) : children}
    </AnimatedPressable>
  );
});

export type ButtonVariant = "primary" | "secondary" | "outline" | "destructive";

const BUTTON_BOX: Record<ButtonVariant, string> = {
  primary: "bg-trail",
  secondary: "bg-gem-soft",
  outline: "border border-line-strong bg-card",
  destructive: "bg-destructive"
};

const BUTTON_PRESSED: Record<ButtonVariant, string> = {
  primary: "bg-secured",
  secondary: "bg-gem-soft opacity-90",
  outline: "bg-muted-panel",
  destructive: "opacity-90"
};

const BUTTON_TEXT_COLOR: Record<ButtonVariant, "on-accent" | "ink"> = {
  primary: "on-accent",
  secondary: "ink",
  outline: "ink",
  destructive: "on-accent"
};

/** Icon foreground hex for a button variant, so callers never repeat palette values. */
export function buttonIconColor(variant: ButtonVariant): string {
  return BUTTON_TEXT_COLOR[variant] === "on-accent" ? colors["on-accent"] : colors.ink;
}

export function Button({
  variant = "primary",
  size = "default",
  disabled = false,
  busy = false,
  onPress,
  label,
  icon,
  haptic,
  accessibilityLabel,
  className,
  testID
}: Readonly<{
  variant?: ButtonVariant;
  size?: "default" | "compact";
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
  label: string;
  icon?: ReactNode;
  haptic?: HapticIntent;
  accessibilityLabel?: string;
  className?: string;
  testID?: string;
}>) {
  const height = size === "default" ? "h-control" : "h-target";
  const textVariant: TextVariant = "label";
  return (
    <PressableSurface
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      busy={busy}
      haptic={haptic}
      onPress={onPress}
      className={`${height} flex-row items-center justify-center gap-2 rounded-control px-4 ${BUTTON_BOX[variant]} ${disabled ? "opacity-50" : ""} ${className ?? ""}`}
      pressedClassName={BUTTON_PRESSED[variant]}
    >
      {/* Busy keeps the label footprint (dimensions stay stable) and overlays a spinner. */}
      <View className={`flex-row items-center justify-center gap-2 ${busy ? "opacity-0" : ""}`}>
        {icon}
        <AppText variant={textVariant} color={BUTTON_TEXT_COLOR[variant]}>
          {label}
        </AppText>
      </View>
      {busy ? (
        <View className="absolute inset-0 items-center justify-center">
          <ActivityIndicator size="small" color={buttonIconColor(variant)} />
        </View>
      ) : null}
    </PressableSurface>
  );
}

/** Icon-only control: the accessible name is REQUIRED and the hit target never drops
 * below the 44px minimum regardless of the rendered icon size. */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  disabled = false,
  busy = false,
  expanded,
  variant = "outline",
  haptic,
  className,
  testID
}: Readonly<{
  icon: ReactNode;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** For a disclosure toggle: announces the expanded/collapsed state (aria-expanded). */
  expanded?: boolean;
  variant?: ButtonVariant | "bare";
  haptic?: HapticIntent;
  className?: string;
  testID?: string;
}>) {
  const box = variant === "bare" ? "" : `rounded-control ${BUTTON_BOX[variant]}`;
  const pressedBox = variant === "bare" ? "opacity-70" : BUTTON_PRESSED[variant];
  return (
    <PressableSurface
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      busy={busy}
      expanded={expanded}
      haptic={haptic}
      onPress={onPress}
      className={`h-target w-target items-center justify-center ${box} ${disabled ? "opacity-50" : ""} ${className ?? ""}`}
      pressedClassName={pressedBox}
    >
      {busy ? <ActivityIndicator size="small" color={colors.ink} /> : icon}
    </PressableSurface>
  );
}
