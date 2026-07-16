import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { RecallChallengeView } from "@lrnki/application/projection";
import { GuardianFight } from "@/components/GuardianFight";
import { useWindowDimensions } from "react-native";
import {
  GuardianReward,
  guardianRewardPreview,
  guardianRewardSceneWidth,
  type GuardianRewardPreview,
  type WonGuardianView
} from "@/components/GuardianReward";
import { queryClient } from "@/lib/api";
import { challengeQuery, expeditionQuery } from "@/lib/queries";
import { RouteStatus } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";
import type { VistaFocus } from "@/learn/crystalFormationLayout";

// Exact-resume Guardian route. The challenge query remains the one fight source; after
// the final reveal, this same route mounts a reward controller that explicitly refetches
// the existing Expedition projection before it classifies first win versus rematch.
export default function GuardianPage() {
  const router = useRouter();
  const { challengeId } = useLocalSearchParams<{ challengeId: string }>();
  const query = challengeQuery(challengeId);
  const challenge = useQuery({ ...query, refetchOnMount: "always" });

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  if (challenge.isPending) return <RouteStatus tone="loading" title={learnerTerm("guardianTitle")} />;
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
    <GuardianResolvedRoute
      key={challenge.data.challengeId}
      view={challenge.data}
      routeChallengeId={challengeId}
      onCommit={(view) => {
        queryClient.setQueryData(challengeQuery(view.challengeId).queryKey, view);
        if (view.challengeId !== challengeId) router.replace(`/guardian/${view.challengeId}`);
      }}
      onExit={goBack}
      onReplace={(href) => router.replace(href)}
    />
  );
}

export function GuardianResolvedRoute({
  view,
  routeChallengeId,
  onCommit,
  onExit,
  onReplace
}: Readonly<{
  view: RecallChallengeView;
  routeChallengeId: string;
  onCommit: (view: RecallChallengeView) => void;
  onExit: () => void;
  onReplace: (href: string) => void;
}>) {
  const [stage, setStage] = useState<"fight" | "reward">(() => view.state === "won" ? "reward" : "fight");
  const [transitionToken, setTransitionToken] = useState<string | null>(null);

  if (stage === "reward" && view.state === "won") {
    return (
      <GuardianRewardRoute
        challenge={view}
        transitionToken={transitionToken}
        onReplace={onReplace}
      />
    );
  }
  return (
    <GuardianFight
      key={routeChallengeId}
      view={view}
      onCommit={onCommit}
      onExit={onExit}
      onVictoryReady={(token) => {
        setTransitionToken(token);
        setStage("reward");
      }}
    />
  );
}

export function GuardianRewardRoute({
  challenge,
  transitionToken,
  onReplace
}: Readonly<{
  challenge: WonGuardianView;
  transitionToken: string | null;
  onReplace: (href: string) => void;
}>) {
  const { width: windowWidth } = useWindowDimensions();
  const query = expeditionQuery(challenge.enrichmentId);
  // Disabled initial execution lets this controller own one explicit invalidate/refetch,
  // including when a cached Expedition is already present.
  const expedition = useQuery({ ...query, enabled: false });
  const refreshStartedRef = useRef(false);
  useEffect(() => {
    if (refreshStartedRef.current) return;
    refreshStartedRef.current = true;
    void queryClient.invalidateQueries({ queryKey: query.queryKey, refetchType: "none" });
    void expedition.refetch();
  }, [expedition, query.queryKey]);

  // Never classify from a stale cache: the preview stays loading until this
  // controller's own refetch has landed (isFetchedAfterMount), then during retries.
  let preview: GuardianRewardPreview;
  if (!expedition.isFetchedAfterMount || expedition.isFetching) preview = { status: "loading" };
  else if (expedition.isError) preview = { status: "error" };
  else if (!expedition.data) preview = { status: "inconsistent" };
  else preview = guardianRewardPreview(challenge, expedition.data.session, guardianRewardSceneWidth(windowWidth));

  const continueRoute = `/expedition/${challenge.enrichmentId}`;
  const explore = (focus: VistaFocus) => {
    const focusParam = focus.kind === "summit" ? "summit" : `leg:${focus.sectionIndex}`;
    onReplace(`${continueRoute}?vista=1&formationFocus=${focusParam}`);
  };
  return (
    <GuardianReward
      challenge={challenge}
      preview={preview}
      transitionToken={transitionToken}
      onRetry={() => void expedition.refetch()}
      onContinue={() => onReplace(continueRoute)}
      onExplore={explore}
    />
  );
}
