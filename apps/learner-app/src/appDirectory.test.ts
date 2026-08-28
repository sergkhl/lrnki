import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, test } from "@jest/globals";

const APP_ROOT = resolve(process.cwd(), "src/app");
const TEST_MODULE_RE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

test("the Expo Router app directory contains routes, never test modules", () => {
  // Expo Router treats every file below src/app as a route module. Keeping this structural guard
  // outside that tree prevents a test-only Node dependency from entering a native bundle again.
  const misplacedTests = filesBelow(APP_ROOT)
    .filter((path) => TEST_MODULE_RE.test(path))
    .map((path) => relative(APP_ROOT, path));

  expect(misplacedTests).toEqual([]);
});
