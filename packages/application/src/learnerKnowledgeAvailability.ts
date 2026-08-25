// One product-owned policy for every learner-knowledge path whose current evidence boundary differs.
// Production compositions read this value before they can create, claim, publish, or project work.
// The retained implementations remain directly testable by injecting an available arm; this policy
// decides only current learner availability and never becomes a general feature-flag framework.

import type { DerivedGraphDetail } from "@lrnki/ports";

export type LearnerKnowledgeHoldoutReason =
  | "source_backed_workflow_only"
  | "curated_source_evidence_required";

export type LearnerKnowledgeCapabilityAvailability =
  | Readonly<{ status: "available" }>
  | Readonly<{ status: "paused"; reason: LearnerKnowledgeHoldoutReason; message: string }>;

export type LearnerKnowledgeCapability =
  | "syntheticTopicGeneration"
  | "llmGroundedPrerequisites"
  | "generatedSupportSteps"
  | "sourceExpeditionAdoption"
  | "sourceMentionedPrerequisites"
  | "referenceSupportSteps";

export type LearnerKnowledgeAvailability = Readonly<
  Record<LearnerKnowledgeCapability, LearnerKnowledgeCapabilityAvailability>
>;

export type DerivedGraphLearnerKnowledgeAvailability =
  | Readonly<{ status: "available" }>
  | Readonly<{
      status: "paused";
      capability: "llmGroundedPrerequisites" | "sourceMentionedPrerequisites";
      reason: LearnerKnowledgeHoldoutReason;
      message: string;
    }>;

export const CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY = {
  syntheticTopicGeneration: {
    status: "paused",
    reason: "source_backed_workflow_only",
    message:
      "New topic scouting is paused while source-backed generation is checked. Choose a ready expedition in Explore."
  },
  llmGroundedPrerequisites: {
    status: "paused",
    reason: "curated_source_evidence_required",
    message: "A prerequisite needs Curated Source evidence before it can enter a learner expedition."
  },
  generatedSupportSteps: {
    status: "paused",
    reason: "curated_source_evidence_required",
    message: "Generated Support Steps are paused; exact source-backed references remain available."
  },
  sourceExpeditionAdoption: { status: "available" },
  sourceMentionedPrerequisites: { status: "available" },
  referenceSupportSteps: { status: "available" }
} as const satisfies LearnerKnowledgeAvailability;

export function learnerKnowledgeIsAvailable(
  availability: LearnerKnowledgeCapabilityAvailability
): availability is Readonly<{ status: "available" }> {
  return availability.status === "available";
}

export function learnerKnowledgeCapabilityIsAvailable(
  availability: LearnerKnowledgeAvailability,
  capability: LearnerKnowledgeCapability
): boolean {
  return learnerKnowledgeIsAvailable(availability[capability]);
}

export function derivedGraphLearnerKnowledgeAvailability(
  availability: LearnerKnowledgeAvailability,
  detail: DerivedGraphDetail
): DerivedGraphLearnerKnowledgeAvailability {
  const llmGrounded = availability.llmGroundedPrerequisites;
  if (!learnerKnowledgeIsAvailable(llmGrounded) &&
      detail.nodes.some((node) => node.groundingOrigin === "llm_grounded")) {
    return { ...llmGrounded, capability: "llmGroundedPrerequisites" };
  }
  const sourceMentioned = availability.sourceMentionedPrerequisites;
  if (!learnerKnowledgeIsAvailable(sourceMentioned) &&
      detail.nodes.some((node) => node.groundingOrigin === "source_mentioned")) {
    return { ...sourceMentioned, capability: "sourceMentionedPrerequisites" };
  }
  return { status: "available" };
}
