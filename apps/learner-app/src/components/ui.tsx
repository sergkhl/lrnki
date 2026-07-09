import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

// Small journal-themed primitives replacing the shadcn kit (rule 15 rescopes shadcn to
// Admin Lab). One variant map keeps every button/badge on the same palette across
// native and web.

export type ButtonVariant = "primary" | "secondary" | "outline" | "destructive";

const BUTTON_BOX: Record<ButtonVariant, string> = {
  primary: "bg-trail",
  secondary: "bg-gem-soft",
  outline: "border border-line bg-card",
  destructive: "bg-destructive"
};

const BUTTON_TEXT: Record<ButtonVariant, string> = {
  primary: "text-[#fdfaf2]",
  secondary: "text-ink",
  outline: "text-ink",
  destructive: "text-[#fdfaf2]"
};

export function buttonTextClass(variant: ButtonVariant): string {
  return BUTTON_TEXT[variant];
}

export function Btn({
  variant = "primary",
  disabled = false,
  onPress,
  label,
  icon,
  className,
  textClassName,
  accessibilityLabel
}: Readonly<{
  variant?: ButtonVariant;
  disabled?: boolean;
  onPress: () => void;
  label: string;
  icon?: ReactNode;
  className?: string;
  textClassName?: string;
  accessibilityLabel?: string;
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      className={`flex-row items-center justify-center gap-2 rounded-xl px-4 py-2.5 ${BUTTON_BOX[variant]} ${disabled ? "opacity-50" : "active:opacity-80"} ${className ?? ""}`}
    >
      {icon}
      <Text className={`text-sm font-medium ${BUTTON_TEXT[variant]} ${textClassName ?? ""}`}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
  return <View className={`rounded-xl border border-line bg-card p-4 ${className ?? ""}`}>{children}</View>;
}

export function CardTitle({ children }: Readonly<{ children: ReactNode }>) {
  return <Text className="text-lg font-semibold text-ink">{children}</Text>;
}

export function CardDescription({ children }: Readonly<{ children: ReactNode }>) {
  return <Text className="text-sm text-muted">{children}</Text>;
}

export function BadgeLabel({ children, className, textClassName }: Readonly<{ children: ReactNode; className?: string; textClassName?: string }>) {
  return (
    <View className={`self-start rounded-full border border-line bg-card px-2.5 py-0.5 ${className ?? ""}`}>
      <Text className={`text-xs font-medium text-ink ${textClassName ?? ""}`}>{children}</Text>
    </View>
  );
}

// Determinate + indeterminate progress. RN has no <progress>; a fraction of null renders
// the pulsing indeterminate bar the generation cards use while queued.
export function ProgressBar({ fraction }: Readonly<{ fraction: number | null }>) {
  return (
    <View className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <View
        className="h-full rounded-full bg-gem"
        style={{ width: fraction === null ? "35%" : `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`, opacity: fraction === null ? 0.5 : 1 }}
      />
    </View>
  );
}
