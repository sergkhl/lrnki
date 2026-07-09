import assert from "node:assert/strict";
import test from "node:test";
import { resumeLabel } from "./resumeLabel";

test("resumeLabel returns Begin before any passed items", () => {
  assert.equal(resumeLabel({ itemsPassed: 0, itemsAttempted: 0, lessonsRead: 0, itemsTotal: 4 }), "Begin");
});

test("resumeLabel returns Resume after a wrong-answer attempt exists", () => {
  assert.equal(resumeLabel({ itemsPassed: 0, itemsAttempted: 1, lessonsRead: 0, itemsTotal: 4 }), "Resume");
});

test("resumeLabel returns Resume after a lesson read exists", () => {
  assert.equal(resumeLabel({ itemsPassed: 0, itemsAttempted: 0, lessonsRead: 1, itemsTotal: 4 }), "Resume");
});

test("resumeLabel returns Begin for missing progress", () => {
  assert.equal(resumeLabel(undefined), "Begin");
});
