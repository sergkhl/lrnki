import { useState } from "react";
import { View } from "react-native";
import { BookCheck } from "lucide-react-native";
import type { StudyItemGroundingProvenance } from "@lrnki/domain-core";
import { learnerTerm } from "@/learn/vocabulary";
import { PressableSurface, Text, colors } from "@/ui";

// Source-grounding marker: tapping toggles the label inline (a press-to-reveal caption
// disclosure — no portal layer on native).
export function GroundedBadge({
  provenance,
  isSourceCited
}: Readonly<{ provenance: StudyItemGroundingProvenance; isSourceCited?: boolean }>) {
  const [open, setOpen] = useState(false);
  if (!isSourceCited && provenance !== "source_cep" && provenance !== "source_mentioned") return null;
  const label = learnerTerm("groundedBadge");
  return (
    <View className="shrink-0 flex-row items-center gap-2">
      <PressableSurface
        accessibilityLabel={label}
        expanded={open}
        onPress={() => setOpen((current) => !current)}
        className="h-target w-target items-center justify-center rounded-full bg-gem-soft"
        pressedClassName="opacity-80"
      >
        <BookCheck size={18} color={colors.ink} />
      </PressableSurface>
      {open ? <Text variant="caption" color="muted" className="max-w-40">{label}</Text> : null}
    </View>
  );
}
