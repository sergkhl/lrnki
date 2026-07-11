import { View } from "react-native";
import { BookOpen, Lock, MapPin, Rows3, Search } from "lucide-react-native";
import { CrystalGlyph } from "./CrystalGlyph";
import { checkpointPresentation, type CheckpointIcon } from "@/learn/checkpointPresentation";
import type { TrailCluster, TrailStop } from "@/learn/trailView";
import { PressableSurface, Text, colors } from "@/ui";

const CIRCLE_ICONS: Record<Exclude<CheckpointIcon, "crystal">, typeof Lock> = {
  lock: Lock,
  book: BookOpen,
  "map-pin": MapPin,
  rows: Rows3,
  search: Search
};

// A trail checkpoint: stable 72px outer box for every stop (the circle grows for the
// guided next stop WITHIN that box, so the trail never reflows), a fixed halo layer
// behind the next stop, and a selection haptic on open.
export function CheckpointCircle({
  stop,
  concept,
  onSelect
}: Readonly<{ stop: TrailStop; concept: TrailCluster; onSelect: (stopId: string) => void }>) {
  const presentation = checkpointPresentation(stop);
  const disabled = stop.state === "locked";
  const size = stop.isNext ? 72 : 64;
  const box = stop.isNext
    ? "border-frontier bg-card"
    : stop.state === "complete"
      ? stop.kind === "capstone"
        ? "border-gem bg-gem-soft"
        : "border-gem bg-gem"
      : stop.state === "available"
        ? "border-line-strong bg-card"
        : "border-fog bg-fog opacity-75";
  return (
    <View className="w-24 items-center gap-2">
      {/* The fixed halo layer marks the guided next stop (its one-shot emphasis lives in
          the motion pass); it sits behind the circle and never moves the trail. */}
      <View className="h-[72px] w-[72px] items-center justify-center">
        {stop.isNext ? <View className="absolute h-20 w-20 rounded-full bg-frontier opacity-25" /> : null}
        <PressableSurface
          accessibilityLabel={`${presentation.label}: ${stop.label}`}
          disabled={disabled}
          haptic="selection"
          onPress={() => onSelect(stop.stopId)}
          className={`items-center justify-center rounded-full border-2 shadow-sm ${box}`}
          pressedClassName="shadow-none opacity-90"
          style={{ width: size, height: size }}
        >
          {iconForStop(stop, concept, presentation.icon)}
        </PressableSurface>
      </View>
      {stop.isNext ? (
        <Text variant="caption" className="max-w-24 text-center font-medium leading-tight">{presentation.label}</Text>
      ) : null}
    </View>
  );
}

function iconForStop(stop: TrailStop, concept: TrailCluster, icon: CheckpointIcon) {
  if (icon === "crystal") {
    // The capstone is the concept's own crystal, mid-growth until the completion rule
    // masters the node — the same formation the marker, header, and vista show.
    return (
      <CrystalGlyph
        derivedNodeId={concept.derivedNodeId}
        difficulty={concept.difficulty}
        growthFraction={concept.growthFraction}
        state={stop.state === "complete" ? "mastered" : "frontier"}
        ghost={concept.isKnownSkipped && stop.state === "complete"}
        size={40}
      />
    );
  }
  const solidComplete = stop.state === "complete" && stop.kind !== "capstone";
  const color = stop.state === "locked" || solidComplete ? colors["on-accent"] : colors.ink;
  const Icon = CIRCLE_ICONS[icon];
  return <Icon size={22} color={color} />;
}
