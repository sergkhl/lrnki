import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, Lock, Map as MapIcon, MoveRight, X } from "lucide-react-native";
import { learnerTerm } from "@/learn/vocabulary";
import { SectionCrystalStrip } from "./SectionCrystalStrip";
import type { TrailCluster, TrailSectionView } from "@/learn/trailView";

// The non-blocking section overview (R5). Opened on demand from the header — the guided
// "continue" flow never requires it. Lists every section with its state and progress; tapping
// an unlocked section scrolls the trail to it (F2 directed jump), while a fogged section names
// the concepts that gate it rather than blocking.
export function SectionOverview({
  sections,
  concepts,
  currentSectionIndex,
  onJump
}: Readonly<{ sections: TrailSectionView[]; concepts: TrailCluster[]; currentSectionIndex: number; onJump: (sectionIndex: number) => void }>) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const current = sections.find((section) => section.sectionIndex === currentSectionIndex) ?? sections[0];

  const jumpTo = (section: TrailSectionView) => {
    if (section.state === "locked") return;
    setOpen(false);
    onJump(section.sectionIndex);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        className="flex-row items-center gap-1.5 rounded-xl border border-line bg-card px-2.5 py-1.5 active:opacity-80"
      >
        <MapIcon size={14} color="#241f18" />
        <Text className="text-xs font-medium text-ink">
          {learnerTerm("section")} {sections.length === 0 ? 0 : (current?.sectionIndex ?? 0) + 1}/{sections.length}
        </Text>
      </Pressable>
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 bg-black/40" onPress={() => setOpen(false)} />
        <View className="max-h-[70%] rounded-t-2xl border border-line bg-card" style={{ paddingBottom: insets.bottom }}>
          <View className="flex-row items-start justify-between border-b border-line px-4 py-3">
            <View>
              <Text className="text-base font-semibold text-ink">{learnerTerm("sectionOverview")}</Text>
              <Text className="text-sm text-muted">{learnerTerm("sectionOverviewHint")}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setOpen(false)} className="p-1">
              <X size={20} color="#6d6152" />
            </Pressable>
          </View>
          <ScrollView contentContainerClassName="gap-2 p-4">
            {sections.map((section) => (
              <Pressable
                key={section.sectionIndex}
                accessibilityRole="button"
                disabled={section.state === "locked"}
                onPress={() => jumpTo(section)}
                className={`flex-row items-center gap-3 rounded-xl border border-line p-3 ${section.state === "locked" ? "opacity-60" : "active:bg-background"} ${section.sectionIndex === currentSectionIndex ? "border-frontier" : ""}`}
              >
                <SectionStateIcon state={section.state} />
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-medium text-ink" numberOfLines={1}>
                    {learnerTerm("section")} {section.sectionIndex + 1}: {section.milestoneLabel}
                  </Text>
                  <Text className="text-xs text-muted" numberOfLines={2}>
                    {section.masteredCount}/{section.conceptCount} concepts · {section.stopsComplete}/{section.stopsTotal} stops
                    {section.state === "locked" && section.gatingLabels.length
                      ? ` · ${learnerTerm("gatedBy")}: ${section.gatingLabels.join(", ")}`
                      : ""}
                  </Text>
                  <SectionCrystalStrip
                    concepts={concepts.filter((concept) => concept.sectionIndex === section.sectionIndex)}
                    className="mt-1"
                  />
                </View>
                {section.state === "locked" ? null : <MoveRight size={16} color="#6d6152" />}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

function SectionStateIcon({ state }: Readonly<{ state: TrailSectionView["state"] }>) {
  if (state === "complete") {
    return (
      <View className="size-7 items-center justify-center rounded-full bg-gem-soft">
        <Check size={14} color="#241f18" />
      </View>
    );
  }
  if (state === "locked") {
    return (
      <View className="size-7 items-center justify-center rounded-full border border-line bg-card">
        <Lock size={14} color="#6d6152" />
      </View>
    );
  }
  return <View className="size-2.5 rounded-full bg-frontier" />;
}
