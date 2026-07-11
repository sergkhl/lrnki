import assert from "node:assert/strict";
import { test } from "@jest/globals";
import { STAGE_TAGS } from "@lrnki/domain-core";
import { NON_LLM_STAGES } from "@lrnki/application/projection";
import { stageCopy } from "./stageCopy";

test("every known generation stage maps to fiction-voiced copy instead of raw ids", () => {
  for (const stage of [...Object.values(STAGE_TAGS), ...Object.values(NON_LLM_STAGES)]) {
    const copy = stageCopy(stage);
    assert.notEqual(copy, stage);
    assert.equal(copy.includes("-"), false, `${stage} rendered a hyphenated identifier-like label`);
  }
});

test("unknown stages use a generic fallback instead of the raw string", () => {
  assert.equal(stageCopy("future-stage-id"), "Scouting the trail");
});
