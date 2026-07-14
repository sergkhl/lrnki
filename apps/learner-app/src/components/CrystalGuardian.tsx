import { View } from "react-native";
import Svg, { Circle, G, Polygon, Rect } from "react-native-svg";
import { CrystalShardsGroup } from "./CrystalGlyph";
import { learnerTerm } from "@/learn/vocabulary";
import { colors } from "@/ui";

// The Crystal Guardian (plan 2026-07-13-003 U5, KTD9): an abstract boss composed entirely
// from react-native-svg geometry and the existing crystal tokens — no raster asset, no
// canvas engine. The silhouette IS the scope anchor's own procedural crystal (crystalSpec
// is deterministic per node id), so the Guardian a learner faces is the same recognizable
// crystal that guards their milestone on the trail and in the vista. Wards (one per lineup
// item) arc above it; the three-segment shield sits at its base. Every state is shape- and
// fill-differentiated, never color-alone, and the whole figure is a single labeled image
// for screen readers — the fight surface announces the numbers as text alongside.

// Guardians render imposing regardless of the anchor concept's intrinsic difficulty: a
// fixed high difficulty seeds a dense shard formation.
const GUARDIAN_DIFFICULTY = 5;

export type GuardianPhase = "active" | "recovery" | "won";

export function CrystalGuardian({
  anchorDerivedNodeId,
  phase,
  wardTotal,
  wardsRemaining,
  shieldRemaining,
  shieldTotal,
  size = 220
}: Readonly<{
  anchorDerivedNodeId: string;
  phase: GuardianPhase;
  wardTotal: number;
  wardsRemaining: number;
  shieldRemaining: number;
  shieldTotal: number;
  size?: number;
}>) {
  const auraColor = phase === "won" ? colors.gold : phase === "recovery" ? colors.destructive : colors["gem-soft"];
  const label =
    phase === "won"
      ? learnerTerm("guardianNodeWon")
      : `${learnerTerm("guardianTitle")}: ${wardsRemaining} of ${wardTotal} ${learnerTerm("guardianWards").toLowerCase()}, ` +
        `${learnerTerm("guardianShield").toLowerCase()} ${shieldRemaining} of ${shieldTotal}` +
        (phase === "recovery" ? `, ${learnerTerm("guardianLastStand")}` : "");
  return (
    <View className="items-center">
      <Svg accessibilityRole="image" accessibilityLabel={label} viewBox="0 0 100 134" width={size} height={(size * 134) / 100}>
        {/* The aura reads the phase: soft gem normally, destructive in Last Stand, gold on
            victory — always accompanied by the banner/summary text, never color-alone. */}
        <Circle cx={50} cy={70} r={36} fill={auraColor} opacity={phase === "active" ? 0.5 : 0.35} />
        <Circle cx={50} cy={70} r={36} stroke={phase === "active" ? colors["line-strong"] : auraColor} strokeWidth={1.5} fill="none" opacity={0.8} />
        {/* The Guardian body: the anchor concept's own deterministic crystal, fully grown. */}
        <G transform="translate(11, 22) scale(0.78)">
          <CrystalShardsGroup
            derivedNodeId={anchorDerivedNodeId}
            difficulty={GUARDIAN_DIFFICULTY}
            growthFraction={1}
            state="mastered"
          />
        </G>
        <WardArc total={wardTotal} remaining={phase === "won" ? 0 : wardsRemaining} />
        {phase === "won" ? null : <ShieldRow total={shieldTotal} remaining={shieldRemaining} />}
      </Svg>
    </View>
  );
}

// One diamond per lineup item along a shallow arc over the Guardian. Broken wards (already
// resolved items) hollow out from the left; intact wards stay filled.
function WardArc({ total, remaining }: Readonly<{ total: number; remaining: number }>) {
  const broken = Math.max(0, total - remaining);
  const spacing = total > 1 ? Math.min(13, 82 / (total - 1)) : 0;
  return (
    <G>
      {Array.from({ length: total }, (_, index) => {
        const x = 50 + (index - (total - 1) / 2) * spacing;
        const y = 10 + ((x - 50) * (x - 50)) / 190;
        const points = `${x},${y - 5} ${x + 4},${y} ${x},${y + 5} ${x - 4},${y}`;
        const intact = index >= broken;
        return intact ? (
          <Polygon key={index} testID="ward-intact" points={points} fill={colors.gem} stroke={colors["line-strong"]} strokeWidth={0.8} />
        ) : (
          <Polygon key={index} testID="ward-broken" points={points} fill="none" stroke={colors.fog} strokeWidth={1.2} opacity={0.7} />
        );
      })}
    </G>
  );
}

// The three-segment crystal shield at the Guardian's base: remaining segments are filled,
// spent segments hollow — a fill/shape difference, not a hue difference.
function ShieldRow({ total, remaining }: Readonly<{ total: number; remaining: number }>) {
  const width = 22;
  const gap = 5;
  const startX = 50 - (total * width + (total - 1) * gap) / 2;
  return (
    <G>
      {Array.from({ length: total }, (_, index) => {
        const x = startX + index * (width + gap);
        const intact = index < remaining;
        return intact ? (
          <Rect key={index} testID="shield-intact" x={x} y={118} width={width} height={9} rx={3.5} fill={colors.trail} stroke={colors["line-strong"]} strokeWidth={0.8} />
        ) : (
          <Rect key={index} testID="shield-spent" x={x} y={118} width={width} height={9} rx={3.5} fill="none" stroke={colors.fog} strokeWidth={1.2} opacity={0.8} />
        );
      })}
    </G>
  );
}
