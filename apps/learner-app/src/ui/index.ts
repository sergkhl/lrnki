// The app-owned UI boundary (R1/R3): learner surfaces import interaction and text
// primitives ONLY from here; ESLint blocks the raw React Native equivalents outside
// this module.
export { Button, IconButton, PressableSurface, buttonIconColor, type ButtonVariant, type PressableSurfaceProps } from "./actions";
export { AppText as Text, Badge, Card, Input, Progress, Screen, type TextColor, type TextVariant } from "./foundation";
export { Dialog, FullScreenDialog, OverlayHeader, SideSheet, type OverlayProps } from "./overlays";
export { BottomSheet } from "./sheets";
export { triggerHaptic, type HapticIntent } from "./feedback";
export { MOTION, PRESS_SCALE, useReducedMotion } from "./motion";
export { colors, radius, touch } from "./tokens";
