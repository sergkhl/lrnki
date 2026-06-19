import assert from "node:assert/strict";
import { test } from "node:test";
import { assembleProfiles, toRunSummary } from "./inspection";

// U6 test scenario 3: run summaries report profile completeness and evidence
// counts rather than verified/rejected claim counts. The summary mapper is pure.
test("toRunSummary surfaces CEP completeness, not claim counts", () => {
  const summary = toRunSummary({
    run_id: "r1", title: "Rust Book §4", declared_domain: "rust", status: "succeeded", degraded: true, latency_ms: 42000,
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
