import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { MarkdownStructuredDocumentParser } from "./MarkdownStructuredDocumentParser";

type AcceptedPathFixture = Readonly<{
  fixtureId: string;
  catalogKey: string;
  catalogRole: string;
  catalogOrder: number;
  audience: string;
  preferredStopCount: Readonly<{ minimum: number; maximum: number }>;
  path: string;
  contentType: string;
  declaredDomain: string;
  title: string;
  teaser: string;
  source: string;
  license: string;
  curation: string;
}>;

type AcceptedPathManifest = Readonly<{
  sourcePolicy: Readonly<{
    authorship: string;
    knowledgeBasis: string;
    acceptanceScope: string;
    externalClaimVerificationRequired: boolean;
    revisionPolicy: string;
  }>;
  fixtures: AcceptedPathFixture[];
}>;

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const manifest = JSON.parse(
  readFileSync(path.join(repoRoot, "fixtures/accepted-paths/manifest.json"), "utf8")
) as AcceptedPathManifest;
const parser = new MarkdownStructuredDocumentParser();

const expectedCatalog = [
  ["critical-thinking", "Critical Thinking", "broad_reasoning_topic", "curious_general_adult_high_school_reading"],
  ["probability-and-statistics", "Probability and Statistics", "quantitative_foundation", "curious_general_adult_high_school_reading"],
  ["personal-finance", "Personal Finance", "broad_consumer_topic", "curious_general_adult_high_school_reading"],
  ["machine-learning", "Machine Learning", "advanced_technical_path", "technically_experienced_density_first"],
  ["neuroscience-of-memory-and-attention", "Neuroscience of Memory and Attention", "science_curiosity_path", "technically_experienced_density_first"]
] as const;

test("accepted-path manifest owns exactly the current five model-authored playtest sources", () => {
  assert.deepEqual(manifest.sourcePolicy, {
    authorship: "lrnki_model_authored_project_source",
    knowledgeBasis: "general_model_knowledge_only",
    acceptanceScope: "local_shared_learner_playtest",
    externalClaimVerificationRequired: false,
    revisionPolicy: "replace_then_hard_reset_and_reseed"
  });
  assert.equal(manifest.fixtures.length, expectedCatalog.length);
  assert.deepEqual(
    manifest.fixtures.map((fixture) => [
      fixture.catalogKey,
      fixture.title,
      fixture.catalogRole,
      fixture.audience
    ]),
    expectedCatalog
  );
  assert.deepEqual(manifest.fixtures.map((fixture) => fixture.catalogOrder), [1, 2, 3, 4, 5]);

  for (const field of ["fixtureId", "catalogKey", "catalogOrder", "path", "title", "declaredDomain"] as const) {
    assert.equal(
      new Set(manifest.fixtures.map((fixture) => fixture[field])).size,
      manifest.fixtures.length,
      `${field} must be unique`
    );
  }
  assert.equal(
    new Set(manifest.fixtures.map((fixture) => path.basename(fixture.path))).size,
    manifest.fixtures.length,
    "source basenames must be unique because registration derives objectKey from the basename"
  );
});

test("accepted-path sources are pure, bounded Markdown and parse into located blocks", async () => {
  for (const fixture of manifest.fixtures) {
    assert.match(fixture.path, /^fixtures\/accepted-paths\/sources\/[a-z-]+\.md$/);
    assert.equal(fixture.contentType, "text/markdown");
    assert.match(fixture.source, /^lrnki model-authored project source accepted for local playtest;/);
    assert.equal(fixture.license, "lrnki project-owned playtest fixture");
    assert.match(fixture.curation, /no external source material/i);
    assert.ok(fixture.teaser.trim().length > 0);

    const body = readFileSync(path.join(repoRoot, fixture.path), "utf8");
    assert.ok(body.trim().length > 0, `${fixture.catalogKey} is empty`);
    assert.doesNotMatch(body, /\0/, `${fixture.catalogKey} contains a NUL byte`);
    assert.doesNotMatch(body, /https?:\/\/|www\.|\[[^\]]+\]\([^\)]+\)/i,
      `${fixture.catalogKey} must not carry an external URL or Markdown citation`);
    assert.doesNotMatch(body, /^#{1,6}\s+(references|bibliography|sources|further reading)\b/im,
      `${fixture.catalogKey} must not carry a citation section`);
    assert.doesNotMatch(body, /lrnki|model-authored|playtest fixture|external claim verification/i,
      `${fixture.catalogKey} must remain pure learner-facing source content`);

    const majorSections = [...body.matchAll(/^## /gm)].length;
    assert.ok(
      majorSections >= fixture.preferredStopCount.minimum &&
        majorSections <= fixture.preferredStopCount.maximum,
      `${fixture.catalogKey} has ${majorSections} major sections outside its editorial range`
    );
    const wordCount = body.trim().split(/\s+/).length;
    const expectedWordRange = fixture.audience === "technically_experienced_density_first"
      ? [4_500, 7_000]
      : [3_000, 5_500];
    assert.ok(
      wordCount >= expectedWordRange[0] && wordCount <= expectedWordRange[1],
      `${fixture.catalogKey} has ${wordCount} words outside ${expectedWordRange.join("-")}`
    );

    const document = await parser.parse({
      sourceResourceId: fixture.fixtureId,
      bytes: new TextEncoder().encode(body),
      contentType: fixture.contentType
    });
    assert.ok(document.blocks.length > majorSections, `${fixture.catalogKey} has no useful body blocks`);
    assert.equal(new Set(document.blocks.map((block) => block.blockId)).size, document.blocks.length);
    for (const block of document.blocks) {
      assert.ok(block.text.trim().length > 0, `${fixture.catalogKey}/${block.blockId} is empty`);
      const { characterStart, characterEnd } = block.locator;
      assert.ok(typeof characterStart === "number" && characterStart >= 0,
        `${fixture.catalogKey}/${block.blockId} has no start locator`);
      assert.ok(typeof characterEnd === "number" && characterEnd > characterStart,
        `${fixture.catalogKey}/${block.blockId} has an invalid end locator`);
    }
  }
});
