import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createDatabaseClient } from "./db";
import { assembleIdentityDecisions, assembleProfiles, PostgresInspectionRead, toRunSummary } from "./PostgresInspectionRead";

const databaseUrl = process.env.TEST_DATABASE_URL;
const maybe = databaseUrl ? test : test.skip;

// U6 test scenario 3: run summaries report profile completeness and evidence
// counts rather than verified/rejected claim counts. The summary mapper is pure.
test("toRunSummary surfaces CEP completeness, not claim counts", () => {
  const summary = toRunSummary({
    run_id: "r1", source_resource_id: "src-1", title: "Rust Book §4", declared_domain: "rust", status: "succeeded", degraded: true, latency_ms: 42000,
    started_at: "2026-06-15T10:00:00.000Z", candidate_count: 9, core_count: 4,
    profile_count: 4, complete_profile_count: 3, definition_count: 4, mention_count: 11, assertion_count: 2
  });
  assert.equal(summary.coreCount, 4);
  assert.equal(summary.degraded, true);
  assert.equal(summary.profileCount, 4);
  assert.equal(summary.completeProfileCount, 3);
  assert.equal(summary.definitionCount, 4);
  assert.equal(summary.mentionCount, 11);
  assert.equal(summary.assertionCount, 2);
  assert.ok(!("verifiedClaimCount" in summary));
  assert.ok(!("proposalCount" in summary));
});

// U6 test scenario 1: a profile exposes definitions, salience-ordered mentions,
// and assertion labels. assembleProfiles stitches the normalized rows.
test("assembleProfiles splits definitions/mentions and resolves assertion targets", () => {
  const profiles = assembleProfiles(
    [
      { profile_id: "p1", candidate_key: "ownership", canonical_label: "Ownership", tier: "core", complete: true },
      { profile_id: "p2", candidate_key: "move", canonical_label: "Move semantics", tier: "core", complete: false }
    ],
    [
      { profile_id: "p1", kind: "definition", source_block_id: "b1", heading_path: ["Ch. 4"], evidence_quote: "Ownership is a set of rules.", salience_rank: 0 },
      { profile_id: "p1", kind: "mention", source_block_id: "b2", heading_path: ["Ch. 4"], evidence_quote: "Each value has an owner.", salience_rank: 0 },
      { profile_id: "p1", kind: "mention", source_block_id: "b3", heading_path: ["Ch. 4"], evidence_quote: "Owner goes out of scope.", salience_rank: 1 }
    ],
    [
      { assertion_id: "a2", profile_id: "p1", assertion_type: "defines", literal_value: "a set of ownership rules" }
    ],
    [{ assertion_id: "a2", evidence_quote: "Ownership is a set of rules." }]
  );

  assert.equal(profiles.length, 2);
  const ownership = profiles[0];
  assert.equal(ownership.conceptLabel, "Ownership");
  assert.equal(ownership.complete, true);
  assert.equal(ownership.definitions.length, 1);
  assert.equal(ownership.mentions.length, 2);
  assert.deepEqual(ownership.mentions.map((m) => m.salienceRank), [0, 1]);

  const defines = ownership.assertions.find((a) => a.assertionType === "defines");
  assert.equal(defines?.target, "a set of ownership rules");
  assert.deepEqual(defines?.evidenceQuotes, ["Ownership is a set of rules."]);

  // An admitted Concept left without a definition is surfaced as incomplete.
  assert.equal(profiles[1].complete, false);
  assert.equal(profiles[1].definitions.length, 0);
});

