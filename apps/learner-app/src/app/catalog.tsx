import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

import { SourceCreditsButton } from "@/components/SourceCredits";
import { dispatchLearnerCommand } from "@/lib/actions";
import { commandFeedback, learnerTerm } from "@/learn/vocabulary";
import { catalogQuery, type CatalogView } from "@/lib/queries";
import {
  Button,
  Card,
  Input,
  RouteStatus,
  Screen,
  Text,
  buttonIconColor,
} from "@/ui";

export default function CatalogPage() {
  const router = useRouter();
  const catalog = useQuery(catalogQuery);
  const [search, setSearch] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const view = catalog.data?.view;
  const expeditions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!view || !query) return view?.expeditions ?? [];
    return view.expeditions.filter((candidate) =>
      [candidate.title, candidate.teaser, candidate.declaredDomain, candidate.audience]
        .some((value) => value.toLocaleLowerCase().includes(query))
    );
  }, [search, view]);

  const goBack = () => router.replace("/");

  if (catalog.isPending) return <RouteStatus tone="loading" title="Opening the catalog…" />;
  if (catalog.isError || !catalog.data) {
    return (
      <RouteStatus
        tone="error"
        title="The catalog is out of reach"
        actions={[
          { label: "Try again", onPress: () => void catalog.refetch() },
          { label: "Back to journal", variant: "outline", onPress: goBack }
        ]}
      />
    );
  }

  const open = async (candidate: CatalogView["expeditions"][number]) => {
    setError(null);
    if (candidate.active) {
      router.push(`/expedition/${candidate.expeditionKey}`);
      return;
    }
    setPendingKey(candidate.expeditionKey);
    try {
      let version = catalog.data.stateVersion;
      if (!candidate.adopted) {
        const adopted = await dispatchLearnerCommand({
          expectedStateVersion: version,
          command: { kind: "adopt_expedition", expeditionKey: candidate.expeditionKey }
        });
        if (adopted.status !== "applied") {
          setError(commandFeedback(adopted.status));
          return;
        }
        version = adopted.stateVersion;
      }
      const activated = await dispatchLearnerCommand({
        expectedStateVersion: version,
        command: { kind: "activate_expedition", expeditionKey: candidate.expeditionKey }
      });
      if (activated.status === "applied") router.push(`/expedition/${candidate.expeditionKey}`);
      else setError(commandFeedback(activated.status));
    } catch {
      setError("The expedition could not be opened. Try again.");
    } finally {
      setPendingKey(null);
    }
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
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl gap-4 p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text variant="display">Browse expeditions</Text>
            <Text color="muted">{learnerTerm("catalogDescription")}</Text>
          </View>
        </View>
        <Input
          label="Search expeditions"
          placeholder="Try reasoning or statistics"
          value={search}
          onChangeText={setSearch}
        />
        {error ? (
          <Card className="border-destructive">
            <Text color="destructive">{error}</Text>
          </Card>
        ) : null}
        {expeditions.length === 0 ? (
          <Card>
            <Text variant="title" className="text-center">No matching expeditions</Text>
            <Text color="muted" className="text-center">Try another title, domain, or audience.</Text>
          </Card>
        ) : expeditions.map((candidate) => (
          <Card key={candidate.expeditionKey} className="gap-3">
            <View className="flex-row flex-wrap items-start justify-between gap-2">
              <View className="min-w-0 flex-1 gap-1">
                <Text variant="heading">{candidate.title}</Text>
                <Text variant="caption" color="muted">{candidate.declaredDomain}</Text>
              </View>
              <SourceCreditsButton sourceCredits={candidate.sourceCredits} sourceCreditKeys={candidate.sourceCredits.map(credit => credit.key)}
                contextLabel={candidate.title} />
            </View>
            <Text>{candidate.teaser}</Text>
            <Text variant="caption" color="muted">For {candidate.audience}</Text>
            <Button
              label={candidate.active ? "Resume" : candidate.adopted ? "Open expedition" : "Start expedition"}
              busy={pendingKey === candidate.expeditionKey}
              disabled={pendingKey !== null}
              onPress={() => void open(candidate)}
            />
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
