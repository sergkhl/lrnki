import assert from "node:assert/strict";
import test from "node:test";
import { LEARNER_VOCABULARY, encodeLearnerStateRef, learnerTerm, type LearnerVocabularyKey } from "./vocabulary";

const USED_KEYS = [
  "routeName",
  "learnerRefLabel",
  "learnerRefPlaceholder",
  "enterAction",
  "camp",
  "theoryStop",
  "itemStop",
  "capstone",
  "nextStop",
  "mastered",
  "frontier",
  "locked",
  "known",
  "examine",
  "answer",
  "skipKnown",
  "journal",
  "gemCollection",
  "surveyMap",
  "topicDoor",
  "progress",
  "summit"
] satisfies LearnerVocabularyKey[];

test("learnerTerm returns text for every learner UI key", () => {
  for (const key of USED_KEYS) {
    assert.equal(learnerTerm(key), LEARNER_VOCABULARY[key]);
    assert.notEqual(learnerTerm(key).trim(), "");
  }
});

test("encodeLearnerStateRef trims, compacts, and URL-encodes learner refs", () => {
  assert.equal(encodeLearnerStateRef("  Ada   Lovelace  "), "Ada%20Lovelace");
  assert.equal(encodeLearnerStateRef("Cohort/One"), "Cohort%2FOne");
});
