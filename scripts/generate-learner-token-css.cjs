#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- Metro loads this synchronous CJS helper. */
// Keeps the NativeWind v5 CSS theme mechanically derived from the app-owned token
// source. Metro invokes this too, so direct `expo export` calls cannot use stale CSS.
const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const appRoot = path.resolve(__dirname, "..", "apps", "learner-app");
const { nativewindThemeCss } = require(path.join(appRoot, "src", "ui", "tokens.js"));
const outputPath = path.join(appRoot, "src", "ui", "tokens.css");

function generateLearnerTokenCss() {
  const next = nativewindThemeCss();
  let current;
  try {
    current = readFileSync(outputPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (current !== next) {
    writeFileSync(outputPath, next);
  }
  return outputPath;
}

if (require.main === module) generateLearnerTokenCss();

module.exports = { generateLearnerTokenCss };
