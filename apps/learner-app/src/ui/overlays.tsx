// Overlay presentation (KTD4, R8-R10): Dialog and FullScreenDialog share RN Primitives
// behavior (focus trap + restoration and Escape on web, portal layering on native), one
// OverlayHeader with a circular semantic icon, and one dismissal contract. A pending
// mutation blocks every dismissal input via `dismissBlocked`.
import { useEffect, type ComponentType, type ReactNode } from "react";
import { BackHandler, Platform, ScrollView, View } from "react-native";
import { FadeInDown, FadeInRight } from "react-native-reanimated";
import * as DialogPrimitive from "@rn-primitives/dialog";
import { X } from "lucide-react-native";
import { AppText } from "./foundation";
import { IconButton } from "./actions";
import { AnimatedView, MOTION, useReducedMotion } from "./motion";
import { colors } from "./tokens";

type IconComponent = ComponentType<{ size?: number; color?: string }>;

const OVERLAY_ENTRANCE = {
  bottom: FadeInDown.duration(MOTION.overlay),
  right: FadeInRight.duration(MOTION.overlay)
};

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

/** The centered dialog's shrinkable middle region (plan 2026-07-13-002 U3, KTD9). The
 * anatomy is FIXED header (OverlayHeader), THIS scrollable body, then DialogFooter: the
 * body carries `flex-1 min-h-0` so at constrained heights it — never the actions — gives
 * up space and scrolls. Consumers must not add their own bounded wrapper (the former
 * `max-h-96` reflow-clipping problem class). */
export function DialogBody({
  children,
  contentClassName
}: Readonly<{ children: ReactNode; contentClassName?: string }>) {
  return (
    <ScrollView testID="dialog-body" className="min-h-0 flex-1" contentContainerClassName={contentClassName ?? "gap-3 p-4"}>
      {children}
    </ScrollView>
  );
}

/** The centered dialog's always-reachable action region (KTD9): fixed below the body,
 * so no action can be pushed off-screen by long content. */
export function DialogFooter({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
  return <View className={`shrink-0 gap-2 border-t border-line bg-card p-4 ${className ?? ""}`}>{children}</View>;
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

/** Overlay entrance (R14): a restrained fade + short slide played once when the overlay
 * content mounts. The base view has no opacity or transform override, so a missing or
 * non-running worklet leaves content in its settled, visible structural state. */
export function OverlayEntrance({
  children,
  className,
  slideFrom = "bottom"
}: Readonly<{ children: ReactNode; className?: string; slideFrom?: "bottom" | "right" }>) {
  const reduceMotion = useReducedMotion();
  const entering = reduceMotion ? undefined : OVERLAY_ENTRANCE[slideFrom];
  return (
    <AnimatedView className={className} entering={entering}>
      {children}
    </AnimatedView>
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
          {/* The bounded dialog column (KTD9): Content caps the height; the entrance
              wrapper and DialogBody carry `flex-1 min-h-0` so the BODY shrinks and
              scrolls while the header and DialogFooter actions stay reachable. On web
              the primitive inserts an unstyled auto-height focus wrapper between
              Overlay and Content, so a percentage max-height resolves against the
              dialog's own natural height and always clips it — cap by viewport there. */}
          <DialogPrimitive.Content
            className="max-h-[85%] w-full max-w-md overflow-hidden rounded-overlay border border-line bg-card"
            style={Platform.OS === "web" ? ({ maxHeight: "85vh" } as object) : undefined}
          >
            <OverlayEntrance className="min-h-0 flex-1">{children}</OverlayEntrance>
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
          {/* absolute, not flex-1: the web primitive inserts an unstyled focus wrapper
              between Overlay and Content, so stretch-based sizing collapses there. */}
          <DialogPrimitive.Content className="absolute inset-0 bg-background">
            <OverlayEntrance className="flex-1">{children}</OverlayEntrance>
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Right-anchored drawer (journal menu): same primitive dismissal contract as Dialog —
 * close control, Escape / system back, and backdrop press all honor `dismissBlocked` —
 * anchored to the edge its top-right trigger lives on. */
export function SideSheet({ open, onOpenChange, dismissBlocked = false, children }: OverlayProps) {
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
          className="absolute inset-0 bg-black/40"
          style={Platform.OS === "web" ? ({ position: "fixed" } as object) : undefined}
        >
          <DialogPrimitive.Content className="absolute bottom-0 right-0 top-0 w-80 max-w-[85%] border-l border-line bg-card">
            <OverlayEntrance className="flex-1" slideFrom="right">
              {children}
            </OverlayEntrance>
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export type { IconComponent };
