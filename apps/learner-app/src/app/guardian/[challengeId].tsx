import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { GuardianFight } from "@/components/GuardianFight";
import { queryClient } from "@/lib/api";
import { challengeQuery } from "@/lib/queries";
import { RouteStatus } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";

// The route-addressable Guardian fight (plan 2026-07-13-003 U5, KTD9): the route read IS
// exact resume — the server refolds the durable challenge, so refresh/deep-link land on the
// same wards, shield, and current item. The query cache is the ONE view source: every
// answer/lifecycle response is committed back into it, and an over/foreign challenge (null)
// returns safely to the trail instead of synthesizing local state.
export default function GuardianPage() {
  const router = useRouter();
  const { challengeId } = useLocalSearchParams<{ challengeId: string }>();
  const query = challengeQuery(challengeId);
  const challenge = useQuery({ ...query, refetchOnMount: "always" });

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  // The Guardian route already partitioned pending/error/over cleanly; U2 keeps that exact
  // behavior and copy but renders it through the shared RouteStatus anatomy (KTD4).
  if (challenge.isPending) {
    return <RouteStatus tone="loading" title={learnerTerm("guardianTitle")} />;
  }

  if (challenge.isError) {
    return (
      <RouteStatus
        tone="error"
        title={learnerTerm("guardianLoadError")}
        actions={[
          { label: learnerTerm("guardianRetry"), onPress: () => void challenge.refetch() },
          { label: learnerTerm("returnToTrail"), variant: "outline", onPress: goBack }
        ]}
      />
    );
  }

  if (!challenge.data) {
    return (
      <RouteStatus
        tone="unavailable"
        title={learnerTerm("guardianOverTitle")}
        message={learnerTerm("guardianOverBody")}
        actions={[{ label: learnerTerm("returnToTrail"), onPress: goBack }]}
      />
    );
  }

  return (
    <GuardianFight
      // Abandon+fresh swaps the committed view to a NEW challenge id; keying on the durable
      // id remounts the fight (fresh board shuffle, cleared reveals) exactly then.
      key={challenge.data.challengeId}
      view={challenge.data}
      onCommit={(view) => {
        // Views commit under their OWN durable id; abandon+fresh yields a new challenge, so
        // the route moves there — a refresh then resumes the new fight, not a 404 on the old.
        queryClient.setQueryData(challengeQuery(view.challengeId).queryKey, view);
        if (view.challengeId !== challengeId) router.replace(`/guardian/${view.challengeId}`);
      }}
      onExit={goBack}
    />
  );
}
