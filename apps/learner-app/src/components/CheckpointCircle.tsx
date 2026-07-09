import { Pressable, Text, View } from "react-native";
import { BookOpen, Lock, MapPin, Rows3, Search } from "lucide-react-native";
import { CrystalGlyph } from "./CrystalGlyph";
import type { TrailCluster, TrailStop } from "@/learn/trailView";
import { learnerTerm } from "@/learn/vocabulary";

const INK = "#241f18";
const WHITE = "#ffffff";

export function CheckpointCircle({
  stop,
  concept,
  onSelect
}: Readonly<{ stop: TrailStop; concept: TrailCluster; onSelect: (stopId: string) => void }>) {
  const disabled = stop.state === "locked";
  const label = `${labelForStop(stop)}: ${stop.label}`;
  const size = stop.isNext ? 72 : 64;
  const box = stop.isNext
    ? "border-frontier bg-card"
    : stop.state === "complete"
      ? stop.kind === "capstone"
        ? "border-gem bg-gem-soft"
        : "border-gem bg-gem"
      : stop.state === "available"
        ? "border-line bg-card"
        : "border-fog bg-fog opacity-75";
  return (
    <View className="w-24 items-center gap-2">
      {/* The static halo ring marks the guided next stop (pulse returns with Reanimated). */}
      {stop.isNext ? <View className="absolute -top-1 size-20 rounded-full bg-frontier opacity-25" /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={() => onSelect(stop.stopId)}
        className={`items-center justify-center rounded-full border-2 shadow-sm ${box}`}
        style={{ width: size, height: size }}
      >
        {iconForStop(stop, concept)}
      </Pressable>
      {stop.isNext ? (
        <Text className="max-w-24 text-center text-xs font-medium leading-tight text-ink">{labelForStop(stop)}</Text>
      ) : null}
    </View>
  );
}

function iconForStop(stop: TrailStop, concept: TrailCluster) {
  const solidComplete = stop.state === "complete" && stop.kind !== "capstone";
  const color = stop.state === "locked" || solidComplete ? WHITE : INK;
  if (stop.state === "locked") return <Lock size={22} color={color} />;
  if (stop.kind === "theory") return <BookOpen size={22} color={color} />;
  if (stop.kind === "option_select") return <MapPin size={22} color={color} />;
  if (stop.kind === "matching") return <Rows3 size={22} color={color} />;
  if (stop.kind === "impostor") return <Search size={22} color={color} />;
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

function labelForStop(stop: TrailStop): string {
  if (stop.kind === "theory") return learnerTerm("theoryStop");
  if (stop.kind === "option_select") return learnerTerm("question");
  if (stop.kind === "matching") return learnerTerm("matching");
  if (stop.kind === "impostor") return learnerTerm("spotTheFake");
  return learnerTerm("capstone");
}
