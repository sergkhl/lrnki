// Overlay presentation (KTD4, R8-R10): Dialog and FullScreenDialog share RN Primitives
// behavior (focus trap + restoration and Escape on web, portal layering on native), one
// OverlayHeader with a circular semantic icon, and one dismissal contract. A pending
// mutation blocks every dismissal input via `dismissBlocked`.
import { useEffect, type ComponentType, type ReactNode } from "react";
import { BackHandler, Platform, ScrollView, useWindowDimensions, View } from "react-native";
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
  // `shrink min-h-0`, not `flex-1`: the body sizes to its content when the dialog fits and
  // gives up space (scrolling) only when the numeric viewport cap bites. `flex-1` grows from
  // a zero basis, which Yoga collapses to nothing under a max-height-only column (the former
  // border-only Android dialog); shrink-from-natural is the measured-cap contract (KTD5, H2).
  return (
    <ScrollView testID="dialog-body" className="min-h-0 shrink" contentContainerClassName={contentClassName ?? "gap-3 p-4"}>
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
  const { height } = useWindowDimensions();
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
          className="absolute inset-0 items-center justify-center bg-scrim p-4"
          style={Platform.OS === "web" ? ({ position: "fixed" } as object) : undefined}
        >
          {/* The bounded dialog column (KTD5/KTD9): Content caps the height with ONE
              window-derived NUMERIC maximum — a percentage cap needs a definite-height
              parent, but on web the primitive inserts an unstyled auto-height focus
              wrapper between Overlay and Content (percentage resolves against the
              dialog's own natural height and clips it) and on native a max-only column
              collapses `flex-1` children to zero. A numeric px cap resolves identically
              on both engines. The entrance wrapper and DialogBody shrink from natural
              height so the BODY scrolls while the header and DialogFooter stay reachable. */}
          <DialogPrimitive.Content
            testID="dialog-content"
            className="w-full max-w-md overflow-hidden rounded-overlay border border-line bg-card"
            style={{ maxHeight: Math.round(height * 0.85) }}
          >
            <OverlayEntrance className="min-h-0 shrink">{children}</OverlayEntrance>
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
          // Native: the Overlay is a Pressable and would claim the JS touch responder at
          // touch START for any non-pressable descendant touch; a JS ancestor responder
          // blocks the descendant ScrollView's native move interception, so drags on
          // Theory prose scroll nothing. This surface has no backdrop-close (closeOnPress
          // is false), so disabling its pressability loses no behavior. Web keeps the
          // Radix overlay untouched.
          disabled={Platform.OS === "web" ? undefined : true}
          className="absolute inset-0"
          style={Platform.OS === "web" ? ({ position: "fixed" } as object) : undefined}
        >
          {/* Web keeps absolute inset-0: the primitive inserts an unstyled focus wrapper
              between Overlay and Content, so stretch-based flex sizing collapses there.
              Native takes a bounded flex chain instead (H1): an absolute-positioned scroll
              ancestor does not propagate a definite height to the activity ScrollView, so
              Theory content grows unbounded and cannot scroll. `flex-1` under the
              definite-height (inset-0) Overlay gives the ScrollView a real bound. */}
          <DialogPrimitive.Content
            testID="fullscreen-content"
            className={Platform.OS === "web" ? "absolute inset-0 bg-background" : "flex-1 bg-background"}
            // Native: the primitive hardwires `onStartShouldSetResponder: () => true` on
            // Content, claiming every touch before the activity ScrollView can win the
            // drag (the props spread after it makes this override sanctioned). The
            // dialog has no backdrop-close to shield content taps from, so the claim
            // only breaks scrolling here.
            onStartShouldSetResponder={undefined}
          >
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
          className="absolute inset-0 bg-scrim"
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
