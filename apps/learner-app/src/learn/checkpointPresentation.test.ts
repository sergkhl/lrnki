import assert from "node:assert/strict";
import { test } from "@jest/globals";
import { checkpointPresentation } from "./checkpointPresentation";

test("each stop kind maps to its one semantic icon", () => {
  assert.equal(checkpointPresentation({ kind: "theory", state: "available" }).icon, "book");
  assert.equal(checkpointPresentation({ kind: "option_select", state: "available" }).icon, "map-pin");
  assert.equal(checkpointPresentation({ kind: "matching", state: "available" }).icon, "rows");
  assert.equal(checkpointPresentation({ kind: "impostor", state: "available" }).icon, "search");
  assert.equal(checkpointPresentation({ kind: "capstone", state: "available" }).icon, "crystal");
});

test("a locked stop presents the lock while keeping its kind label", () => {
  const locked = checkpointPresentation({ kind: "option_select", state: "locked" });
  assert.equal(locked.icon, "lock");
  assert.equal(locked.label, checkpointPresentation({ kind: "option_select", state: "available" }).label);
});

test("a complete stop keeps its kind icon (trigger-to-header continuity, AE3)", () => {
  assert.equal(checkpointPresentation({ kind: "matching", state: "complete" }).icon, "rows");
});
