import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { StudySession } from "@lrnki/application/projection";
import { clearLearnerVerdict, refreshLearnerExpedition, setLearnerVerdict } from "@/lib/actions";
import { Btn } from "./ui";
import { CrystalGlyph } from "./CrystalGlyph";
import type { TrailCluster } from "@/learn/trailView";
import { learnerTerm } from "@/learn/vocabulary";

// The concept row above its stops. Tapping expands the verdict panel inline (the web
// popover becomes an accordion — no portal layer on native): skip-as-known or unmark.
export function ConceptMarker({ concept, session }: Readonly<{ concept: TrailCluster; session: StudySession }>) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const isMastered = concept.state === "mastered";
  const isKnownVerdict = session.verdictByNode[concept.derivedNodeId] === "known";

  const runVerdict = (action: () => Promise<void>) => {
    setPending(true);
    void (async () => {
      try {
        await action();
        await refreshLearnerExpedition({ enrichmentId: session.enrichmentId });
        setOpen(false);
      } finally {
        setPending(false);
      }
    })();
  };

  return (
    <View className="rounded-xl border border-line bg-card shadow-sm">
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen((current) => !current)}
        className="w-full flex-row items-center justify-between gap-3 px-3 py-2"
      >
        <Text className="min-w-0 flex-1 text-sm font-semibold text-ink" numberOfLines={1}>{concept.label}</Text>
        <CrystalGlyph
          derivedNodeId={concept.derivedNodeId}
          difficulty={concept.difficulty}
          growthFraction={concept.growthFraction}
          state={concept.state}
          ghost={concept.isKnownSkipped}
          size={26}
          ariaLabel={concept.isKnownSkipped ? learnerTerm("known") : isMastered ? "Collected" : "Not collected"}
        />
      </Pressable>
      {open ? (
        <View className="gap-3 border-t border-line px-3 py-3">
          <Text className="text-sm text-muted">
            {concept.isKnownSkipped ? learnerTerm("known") : stateLabel(concept.state)} · {concept.stops.length} stops · {difficultyDiamonds(concept.difficulty)}
          </Text>
          {isKnownVerdict ? (
            <Btn
              variant="outline"
              disabled={pending}
              label={learnerTerm("unskipKnown")}
              onPress={() => runVerdict(() => clearLearnerVerdict({ enrichmentId: session.enrichmentId, derivedNodeId: concept.derivedNodeId }))}
            />
          ) : !isMastered ? (
            <Btn
              variant="outline"
              disabled={pending}
              label={learnerTerm("skipKnown")}
              onPress={() => runVerdict(() => setLearnerVerdict({ enrichmentId: session.enrichmentId, derivedNodeId: concept.derivedNodeId, verdict: "known" }))}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function difficultyDiamonds(difficulty: number): string {
  const rating = Math.min(5, Math.max(1, Math.round(difficulty * 4) + 1));
  return "◆".repeat(rating) + "◇".repeat(5 - rating);
}

function stateLabel(state: TrailCluster["state"]): string {
  if (state === "mastered") return learnerTerm("mastered");
  if (state === "frontier") return learnerTerm("frontier");
  return learnerTerm("locked");
}
