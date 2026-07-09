import { Text, View } from "react-native";
import type { StudySession } from "@lrnki/application/projection";
import { CrystalGlyph } from "./CrystalGlyph";
import { SectionOverview } from "./SectionOverview";
import type { TrailView } from "@/learn/trailView";

export function QuestHeader({
  session,
  trail,
  expeditionTitle,
  onJumpToSection
}: Readonly<{ session: StudySession; trail: TrailView; expeditionTitle: string | null; onJumpToSection: (sectionIndex: number) => void }>) {
  // The learner's topic titles the expedition; the derived summit concept label
  // demotes to a secondary line (unmodified canonical label).
  const title = expeditionTitle ?? session.target.label;
  const mastered = trail.concepts.filter((concept) => concept.state === "mastered" && !concept.isKnownSkipped);
  return (
    <View className="border-b border-line bg-card px-4 py-3">
      <View className="mx-auto w-full max-w-3xl flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-xs text-muted">Expedition</Text>
          <Text className="text-base font-semibold text-ink" numberOfLines={1}>{title}</Text>
          {title !== session.target.label ? (
            <Text className="text-xs text-muted" numberOfLines={1}>Summit: {session.target.label}</Text>
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
          {/* Static crystal tally (the vista door returns in the follow-up pass): the most
              recently collected crystal plus the running count. */}
          <View className="flex-row items-center gap-1.5 rounded-xl border border-line bg-card px-2.5 py-1.5">
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
          </View>
        </View>
      </View>
    </View>
  );
}
