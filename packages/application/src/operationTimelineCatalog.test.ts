import assert from "node:assert/strict";
import test from "node:test";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type { OperationType } from "@lrnki/ports";
import {
  NON_LLM_STAGES,
  OPERATION_TIMELINE_CATALOG,
  SHARED_STAGES,
  isLlmStage,
  operationTimelineLlmSpendStageTags,
  operationTimelineStageKind,
  spendStageBelongsToOperation,
  stageBelongsToOperation
} from "./operationTimelineCatalog";

test("classifies the closed LLM vocabulary as LLM and non-LLM stages as non-LLM", () => {
  for (const stage of Object.values(STAGE_TAGS)) {
    assert.equal(isLlmStage(stage), true, `expected ${stage} to be an LLM stage`);
    assert.equal(operationTimelineStageKind(stage), "llm");
  }
  for (const stage of Object.values(NON_LLM_STAGES)) {
    assert.equal(isLlmStage(stage), false, `expected ${stage} to be non-LLM`);
    assert.equal(operationTimelineStageKind(stage), "non_llm");
  }
  assert.equal(operationTimelineStageKind("not-a-real-stage"), "unknown");
});

// R2: the catalog's LLM stages must be exactly the closed STAGE_TAGS vocabulary — no
// orphaned live tag (a tag no operation owns) and no dead tag (a tag no operation runs).
// This set-equality property replaces the hand-copied per-operation stage lists that used
// to restate the catalog: those could only ever re-encode the same gap, never catch it.
test("catalog LLM stages are exactly the closed stage-tag vocabulary, owned once except SHARED_STAGES", () => {
  // KTD7 relaxation: an LLM stage is owned-exactly-once UNLESS it is a SHARED_STAGE, in which
  // case it is owned-at-least-once. The set of owners for each stage is checked below.
  const ownersByStage = new Map<string, OperationType[]>();
  for (const [operationType, stages] of Object.entries(OPERATION_TIMELINE_CATALOG) as [
    OperationType,
    readonly { stage: string; kind: "llm" | "non_llm" }[]
  ][]) {
    for (const { stage, kind } of stages) {
      if (kind !== "llm") continue;
      const owners = ownersByStage.get(stage) ?? [];
      if (owners.length > 0 && !SHARED_STAGES.has(stage)) {
        assert.fail(`non-shared LLM stage ${stage} is claimed by both ${owners.join(", ")} and ${operationType}`);
      }
      ownersByStage.set(stage, [...owners, operationType]);
    }
  }

  const catalogLlmStages = new Set(ownersByStage.keys());
  const vocabulary = new Set<string>(Object.values(STAGE_TAGS));
  const orphanedTags = [...vocabulary].filter((tag) => !catalogLlmStages.has(tag));
  const unknownStages = [...catalogLlmStages].filter((stage) => !vocabulary.has(stage));
  assert.deepEqual(orphanedTags, [], `stage tags no operation catalogs: ${orphanedTags.join(", ")}`);
  assert.deepEqual(unknownStages, [], `catalog LLM stages absent from STAGE_TAGS: ${unknownStages.join(", ")}`);
});

// KTD7: SHARED_STAGES is EXACTLY the probe + grounding-generation descriptors plus the probe's
// node-embedding spend stage, claimed by EXACTLY enrichment and scaffold; every other LLM stage
// keeps a single owner.
test("SHARED_STAGES is exactly the probe + grounding + node-embedding stages, owned by exactly enrichment and scaffold", () => {
  assert.deepEqual(
    [...SHARED_STAGES].sort(),
    [STAGE_TAGS.groundingGeneration, STAGE_TAGS.knowledgeBoundaryProbe, STAGE_TAGS.nodeEmbedding].sort()
  );
  for (const stage of SHARED_STAGES) {
    assert.equal(stageBelongsToOperation(stage, "enrichment"), true, `${stage} belongs to enrichment`);
    assert.equal(stageBelongsToOperation(stage, "scaffold"), true, `${stage} belongs to scaffold`);
  }
  // The two OWNED scaffold stages belong ONLY to scaffold.
  for (const stage of [STAGE_TAGS.scaffoldOutlineGeneration, STAGE_TAGS.scaffoldContentGeneration]) {
    assert.equal(stageBelongsToOperation(stage, "scaffold"), true, `${stage} belongs to scaffold`);
    assert.equal(stageBelongsToOperation(stage, "enrichment"), false, `${stage} does not belong to enrichment`);
  }
});

test("catalog non-LLM stages are drawn from the known non-LLM vocabulary", () => {
  const knownNonLlm = new Set<string>(Object.values(NON_LLM_STAGES));
  for (const stages of Object.values(OPERATION_TIMELINE_CATALOG)) {
    for (const { stage, kind } of stages) {
      if (kind !== "non_llm") continue;
      assert.equal(knownNonLlm.has(stage), true, `${stage} is not a known non-LLM stage`);
    }
  }
});

// R1 regression: the four live tags that were silently dropped from cost & timings / journey
// reports until this change now belong to their owning operation.
test("previously-dropped spend tags belong to their owning operation", () => {
  assert.equal(spendStageBelongsToOperation(STAGE_TAGS.conceptSetSynthesis, "enrichment"), true);
  assert.equal(spendStageBelongsToOperation(STAGE_TAGS.knowledgeBoundaryProbe, "enrichment"), true);
  assert.equal(spendStageBelongsToOperation(STAGE_TAGS.rescuedNodeLabeling, "enrichment"), true);
  assert.equal(spendStageBelongsToOperation(STAGE_TAGS.impostorLieValidityJudgment, "study_items"), true);
  // A stage owned by enrichment must not be attributed to a different operation.
  assert.equal(spendStageBelongsToOperation(STAGE_TAGS.conceptSetSynthesis, "study_items"), false);
});

test("checks operation ownership without claiming unknown stages", () => {
  assert.equal(stageBelongsToOperation(STAGE_TAGS.admission, "extraction"), true);
  assert.equal(stageBelongsToOperation(STAGE_TAGS.admission, "enrichment"), false);
  for (const stage of [
    STAGE_TAGS.conceptLessonGeneration,
    STAGE_TAGS.studyItemBlueprint,
    STAGE_TAGS.studyItemGeneration,
    STAGE_TAGS.matchingGeneration,
    STAGE_TAGS.impostorGeneration
  ]) {
    assert.equal(stageBelongsToOperation(stage, "study_items"), true, `${stage} belongs to study_items`);
    assert.equal(stageBelongsToOperation(stage, "enrichment"), false, `${stage} does not belong to enrichment`);
  }
  assert.equal(stageBelongsToOperation(NON_LLM_STAGES.persist, "minting"), true);
  assert.equal(stageBelongsToOperation("not-a-real-stage", "extraction"), false);
});

test("spend ownership excludes non-LLM and unknown stages", () => {
  assert.equal(spendStageBelongsToOperation(STAGE_TAGS.admission, "extraction"), true);
  assert.equal(spendStageBelongsToOperation(STAGE_TAGS.admission, "enrichment"), false);
  assert.equal(spendStageBelongsToOperation(NON_LLM_STAGES.persist, "minting"), false);
  assert.equal(spendStageBelongsToOperation("not-a-real-stage", "extraction"), false);
});

test("LiteLLM spend-stage tags are LLM-only", () => {
  const tags = operationTimelineLlmSpendStageTags();
  assert.deepEqual(tags, Object.values(STAGE_TAGS));
  assert.ok(tags.every((stage) => operationTimelineStageKind(stage) === "llm"));
  assert.equal(new Set<string>(tags).has(NON_LLM_STAGES.persist), false);
});
