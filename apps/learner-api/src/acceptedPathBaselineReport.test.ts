import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parseAcceptedPathManifest } from "@lrnki/infrastructure-ingestion";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

test("the accepted-path manifest exposes no obsolete package during the v2 cutover", async () => {
  const manifest = parseAcceptedPathManifest(JSON.parse(
    await readFile(path.join(repoRoot, "fixtures/accepted-paths/manifest.json"), "utf8")
  ));
  assert.deepEqual(
    manifest.fixtures.flatMap((fixture) => fixture.acceptedPackage ? [fixture.catalogKey] : []),
    []
  );
});

test("U6 target: the v2 report proves all five route and mixed-family contracts", {
  todo: "U6 regenerates and directly inspects the five replacement v2 packages"
}, () => {});
