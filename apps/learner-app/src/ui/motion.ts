// Motion policy (KTD6, R14, R16): every timed transform in the learner app reads its
// duration here, and every animated surface consults the SAME reduced-motion source.
// Reduced motion swaps presentation only — state transitions and completion callbacks
// never ride on an animation finishing.
import { useReducedMotion as useReanimatedReducedMotion } from "react-native-reanimated";

/** Durations in ms. `press` is the press-in acknowledgement; `standard` covers
 * disclosures and small layout reveals; `overlay` is dialog/sheet entrance;
 * `celebration` paces facet assembly steps; `emphasis` is the one-shot next-stop halo. */
export const MOTION = {
  press: 90,
  standard: 200,
  overlay: 220,
  nudge: 70,
  celebration: 340,
  emphasis: 900
} as const;

/** Press-in scale for PressableSurface — restrained and layout-stable (AE1). */
export const PRESS_SCALE = 0.97;

/** The one shared reduced-motion policy (R16): the OS/browser preference via Reanimated.
 * There is deliberately no app-specific motion setting. */
export function useReducedMotion(): boolean {
  return useReanimatedReducedMotion();
}
