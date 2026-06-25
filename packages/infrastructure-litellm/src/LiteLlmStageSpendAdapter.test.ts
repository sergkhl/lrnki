import assert from "node:assert/strict";
import test from "node:test";
import { STAGE_TAGS } from "@lrnki/domain-core";
import { parseStageSpend } from "./LiteLlmStageSpendAdapter";

// Deterministic parse test over a canned /spend/tags payload (rule 11): the projection
// onto STAGE_TAGS is a pure transform; no model judgment is asserted.

test("parses STAGE_TAGS rows and excludes User-Agent pseudo-tags and stale tags", () => {
  const raw = [
    { individual_request_tag: STAGE_TAGS.cepExtraction, log_count: 1343, total_spend: 0.5776 },
    { individual_request_tag: "User-Agent: node", log_count: 18908, total_spend: 7.75 },
    { individual_request_tag: "User-Agent: curl/8.18.0", log_count: 4, total_spend: 0.0 },
    { individual_request_tag: "generated-enrichment-judge", log_count: 84, total_spend: 0.021 },
    { individual_request_tag: STAGE_TAGS.assertionEntailment, log_count: 691, total_spend: 0.1771 }
  ];
  const parsed = parseStageSpend(raw);
  assert.deepEqual(
    parsed.map((row) => row.tag).sort(),
    [STAGE_TAGS.assertionEntailment, STAGE_TAGS.cepExtraction].sort()
  );
  const cep = parsed.find((row) => row.tag === STAGE_TAGS.cepExtraction);
  assert.deepEqual(cep, { tag: STAGE_TAGS.cepExtraction, logCount: 1343, totalSpend: 0.5776 });
});

test("an empty payload yields no rows", () => {
  assert.deepEqual(parseStageSpend([]), []);
});
