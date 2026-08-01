import { createPortal } from "react-dom";
import { colors } from "./tokens";

// Expo's web BottomSheet renders its vaul overlay outside vaul's own DOM portal. When an app sheet
// opens over an already-portaled full-screen dialog, that overlay inherits the older surface's
// inert stacking context even though the drawer content itself reaches document.body. The app-owned
// root backdrop keeps hit-testing and scrim presentation in one body-level layer for every web
// sheet; the generated vaul overlay is made presentation-neutral in global.css.
export function BottomSheetBackdrop({
  dismissBlocked,
  onDismiss
}: Readonly<{ dismissBlocked: boolean; onDismiss: () => void }>) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      aria-hidden="true"
      data-testid="bottom-sheet-backdrop"
      onClick={dismissBlocked ? undefined : onDismiss}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999,
        pointerEvents: "auto",
        backgroundColor: colors.scrim
      }}
    />,
    document.body
  );
}
