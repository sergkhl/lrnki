import type { RecallScopeStatus } from "@lrnki/application/projection";
import { createChallengeAction } from "./actions";
import { queryClient } from "./api";
import { challengeQuery } from "./queries";

// One entry rule for every Guardian affordance (plan 2026-07-13-003 U6): an active scope
// resumes its durable challenge; anything else asks the server to create one — and a lost
// create race (409 active_challenge_exists) resumes the winner, so two taps or two devices
// converge on the same fight. The created/read view is seeded into the challenge query
// cache so the fight route renders without a second read.
export async function enterGuardianScope(input: {
  enrichmentId: string;
  scope: Pick<RecallScopeStatus, "scopeKind" | "anchorDerivedNodeId" | "state" | "activeChallengeId">;
}): Promise<{ entered: true; challengeId: string } | { entered: false }> {
  if (input.scope.state === "active" && input.scope.activeChallengeId) {
    return { entered: true, challengeId: input.scope.activeChallengeId };
  }
  const created = await createChallengeAction({
    enrichmentId: input.enrichmentId,
    scopeKind: input.scope.scopeKind,
    anchorDerivedNodeId: input.scope.anchorDerivedNodeId
  });
  if ("created" in created && created.created === true) {
    queryClient.setQueryData(challengeQuery(created.view.challengeId).queryKey, created.view);
    return { entered: true, challengeId: created.view.challengeId };
  }
  if ("refused" in created && created.refused === "active_challenge_exists") {
    return { entered: true, challengeId: created.activeChallengeId };
  }
  return { entered: false };
}
