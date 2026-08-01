// Semantic haptic policy (R7, KTD6): named intents fired once by the owner of a state
// transition. Fire-and-forget — a haptic never gates or delays a learner action — and
// generic navigation (back, menu, close) deliberately has NO intent. Web is a no-op.
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

export type HapticIntent =
  | "selection"
  | "success"
  | "warning"
  | "mastery"
  | "fusion"
  | "unlock";

const PLAYERS: Record<HapticIntent, () => Promise<void>> = {
  // Apple's selection tick is easy to miss in the hand. A light impact keeps ordinary
  // choices restrained while making the acknowledgement reliably perceptible.
  selection: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  mastery: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  fusion: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  unlock: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
};

export function triggerHaptic(intent: HapticIntent): void {
  if (Platform.OS === "web") return;
  void PLAYERS[intent]().catch(() => {
    // A missing vibrator (or a device setting) must never surface as an app error.
  });
}
