import { ActivityIndicator, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { GuardianFight } from "@/components/GuardianFight";
import { queryClient } from "@/lib/api";
import { challengeQuery } from "@/lib/queries";
import { Button, Screen, Text, colors } from "@/ui";
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

  if (challenge.isPending) {
    return (
      <Screen className="items-center justify-center gap-3 p-6">
        <ActivityIndicator size="large" color={colors.gem} />
        <Text variant="label" color="muted">{learnerTerm("guardianTitle")}</Text>
      </Screen>
    );
  }

  if (challenge.isError) {
    return (
      <Screen className="items-center justify-center gap-3 p-6">
        <Text variant="title">{learnerTerm("guardianLoadError")}</Text>
        <View className="flex-row gap-2">
          <Button variant="primary" onPress={() => void challenge.refetch()} label={learnerTerm("guardianRetry")} />
          <Button variant="outline" onPress={goBack} label={learnerTerm("returnToTrail")} />
        </View>
      </Screen>
    );
  }

  if (!challenge.data) {
    return (
      <Screen className="items-center justify-center gap-3 p-6">
        <Text variant="title">{learnerTerm("guardianOverTitle")}</Text>
        <Text variant="label" color="muted" className="text-center font-normal">{learnerTerm("guardianOverBody")}</Text>
        <Button variant="primary" onPress={goBack} label={learnerTerm("returnToTrail")} />
      </Screen>
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
