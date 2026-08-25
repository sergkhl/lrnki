import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import type { LearnerKnowledgeCapabilityAvailability } from "@lrnki/application";
import { ArrowRight, Compass, Map as MapIcon } from "lucide-react-native";
import { Badge, Button, Card, Progress, Text, buttonIconColor, colors } from "@/ui";
import { expeditionStatusLabel, learnerTerm } from "@/learn/vocabulary";
import { chooseCandidateExpedition, setActiveExpedition, startTopicExpedition } from "@/lib/actions";
import type { CatalogView, JournalView } from "@/lib/queries";
import { GenerationProgressCard } from "./GenerationProgressCard";
import { PlanExpeditionSheet } from "./PlanExpeditionSheet";
import { resumeLabel } from "@/learn/resumeLabel";

type JournalRow = JournalView["yours"][number];
type CandidateCardView = CatalogView["candidates"][number];

const EXAMPLE_TOPICS = [
  "Game Theory",
  "Rust ownership",
  "Bayesian statistics",
  "Supply chain resilience",
  "Database indexing",
  "Photosynthesis",
  "Contract law basics",
  "Climate feedback loops",
  "Classical conditioning",
  "Cryptographic signatures",
  "Cellular respiration",
  "Linear algebra intuition",
  "Urban transit planning",
  "Macroeconomic inflation",
  "Distributed systems consensus",
  "Renaissance art history"
] as const;

// Journal hierarchy (U2): unframed section groups with separated rows instead of
// card-inside-card nesting. Tiers arrive finished from the Expedition Journal
// projection: Continue, Your expeditions, Explore.
export function ExpeditionEntry({
  learnerStateRef,
  entry
}: Readonly<{ learnerStateRef: string; entry: JournalView }>) {
  const router = useRouter();
  const exampleTopics = pickExampleTopics(EXAMPLE_TOPICS, 4);
  const { started, yours, shared, capabilities } = entry;
  const topicGenerationAvailability = capabilities.syntheticTopicGeneration;
  return (
    <View className="gap-7">
      <View className="gap-2">
        <Badge>{learnerTerm("routeName")}</Badge>
        <View className="min-w-0">
          <Text variant="display">Choose an expedition</Text>
          <Text variant="caption" color="muted" numberOfLines={1}>Exploring as {learnerStateRef}</Text>
        </View>
      </View>

      {started.length > 0 ? (
        <JournalSection title="Continue" description="Pick up where you left off.">
          {started.map((expedition) => (
            <LearnerExpeditionRow
              key={expedition.learnerExpeditionId}
              expedition={expedition}
              topicGenerationAvailability={topicGenerationAvailability}
            />
          ))}
        </JournalSection>
      ) : null}

      <JournalSection title="Your expeditions" description="Ready and scouting journals for this explorer.">
        {topicGenerationAvailability.status === "available" ? (
          <PlanExpeditionSheet
            exampleTopics={exampleTopics}
            onCreate={(topic) => startTopicExpedition({ topic })}
          />
        ) : (
          <Card className="gap-2">
            <Text variant="title">{learnerTerm("topicGenerationPausedTitle")}</Text>
            <Text variant="caption" color="muted">{topicGenerationAvailability.message}</Text>
          </Card>
        )}
        {yours.length === 0 ? (
          <Text variant="label" color="muted">No expeditions yet.</Text>
        ) : yours.map((expedition) => (
          <LearnerExpeditionRow
            key={expedition.learnerExpeditionId}
            expedition={expedition}
            topicGenerationAvailability={topicGenerationAvailability}
          />
        ))}
      </JournalSection>

      <JournalSection
        title="Explore"
        description="Shared expeditions ready to begin."
        action={<Button variant="outline" size="compact" onPress={() => router.push("/catalog")} label="Browse all →" />}
      >
        {shared.length === 0 ? <NoCandidates /> : shared.map((candidate) => (
          <CandidateCard key={candidate.enrichmentId} candidate={candidate} />
        ))}
      </JournalSection>
    </View>
  );
}

