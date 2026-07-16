// The single source of semantic design tokens (KTD1, R2). Plain CommonJS keeps the
// TypeScript app and the build-time CSS generator on exactly the same values.

/** Semantic color palette. Interactive boundaries use `lineStrong` (>=3:1 on card);
 * `line` is decorative separation only. All pairs are asserted by tokens.test.ts. */
const gemTeal = "#2f8f83";
const colors = {
  background: "#f7f0de",
  ink: "#241f18",
  muted: "#6d6152",
  card: "#fffaf0",
  line: "#d8c8aa",
  "line-strong": "#8d8064",
  trail: "#617a55",
  "trail-muted": "#b9ad92",
  gem: gemTeal,
  "gem-soft": "#cbe7df",
  // Mineral tier tints (plan 2026-07-16-002 D7): quartz shares the journal gem teal;
  // amethyst is a muted violet; diamond a pale ice-blue. Gold stays reserved for
  // earned rewards and is never a tier tint.
  "mineral-quartz": gemTeal,
  "mineral-amethyst": "#7d6b9e",
  "mineral-diamond": "#9cc3d5",
  fog: "#8d887c",
  frontier: "#9c5f2b",
  "muted-panel": "#eee4cd",
  destructive: "#a13c2e",
  "on-accent": "#fdfaf2",
  gold: "#d8b64c",
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
