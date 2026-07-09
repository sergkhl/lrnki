// The learner journal palette (moved from learner-web theme.css) becomes Tailwind theme
// colors, so `bg-card` / `text-ink` etc. read the same on native and web.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#f7f0de",
        ink: "#241f18",
        muted: "#6d6152",
        card: "#fffaf0",
        line: "#d8c8aa",
        trail: "#617a55",
        "trail-muted": "#b9ad92",
        gem: "#2f8f83",
        "gem-soft": "#cbe7df",
        fog: "#8d887c",
        frontier: "#9c5f2b",
        "muted-panel": "#eee4cd",
        destructive: "#a13c2e"
      }
    }
  },
  plugins: []
};
