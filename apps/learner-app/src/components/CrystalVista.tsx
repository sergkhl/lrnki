import { useEffect, useMemo, useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import Animated, { useAnimatedProps, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Ellipse, G, Polygon, Polyline, Rect } from "react-native-svg";
import { ArrowRight, Gem } from "lucide-react-native";
import type { StudySession } from "@lrnki/application/projection";
import {
  buildCrystalFormation,
  fusedSectionIndexes,
  hasSummitKeystone,
  isNameableCrystal,
  memoryDoorFor,
  placeFormation,
  VISTA_CRYSTAL_SIZE,
  type PlacedCrystal,
  type PlacedFormation
} from "@/learn/crystalVistaView";
import type { TrailView } from "@lrnki/application/projection";
import { readFusedSections, writeFusedSections } from "@/lib/navMemory";
import { CrystalShardsGroup } from "./CrystalGlyph";
import { Button, FullScreenDialog, MOTION, OverlayHeader, PressableSurface, Text, colors, triggerHaptic, useReducedMotion } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";

// The constructive Crystal Vista (plan 2026-07-10-001 U3): the formation the learner is
// BUILDING. Interaction moved off the SVG scene graph (KTD7): nameable crystals get
// positioned native touch targets with labels, focus, and selection state, while the
// pure formation geometry — placement, veins, auras, keystone — renders untouched
// beneath them. Ordinary fogged mystery shapes expose no interactive semantics.
export function CrystalVista({
  session,
  trail,
  open,
  onOpenChange,
  onExamine
}: Readonly<{
  session: StudySession;
  trail: TrailView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExamine: (derivedNodeId: string) => void;
}>) {
  const { width } = useWindowDimensions();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [celebratingSection, setCelebratingSection] = useState<number | null>(null);

  const formation = useMemo(() => buildCrystalFormation(session, trail), [session, trail]);
  const placed = useMemo(() => placeFormation(formation), [formation]);
  // Fusion and the keystone are the server-projected Guardian victories (plan
  // 2026-07-13-003 U6, KTD3) — mastery alone never fuses a Leg or crowns the summit.
  const fused = useMemo(() => fusedSectionIndexes(trail), [trail]);
  const keystone = hasSummitKeystone(trail);
  const mastered = trail.concepts.filter((concept) => concept.state === "mastered" && !concept.isKnownSkipped);

  // Fusion celebration, once per newly fused leg: compare against the device memo, play
  // the highlight for the newest fusion, then remember the whole fused set.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const seen = (await readFusedSections(session.learnerStateRef, session.enrichmentId)) ?? [];
      const fresh = fused.filter((sectionIndex) => !seen.includes(sectionIndex));
      if (cancelled) return;
      await writeFusedSections(session.learnerStateRef, session.enrichmentId, fused);
      if (fresh.length === 0) return;
      // Seeing the new fusion assembled for the first time IS the fusion transition (R7):
      // one haptic, then the timed highlight (banner + aura swell, static-bright under
      // reduced motion) plays once and settles into the retained fusion highlight.
      triggerHaptic("fusion");
      setCelebratingSection(fresh[fresh.length - 1]);
      setTimeout(() => { if (!cancelled) setCelebratingSection(null); }, 2200);
    })();
    return () => { cancelled = true; };
  }, [open, fused, session.learnerStateRef, session.enrichmentId]);

  const door = memoryDoorFor(formation, selectedNodeId);
  const canvasWidth = Math.min(width - 32, 720);
  const scale = placed.viewBox.width > 0 ? canvasWidth / placed.viewBox.width : 0;
  const canvasHeight = canvasWidth * (placed.viewBox.width > 0 ? placed.viewBox.height / placed.viewBox.width : 0);

  const close = () => {
    setSelectedNodeId(null);
    onOpenChange(false);
  };

  return (
    <FullScreenDialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <View className="flex-1 bg-background">
        <OverlayHeader
          icon={
            mastered.length > 0 ? (
              <CrystalShardsGroupIcon crystal={mastered[mastered.length - 1]} />
            ) : (
              <Gem size={20} color={colors.ink} />
            )
          }
          title={formation.title}
          description={learnerTerm("vistaTitle")}
          onClose={close}
          closeLabel={learnerTerm("returnToTrail")}
        />
        <ScrollView className="flex-1" contentContainerClassName="items-center gap-3 p-4">
          <Text variant="caption" color="muted" className="max-w-md text-center">{learnerTerm("vistaHint")}</Text>
          {celebratingSection !== null ? (
            <View accessibilityLiveRegion="polite" className="rounded-card border border-gem-soft bg-gem-soft px-3 py-1.5">
              <Text variant="caption" className="font-semibold">
                {learnerTerm("vistaFusedTemplate").replace("{n}", String(celebratingSection + 1))}
              </Text>
            </View>
          ) : null}
          {placed.crystals.length > 0 ? (
            <View style={{ width: canvasWidth, height: canvasHeight }}>
              <Svg width={canvasWidth} height={canvasHeight} viewBox={`${placed.viewBox.x} ${placed.viewBox.y} ${placed.viewBox.width} ${placed.viewBox.height}`}>
                {/* Bedrock line the formation grows from. */}
                <Rect
                  x={placed.viewBox.x}
                  y={Math.max(...placed.crystals.map((crystal) => crystal.y)) + 4}
                  width={placed.viewBox.width}
                  height={8}
                  fill={colors.fog}
                  opacity={0.35}
                />
                <FusionAuras placed={placed} fused={fused} celebratingSection={celebratingSection} />
                {placed.veins.map((vein) => (
                  <Polyline
                    key={vein.key}
                    points={vein.points.map((point) => `${point.x},${point.y}`).join(" ")}
                    fill="none"
                    stroke={colors.fog}
                    strokeWidth={2.5}
                    strokeDasharray={vein.uncertain ? "6 6" : undefined}
                    opacity={0.5}
                  />
                ))}
                {placed.crystals.map((crystal) => (
                  <G
                    key={crystal.derivedNodeId}
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
              {/* Native hit layer (KTD7): one positioned target per NAMEABLE crystal. */}
              {placed.crystals.filter(isNameableCrystal).map((crystal) => {
                const target = targetBox(crystal, placed, scale);
                return (
                  <PressableSurface
                    key={`target-${crystal.derivedNodeId}`}
                    accessibilityLabel={crystal.label}
                    selected={selectedNodeId === crystal.derivedNodeId}
                    onPress={() =>
                      setSelectedNodeId((current) => (current === crystal.derivedNodeId ? null : crystal.derivedNodeId))
                    }
                    className={`absolute items-center justify-center rounded-control ${selectedNodeId === crystal.derivedNodeId ? "border-2 border-frontier" : ""}`}
                    style={{ left: target.left, top: target.top, width: target.size, height: target.size }}
                  >
                    <View />
                  </PressableSurface>
                );
              })}
            </View>
          ) : (
            <Text variant="label" color="muted" className="font-normal">{learnerTerm("vistaEmpty")}</Text>
          )}
        </ScrollView>
        {door ? (
          <View className="border-t border-line bg-card px-4 py-3">
            <View className="mx-auto w-full max-w-3xl gap-1.5">
              <Text variant="label" className="font-semibold" numberOfLines={1}>{door.label}</Text>
              {door.kind === "reveal" ? (
                <>
                  {door.gist ? <Text variant="caption" color="muted" numberOfLines={3}>{door.gist}</Text> : null}
                  <Button
                    onPress={() => onExamine(door.derivedNodeId)}
                    icon={<ArrowRight size={14} color={colors["on-accent"]} />}
                    label={learnerTerm("examine")}
                  />
                </>
              ) : (
                <Text variant="caption" color="muted">
                  {learnerTerm("vistaGuardedTemplate").replace("{n}", String(door.legNumber))}
                </Text>
              )}
            </View>
          </View>
        ) : null}
      </View>
    </FullScreenDialog>
  );
}

// A stable square touch target over a crystal's body: at least 44px regardless of the
// canvas scale, centered on the crystal's visual center.
function targetBox(crystal: PlacedCrystal, placed: PlacedFormation, scale: number): { left: number; top: number; size: number } {
  const size = Math.max(44, VISTA_CRYSTAL_SIZE * scale * 0.7);
  const centerX = (crystal.x - placed.viewBox.x) * scale;
  const centerY = (crystal.y - VISTA_CRYSTAL_SIZE * 0.45 - placed.viewBox.y) * scale;
  return { left: centerX - size / 2, top: centerY - size / 2, size };
}

// The header's tally crystal rendered inside its own tiny canvas (the OverlayHeader
// circle), mirroring the trail tally door the learner pressed to get here.
function CrystalShardsGroupIcon({ crystal }: Readonly<{ crystal: { derivedNodeId: string; difficulty: number } }>) {
  return (
    <Svg width={26} height={26} viewBox="0 0 100 100">
      <CrystalShardsGroup
        derivedNodeId={crystal.derivedNodeId}
        difficulty={crystal.difficulty}
        growthFraction={1}
        state="mastered"
      />
    </Svg>
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
        if (celebratingSection === sectionIndex) {
          return <CelebratingAura key={sectionIndex} bounds={bounds} />;
        }
        return (
          <Ellipse
            key={sectionIndex}
            cx={bounds.cx}
            cy={bounds.cy}
            rx={bounds.rx}
            ry={bounds.ry}
            fill={colors.gold}
            opacity={0.16}
          />
        );
      })}
    </>
  );
}

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

