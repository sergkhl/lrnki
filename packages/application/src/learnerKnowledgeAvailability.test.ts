import assert from "node:assert/strict";
import { test } from "node:test";
import type { DerivedGraphDetail } from "@lrnki/ports";
import {
  CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY,
  derivedGraphLearnerKnowledgeAvailability,
  learnerKnowledgeCapabilityIsAvailable,
  learnerKnowledgeIsAvailable,
  type LearnerKnowledgeAvailability,
  type LearnerKnowledgeCapability
} from "./learnerKnowledgeAvailability";

const EXPECTED_CAPABILITIES = [
  "syntheticTopicGeneration",
  "llmGroundedPrerequisites",
  "generatedSupportSteps",
  "sourceExpeditionAdoption",
  "sourceMentionedPrerequisites",
  "referenceSupportSteps"
] as const satisfies readonly LearnerKnowledgeCapability[];

test("the current policy holds out source-less knowledge and keeps source-backed paths open", () => {
  assert.deepEqual(
    Object.keys(CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY).sort(),
    [...EXPECTED_CAPABILITIES].sort()
  );
  assert.deepEqual(
    EXPECTED_CAPABILITIES.filter((capability) =>
      learnerKnowledgeCapabilityIsAvailable(CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY, capability)
    ),
    ["sourceExpeditionAdoption", "sourceMentionedPrerequisites", "referenceSupportSteps"]
  );
  assert.equal(
    CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY.syntheticTopicGeneration.reason,
    "source_backed_workflow_only"
  );
  assert.equal(
    CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY.llmGroundedPrerequisites.reason,
    "curated_source_evidence_required"
  );
  assert.equal(
    CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY.generatedSupportSteps.reason,
    "curated_source_evidence_required"
  );
});

test("the leaf predicate narrows an injected available arm without changing the current policy", () => {
  const available: LearnerKnowledgeAvailability["syntheticTopicGeneration"] = { status: "available" };
  assert.equal(learnerKnowledgeIsAvailable(available), true);
  assert.equal(learnerKnowledgeIsAvailable(CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY.syntheticTopicGeneration), false);
});

test("one graph assessment returns the held-out capability and keeps source-mentioned evidence available", () => {
  const detail = (groundingOrigin: "document_anchored" | "source_mentioned" | "llm_grounded") => ({
    nodes: [{ groundingOrigin }]
  } as unknown as DerivedGraphDetail);
  assert.deepEqual(
    derivedGraphLearnerKnowledgeAvailability(CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY, detail("llm_grounded")),
    {
      ...CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY.llmGroundedPrerequisites,
      capability: "llmGroundedPrerequisites"
    }
  );
  assert.deepEqual(
    derivedGraphLearnerKnowledgeAvailability(CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY, detail("source_mentioned")),
    { status: "available" }
  );
});
