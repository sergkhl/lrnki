import assert from "node:assert/strict";
import { test } from "@jest/globals";
import { STAGE_TAGS } from "@lrnki/domain-core";
import { NON_LLM_STAGES, TOPIC_EXPEDITION_STAGE_PROFILE } from "@lrnki/application/projection";
import { hasExplicitStageCopy, stageCopy } from "./stageCopy";

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

test("every Topic Expedition profile and non-LLM stage has explicit fiction-voiced copy", () => {
  const stages = [
    ...Object.values(TOPIC_EXPEDITION_STAGE_PROFILE).flatMap((phase) =>
      phase.map((descriptor) => descriptor.stage)
    ),
    ...Object.values(NON_LLM_STAGES)
  ];
  for (const stage of stages) {
    assert.equal(hasExplicitStageCopy(stage), true, `${stage} would fall through to generic copy`);
    assert.notEqual(stageCopy(stage), "Scouting the trail");
  }
  assert.deepEqual(
    [
      stageCopy(STAGE_TAGS.groundingVerificationQuestionPlanning),
      stageCopy(STAGE_TAGS.groundingVerificationAnswering),
      stageCopy(STAGE_TAGS.groundingFactualityRevision)
    ],
    ["Drafting challenge questions", "Consulting independent guides", "Testing each field note"]
  );
});