// The newest fusion's one-time assembly swell (U5, R15): the aura brightens from the
// resting 0.16 up past the celebration level and settles at 0.4 for the highlight
// window. Reduced motion renders the bright celebration opacity statically.
function CelebratingAura({ bounds }: Readonly<{ bounds: { cx: number; cy: number; rx: number; ry: number } }>) {
  const reduceMotion = useReducedMotion();
  const glow = useSharedValue(reduceMotion ? 0.4 : 0.16);
  useEffect(() => {
    if (reduceMotion) return;
    glow.set(
      withSequence(
        withTiming(0.55, { duration: MOTION.celebration }),
        withTiming(0.4, { duration: MOTION.celebration })
      )
    );
    // Mount-only celebration by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const animatedProps = useAnimatedProps(() => ({ opacity: glow.get() }));
  return <AnimatedEllipse cx={bounds.cx} cy={bounds.cy} rx={bounds.rx} ry={bounds.ry} fill={colors.gold} animatedProps={animatedProps} />;
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
      <Polygon points={`${cx},${cy - r} ${cx + r * 0.7},${cy} ${cx},${cy + r} ${cx - r * 0.7},${cy}`} fill={colors.gold} stroke={colors.frontier} strokeWidth={2} />
      <Polygon points={`${cx},${cy - r * 0.5} ${cx + r * 0.35},${cy} ${cx},${cy + r * 0.5} ${cx - r * 0.35},${cy}`} fill="white" opacity={0.5} />
    </G>
  );
}
