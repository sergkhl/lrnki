import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { HtmlStructuredDocumentParser } from "./HtmlStructuredDocumentParser";
import { MarkdownStructuredDocumentParser } from "./MarkdownStructuredDocumentParser";
import { StructuredDocumentParserRegistry } from "./StructuredDocumentParserRegistry";
import { TextStructuredDocumentParser } from "./TextStructuredDocumentParser";

type DiagnosticFixture = Readonly<{
  fixtureId: string;
  path: string;
  contentType: string;
  declaredDomain: string;
  title: string;
  source: string;
  license: string;
}>;

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const manifest = JSON.parse(
  readFileSync(path.join(repoRoot, "fixtures/diagnostic-manifest.json"), "utf8")
) as { fixtures: DiagnosticFixture[] };
const parsers = new StructuredDocumentParserRegistry([
  new TextStructuredDocumentParser(),
  new HtmlStructuredDocumentParser(),
  new MarkdownStructuredDocumentParser()
]);

test("project-authored diagnostic Curated Sources are distinct, registered, and parse into located blocks", async () => {
  assert.equal(manifest.fixtures.length, 4);
  assert.equal(new Set(manifest.fixtures.map((fixture) => fixture.fixtureId)).size, manifest.fixtures.length);
  assert.equal(new Set(manifest.fixtures.map((fixture) => fixture.path)).size, manifest.fixtures.length);

  for (const fixture of manifest.fixtures) {
    assert.match(fixture.path, /^fixtures\/(markdown|html|plaintext)\/lrnki-diagnostic-/);
    assert.equal(fixture.source, "lrnki project-authored diagnostic source");
    assert.equal(fixture.license, "Project test fixture");

    const bytes = new Uint8Array(readFileSync(path.join(repoRoot, fixture.path)));
    const document = await parsers.parserFor(fixture.contentType).parse({
      sourceResourceId: fixture.fixtureId,
      bytes,
      contentType: fixture.contentType
    });

    assert.ok(document.blocks.length >= 8, `${fixture.fixtureId} should yield a useful block set`);
    assert.equal(new Set(document.blocks.map((block) => block.blockId)).size, document.blocks.length);
    for (const block of document.blocks) {
      assert.ok(block.text.trim().length > 0, `${fixture.fixtureId}/${block.blockId} has empty text`);
      const { characterStart, characterEnd } = block.locator;
      assert.ok(
        typeof characterStart === "number" && characterStart >= 0,
        `${fixture.fixtureId}/${block.blockId} has no start locator`
      );
      assert.ok(
        typeof characterEnd === "number" && characterEnd > characterStart,
        `${fixture.fixtureId}/${block.blockId} has an invalid end locator`
      );
    }
  }
});

test("the harbor diagnostic models one prerequisite completed by a second Curated Source", () => {
  const harbor = manifest.fixtures.filter((fixture) => fixture.declaredDomain === "harbor operations");
  assert.deepEqual(
    harbor.map((fixture) => fixture.fixtureId),
    ["diagnostic-harbor-dispatch-core", "diagnostic-harbor-tide-margin"]
  );

  const core = readFileSync(path.join(repoRoot, harbor[0].path), "utf8");
  const supplement = readFileSync(path.join(repoRoot, harbor[1].path), "utf8");
  assert.match(core, /does not define how tide margin is\s+calculated/i);
  assert.match(supplement, /Tide margin<\/strong> is the predicted minimum water depth/i);
});
