import assert from "node:assert/strict";
import test from "node:test";
import { resumeLabel } from "./resumeLabel";

test("resumeLabel returns Begin before any passed items", () => {
  assert.equal(resumeLabel({ itemsPassed: 0, itemsTotal: 4 }), "Begin");
});

test("resumeLabel returns Resume after progress exists", () => {
  assert.equal(resumeLabel({ itemsPassed: 3, itemsTotal: 4 }), "Resume");
});

test("resumeLabel returns Begin for missing progress", () => {
  assert.equal(resumeLabel(undefined), "Begin");
});
