import { useEffect, useRef } from "react";
import { View } from "react-native";
import { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { BookOpen, Lock, MapPin, Rows3, Search } from "lucide-react-native";
import { CrystalSpecimen } from "./CrystalSpecimen";
import { checkpointPresentation, type CheckpointIcon } from "@/learn/checkpointPresentation";
import { crystalForBand, type CrystalMaterial } from "@/learn/crystalLibrary";
import { MIN_SPECIMEN_PX } from "@/learn/mineralSpecimen";
import { difficultyBand, type TrailCluster, type TrailStop } from "@lrnki/application/projection";
import { AnimatedView, MOTION, PressableSurface, Text, colors, useReducedMotion } from "@/ui";

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
  // Ink-ring-on-parchment (plan 2026-07-18-001 KTD6/KTD7): the next stop keeps its
  // frontier guidance ring, complete keeps the gem fill language, available reads as a
  // drawn ink ring, and locked adopts the uncharted parchment treatment.
  // The capstone is the ONE stop that shows a crystal, and every crystal uses the shared warm
  // ground (plan 2026-07-30-001 KTD2): its circle is a deeper parchment socket, so the
  // library needs no second ground variant. Every other stop keeps the shipped
  // ink-on-parchment language exactly.
  const socket = stop.kind === "capstone";
  const box = socket
    ? stop.isNext
      ? "border-frontier bg-cavern-rock"
      : `border-cavern-edge bg-cavern-rock${stop.state === "locked" ? " opacity-75" : ""}`
    : stop.isNext
      ? "border-frontier bg-card"
      : stop.state === "complete"
        ? "border-gem bg-gem"
        : stop.state === "available"
          ? "border-map-ink bg-card"
          : "border-map-ink-soft bg-map-parchment-deep opacity-75";
  return (
    <View className="w-24 items-center gap-2">
      {/* The fixed halo layer marks the guided next stop (its one-shot emphasis lives in
          the motion pass); it sits behind the circle and never moves the trail. */}
      <View className="h-[72px] w-[72px] items-center justify-center">
        {stop.isNext ? <NextStopHalo stopId={stop.stopId} /> : null}
        <PressableSurface
          accessibilityLabel={`${presentation.label}: ${stop.label}`}
          // Content-neutral seam for the real-backend e2e journey (plan 2026-07-15-001 U3): the
          // visible name is the dynamic concept label, so the durable suite targets a checkpoint by
          // its typed kind + state instead. No effect on the shipped UX.
          testID={`checkpoint-${stop.kind}-${stop.state}`}
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

// The guided-next halo (U5, R14): one finite swell when a stop BECOMES the next stop,
// settling into the static ring. It never replays on an unchanged render — the played
// stop id is remembered — and reduced motion renders the static ring immediately.
function NextStopHalo({ stopId }: Readonly<{ stopId: string }>) {
  const reduceMotion = useReducedMotion();
  const swell = useSharedValue(0);
  const playedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (playedForRef.current === stopId) return;
    playedForRef.current = stopId;
    if (reduceMotion) return;
    swell.set(0);
    swell.set(
      withSequence(
        withTiming(1, { duration: MOTION.emphasis / 2 }),
        withTiming(0, { duration: MOTION.emphasis / 2 })
      )
    );
  }, [stopId, reduceMotion, swell]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.25 + 0.3 * swell.get(),
    transform: [{ scale: 1 + 0.18 * swell.get() }]
  }));
  return <AnimatedView className="absolute h-20 w-20 rounded-full bg-frontier" animatedStyle={style} />;
}

function iconForStop(stop: TrailStop, concept: TrailCluster, icon: CheckpointIcon) {
  if (icon === "crystal") {
    // The capstone is the concept's own band crystal from the shared library, mid-growth
    // until the completion rule masters the node — MIN_SPECIMEN_PX is the smallest readable
    // size. Known ground stays fogged stone, so a skip never reads as a collected crystal.
    const fogged = concept.isKnownSkipped && stop.state === "complete";
    const material: CrystalMaterial = fogged
      ? "fogged"
      : stop.state === "complete"
        ? "collected"
        : stop.isNext
          ? "next"
          : "open";
    return (
      <CrystalSpecimen
        species={crystalForBand(difficultyBand(concept.difficulty))}
        derivedNodeId={concept.derivedNodeId}
        material={material}
        growthFraction={concept.growthFraction}
        size={MIN_SPECIMEN_PX}
      />
    );
  }
  const solidComplete = stop.state === "complete" && stop.kind !== "capstone";
  // A locked capstone keeps the deeper socket, so its lock draws in formation ink; every other
  // stop keeps the shipped parchment treatment (faded ink on the uncharted wash).
  const color =
    stop.kind === "capstone"
      ? colors["cavern-ink"]
      : solidComplete
        ? colors["on-accent"]
        : stop.state === "locked"
          ? colors["map-ink-soft"]
          : colors.ink;
  const Icon = CIRCLE_ICONS[icon];
  return <Icon size={22} color={color} />;
}
