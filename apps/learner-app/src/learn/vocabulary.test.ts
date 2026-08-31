import assert from "node:assert/strict";
import { test } from "@jest/globals";

import {
  LEARNER_VOCABULARY,
  learnerTerm,
  termSupportActionLabel,
  type LearnerVocabularyKey
} from "./vocabulary";

test("the retained learner vocabulary is complete and nonempty", () => {
  for (const [key, value] of Object.entries(LEARNER_VOCABULARY)) {
    assert.equal(learnerTerm(key as LearnerVocabularyKey), value);
    assert.notEqual(value.trim(), "");
  }
});

test("an Explorable Term receives an exact accessible Support action", () => {
  assert.equal(
    termSupportActionLabel("support relationship"),
    "Open the authored Support Path for support relationship"
  );
});
