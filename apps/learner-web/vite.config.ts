import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Static SPA build (R3). `base` is configurable for GitHub Pages project hosting; the
// 404.html copy is the Pages SPA fallback (KTD4) so deep links like /expedition/:id
// resolve to the router instead of a Pages 404.
export default defineConfig({
  base: process.env.LEARNER_WEB_BASE ?? "/",
  plugins: [
    react(),
    {
      name: "spa-404-fallback",
      closeBundle() {
        copyFileSync(resolve(__dirname, "dist/index.html"), resolve(__dirname, "dist/404.html"));
      }
    }
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "node:crypto": resolve(__dirname, "src/lib/nodeCryptoShim.ts")
    }
  }
});
