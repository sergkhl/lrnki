// Bottom sheet (KTD2, R9-R10): a narrow controlled wrapper over the Expo UI drop-in
// bottom sheet, which owns platform gesture behavior (SwiftUI detents on iOS, Material3
// modal sheet on Android, vaul on web). The app owns the header, dismissal guard, and
// safe-area/keyboard framing.
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BottomSheetPrimitive, { BottomSheetView, type BottomSheetMethods } from "@expo/ui/community/bottom-sheet";
import type { OverlayProps } from "./overlays";
import { colors } from "./tokens";

/** Controlled bottom sheet: pan-down, backdrop, system back, and Escape all close it —
 * unless `dismissBlocked` holds it open while a mutation settles (AE4). */
export function BottomSheet({ open, onOpenChange, dismissBlocked = false, children }: OverlayProps) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetMethods>(null);

  useEffect(() => {
    if (open) sheetRef.current?.snapToIndex(0);
    else sheetRef.current?.close();
  }, [open]);

  if (!open) return null;

  return (
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
        <View style={{ paddingBottom: insets.bottom }}>{children}</View>
      </BottomSheetView>
    </BottomSheetPrimitive>
  );
}
