// One product-owned availability seam for the fully anchor-less Synthetic Topic Generation
// operation. Production-shaped entry points consume this value before they can create, claim, or
// execute work; the retained use-case stays directly testable while the capability is paused.
export type SyntheticTopicGenerationAvailability =
  | Readonly<{ status: "available" }>
  | Readonly<{ status: "paused"; message: string }>;

export const CURRENT_SYNTHETIC_TOPIC_GENERATION_AVAILABILITY = {
  status: "paused",
  message: "New topic scouting is paused while source-backed generation is checked. Choose a ready expedition in Explore."
} as const satisfies SyntheticTopicGenerationAvailability;

export function syntheticTopicGenerationIsAvailable(
  availability: SyntheticTopicGenerationAvailability
): availability is Readonly<{ status: "available" }> {
  return availability.status === "available";
}
