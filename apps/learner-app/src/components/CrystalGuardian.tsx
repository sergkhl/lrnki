import { View } from "react-native";
import Svg, { Circle, G, Polygon, Rect } from "react-native-svg";
import { guardianObeliskLayout, type GuardianObeliskSegment } from "@/learn/guardianObelisk";
import {
  GLOSS_FILL,
  facetFill,
  materialFor,
  type CrystalMaterial,
  type CrystalPalette,
  type CrystalSpecies
} from "@/learn/crystalLibrary";
import { guardianScopeTitle, learnerTerm } from "@/learn/vocabulary";
import type { RecallChallengeView } from "@lrnki/application/projection";
import { colors } from "@/ui";

// The Crystal Guardian (plan 2026-07-13-003 U5, KTD9; rebuilt as the Ward Obelisk by plan
// 2026-07-31-002 U2). An abstract boss composed entirely from react-native-svg geometry and
// the shared crystal library — no raster asset, no canvas engine, no second art system.
//
// The Guardian is ONE fixed obelisk of the ward it defends, and its ordered segments are the
// single visual encoding of the challenge's ward count (KTD7 — the separate ward arc is gone).
// The body never reflows: answering a ward changes only a segment's material, so the silhouette
// the learner is fighting stays the same object from the first ward to the last. Wards resolve
// base-to-crown, which makes the crown the Final Ward by construction. Crystal art always
// shares the same warm ground, so the obelisk rises from a deeper cavern socket.
//
// The body deliberately carries no difficulty band: the challenge projection does not publish
// the anchor's intrinsic difficulty, and inventing one from the node id would make the specimen
// encode noise as if it were the neutral fact bands stand for (R2). The scope's own earned-only
// ward species (`legWard` for a Leg, `summitWard` for the summit) keeps the two duels
// shape-distinguishable, carried by the emblem on the crown.
//
// Every state is shape- and fill-differentiated, never color-alone: a resolved ward is a bare
// stone slot, a queued ward carries a lit facet, and the current ward adds gloss and a heavier
// boundary — with the exact counts announced as text beside the figure. The whole figure is one
// labeled image for screen readers; individual segments are never separate a11y elements.
//
// There is deliberately NO victory rendering. A committed win routes straight to the Crystal
// Formation reward, which owns the whole victory beat, so the Guardian body is only ever drawn
// for a fight in progress. That structural absence — not a defensive branch — is what makes the
// corrective contract hold: no shatter, collapse, or defeat pose exists to render.

// The only two states a Guardian body is ever drawn in, and exactly the pair `GuardianStage`
// narrows the challenge view to. `won` is absent on purpose (see above).
export type GuardianPhase = "active" | "recovery";

// Contour weights: the current ward's heavier boundary is a non-colour state channel, and the
// outer frame is drawn last at the heaviest weight so the body always reads as one solid.
const SEGMENT_CONTOUR_WIDTH = 0.9;
const CURRENT_CONTOUR_WIDTH = 2;
const FRAME_CONTOUR_WIDTH = 1.6;
const EMBLEM_CONTOUR_WIDTH = 1.4;
// The lit facet's authored tone, ramped through each material's own strength — inside the
// crystal library's authored range (its own facets run |tone| <= 0.24), so a ward face reads as
// lit stone rather than a second colour.
const FACET_TONE = 0.3;
// The current ward's static luminous emphasis. Deliberately below the library's
// GLOSS_OPACITY.collected: that 0.42 is authored for a narrow gloss sliver, and washing a face
// this wide with it erases the ward's own hue.
const CURRENT_GLOSS_OPACITY = 0.18;

