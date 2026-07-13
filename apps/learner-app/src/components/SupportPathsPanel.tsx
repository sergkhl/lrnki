import { View } from "react-native";
import { GitBranchPlus } from "lucide-react-native";
import type { ExplorableTermView } from "@lrnki/application/projection";
import { IconButton, Text, colors } from "@/ui";
import { learnerTerm, termSupportActionLabel } from "@/learn/vocabulary";

// The compact post-content Support Paths panel (plan 2026-07-13-002 U3, KTD4; R7-R8).
// The large-target half of the discovery pair: theory renders it AFTER the lesson
// content, graded activities render it between the question stem and the answer
// controls. It lists ONLY terms still available for creation (an active detour's term is
// suppressed by the projection, R3) and renders nothing when none remain (AE8). Each row
// is the term as content plus one 44px icon-only action whose accessible name carries
// the exact term; the repeated `Explore “…”` button copy is gone (R8).
export function SupportPathsPanel({
  terms,
  busyTerm,
  onSelect
}: Readonly<{
  terms: readonly ExplorableTermView[];
  // The term whose request is in flight: its action shows busy, every other action is
  // disabled so a double press cannot create a second request (R4).
  busyTerm: string | null;
  onSelect: (term: string) => void;
}>) {
  const available = terms.filter((entry) => entry.support.kind === "available");
  if (available.length === 0) return null;
  return (
    <View className="gap-1 rounded-card border border-line bg-card px-3 py-2" testID="support-paths-panel">
      <Text variant="caption" color="muted" className="font-medium uppercase tracking-wide">
        {learnerTerm("supportPanelTitle")}
      </Text>
      {available.map((entry) => (
        <View key={entry.term} className="flex-row items-center gap-2">
          <Text variant="label" className="min-w-0 flex-1 font-normal">
            {entry.term}
          </Text>
          <IconButton
            icon={<GitBranchPlus size={18} color={colors.ink} />}
            accessibilityLabel={termSupportActionLabel(entry.term)}
            variant="outline"
            busy={busyTerm === entry.term}
            disabled={busyTerm !== null && busyTerm !== entry.term}
            onPress={() => onSelect(entry.term)}
            testID={`support-path-add-${entry.term}`}
          />
        </View>
      ))}
    </View>
  );
}
