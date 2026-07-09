import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { BookCheck } from "lucide-react-native";
import type { StudyItemGroundingProvenance } from "@lrnki/domain-core";
import { learnerTerm } from "@/learn/vocabulary";

// Source-grounding marker: tapping toggles the label inline (the web popover becomes a
// press-to-reveal caption — no portal layer on native).
export function GroundedBadge({
  provenance,
  isSourceCited
}: Readonly<{ provenance: StudyItemGroundingProvenance; isSourceCited?: boolean }>) {
  const [open, setOpen] = useState(false);
  if (!isSourceCited && provenance !== "source_cep" && provenance !== "source_mentioned") return null;
  const label = learnerTerm("groundedBadge");
  return (
    <View className="shrink-0 flex-row items-center gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen((current) => !current)}
        className="size-9 items-center justify-center rounded-full bg-gem-soft"
      >
        <BookCheck size={18} color="#241f18" />
      </Pressable>
      {open ? <Text className="max-w-40 text-xs text-muted">{label}</Text> : null}
    </View>
  );
}