export function CrystalGuardian({
  scopeKind,
  phase,
  wardTotal,
  wardsRemaining,
  shieldRemaining,
  shieldTotal,
  size = 220
}: Readonly<{
  scopeKind: RecallChallengeView["scopeKind"];
  phase: GuardianPhase;
  wardTotal: number;
  wardsRemaining: number;
  shieldRemaining: number;
  shieldTotal: number;
  size?: number;
}>) {
  const ward: CrystalSpecies = scopeKind === "enrichment" ? "summitWard" : "legWard";
  const auraColor = phase === "recovery" ? colors.destructive : colors["gem-soft"];
  const ringColor = phase === "recovery" ? colors.destructive : colors["cavern-edge"];
  const obelisk = guardianObeliskLayout({ ward, wardTotal, wardsRemaining });
  const frameContour = materialFor(ward, "collected").contour;
  const label =
    `${guardianScopeTitle(scopeKind)}: ${wardsRemaining} of ${wardTotal} ${learnerTerm("guardianWards").toLowerCase()}, ` +
    `${learnerTerm("guardianShield").toLowerCase()} ${shieldRemaining} of ${shieldTotal}` +
    (phase === "recovery" ? `, ${learnerTerm("guardianLastStand")}` : "");
  return (
    <View className="items-center">
      <Svg accessibilityRole="image" accessibilityLabel={label} viewBox="0 0 100 134" width={size} height={(size * 134) / 100}>
        {/* The socket is cavern rock, so the obelisk keeps its native ground. The phase
            reads on the wash and ring — soft gem normally, destructive in Last Stand — always
            accompanied by the banner/summary text, never color-alone. */}
        <Circle cx={50} cy={70} r={36} fill={colors.cavern} />
        <Circle cx={50} cy={70} r={36} fill={auraColor} opacity={phase === "active" ? 0.2 : 0.32} />
        <Circle
          cx={50}
          cy={70}
          r={36}
          stroke={ringColor}
          strokeWidth={1.5}
          fill="none"
          opacity={0.9}
        />
        {obelisk.segments.map((segment) => (
          <WardSegment key={segment.indexFromBase} segment={segment} ward={ward} />
        ))}
        {/* The scope ward's own silhouette, cut into the crown as a constant identity mark: it
            survives every material state, so a Leg Guardian and the Expedition Guardian stay
            distinguishable by shape even when the whole body is stone. */}
        <Polygon
          testID="guardian-ward-emblem"
          points={obelisk.crownWardPoints}
          fill="none"
          stroke={frameContour}
          strokeWidth={EMBLEM_CONTOUR_WIDTH}
          strokeLinejoin="round"
        />
        {/* Drawn last, over every seam, so the silhouette can never appear to break apart as
            wards resolve. */}
        <Polygon
          testID="guardian-obelisk-frame"
          points={obelisk.framePoints}
          fill="none"
          stroke={frameContour}
          strokeWidth={FRAME_CONTOUR_WIDTH}
          strokeLinejoin="round"
        />
        <ShieldRow total={shieldTotal} remaining={shieldRemaining} />
      </Svg>
    </View>
  );
}

// One ward of the lineup as one slot of the body. The three states differ in STRUCTURE before
// colour: resolved is bare stone, queued adds the lit facet, current adds gloss over that facet
// and a heavier boundary.
function WardSegment({ segment, ward }: Readonly<{ segment: GuardianObeliskSegment; ward: CrystalSpecies }>) {
  const material: CrystalMaterial = segment.state === "resolved" ? "fogged" : segment.state === "current" ? "collected" : "open";
  const palette: CrystalPalette = materialFor(ward, material);
  const current = segment.state === "current";
  return (
    <G>
      <Polygon
        testID={`guardian-ward-segment-${segment.state}`}
        points={segment.points}
        fill={palette.base}
        stroke={palette.contour}
        strokeWidth={current ? CURRENT_CONTOUR_WIDTH : SEGMENT_CONTOUR_WIDTH}
        strokeLinejoin="round"
      />
      {segment.state === "resolved" || segment.highlightPoints === null ? null : (
        <Polygon points={segment.highlightPoints} fill={facetFill(palette, FACET_TONE, material)} />
      )}
      {current && segment.highlightPoints !== null ? (
        <Polygon points={segment.highlightPoints} fill={GLOSS_FILL} fillOpacity={CURRENT_GLOSS_OPACITY} />
      ) : null}
    </G>
  );
}

// The three-segment crystal shield at the Guardian's base — the learner's own protection, fully
// independent of the ward segmentation above it. The corrective reveal owns a miss response; when
// the Guardian returns it statically reflects the server-owned shield count without resolving or
// rearranging a ward. Remaining segments are filled, spent segments hollow — a fill/shape
// difference, not a hue difference.
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
