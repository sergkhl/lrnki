import { test, expect } from "@jest/globals";
import { colors, cssVariables, radius, touch } from "./tokens";

// WCAG 2.2 relative-luminance contrast (R4, U1 scenario 4): every semantic pairing the
// UI module renders must clear 4.5:1 for normal text and 3:1 for large text, meaningful
// icons, focus indicators, and control boundaries.
function luminance(hex: string): number {
  const channels = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
  const [r, g, b] = channels.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const NORMAL_TEXT_PAIRS: [string, string][] = [
  [colors.ink, colors.card],
  [colors.ink, colors.background],
  [colors.ink, colors["gem-soft"]],
  [colors.ink, colors["muted-panel"]],
  [colors.muted, colors.card],
  [colors.muted, colors.background],
  [colors.muted, colors["muted-panel"]],
  [colors["on-accent"], colors.trail],
  [colors["on-accent"], colors.destructive],
  [colors.destructive, colors.card]
];

const LARGE_OR_ICON_PAIRS: [string, string][] = [
  [colors["on-accent"], colors.gem],
  [colors["on-accent"], colors.fog],
  [colors.frontier, colors.card],
  [colors.frontier, colors.background],
  [colors["line-strong"], colors.card],
  [colors.gem, colors.card],
  [colors.award, colors.card],
  [colors.secured, colors.card]
];

test("normal-text token pairs meet 4.5:1", () => {
  for (const [fg, bg] of NORMAL_TEXT_PAIRS) {
    expect({ fg, bg, ratio: contrast(fg, bg) }).toEqual({ fg, bg, ratio: expect.any(Number) });
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  }
});

test("icon, focus, and control-boundary pairs meet 3:1", () => {
  for (const [fg, bg] of LARGE_OR_ICON_PAIRS) {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
  }
});

test("css variables are generated one-to-one from the token maps", () => {
  const vars = cssVariables();
  expect(Object.keys(vars)).toHaveLength(Object.keys(colors).length + Object.keys(radius).length + Object.keys(touch).length);
  expect(vars["--color-ink"]).toBe(colors.ink);
  expect(vars["--radius-card"]).toBe("8px");
  expect(vars["--size-target"]).toBe("44px");
});

test("card radius stays flat and touch sizes hold the WCAG floor", () => {
  expect(radius.card).toBeLessThanOrEqual(8);
  expect(touch.target).toBeGreaterThanOrEqual(44);
  expect(touch.control).toBeGreaterThanOrEqual(touch.target);
});
