import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Check, Lock, Map as MapIcon, MoveRight } from "lucide-react-native";
import { learnerTerm } from "@/learn/vocabulary";
import { formationProgress, formationProgressLine } from "@/learn/mineralSpecimen";
import type { TrailCluster, TrailSectionView } from "@lrnki/application/projection";
import { BottomSheet, OverlayHeader, PressableSurface, Progress, Text, colors } from "@/ui";

// The non-blocking section overview (R5/R9). Opened on demand from the header — the
// guided "continue" flow never requires it. A bottom sheet lists every section with its
// state and progress; tapping an unlocked section scrolls the trail to it, while a
// fogged section names the concepts that gate it rather than blocking.
export function SectionOverview({
  sections,
  concepts,
  currentSectionIndex,
  onJump
}: Readonly<{ sections: TrailSectionView[]; concepts: TrailCluster[]; currentSectionIndex: number; onJump: (sectionIndex: number) => void }>) {
  const [open, setOpen] = useState(false);
  const current = sections.find((section) => section.sectionIndex === currentSectionIndex) ?? sections[0];

  const jumpTo = (section: TrailSectionView) => {
    if (section.state === "locked") return;
    setOpen(false);
    onJump(section.sectionIndex);
  };

  return (
    <>
      <PressableSurface
        accessibilityLabel={learnerTerm("sectionOverview")}
        onPress={() => setOpen(true)}
        className="h-target flex-row items-center gap-1.5 rounded-control border border-line-strong bg-card px-2.5"
        pressedClassName="bg-muted-panel"
      >
        <MapIcon size={14} color={colors.ink} />
        <Text variant="caption" className="font-medium">
          {learnerTerm("section")} {sections.length === 0 ? 0 : (current?.sectionIndex ?? 0) + 1}/{sections.length}
        </Text>
      </PressableSurface>
      <BottomSheet open={open} onOpenChange={setOpen}>
        <OverlayHeader
          icon={<MapIcon size={20} color={colors.ink} />}
          title={learnerTerm("sectionOverview")}
          description={learnerTerm("sectionOverviewHint")}
          onClose={() => setOpen(false)}
        />
        <ScrollView contentContainerClassName="gap-2 p-4" className="max-h-96">
          {sections.map((section) => {
            // Honest compact progress (U1, R14/AE1): completed ground drives the meter;
            // crystals collected and known ground are named separately in the copy —
            // no miniature specimen row.
            const progress = formationProgress(concepts.filter((concept) => concept.sectionIndex === section.sectionIndex));
            return (
            <PressableSurface
              key={section.sectionIndex}
              accessibilityLabel={`${learnerTerm("section")} ${section.sectionIndex + 1}: ${section.milestoneLabel}`}
              disabled={section.state === "locked"}
              onPress={() => jumpTo(section)}
              className={`min-h-target flex-row items-center gap-3 rounded-card border p-3 ${section.state === "locked" ? "border-line opacity-60" : "border-line-strong"} ${section.sectionIndex === currentSectionIndex ? "border-frontier" : ""}`}
              pressedClassName="bg-muted-panel"
            >
              <SectionStateIcon state={section.state} />
              <View className="min-w-0 flex-1">
                <Text variant="label" numberOfLines={1}>
                  {learnerTerm("section")} {section.sectionIndex + 1}: {section.milestoneLabel}
                </Text>
                <Text variant="caption" color="muted" numberOfLines={2}>
                  {formationProgressLine(progress)} · {section.stopsComplete}/{section.stopsTotal} stops
                  {section.state === "locked" && section.gatingLabels.length
                    ? ` · ${learnerTerm("gatedBy")}: ${section.gatingLabels.join(", ")}`
                    : ""}
                </Text>
                <Progress
                  fraction={progress.completionFraction}
                  accessibilityLabel={`${learnerTerm("section")} ${section.sectionIndex + 1}: ${formationProgressLine(progress)}`}
                  className="mt-1.5"
                />
              </View>
              {section.state === "locked" ? null : <MoveRight size={16} color={colors.muted} />}
            </PressableSurface>
            );
          })}
        </ScrollView>
      </BottomSheet>
    </>
  );
}

function SectionStateIcon({ state }: Readonly<{ state: TrailSectionView["state"] }>) {
  if (state === "complete") {
    return (
      <View className="size-7 items-center justify-center rounded-full bg-gem-soft">
        <Check size={14} color={colors.ink} />
      </View>
    );
  }
  if (state === "locked") {
    return (
      <View className="size-7 items-center justify-center rounded-full border border-line bg-card">
        <Lock size={14} color={colors.muted} />
      </View>
    );
  }
  return <View className="size-2.5 rounded-full bg-frontier" />;
}
