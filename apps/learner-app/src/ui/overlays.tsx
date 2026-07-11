// Overlay presentation (KTD4, R8-R10): Dialog and FullScreenDialog share RN Primitives
// behavior (focus trap + restoration and Escape on web, portal layering on native), one
// OverlayHeader with a circular semantic icon, and one dismissal contract. A pending
// mutation blocks every dismissal input via `dismissBlocked`.
import { useEffect, type ComponentType, type ReactNode } from "react";
import { BackHandler, Platform, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as DialogPrimitive from "@rn-primitives/dialog";
import { X } from "lucide-react-native";
import { AppText } from "./foundation";
import { IconButton } from "./actions";
import { MOTION, useReducedMotion } from "./motion";
import { colors } from "./tokens";

type IconComponent = ComponentType<{ size?: number; color?: string }>;

/** The circular semantic icon header every overlay renders (R8). Activity overlays pass
 * the same icon + tone the opening checkpoint used, so trigger and header match (AE3). */
export function OverlayHeader({
  icon,
  iconTone = "soft",
  title,
  description,
  onClose,
  closeLabel = "Close",
  closeDisabled = false
}: Readonly<{
  icon: ReactNode;
  iconTone?: "soft" | "solid" | "frontier";
  title: string;
  description?: string | null;
  onClose?: () => void;
  closeLabel?: string;
  closeDisabled?: boolean;
}>) {
  const tone =
    iconTone === "solid" ? "bg-gem" : iconTone === "frontier" ? "border-2 border-frontier bg-card" : "bg-gem-soft";
  return (
    <View className="flex-row items-center gap-3 border-b border-line bg-card px-4 py-3">
      <View className={`h-target w-target shrink-0 items-center justify-center rounded-full ${tone}`}>{icon}</View>
      <View className="min-w-0 flex-1">
        <AppText variant="title" numberOfLines={2}>
          {title}
        </AppText>
        {description ? (
          <AppText variant="caption" color="muted" numberOfLines={2}>
            {description}
          </AppText>
        ) : null}
      </View>
      {onClose ? (
        <IconButton
          icon={<X size={20} color={colors.ink} />}
          accessibilityLabel={closeLabel}
          variant="bare"
          disabled={closeDisabled}
          onPress={onClose}
        />
      ) : null}
    </View>
  );
}

/** Android hardware back inside an open overlay: close unless a mutation blocks it. */
function useHardwareBack(open: boolean, blocked: boolean, close: () => void) {
  useEffect(() => {
    if (!open || Platform.OS === "web") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!blocked) close();
      return true;
    });
    return () => subscription.remove();
  }, [open, blocked, close]);
}

/** Overlay entrance (R14): a restrained fade + short rise played once when the overlay
 * content mounts. Reduced motion renders the settled state immediately; dismissal stays
 * instant, so no state or callback ever waits on this. */
function OverlayEntrance({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (!reduceMotion) progress.set(withTiming(1, { duration: MOTION.overlay }));
    // Mount-only entrance by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * 12 }]
  }));
  return (
    <Animated.View className={className} style={style}>
      {children}
    </Animated.View>
  );
}

export type OverlayProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** True while a pending mutation must keep the overlay mounted (AE4). */
  dismissBlocked?: boolean;
  children: ReactNode;
}>;

/** Centered adaptive dialog (Board, celebrations): close control, Escape / system back,
 * and backdrop press all honor `dismissBlocked`. */
export function Dialog({ open, onOpenChange, dismissBlocked = false, children }: OverlayProps) {
  const requestClose = (next: boolean) => {
    if (!next && dismissBlocked) return;
    onOpenChange(next);
  };
  useHardwareBack(open, dismissBlocked, () => onOpenChange(false));
  return (
    <DialogPrimitive.Root open={open} onOpenChange={requestClose}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          closeOnPress={!dismissBlocked}
          className="absolute inset-0 items-center justify-center bg-black/40 p-4"
          style={Platform.OS === "web" ? ({ position: "fixed" } as object) : undefined}
        >
          <DialogPrimitive.Content className="max-h-[85%] w-full max-w-md overflow-hidden rounded-overlay border border-line bg-card">
            <OverlayEntrance>{children}</OverlayEntrance>
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Full-screen activity surface (study, Vista): explicit close and system back only —
 * there is no backdrop, so content owns the whole canvas (R9). */
export function FullScreenDialog({ open, onOpenChange, dismissBlocked = false, children }: OverlayProps) {
  const requestClose = (next: boolean) => {
    if (!next && dismissBlocked) return;
    onOpenChange(next);
  };
  useHardwareBack(open, dismissBlocked, () => onOpenChange(false));
  return (
    <DialogPrimitive.Root open={open} onOpenChange={requestClose}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          closeOnPress={false}
          className="absolute inset-0"
          style={Platform.OS === "web" ? ({ position: "fixed" } as object) : undefined}
        >
          <DialogPrimitive.Content className="flex-1 bg-background">
            <OverlayEntrance className="flex-1">{children}</OverlayEntrance>
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export type { IconComponent };
