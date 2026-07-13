import { View } from "react-native";
import { CrystalGlyph } from "./CrystalGlyph";
import type { TrailCluster } from "@lrnki/application/projection";

// A section's crystals at a glance: one mini glyph per concept, growing exactly as its
// trail capstone does. Decorative (the counts beside it carry the accessible truth).
export function SectionCrystalStrip({ concepts, className }: Readonly<{ concepts: TrailCluster[]; className?: string }>) {
  return (
    <View className={`flex-row flex-wrap items-center gap-0.5 ${className ?? ""}`}>
      {concepts.map((concept) => (
        <CrystalGlyph
          key={concept.derivedNodeId}
          derivedNodeId={concept.derivedNodeId}
          difficulty={concept.difficulty}
          growthFraction={concept.growthFraction}
          state={concept.state}
          ghost={concept.isKnownSkipped}
          size={14}
        />
      ))}
    </View>
  );
}
