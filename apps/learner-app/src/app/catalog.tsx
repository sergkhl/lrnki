import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { CandidateCard } from "@/components/ExpeditionEntry";
import { filterCatalogCandidates } from "@/learn/catalogSearch";
import { catalogQuery } from "@/lib/queries";
import { Button, Card, Input, RouteStatus, Screen, Text, buttonIconColor } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";

export default function CatalogPage() {
  const router = useRouter();
  const catalog = useQuery(catalogQuery);
  const [search, setSearch] = useState("");
  const results = useMemo(() => filterCatalogCandidates(catalog.data?.candidates ?? [], search), [catalog.data, search]);
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  // Explicit pending/error states (R6): loading is no longer a blank list, and a failed read
  // is distinct from a valid empty catalog (which the data branch below still renders as its
  // own "no expeditions" card). Retry keeps the Browse route and its navigation context.
  if (catalog.isPending) {
    return <RouteStatus tone="loading" title={learnerTerm("catalogLoading")} />;
  }
  if (catalog.isError || !catalog.data) {
    return (
      <RouteStatus
        tone="error"
        title={learnerTerm("catalogErrorTitle")}
        message={learnerTerm("catalogErrorBody")}
        actions={[
          { label: learnerTerm("retryAction"), onPress: () => void catalog.refetch() },
          { label: learnerTerm("returnToTrail"), variant: "outline", onPress: goBack }
        ]}
      />
    );
  }

  return (
    <Screen>
      <View className="border-b border-line bg-card px-4 py-2">
        <Button
          variant="outline"
          size="compact"
          onPress={goBack}
          icon={<ArrowLeft size={14} color={buttonIconColor("outline")} />}
          label="Back to journal"
          className="self-start"
        />
      </View>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-lg gap-4 p-4">
        <View className="gap-1">
          <Text variant="display">Browse expeditions</Text>
          <Text variant="caption" color="muted">Find a shared trail ready to begin.</Text>
        </View>
        <Input
          label="Search expeditions"
          placeholder="Try photosynthesis or oceanography"
          value={search}
          onChangeText={setSearch}
          accessibilityLabel="Search expeditions"
        />
        {results.length > 0 ? results.map((candidate) => (
          <CandidateCard key={candidate.enrichmentId} candidate={candidate} />
        )) : (
          <Card>
            <Text variant="title" className="text-center">{search.trim() ? "No matching expeditions" : "No expeditions to browse"}</Text>
            <Text variant="caption" color="muted" className="text-center">
              {search.trim() ? "Try a different title or domain." : "Plan a new trail from your journal."}
            </Text>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
