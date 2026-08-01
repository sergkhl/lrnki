// The single source of semantic design tokens (KTD1, R2). Plain CommonJS keeps the
// TypeScript app and the build-time CSS generator on exactly the same values.

/** Semantic color palette. Interactive boundaries use `lineStrong` (>=3:1 on card);
 * `line` is decorative separation only. All pairs are asserted by tokens.test.ts. */
const gemTeal = "#2f8f83";
const mapParchment = "#f1e5c9";
const mapParchmentDeep = "#e5d4af";
const mapInk = "#3f2f1c";
const mapInkSoft = "#846c47";
const card = "#fffaf0";
const colors = {
  background: "#f7f0de",
  ink: "#241f18",
  muted: "#6d6152",
  card,
  line: "#d8c8aa",
  "line-strong": "#8d8064",
  trail: "#617a55",
  "trail-muted": "#b9ad92",
  gem: gemTeal,
  "gem-soft": "#cbe7df",
  // Treasure-map trail surfaces (plan 2026-07-18-001 KTD2/KTD7): parchment ground,
  // deeper edge/uncharted wash, and two sepia inks. Values clear the tokens.test.ts
  // contrast floors (map-ink text >= 4.5:1 on both parchments; map-ink-soft
  // boundaries >= 3:1). Gold stays earned-only and is never map decoration.
  "map-parchment": mapParchment,
  "map-parchment-deep": mapParchmentDeep,
  "map-ink": mapInk,
  "map-ink-soft": mapInkSoft,
  // Crystal Formation chrome aliases the same warm parchment system mechanically. Every
  // crystal-bearing surface therefore has one shared LIGHT ground without a parallel palette;
  // crystal colours remain owned by `crystalLibrary.ts`.
  cavern: mapParchment,
  "cavern-panel": card,
  "cavern-rock": mapParchmentDeep,
  "cavern-edge": mapInkSoft,
  "cavern-ink": mapInk,
  fog: "#8d887c",
  frontier: "#9c5f2b",
  "muted-panel": "#eee4cd",
  destructive: "#a13c2e",
  "on-accent": "#fdfaf2",
  gold: "#d8b64c",
  "gold-ink": "#875e13",
  award: "#b45309",
  secured: "#3f7d4e",
  // Overlay backdrop (plan 2026-07-16-003 D6): a LITERAL rgba value, never a Tailwind
  // opacity modifier — `bg-black/40` compiles to color-mix(), which NativeWind's native
  // styler drops, leaving Android scrims transparent.
  scrim: "rgba(0, 0, 0, 0.4)"
};

/** Corner radii in px: cards stay flat (<=8px per the interaction plan), controls are
 * rounder, overlays (sheet/dialog shells) roundest. */
const radius = {
  card: 8,
  control: 12,
  overlay: 16
};

/** Touch sizing in px: 44 is the WCAG 2.2 minimum target, 48 the default control height. */
const touch = {
  target: 44,
  control: 48
};

/** Tailwind v4 needs theme declarations to generate semantic utilities and runtime
 * declarations to resolve them on native. This is rendered into tokens.css; do not
 * hand-maintain a second set of values in CSS. */
function nativewindThemeCss() {
  const declarations = [
    ...Object.entries(colors).map(([name, value]) => [`--color-${name}`, value]),
    ...Object.entries(radius).map(([name, value]) => [`--radius-${name}`, `${value}px`]),
    ...Object.entries(touch).map(([name, value]) => [`--spacing-${name}`, `${value}px`])
  ];
  const body = declarations.map(([name, value]) => `  ${name}: ${value};`).join("\n");
  return `/* Generated from tokens.js by scripts/generate-learner-token-css.cjs. Do not edit. */\n@theme {\n${body}\n}\n\n:root {\n${body}\n}\n`;
}

module.exports = { colors, radius, touch, nativewindThemeCss };
