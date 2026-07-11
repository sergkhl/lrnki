// The single source of semantic design tokens (KTD1, R2). Plain CommonJS so both
// tailwind.config.js (node require) and the TypeScript app (allowJs) read the SAME
// values; the CSS variables NativeWind consumes are generated mechanically from here.

/** Semantic color palette. Interactive boundaries use `lineStrong` (>=3:1 on card);
 * `line` is decorative separation only. All pairs are asserted by tokens.test.ts. */
const colors = {
  background: "#f7f0de",
  ink: "#241f18",
  muted: "#6d6152",
  card: "#fffaf0",
  line: "#d8c8aa",
  "line-strong": "#8d8064",
  trail: "#617a55",
  "trail-muted": "#b9ad92",
  gem: "#2f8f83",
  "gem-soft": "#cbe7df",
  fog: "#8d887c",
  frontier: "#9c5f2b",
  "muted-panel": "#eee4cd",
  destructive: "#a13c2e",
  "on-accent": "#fdfaf2",
  gold: "#d8b64c",
  award: "#b45309",
  secured: "#3f7d4e"
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

/** The generated `:root` block consumed by the tailwind plugin — never hand-edit CSS vars. */
function cssVariables() {
  /** @type {Record<string, string>} */
  const vars = {};
  for (const [name, value] of Object.entries(colors)) vars[`--color-${name}`] = value;
  for (const [name, value] of Object.entries(radius)) vars[`--radius-${name}`] = `${value}px`;
  for (const [name, value] of Object.entries(touch)) vars[`--size-${name}`] = `${value}px`;
  return vars;
}

module.exports = { colors, radius, touch, cssVariables };
