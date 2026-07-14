// Foundation pieces (R1/R2): route shell, the app-owned Text, surfaces, form input,
// and progress. Every learner surface reads type + color through these variants, so
// the semantic scale has exactly one definition.
import { useState, type ReactNode } from "react";
import {
  Text as RNText,
  TextInput as RNTextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from "react-native-reanimated";
import { useEffect } from "react";
import { colors } from "./tokens";
import { AnimatedView, useReducedMotion } from "./motion";

export type TextVariant = "display" | "heading" | "title" | "label" | "body" | "caption";
export type TextColor = "ink" | "muted" | "destructive" | "on-accent" | "trail" | "award";

const TEXT_VARIANT_CLASS: Record<TextVariant, string> = {
  display: "text-3xl font-semibold tracking-tight",
  heading: "text-xl font-semibold",
  title: "text-base font-semibold",
  label: "text-sm font-medium",
  body: "text-base leading-7",
  caption: "text-xs"
};

const TEXT_COLOR_CLASS: Record<TextColor, string> = {
  ink: "text-ink",
  muted: "text-muted",
  destructive: "text-destructive",
  "on-accent": "text-on-accent",
  trail: "text-trail",
  award: "text-award"
};

export type AppTextProps = TextProps &
  Readonly<{
    variant?: TextVariant;
    color?: TextColor;
    className?: string;
  }>;

/** The only Text learner surfaces may render (R3). Forwards every React Native Text
 * prop — nesting, numberOfLines, font scaling, accessibility — unchanged. */
export function AppText({ variant = "body", color, className, children, ...rest }: AppTextProps) {
  const colorClass = color ? TEXT_COLOR_CLASS[color] : color === undefined && variant === "caption" ? "text-muted" : "text-ink";
  return (
    <RNText {...rest} className={`${TEXT_VARIANT_CLASS[variant]} ${colorClass} ${className ?? ""}`}>
      {children}
    </RNText>
  );
}

/** Safe-area route shell: every screen gets the journal background and top inset. */
export function Screen({
  children,
  edges = ["top"],
  className
}: Readonly<{ children: ReactNode; edges?: ("top" | "bottom")[]; className?: string }>) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className={`flex-1 bg-background ${className ?? ""}`}
      style={{
        paddingTop: edges.includes("top") ? insets.top : 0,
        paddingBottom: edges.includes("bottom") ? insets.bottom : 0
      }}
    >
      {children}
    </View>
  );
}

export function Card({
  children,
  className,
  style
}: Readonly<{ children: ReactNode; className?: string; style?: StyleProp<ViewStyle> }>) {
  return (
    <View className={`rounded-card border border-line bg-card p-4 ${className ?? ""}`} style={style}>
      {children}
    </View>
  );
}

export function Badge({
  children,
  className,
  textClassName
}: Readonly<{ children: ReactNode; className?: string; textClassName?: string }>) {
  return (
    <View className={`self-start rounded-full border border-line bg-card px-2.5 py-0.5 ${className ?? ""}`}>
      <AppText variant="caption" className={`font-medium text-ink ${textClassName ?? ""}`}>
        {children}
      </AppText>
    </View>
  );
}

export type InputProps = Omit<TextInputProps, "style"> &
  Readonly<{
    label: string;
    hint?: string;
    error?: string | null;
    className?: string;
    inputStyle?: StyleProp<TextStyle>;
  }>;

/** Labelled input: label + hint stay attached to the field for screen readers, error
 * recolors the boundary, and focus is visible without hover (R4). */
export function Input({ label, hint, error, className, inputStyle, ...rest }: InputProps) {
  const [focused, setFocused] = useState(false);
  const border = error ? "border-destructive" : focused ? "border-frontier" : "border-line-strong";
  return (
    <View className={`gap-1.5 ${className ?? ""}`}>
      <AppText variant="label">{label}</AppText>
      <RNTextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        placeholderTextColor={colors.muted}
        {...rest}
        onFocus={(event) => {
          setFocused(true);
          rest.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          rest.onBlur?.(event);
        }}
        className={`min-h-control rounded-control border bg-card px-3 py-2.5 text-base text-ink ${border}`}
        style={inputStyle}
      />
      {error ? (
        <AppText variant="caption" color="destructive">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

/** Determinate + indeterminate progress. Determinate announces its value; indeterminate
 * sweeps a bounded segment — and becomes a static track under reduced motion (R16). */
export function Progress({
  fraction,
  accessibilityLabel,
  className
}: Readonly<{ fraction: number | null; accessibilityLabel?: string; className?: string }>) {
  const clamped = fraction === null ? null : Math.min(1, Math.max(0, fraction));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={clamped === null ? undefined : { min: 0, max: 100, now: Math.round(clamped * 100) }}
      className={`h-1.5 w-full overflow-hidden rounded-full bg-line ${className ?? ""}`}
    >
      {clamped === null ? <IndeterminateSweep /> : <View className="h-full rounded-full bg-gem" style={{ width: `${Math.round(clamped * 100)}%` }} />}
    </View>
  );
}

function IndeterminateSweep() {
  const reduceMotion = useReducedMotion();
  const shift = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    shift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.quad) })
      ),
      -1
    );
    return () => {
      shift.value = 0;
    };
  }, [reduceMotion, shift]);
  const animatedStyle = useAnimatedStyle(() => ({
    // The track is bounded: the 35% segment translates inside the 100% rail.
    transform: [{ translateX: `${shift.value * 185}%` }]
  }));
  if (reduceMotion) {
    return <View className="h-full w-[35%] rounded-full bg-gem opacity-60" />;
  }
  return <AnimatedView className="h-full w-[35%] rounded-full bg-gem opacity-80" style={animatedStyle} />;
}
