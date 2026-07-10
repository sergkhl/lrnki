import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import Svg, { Ellipse, G, Polygon, Polyline, Rect } from "react-native-svg";
import { ArrowRight, X } from "lucide-react-native";
import type { StudySession } from "@lrnki/application/projection";
import {
  buildCrystalFormation,
  completeSectionIndexes,
  memoryDoorFor,
  placeFormation,
  VISTA_CRYSTAL_SIZE,
  type PlacedCrystal,
  type PlacedFormation
} from "@/learn/crystalVistaView";
import type { TrailView } from "@/learn/trailView";
import { readFusedSections, writeFusedSections } from "@/lib/navMemory";
import { CrystalShardsGroup } from "./CrystalGlyph";
import { Btn } from "./ui";
import { learnerTerm } from "@/learn/vocabulary";

// The constructive Crystal Vista (plan 2026-07-10-001 U3): the formation the learner is
// BUILDING. Leg clusters fuse when their section completes (one celebration per fusion,
// deduped by local nav memory — the same seam pattern as the board splash); the final
// fusion crowns the summit keystone. Tapping a nameable crystal opens the memory door —
// review navigation back to that trail stop, never a collection game. All state derives
// from the Study Session projection; the vista persists nothing but the celebration memo.
export function CrystalVista({
  session,
  trail,
  onClose,
  onExamine
}: Readonly<{ session: StudySession; trail: TrailView; onClose: () => void; onExamine: (derivedNodeId: string) => void }>) {
  const { width } = useWindowDimensions();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [celebratingSection, setCelebratingSection] = useState<number | null>(null);

  const formation = useMemo(() => buildCrystalFormation(session, trail), [session, trail]);
  const placed = useMemo(() => placeFormation(formation), [formation]);
  const fused = useMemo(() => completeSectionIndexes(formation), [formation]);
  const lastSectionIndex = Math.max(-1, ...formation.nodes.map((node) => node.sectionIndex));
  const keystone = lastSectionIndex >= 0 && fused.includes(lastSectionIndex);

  // Fusion celebration, once per newly fused leg: compare against the device memo, play
  // the pulse for the newest fusion, then remember the whole fused set.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const seen = (await readFusedSections(session.learnerStateRef, session.enrichmentId)) ?? [];
      const fresh = fused.filter((sectionIndex) => !seen.includes(sectionIndex));
      if (cancelled) return;
      await writeFusedSections(session.learnerStateRef, session.enrichmentId, fused);
      if (fresh.length === 0) return;
      // A timed highlight (banner + brightened aura) rather than programmatic motion, so
      // the celebration is identical under reduced-motion settings.
      setCelebratingSection(fresh[fresh.length - 1]);
      setTimeout(() => { if (!cancelled) setCelebratingSection(null); }, 2200);
    })();
    return () => { cancelled = true; };
  }, [fused, session.learnerStateRef, session.enrichmentId]);

  const door = memoryDoorFor(formation, selectedNodeId);
  const canvasWidth = Math.min(width - 32, 720);
  const canvasHeight = placed.viewBox.width > 0 ? canvasWidth * (placed.viewBox.height / placed.viewBox.width) : 0;

  return (
    <View className="absolute inset-0 z-50 bg-background">
      <View className="border-b border-line bg-card px-4 py-3">
        <View className="mx-auto w-full max-w-3xl flex-row items-center justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text className="text-xs text-muted">{learnerTerm("vistaTitle")}</Text>
            <Text className="text-base font-semibold text-ink" numberOfLines={1}>{formation.title}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={learnerTerm("returnToTrail")}
            onPress={onClose}
            className="flex-row items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-1.5 active:opacity-80"
          >
            <X size={14} color="#241f18" />
            <Text className="text-xs font-medium text-ink">{learnerTerm("returnToTrail")}</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="items-center gap-3 p-4">
        <Text className="max-w-md text-center text-xs text-muted">{learnerTerm("vistaHint")}</Text>
        {celebratingSection !== null ? (
          <View className="rounded-xl border border-gem-soft bg-gem-soft px-3 py-1.5">
            <Text className="text-xs font-semibold text-ink">
              {learnerTerm("vistaFusedTemplate").replace("{n}", String(celebratingSection + 1))}
            </Text>
          </View>
        ) : null}
        {placed.crystals.length > 0 ? (
          <Svg width={canvasWidth} height={canvasHeight} viewBox={`${placed.viewBox.x} ${placed.viewBox.y} ${placed.viewBox.width} ${placed.viewBox.height}`}>
            {/* Bedrock line the formation grows from. */}
            <Rect
              x={placed.viewBox.x}
              y={Math.max(...placed.crystals.map((crystal) => crystal.y)) + 4}
              width={placed.viewBox.width}
              height={8}
              fill="#8d887c"
              opacity={0.35}
            />
            <FusionAuras placed={placed} fused={fused} celebratingSection={celebratingSection} />
            {placed.veins.map((vein) => (
              <Polyline
                key={vein.key}
                points={vein.points.map((point) => `${point.x},${point.y}`).join(" ")}
                fill="none"
                stroke="#8d887c"
                strokeWidth={2.5}
                strokeDasharray={vein.uncertain ? "6 6" : undefined}
                opacity={0.5}
              />
            ))}
            {placed.crystals.map((crystal) => (
              <G
                key={crystal.derivedNodeId}
                onPress={() => setSelectedNodeId((current) => (current === crystal.derivedNodeId ? null : crystal.derivedNodeId))}
                transform={`translate(${crystal.x - (VISTA_CRYSTAL_SIZE / 100) * 50}, ${crystal.y - (VISTA_CRYSTAL_SIZE / 100) * 95}) scale(${VISTA_CRYSTAL_SIZE / 100})`}
                opacity={selectedNodeId === null || selectedNodeId === crystal.derivedNodeId ? 1 : 0.55}
              >
                <CrystalShardsGroup
                  derivedNodeId={crystal.derivedNodeId}
                  difficulty={crystal.difficulty}
                  growthFraction={crystal.growthFraction}
                  state={crystal.state}
                  ghost={crystal.isKnownSkipped}
                />
              </G>
            ))}
            {keystone ? <SummitKeystone placed={placed} /> : null}
          </Svg>
        ) : (
          <Text className="text-sm text-muted">{learnerTerm("vistaEmpty")}</Text>
        )}
      </ScrollView>
      {door ? (
        <View className="border-t border-line bg-card px-4 py-3">
          <View className="mx-auto w-full max-w-3xl gap-1.5">
            <Text className="text-sm font-semibold text-ink" numberOfLines={1}>{door.label}</Text>
            {door.kind === "reveal" ? (
              <>
                {door.gist ? <Text className="text-xs text-muted" numberOfLines={3}>{door.gist}</Text> : null}
                <Btn
                  onPress={() => onExamine(door.derivedNodeId)}
                  icon={<ArrowRight size={14} color="#fdfaf2" />}
                  label={learnerTerm("examine")}
                />
              </>
            ) : (
              <Text className="text-xs text-muted">
                {learnerTerm("vistaGuardedTemplate").replace("{n}", String(door.legNumber))}
              </Text>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

// A soft aura behind each FUSED leg cluster: the visual that the cluster now reads as one
// grown formation piece. The newest fusion renders brightened for the celebration window.
function FusionAuras({
  placed,
  fused,
  celebratingSection
}: Readonly<{ placed: PlacedFormation; fused: number[]; celebratingSection: number | null }>) {
  return (
    <>
      {fused.map((sectionIndex) => {
        const members = placed.crystals.filter((crystal) => crystal.sectionIndex === sectionIndex);
        if (members.length === 0) return null;
        const bounds = clusterBounds(members);
        return (
          <Ellipse
            key={sectionIndex}
            cx={bounds.cx}
            cy={bounds.cy}
            rx={bounds.rx}
            ry={bounds.ry}
            fill="#d8b64c"
            opacity={celebratingSection === sectionIndex ? 0.4 : 0.16}
          />
        );
      })}
    </>
  );
}

function clusterBounds(members: PlacedCrystal[]): { cx: number; cy: number; rx: number; ry: number } {
  const xs = members.map((crystal) => crystal.x);
  const ys = members.map((crystal) => crystal.y - VISTA_CRYSTAL_SIZE / 2);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    rx: (maxX - minX) / 2 + VISTA_CRYSTAL_SIZE * 0.7,
    ry: (maxY - minY) / 2 + VISTA_CRYSTAL_SIZE * 0.7
  };
}

// The summit keystone (U3): the final leg's fusion crowns the whole formation — a bright
// capstone diamond floating above the highest crystal tip.
function SummitKeystone({ placed }: Readonly<{ placed: PlacedFormation }>) {
  const topCrystal = placed.crystals.reduce((top, crystal) => (crystal.y < top.y ? crystal : top), placed.crystals[0]);
  const cx = topCrystal.x;
  const cy = topCrystal.y - VISTA_CRYSTAL_SIZE - 34;
  const r = 22;
  return (
    <G>
      <Polygon points={`${cx},${cy - r} ${cx + r * 0.7},${cy} ${cx},${cy + r} ${cx - r * 0.7},${cy}`} fill="#d8b64c" stroke="#9c5f2b" strokeWidth={2} />
      <Polygon points={`${cx},${cy - r * 0.5} ${cx + r * 0.35},${cy} ${cx},${cy + r * 0.5} ${cx - r * 0.35},${cy}`} fill="white" opacity={0.5} />
    </G>
  );
}
