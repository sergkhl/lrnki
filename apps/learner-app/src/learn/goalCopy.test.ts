import assert from "node:assert/strict";
import { test } from "@jest/globals";
import { isSummitPush, legBannerLine, summitLine, terminusLine } from "./goalCopy";
import type { TrailView } from "@lrnki/application/projection";

function trail(overrides: Partial<TrailView> = {}): TrailView {
  return {
    concepts: [],
    sections: [
      { sectionIndex: 0, milestoneLabel: "A", state: "complete", conceptCount: 2, masteredCount: 2, stopsComplete: 4, stopsTotal: 4, firstConceptId: "n1", gatingLabels: [] },
      { sectionIndex: 1, milestoneLabel: "B", state: "available", conceptCount: 3, masteredCount: 1, stopsComplete: 2, stopsTotal: 6, firstConceptId: "n3", gatingLabels: [] }
    ],
    currentSectionIndex: 1,
    nextStopId: "s1",
    nextStopLabel: "Stop",
    masteredCount: 3,
    totalClusters: 5,
    ...overrides
  };
}

test("summitLine themes the purpose and falls back to the mechanical template", () => {
  assert.equal(
    summitLine({ summitLabel: "Bayes' theorem", layerPurpose: "You can update beliefs with evidence.", legCount: 2, crystalCount: 5 }),
    "Summit: Bayes' theorem — You can update beliefs with evidence."
  );
  assert.equal(
    summitLine({ summitLabel: "Bayes' theorem", layerPurpose: null, legCount: 2, crystalCount: 5 }),
    "Summit: Bayes' theorem — 2 legs, 5 crystals"
  );
  assert.equal(
    summitLine({ summitLabel: "X", layerPurpose: "  ", legCount: 1, crystalCount: 1 }),
    "Summit: X — 1 leg, 1 crystal"
  );
});

test("isSummitPush is true only in the final leg with work remaining", () => {
  assert.equal(isSummitPush(trail()), true);
  assert.equal(isSummitPush(trail({ currentSectionIndex: 0 })), false);
  assert.equal(isSummitPush(trail({ masteredCount: 5 })), false);
  assert.equal(isSummitPush(trail({ sections: [] })), false);
});

test("legBannerLine announces the guarded milestone and flips to secured", () => {
  assert.equal(
    legBannerLine({ sectionIndex: 1, conceptCount: 5, masteredCount: 0, milestoneLabel: "Bayes' theorem" }),
    "Leg 2 · 5 crystals guard Bayes' theorem"
  );
  assert.equal(
    legBannerLine({ sectionIndex: 0, conceptCount: 3, masteredCount: 2, milestoneLabel: "Priors" }),
    "Leg 1 · 1 crystal guards Priors"
  );
  assert.equal(
    legBannerLine({ sectionIndex: 0, conceptCount: 3, masteredCount: 3, milestoneLabel: "Priors" }),
    "Leg 1 · Priors secured"
  );
});

test("terminusLine counts remaining crystals and celebrates completion", () => {
  assert.equal(terminusLine(trail()), "2 crystals still guard the summit.");
  assert.equal(terminusLine(trail({ masteredCount: 4 })), "1 crystal still guards the summit.");
  assert.equal(terminusLine(trail({ masteredCount: 5 })), "Every crystal is grown. The summit is yours.");
});
