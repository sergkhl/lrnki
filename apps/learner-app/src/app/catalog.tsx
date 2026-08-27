import { useMemo, useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowLeft, BookOpen } from "lucide-react-native";
import { CandidateCard } from "@/components/ExpeditionEntry";
import { filterCatalogCandidates } from "@/learn/catalogSearch";
import { catalogQuery } from "@/lib/queries";
import {
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogFooter,
  Input,
  OverlayHeader,
  RouteStatus,
  Screen,
  Text,
  buttonIconColor,
  colors
} from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";
import type { CatalogView } from "@/lib/queries";

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
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text variant="display">Browse expeditions</Text>
            <Text variant="caption" color="muted">Find a shared trail ready to begin.</Text>
          </View>
          <SourcesAndLicensesDialog sources={catalog.data.sources} />
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

export function SourcesAndLicensesDialog({
  sources
}: Readonly<{ sources: CatalogView["sources"] }>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="compact"
        onPress={() => setOpen(true)}
        icon={<BookOpen size={14} color={buttonIconColor("outline")} />}
        label="Sources & licenses"
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <OverlayHeader
          icon={<BookOpen size={20} color={colors.ink} />}
          title="Sources & licenses"
          description="Provenance for the accepted expedition catalog."
          onClose={() => setOpen(false)}
        />
        <DialogBody>
          {sources.length === 0 ? (
            <Text color="muted">No accepted source credits are published.</Text>
          ) : sources.map((entry) => (
            <View key={entry.catalogKey} className="gap-2 border-b border-line pb-4 last:border-b-0">
              <Text variant="title">{entry.title}</Text>
              <Text variant="caption" color="muted">
                {sourcePolicyDisclosure(entry.sourceProvenance)}
              </Text>
              {entry.sourceCredits.map((credit) => (
                <View key={credit.sourceResourceId} className="gap-1">
                  <Text variant="label">{credit.title}</Text>
                  {credit.sourceUri ? <SourceUri value={credit.sourceUri} /> : null}
                  {credit.license ? (
                    <Text variant="caption" color="muted">License: {credit.license}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          ))}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onPress={() => setOpen(false)} label="Done" />
        </DialogFooter>
      </Dialog>
    </>
  );
}

function SourceUri({ value }: Readonly<{ value: string }>) {
  if (!/^https?:\/\//i.test(value)) {
    return <Text variant="caption" color="muted">Source: {value}</Text>;
  }
  return (
    <Text
      variant="caption"
      accessibilityRole="link"
      className="underline"
      onPress={() => void Linking.openURL(value)}
    >
      {value}
    </Text>
  );
}

function sourcePolicyDisclosure(source: CatalogView["sources"][number]["sourceProvenance"]): string {
  const authorship = source.authorship === "lrnki_model_authored_project_source"
    ? "lrnki project-authored playtest source"
    : source.authorship;
  const knowledge = source.knowledgeBasis === "general_model_knowledge_only"
    ? "general model knowledge"
    : source.knowledgeBasis;
  const verification = source.externalClaimVerificationRequired
    ? "external claims require verification"
    : "external claims are not independently verified";
  const scope = source.acceptanceScope === "local_shared_learner_playtest"
    ? "accepted for local shared learner playtest"
    : source.acceptanceScope;
  return `${authorship} · ${knowledge} · ${verification} · ${scope}`;
}
