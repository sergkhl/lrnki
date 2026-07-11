import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { CandidateCard } from "@/components/ExpeditionEntry";
import { filterCatalogCandidates } from "@/learn/catalogSearch";
import { partitionExpeditionJournal } from "@/learn/expeditionJournalView";
import { catalogQuery } from "@/lib/queries";
import { Button, Card, Input, Screen, Text, buttonIconColor } from "@/ui";

export default function CatalogPage() {
  const router = useRouter();
  const catalog = useQuery(catalogQuery);
  const [search, setSearch] = useState("");
  const shared = catalog.data ? partitionExpeditionJournal(catalog.data).shared : [];
  const results = useMemo(() => filterCatalogCandidates(shared, search), [shared, search]);
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

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
        {catalog.isPending ? null : results.length > 0 ? results.map((candidate) => (
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
