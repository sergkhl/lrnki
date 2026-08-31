import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowLeft, BookOpen } from "lucide-react-native";

import { dispatchLearnerCommand } from "@/lib/actions";
import { catalogQuery, type CatalogView } from "@/lib/queries";
import {
  Badge,
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

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  if (catalog.isPending) return <RouteStatus tone="loading" title="Opening the authored catalog…" />;
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
          setError(commandMessage(adopted.status));
          return;
        }
        version = adopted.stateVersion;
      }
      const activated = await dispatchLearnerCommand({
        expectedStateVersion: version,
        command: { kind: "activate_expedition", expeditionKey: candidate.expeditionKey }
      });
      if (activated.status === "applied") router.push(`/expedition/${candidate.expeditionKey}`);
      else setError(commandMessage(activated.status));
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
            <Text color="muted">Directly authored trails, qualified together before the server starts.</Text>
          </View>
          <SourcesDialog expeditions={catalog.data.view.expeditions} />
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
              {candidate.active ? <Badge>Active</Badge> : candidate.adopted ? <Badge>In journal</Badge> : null}
            </View>
            <Text>{candidate.teaser}</Text>
            <Text variant="caption" color="muted">For {candidate.audience}</Text>
            <Button
              label={candidate.active ? "Resume trail" : candidate.adopted ? "Make active and open" : "Add to journal"}
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

function SourcesDialog({ expeditions }: Readonly<{ expeditions: CatalogView["expeditions"] }>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="compact"
        label="Sources"
        icon={<BookOpen size={14} color={buttonIconColor("outline")} />}
        onPress={() => setOpen(true)}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <OverlayHeader
          icon={<BookOpen size={20} color={colors.ink} />}
          title="Sources and disclosures"
          description="Project-owned authoring bases for this catalog. No external factual-verification claim is implied."
          onClose={() => setOpen(false)}
        />
        <DialogBody>
          {expeditions.map((expedition) => (
            <View key={expedition.expeditionKey} className="gap-2 border-b border-line pb-4 last:border-b-0">
              <Text variant="title">{expedition.title}</Text>
              {expedition.sourceCredits.map((credit, index) => (
                <View key={`${expedition.expeditionKey}-${index}`} className="gap-1">
                  <Text variant="label">{credit.title}{credit.author ? ` — ${credit.author}` : ""}</Text>
                  <Text variant="caption" color="muted">License: {credit.license}</Text>
                  {credit.note ? <Text variant="caption" color="muted">{credit.note}</Text> : null}
                </View>
              ))}
            </View>
          ))}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" label="Done" onPress={() => setOpen(false)} />
        </DialogFooter>
      </Dialog>
    </>
  );
}

function commandMessage(status: string): string {
  if (status === "stale") return "Your journal changed elsewhere. The catalog is refreshing; try again.";
  if (status === "content_changed") return "This content revision needs the guarded development reset.";
  return "The learner runtime refused this catalog action.";
}
