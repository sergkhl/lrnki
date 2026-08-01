// Bottom sheet (KTD2/KTD7, R9-R13): a narrow controlled wrapper over the Expo UI drop-in
// bottom sheet, which owns platform gesture behavior (SwiftUI detents on iOS, Material3
// modal sheet on Android, vaul on web). The app owns the header, dismissal guard, and
// safe-area/keyboard framing — and, on web only, the root-layer placement.
import { useEffect, useId, useRef } from "react";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Portal } from "@rn-primitives/portal";
import BottomSheetPrimitive, { BottomSheetView, type BottomSheetMethods } from "@expo/ui/community/bottom-sheet";
import type { OverlayProps } from "./overlays";
import { BottomSheetBackdrop } from "./sheetBackdrop";
import { colors } from "./tokens";

/** Controlled bottom sheet: pan-down, backdrop, system back, and Escape all close it —
 * unless `dismissBlocked` holds it open while a mutation settles (AE4). */
export function BottomSheet({ open, onOpenChange, dismissBlocked = false, children }: OverlayProps) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetMethods>(null);
  // A stable per-instance portal identity so sequential opens register and clean up their
  // own root-layer entry (KTD7); it is constant across this instance's renders.
  const portalName = useId();

  useEffect(() => {
    if (open) sheetRef.current?.snapToIndex(0);
    else sheetRef.current?.close();
  }, [open]);

  if (!open) return null;

  const sheet = (
    <BottomSheetPrimitive
      ref={sheetRef}
      enableDynamicSizing
      enablePanDownToClose={!dismissBlocked}
      keyboardBehavior="interactive"
      backgroundStyle={{ backgroundColor: colors.card }}
      onClose={() => {
        // The primitive can close itself (pan/backdrop/back). While a mutation is
        // pending we re-assert the open snap instead of accepting the close.
        if (dismissBlocked) {
          sheetRef.current?.snapToIndex(0);
          return;
        }
        onOpenChange(false);
      }}
    >
      <BottomSheetView>
        <View testID="bottom-sheet-safe-area" style={{ paddingBottom: insets.bottom }}>{children}</View>
      </BottomSheetView>
    </BottomSheetPrimitive>
  );

  // On web the Expo sheet renders its scrim in place, trapped inside the journal's stacking
  // contexts, so transformed/positioned journal, Browse, expedition, and Crystal Guardian
  // surfaces can paint over it. Relocating the whole primitive to the root PortalHost — the
  // same escape RN Primitives dialogs use — lifts scrim and content above every journal
  // surface without any consumer z-index change (KTD7, R11-R12). Native keeps Expo's in-place
  // system modal sheet and its gesture/safe-area/keyboard semantics untouched (R13).
  if (Platform.OS === "web") {
    return (
      <>
        <BottomSheetBackdrop
          dismissBlocked={dismissBlocked}
          onDismiss={() => sheetRef.current?.close()}
        />
        <Portal name={portalName}>{sheet}</Portal>
      </>
    );
  }
  return sheet;
}