// U4 test scenario: the identity-decision stitch maps merge/distinct/quarantine rows
// into the view with both labels, survivor, proposing score, rationale, and model.
test("assembleIdentityDecisions maps merge, distinct, and quarantine rows", () => {
  const views = assembleIdentityDecisions([
    {
      outcome: "merge", rationale: "owner ≈ ownership",
      subject: { declaredDomain: "rust programming", survivorNormalizedLabel: "ownership", members: [
        { normalizedLabel: "ownership", canonicalLabel: "Ownership" },
        { normalizedLabel: "owner", canonicalLabel: "Owner" }
      ] },
      provenance: { proposingScore: 0.91, decidingRelationship: "equivalent", decidingModel: "gpt-oss-120b" }
    },
    {
      outcome: "distinct", rationale: "demand ≠ demography",
      subject: { declaredDomain: "economics", survivorNormalizedLabel: null, members: [
        { normalizedLabel: "demand", canonicalLabel: "Demand" },
        { normalizedLabel: "demography", canonicalLabel: "Demography" }
      ] },
      provenance: { proposingScore: 0.72, decidingRelationship: "broader_or_narrower", decidingModel: "gpt-oss-120b" }
    },
    {
      outcome: "quarantine", rationale: "two published collide",
      subject: { declaredDomain: "economics", survivorNormalizedLabel: null, members: [
        { normalizedLabel: "tradeone", canonicalLabel: "Trade One" },
        { normalizedLabel: "tradetwo", canonicalLabel: "Trade Two" }
      ] },
      provenance: { proposingScore: 0.95, decidingRelationship: "equivalent", decidingModel: "gpt-oss-120b" }
    }
  ]);

  assert.equal(views.length, 3);
  assert.deepEqual(views[0], {
    outcome: "merge", declaredDomain: "rust programming", survivorLabel: "Ownership",
    absorbedLabels: ["Owner"], proposingScore: 0.91, decidingRelationship: "equivalent",
    rationale: "owner ≈ ownership", decidingModel: "gpt-oss-120b"
  });
  assert.equal(views[1].survivorLabel, null, "a distinct decision has no survivor");
  assert.equal(views[1].decidingRelationship, "broader_or_narrower");
  assert.deepEqual(views[1].absorbedLabels, ["Demand", "Demography"]);
  assert.equal(views[2].outcome, "quarantine");
  assert.deepEqual(views[2].absorbedLabels, ["Trade One", "Trade Two"]);
});

test("assembleIdentityDecisions returns an empty list for no rows (not an error)", () => {
  assert.deepEqual(assembleIdentityDecisions([]), []);
});

maybe("readSourceEvidence resolves exact immutable resource/block pairs in request order", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const firstResourceId = randomUUID();
  const secondResourceId = randomUUID();
  const firstDocumentId = randomUUID();
  const secondDocumentId = randomUUID();
  const firstBlockId = randomUUID();
  const secondBlockId = randomUUID();
  try {
    await sql`
      INSERT INTO source_resources
        (source_resource_id, content_hash, content_type, object_key, declared_domain, title)
      VALUES
        (${firstResourceId}, ${`inspection-${firstResourceId}`}, 'text/plain', ${`test/${firstResourceId}`}, 'test domain', 'Generated source one'),
        (${secondResourceId}, ${`inspection-${secondResourceId}`}, 'text/plain', ${`test/${secondResourceId}`}, 'test domain', 'Generated source two')`;
    await sql`
      INSERT INTO source_documents
        (source_document_id, source_resource_id, parser_name, parser_version, parser_config_hash)
      VALUES
        (${firstDocumentId}, ${firstResourceId}, 'test', '1', 'test'),
        (${secondDocumentId}, ${secondResourceId}, 'test', '1', 'test')`;
    await sql`
      INSERT INTO source_blocks
        (source_block_id, source_document_id, block_id, block_type, text, heading_path, locator)
      VALUES
        (${firstBlockId}, ${firstDocumentId}, 'first', 'paragraph', 'The first generated source preserves its condition.', ${sql.json(["First"])}, ${sql.json({})}),
        (${secondBlockId}, ${secondDocumentId}, 'second', 'paragraph', 'The second generated source preserves its exception.', ${sql.json(["Second"])}, ${sql.json({})})`;

    const rows = await new PostgresInspectionRead(sql).readSourceEvidence([
      { sourceResourceId: secondResourceId, sourceBlockId: secondBlockId },
      { sourceResourceId: firstResourceId, sourceBlockId: secondBlockId },
      { sourceResourceId: firstResourceId, sourceBlockId: firstBlockId },
      { sourceResourceId: firstResourceId, sourceBlockId: firstBlockId }
    ]);

    assert.deepEqual(rows.map((row) => ({
      sourceResourceId: row.sourceResourceId,
      sourceBlockId: row.sourceBlockId,
      sourceTitle: row.sourceTitle,
      headingPath: row.headingPath,
      text: row.text
    })), [
      {
        sourceResourceId: secondResourceId,
        sourceBlockId: secondBlockId,
        sourceTitle: "Generated source two",
        headingPath: ["Second"],
        text: "The second generated source preserves its exception."
      },
      {
        sourceResourceId: firstResourceId,
        sourceBlockId: firstBlockId,
        sourceTitle: "Generated source one",
        headingPath: ["First"],
        text: "The first generated source preserves its condition."
      }
    ]);
  } finally {
    await sql`DELETE FROM source_blocks WHERE source_block_id IN (${firstBlockId}, ${secondBlockId})`;
    await sql`DELETE FROM source_documents WHERE source_document_id IN (${firstDocumentId}, ${secondDocumentId})`;
    await sql`DELETE FROM source_resources WHERE source_resource_id IN (${firstResourceId}, ${secondResourceId})`;
    await sql.end();
  }
});
