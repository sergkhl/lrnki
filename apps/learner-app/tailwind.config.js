// The theme maps NativeWind class names onto CSS variables generated from the single
// token source in src/ui/tokens.js (KTD1). Only the plugin below may emit `:root` vars.
const plugin = require("tailwindcss/plugin");
const { colors, radius, touch, cssVariables } = require("./src/ui/tokens.js");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: Object.fromEntries(Object.keys(colors).map((name) => [name, `var(--color-${name})`])),
      borderRadius: Object.fromEntries(Object.keys(radius).map((name) => [name, `var(--radius-${name})`])),
      spacing: Object.fromEntries(Object.keys(touch).map((name) => [name, `var(--size-${name})`]))
    }
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({ ":root": cssVariables() });
    })
  ]
};
