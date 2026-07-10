import { Pressable, Text, View } from "react-native";
import type { StudySession } from "@lrnki/application/projection";
import { CrystalGlyph } from "./CrystalGlyph";
import { SectionOverview } from "./SectionOverview";
import { isSummitPush, summitLine } from "@/learn/goalCopy";
import type { TrailView } from "@/learn/trailView";
import { learnerTerm } from "@/learn/vocabulary";

export function QuestHeader({
  session,
  trail,
  expeditionTitle,
  onJumpToSection,
  onOpenVista
}: Readonly<{ session: StudySession; trail: TrailView; expeditionTitle: string | null; onJumpToSection: (sectionIndex: number) => void; onOpenVista: () => void }>) {
  // The learner's topic titles the expedition; the summit line below merges the derived
  // summit label with the layer purpose (plan 2026-07-10-001 U2) — the advance-visible
  // mid-horizon goal, template fallback when no purpose row exists.
  const title = expeditionTitle ?? session.target.label;
  const mastered = trail.concepts.filter((concept) => concept.state === "mastered" && !concept.isKnownSkipped);
  return (
    <View className="border-b border-line bg-card px-4 py-3">
      <View className="mx-auto w-full max-w-3xl flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-xs text-muted">{isSummitPush(trail) ? learnerTerm("summitPushEyebrow") : "Expedition"}</Text>
          <Text className="text-base font-semibold text-ink" numberOfLines={1}>{title}</Text>
          {session.target.label ? (
            <Text className="text-xs text-muted" numberOfLines={2}>
              {summitLine({
                summitLabel: session.target.label,
                layerPurpose: session.layerPurpose,
                legCount: trail.sections.length,
                crystalCount: trail.totalClusters
              })}
            </Text>
          ) : null}
        </View>
        <View className="shrink-0 flex-row items-center gap-2">
          {/* Non-blocking overview trigger (R5): opens the section map on demand; the guided
              continue flow never needs it. */}
          <SectionOverview
            sections={trail.sections}
            concepts={trail.concepts}
            currentSectionIndex={trail.currentSectionIndex}
            onJump={onJumpToSection}
          />
          {/* The crystal tally IS the vista door (plan 2026-07-10-001 U3): the most
              recently collected crystal plus the running count opens the formation. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={learnerTerm("vistaOpen")}
            onPress={onOpenVista}
            className="flex-row items-center gap-1.5 rounded-xl border border-line bg-card px-2.5 py-1.5 active:opacity-80"
          >
            {mastered.length > 0 ? (
              <CrystalGlyph
                derivedNodeId={mastered[mastered.length - 1].derivedNodeId}
                difficulty={mastered[mastered.length - 1].difficulty}
                growthFraction={1}
                state="mastered"
                size={18}
              />
            ) : null}
            <Text className="text-xs font-medium tabular-nums text-ink">
              {mastered.length}/{trail.concepts.length}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
