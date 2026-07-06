import assert from "node:assert/strict";
import test from "node:test";
import { LEARNER_VOCABULARY, learnerTerm, lessonSectionHeading, type LearnerVocabularyKey } from "./vocabulary";

const USED_KEYS = [
  "routeName",
  "learnerRefLabel",
  "learnerRefPlaceholder",
  "enterAction",
  "theoryStop",
  "question",
  "matching",
  "spotTheFake",
  "capstone",
  "nextStop",
  "mastered",
  "frontier",
  "locked",
  "known",
  "examine",
  "continueAction",
  "returnToTrail",
  "skipKnown",
  "unskipKnown",
  "groundedBadge",
  "topicDoor",
  "generatingProgress",
  "summit"
] satisfies LearnerVocabularyKey[];

test("learnerTerm returns text for every learner UI key", () => {
  for (const key of USED_KEYS) {
    assert.equal(learnerTerm(key), LEARNER_VOCABULARY[key]);
    assert.notEqual(learnerTerm(key).trim(), "");
  }
});

test("lessonSectionHeading maps section kinds to learner-facing headings", () => {
  assert.equal(lessonSectionHeading("gist"), "In a nutshell");
  assert.equal(lessonSectionHeading("intuition"), "Intuition");
  assert.equal(lessonSectionHeading("definition"), "Definition");
  assert.equal(lessonSectionHeading("examples"), "Examples");
  assert.equal(lessonSectionHeading("applications"), "Where it applies");
  assert.equal(lessonSectionHeading("formulas"), "Formulas");
});
