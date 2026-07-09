import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowRight, Compass, Map as MapIcon } from "lucide-react-native";
import type { ExpeditionCandidate, LearnerExpeditionEntry } from "@lrnki/application/projection";
import { BadgeLabel, Btn, Card, CardDescription, CardTitle } from "./ui";
import { expeditionStatusLabel, learnerTerm } from "@/learn/vocabulary";
import { chooseCandidateExpedition, setActiveExpedition, startTopicExpedition } from "@/lib/actions";
import type { JournalView } from "@/lib/queries";
import { partitionExpeditionJournal } from "@/learn/expeditionJournalView";
import { GenerationProgressCard } from "./GenerationProgressCard";
import { PlanExpeditionModal } from "./PlanExpeditionModal";
import { resumeLabel } from "@/learn/resumeLabel";

type LearnerExpeditionRowModel = LearnerExpeditionEntry["learnerExpeditions"][number];

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

export function ExpeditionEntry({
  learnerStateRef,
  entry
}: Readonly<{ learnerStateRef: string; entry: JournalView }>) {
  const exampleTopics = pickExampleTopics(EXAMPLE_TOPICS, 4);
  const { started, yours, shared } = partitionExpeditionJournal(entry);
  return (
    <View className="gap-6">
      <View className="gap-2">
        <BadgeLabel>{learnerTerm("routeName")}</BadgeLabel>
        <View className="min-w-0">
          <Text className="text-3xl font-semibold text-ink">Choose an expedition</Text>
          <Text className="text-sm text-muted" numberOfLines={1}>Exploring as {learnerStateRef}</Text>
        </View>
      </View>

      {started.length > 0 ? (
        <Card className="gap-3">
          <View>
            <CardTitle>Continue</CardTitle>
            <CardDescription>Pick up where you left off.</CardDescription>
          </View>
          {started.map((expedition) => (
            <LearnerExpeditionRow key={expedition.learnerExpeditionId} expedition={expedition} timelines={entry.timelinesByOperationId} />
          ))}
        </Card>
      ) : null}

      <Card className="gap-3">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <CardTitle>Your expeditions</CardTitle>
            <CardDescription>Ready and scouting journals for this explorer.</CardDescription>
          </View>
        </View>
        <PlanExpeditionModal
          exampleTopics={exampleTopics}
          onCreate={(topic) => startTopicExpedition({ topic })}
        />
        {yours.length === 0 ? (
          <Text className="text-sm text-muted">No expeditions yet.</Text>
        ) : yours.map((expedition) => (
          <LearnerExpeditionRow key={expedition.learnerExpeditionId} expedition={expedition} timelines={entry.timelinesByOperationId} />
        ))}
      </Card>

      <View className="gap-4">
        <View className="min-w-0">
          <Text className="text-lg font-semibold text-ink">Explore</Text>
          <Text className="text-sm text-muted">Shared expeditions ready to begin.</Text>
        </View>
        <View className="gap-4">
          {shared.length === 0 ? <NoCandidates /> : shared.map((candidate) => (
            <CandidateCard key={candidate.enrichmentId} candidate={candidate} />
          ))}
        </View>
      </View>
    </View>
  );
}

function LearnerExpeditionRow({
  expedition,
  timelines
}: Readonly<{ expedition: LearnerExpeditionRowModel; timelines: JournalView["timelinesByOperationId"] }>) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  if (expedition.status === "generating" || expedition.status === "failed") {
    return <GenerationProgressCard expedition={expedition} timeline={expedition.currentOperationId ? timelines[expedition.currentOperationId] : undefined} />;
  }
  const open = () => {
    setPending(true);
    void (async () => {
      try {
        await setActiveExpedition({
          learnerExpeditionId: expedition.learnerExpeditionId,
          enrichmentId: expedition.enrichmentId
        });
        if (expedition.enrichmentId) {
          router.push({ pathname: "/expedition/[enrichmentId]", params: { enrichmentId: expedition.enrichmentId } });
        }
      } finally {
        setPending(false);
      }
    })();
  };
  const progressFraction =
    expedition.status === "ready" && expedition.progress && expedition.progress.itemsTotal > 0
      ? expedition.progress.itemsPassed / expedition.progress.itemsTotal
      : null;
  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-line bg-card p-3">
      <MapIcon size={20} color="#241f18" />
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-medium text-ink" numberOfLines={1}>{expedition.title}</Text>
        <Text className="text-xs text-muted" numberOfLines={1}>{expedition.declaredDomain}</Text>
        <Text className="text-xs text-muted" numberOfLines={1}>
          {expedition.status === "ready" && expedition.progress
            ? `${expedition.progress.itemsPassed} of ${expedition.progress.itemsTotal} collected`
            : expeditionStatusLabel(expedition.status)}
          {expedition.active ? " · active" : ""}
        </Text>
        {progressFraction !== null ? (
          <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
            <View className="h-full rounded-full bg-gem" style={{ width: `${Math.round(progressFraction * 100)}%` }} />
          </View>
        ) : null}
      </View>
      <Btn
        variant={expedition.active ? "secondary" : "outline"}
        disabled={pending || expedition.status !== "ready"}
        onPress={open}
        icon={<ArrowRight size={14} color="#241f18" />}
        label={resumeLabel(expedition.progress)}
      />
    </View>
  );
}

function CandidateCard({ candidate }: Readonly<{ candidate: ExpeditionCandidate }>) {
  const existingLearnerExpeditionId = candidate.existingLearnerExpeditionId;
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const begin = () => {
    setPending(true);
    void (async () => {
      try {
        if (existingLearnerExpeditionId) {
          await setActiveExpedition({
            learnerExpeditionId: existingLearnerExpeditionId,
            enrichmentId: candidate.enrichmentId
          });
        } else {
          await chooseCandidateExpedition({
            enrichmentId: candidate.enrichmentId,
            title: candidate.title,
            declaredDomain: candidate.declaredDomain
          });
        }
        router.push({ pathname: "/expedition/[enrichmentId]", params: { enrichmentId: candidate.enrichmentId } });
      } finally {
        setPending(false);
      }
    })();
  };
  return (
    <Card className="gap-3">
      <BadgeLabel className="border-gem-soft bg-gem-soft">{titleCase(candidate.declaredDomain)}</BadgeLabel>
      <Text className="text-xl font-semibold text-ink">Expedition: {candidate.title}</Text>
      <CardDescription>{candidate.totalStopCount} concepts to the summit</CardDescription>
      <Btn
        disabled={pending}
        onPress={begin}
        icon={<Compass size={16} color="#fdfaf2" />}
        label={existingLearnerExpeditionId ? learnerTerm("resumeExpedition") : learnerTerm("beginExpedition")}
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
  return (
    <Card>
      <Text className="text-center text-base font-semibold text-ink">No ready expeditions</Text>
      <Text className="text-center text-sm text-muted">Paste course data to create the first trail.</Text>
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