function JournalSection({
  title,
  description,
  action,
  children
}: Readonly<{ title: string; description: string; action?: React.ReactNode; children: React.ReactNode }>) {
  return (
    <View className="gap-3">
      <View className="flex-row items-start justify-between gap-2 border-b border-line pb-2">
        <View className="min-w-0 flex-1">
          <Text variant="heading">{title}</Text>
          <Text variant="caption" color="muted">{description}</Text>
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

function LearnerExpeditionRow({
  expedition,
  topicGenerationAvailability
}: Readonly<{
  expedition: JournalRow;
  topicGenerationAvailability: LearnerKnowledgeCapabilityAvailability;
}>) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  if (expedition.status !== "ready") {
    return <GenerationProgressCard
      expedition={expedition}
      topicGenerationAvailability={topicGenerationAvailability}
    />;
  }
  const open = () => {
    if (pending) return;
    setPending(true);
    void (async () => {
      try {
        await setActiveExpedition({
          learnerExpeditionId: expedition.learnerExpeditionId
        });
        if (expedition.enrichmentId) {
          router.push({ pathname: "/expedition/[enrichmentId]", params: { enrichmentId: expedition.enrichmentId } });
        }
      } finally {
        setPending(false);
      }
    })();
  };
  const progressFraction = expedition.progress.itemsTotal > 0
    ? expedition.progress.itemsPassed / expedition.progress.itemsTotal
    : null;
  return (
    <View className="flex-row items-center gap-3 rounded-card border border-line bg-card p-3">
      <MapIcon size={20} color={colors.ink} />
      <View className="min-w-0 flex-1">
        <Text variant="label" numberOfLines={1}>{expedition.title}</Text>
        <Text variant="caption" color="muted" numberOfLines={1}>{expedition.declaredDomain}</Text>
        {/* Purpose teaser (plan 2026-07-10-001 U2): the layer's capability statement makes
            the mid-horizon goal visible before opening the trail. Absent row → no teaser;
            the progress line below is the mechanical fallback. */}
        {expedition.layerPurpose ? (
          <Text variant="caption" color="muted" className="italic" numberOfLines={2}>{expedition.layerPurpose}</Text>
        ) : null}
        <Text variant="caption" color="muted" numberOfLines={1}>
          {expedition.enrichmentId
            ? `${expedition.progress.itemsPassed} of ${expedition.progress.itemsTotal} collected`
            : expeditionStatusLabel(expedition.status)}
          {expedition.active ? " · active" : ""}
        </Text>
        {progressFraction !== null ? (
          <Progress fraction={progressFraction} accessibilityLabel="Crystals collected" className="mt-2" />
        ) : null}
      </View>
      <Button
        variant={expedition.active ? "secondary" : "outline"}
        size="compact"
        busy={pending}
        onPress={open}
        icon={<ArrowRight size={14} color={buttonIconColor(expedition.active ? "secondary" : "outline")} />}
        label={resumeLabel(expedition.progress)}
      />
    </View>
  );
}

export function CandidateCard({ candidate }: Readonly<{ candidate: CandidateCardView }>) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const begin = () => {
    if (pending) return;
    setPending(true);
    void (async () => {
      try {
        // The choose route upserts idempotently, so re-beginning an already-known
        // enrichment is safe; adopted candidates never reach this card (they surface
        // as owned rows instead).
        await chooseCandidateExpedition({
          enrichmentId: candidate.enrichmentId
        });
        router.push({ pathname: "/expedition/[enrichmentId]", params: { enrichmentId: candidate.enrichmentId } });
      } finally {
        setPending(false);
      }
    })();
  };
  return (
    <Card className="gap-3">
      <Badge className="border-gem-soft bg-gem-soft">{titleCase(candidate.declaredDomain)}</Badge>
      <Text variant="title">Expedition: {candidate.title}</Text>
      <Text variant="caption" color="muted">{candidate.totalStopCount} concepts to the summit</Text>
      <Button
        busy={pending}
        onPress={begin}
        icon={<Compass size={16} color={buttonIconColor("primary")} />}
        label={learnerTerm("beginExpedition")}
        // Content-neutral seam (plan 2026-07-15-001 U3): the real-backend suite selects the
        // runtime-discovered candidate by its enrichment id, never by generated title text.
        testID={`candidate-${candidate.enrichmentId}`}
      />
    </Card>
  );
}

function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function NoCandidates() {
  const router = useRouter();
  return (
    <Card className="gap-3">
      <Text variant="title" className="text-center">No ready expeditions</Text>
      <Text variant="caption" color="muted" className="text-center">Browse all expeditions, or plan a new trail.</Text>
      <Button variant="outline" onPress={() => router.push("/catalog")} label="Browse all →" />
    </Card>
  );
}

function pickExampleTopics(topics: readonly string[], count: number): string[] {
  return [...topics]
    .map((topic) => ({ topic, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, count)
    .map((entry) => entry.topic);
}
