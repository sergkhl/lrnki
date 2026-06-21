import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { assessmentDisabled, calibrationRatingFor } from "./studyView";

const here = dirname(fileURLToPath(import.meta.url));

// Pure presentation helpers only — component rendering is verified by the U7 real-use run
// (no jsdom in this project's test convention).

test("assess controls are disabled until the answer is revealed (Covers R6)", () => {
  assert.equal(assessmentDisabled(false), true);
  assert.equal(assessmentDisabled(true), false);
});

test("'I know it' maps to a propagating 'good'; 'not sure' maps to a non-propagating 'hard' (Covers R2/R3)", () => {
  assert.equal(calibrationRatingFor("know_it"), "good");
  assert.equal(calibrationRatingFor("not_sure"), "hard");
});

// Covers R15: the transfer-ready modules import no Admin-Lab loader and no server action,
// so a later Learner app consumes them unchanged. A structural guard on the import surface.
test("study modules import no @/lib loader and no server action (Covers R15)", () => {
  for (const file of ["RecallCard.tsx", "CalibrationSweep.tsx", "StudySideSheet.tsx", "studyView.ts"]) {
    const source = readFileSync(join(here, file), "utf8");
    assert.equal(source.includes("@/lib/"), false, `${file} must not import an Admin-Lab loader`);
    assert.equal(source.includes("/study/actions"), false, `${file} must not import a study server action`);
    assert.equal(source.includes("\"use server\""), false, `${file} must not be a server-action module`);
  }
});
