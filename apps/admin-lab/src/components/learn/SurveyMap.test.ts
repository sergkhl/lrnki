import assert from "node:assert/strict";
import test from "node:test";
import { fogVisualState } from "./SurveyMap";

test("fogVisualState maps projection state to learner map visual state", () => {
  assert.equal(fogVisualState("mastered"), "lit");
  assert.equal(fogVisualState("frontier"), "outlined");
  assert.equal(fogVisualState("locked"), "fogged");
});
