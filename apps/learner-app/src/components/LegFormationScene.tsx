import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Svg, { Circle, G, Polygon } from "react-native-svg";
import { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import type { RecallScopeStatus } from "@lrnki/application/projection";
import { CrystalSpecimen } from "./CrystalSpecimen";
import { GuardianLegRow } from "./GuardianLegRow";
import {
  BADGE_CRYSTAL_PX,
  BADGE_RADIUS,
  CELL_CHIP_HEIGHT,
  CELL_CHIP_INSET,
  PANEL_PAD,
  isNameableMineral,
  type FormationCell,
  type LegPanelModel
} from "@/learn/crystalFormationLayout";
import { materialFor } from "@/learn/crystalLibrary";
import { formationProgressLine } from "@/learn/mineralSpecimen";
import { legStateCopy, learnerTerm } from "@/learn/vocabulary";
import { AnimatedView, MOTION, PressableSurface, Text, colors, radius, useReducedMotion } from "@/ui";

export type LegSceneMode = "overview" | "collection" | "binding";

// ONE Leg as a cavern-role panel (plan 2026-07-30-001 U4, KTD6/KTD8/KTD9/KTD10): a warm well
// holding one cell per concept, a junction badge straddling the panel's top edge, and — where a
// surface offers Guardian entry — the Leg's own Guardian row. No island outline, no mound, no
// spine, no crop.
//
// The panel is React Native views with ONE small <Svg> per crystal, not one scene-wide canvas:
// text (the `Next` chip) then never goes through react-native-svg, which is the Android
// divergence class the trail restyle was bitten by, and every cell is a real touch target.
//
// Presentation inputs stay explicit event identities, never inferred from render changes, so a
// rerender or a reopened surface can never replay a reward:
// - `overview` frames the panel at rest.
// - `collection` frames the whole panel; ONLY the cell named by `enteringNodeId` plays its
//   one-shot rise — every other crystal stays still.
// - `binding` frames the whole panel; the keyed seal scale-in + the gold panel-edge sweep play
//   exactly once per `bindingEventId`.
export function LegFormationScene({
  panel,
  mode,
  enteringNodeId = null,
  bindingEventId = null,
  selectedNodeId = null,
  onSelectNode,
  onEnterGuardian
}: Readonly<{
  panel: LegPanelModel;
  mode: LegSceneMode;
  enteringNodeId?: string | null;
  bindingEventId?: string | null;
  selectedNodeId?: string | null;
  onSelectNode?: (derivedNodeId: string) => void;
  // Provided only by surfaces that own Guardian entry (KTD9). A panel without it renders no
  // row, so the reward card and the capstone inset stay pure presentation.
  onEnterGuardian?: (scope: RecallScopeStatus) => Promise<void>;
}>) {
  const reduceMotion = useReducedMotion();
  const stateLine = legStateCopy(panel.structuralState, panel.guardianSubstate);
  const label = `${learnerTerm("section")} ${panel.sectionIndex + 1}: ${panel.milestoneLabel} — ${stateLine}. ${formationProgressLine(panel.progress)}.`;
  const future = panel.structuralState === "future";
  const bound = panel.structuralState === "bound";
  const badge = panel.structuralState === "guardian_ready" ? "ward" : bound ? "seal" : null;

  return (
    // The badge straddles the panel's top edge, so the wrapper reserves its overhang instead of
    // relying on overflow — Android clips absolutely positioned children of a rounded parent.
    <View style={{ width: panel.width, paddingTop: BADGE_RADIUS }}>
      <View
        testID={`cavern-panel-${panel.structuralState}`}
        style={{
          width: panel.width,
          padding: PANEL_PAD,
          borderRadius: 26,
          backgroundColor: future ? colors.cavern : colors["cavern-panel"],
          borderWidth: 1.5,
          // Shape, never colour alone (R5): a future Leg's edge is dashed.
          borderStyle: future ? "dashed" : "solid",
          borderColor: panelEdge(panel.structuralState)
        }}
      >
        <View
          accessible={onSelectNode ? undefined : true}
          accessibilityRole={onSelectNode ? undefined : "image"}
          accessibilityLabel={onSelectNode ? undefined : label}
          style={{
            width: panel.well.width,
            height: panel.well.height,
            borderRadius: radius.overlay + 4,
            backgroundColor: colors.cavern
          }}
        >
          {panel.cells.map((cell) => (
            <CavernCell
              key={cell.derivedNodeId}
              cell={cell}
              selected={selectedNodeId === cell.derivedNodeId}
              onSelectNode={onSelectNode}
              entering={mode === "collection" && enteringNodeId !== null && cell.derivedNodeId === enteringNodeId}
            />
          ))}
        </View>

        {onEnterGuardian && panel.recallScope ? (
          <GuardianLegRow
            scope={panel.recallScope}
            sectionComplete={panel.structuralState !== "collecting" && panel.structuralState !== "future"}
            onEnter={onEnterGuardian}
          />
        ) : null}
      </View>

      {/* The single junction badge: the ward crystal while the Guardian stands, the gold seal
          once the Leg is bound. Gold appears here only when it has been earned. */}
      {badge ? <JunctionBadge panel={panel} kind={badge} /> : null}

      {/* Reduced motion renders the sealed bound state directly: the binding overlay is pure
          event emphasis, so it is skipped rather than frozen mid-fade. */}
      {mode === "binding" && bindingEventId !== null && !reduceMotion ? (
        <BindingEvent key={bindingEventId} panel={panel} />
      ) : null}
    </View>
  );
}

function panelEdge(state: LegPanelModel["structuralState"]): string {
  if (state === "bound") return colors["gold-ink"];
  if (state === "guardian_ready") return colors.frontier;
  if (state === "future") return colors["cavern-edge"];
  return colors["cavern-edge"];
}

// The junction badge on the panel's top edge: a rock roundel holding the earned-only shape.
// `legWard` is the Guardian's own ward crystal; the seal is the gold star of a bound Leg.
function JunctionBadge({ panel, kind }: Readonly<{ panel: LegPanelModel; kind: "ward" | "seal" }>) {
  const size = BADGE_RADIUS * 2;
  return (
    <View
      testID={`cavern-badge-${kind}`}
      pointerEvents="none"
      style={{ position: "absolute", left: panel.badge.x - BADGE_RADIUS, top: 0, width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute" }}>
        <Circle
          testID="cavern-seal-roundel"
          cx={BADGE_RADIUS}
          cy={BADGE_RADIUS}
          r={BADGE_RADIUS - 1}
          fill={colors["cavern-rock"]}
          stroke={kind === "seal" ? colors["gold-ink"] : colors.frontier}
          strokeWidth={1.5}
        />
        {kind === "seal" ? (
          <G>
            <Polygon
              testID="cavern-seal-shape"
              points={sealStar(BADGE_RADIUS)}
              fill={colors.gold}
              stroke={colors["gold-ink"]}
              strokeWidth={0.8}
            />
          </G>
        ) : null}
      </Svg>
      {/* Absolutely positioned on purpose: on web a positioned sibling (the roundel) paints above
          every in-flow one regardless of document order, so an in-flow crystal would be hidden. */}
      {kind === "ward" ? (
        <View style={{ position: "absolute", left: (size - BADGE_CRYSTAL_PX) / 2, top: (size - BADGE_CRYSTAL_PX) / 2 }}>
          <CrystalSpecimen
            species="legWard"
            derivedNodeId={`ward:${panel.sectionIndex}`}
            material="collected"
            growthFraction={1}
            size={BADGE_CRYSTAL_PX}
            ariaLabel={null}
          />
        </View>
      ) : null}
    </View>
  );
}

function sealStar(r: number): string {
  const arm = r - 5;
  const waist = arm * 0.34;
  return [
    [r, r - arm],
    [r + waist, r - waist],
    [r + arm, r],
    [r + waist, r + waist],
    [r, r + arm],
    [r - waist, r + waist],
    [r - arm, r],
    [r - waist, r - waist]
  ]
    .map(([x, y]) => `${round1(x)},${round1(y)}`)
    .join(" ");
}

// First victory traces the already-earned structure only: crystals never regrow. One gold sweep
// fades along the panel edge (replacing the deleted island rim sweep and spine segment) while
// the seal scales in about the junction.
function BindingEvent({ panel }: Readonly<{ panel: LegPanelModel }>) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withTiming(1, { duration: MOTION.emphasis }));
  }, [progress]);
  const edgeStyle = useAnimatedStyle(() => ({ opacity: 0.95 - progress.get() * 0.55 }));
  const sealStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ scale: 0.4 + 0.6 * progress.get() }]
  }));
  return (
    <View testID="leg-binding-event" pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: BADGE_RADIUS, bottom: 0 }}>
      <AnimatedView
        animatedStyle={edgeStyle}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: 26, borderWidth: 4, borderColor: colors.gold }}
      />
      <AnimatedView
        animatedStyle={sealStyle}
        style={{ position: "absolute", left: panel.badge.x - BADGE_RADIUS, top: -BADGE_RADIUS, width: BADGE_RADIUS * 2, height: BADGE_RADIUS * 2 }}
      >
        <JunctionBadge panel={{ ...panel, badge: { x: BADGE_RADIUS, y: 0 } }} kind="seal" />
      </AnimatedView>
    </View>
  );
}

// One concept's cell: the crystal on its deeper parchment, the growth bar under it, and — on the single
// study target — the `Next` chip. The chip is load-bearing text, not decoration: a fully grown
// `open` crystal is pixel-identical to a `collected` one, so the target must say so in words.
function CavernCell({
  cell,
  selected,
  entering,
  onSelectNode
}: Readonly<{
  cell: FormationCell;
  selected: boolean;
  entering: boolean;
  onSelectNode?: (derivedNodeId: string) => void;
}>) {
  const reduceMotion = useReducedMotion();
  const animate = entering && !reduceMotion && cell.state === "collected";
  const playedRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!animate || playedRef.current) return;
    playedRef.current = true;
    setPlaying(true);
  }, [animate]);

  // Only a crystal the formation would name is a tap target; an unreached concept stays an
  // unnamed shape, exactly as the Vista's memory door rule already decides.
  const nameable = isNameableMineral(cell);
  const palette = materialFor(cell.species, cell.material);
  const body = (
    <>
      <View style={{ position: "absolute", left: cell.crystal.x, top: cell.crystal.y }}>
        <CrystalSpecimen
          species={cell.species}
          derivedNodeId={cell.derivedNodeId}
          material={cell.material}
          growthFraction={cell.growthFraction}
          size={cell.crystal.width}
          ariaLabel={null}
        />
      </View>
      {cell.bar ? (
        <View
          testID="cavern-cell-bar"
          style={{ position: "absolute", left: cell.bar.x, top: cell.bar.y, width: cell.bar.width, height: cell.bar.height, borderRadius: cell.bar.height / 2, backgroundColor: colors["cavern-rock"], overflow: "hidden" }}
        >
          <View style={{ width: `${Math.round(clamp01(cell.growthFraction) * 100)}%`, height: "100%", backgroundColor: palette.light }} />
        </View>
      ) : null}
      {cell.isNext ? (
        <View
          testID="cavern-cell-next"
          style={{ position: "absolute", left: 4, right: 4, bottom: CELL_CHIP_INSET, height: CELL_CHIP_HEIGHT, borderRadius: CELL_CHIP_HEIGHT / 2, backgroundColor: colors.frontier, alignItems: "center", justifyContent: "center" }}
        >
          <Text variant="caption" color="on-accent" className="text-[9px] font-bold" numberOfLines={1}>
            {learnerTerm("nextStop")}
          </Text>
        </View>
      ) : null}
    </>
  );

  const frame = {
    position: "absolute" as const,
    left: cell.rect.x,
    top: cell.rect.y,
    width: cell.rect.width,
    height: cell.rect.height,
    borderRadius: radius.control,
    backgroundColor: colors["cavern-rock"],
    opacity: cell.state === "known" ? 0.8 : 1
  };
  const testID = `cavern-cell-${cell.state}`;

  if (onSelectNode && nameable) {
    return (
      <PressableSurface
        testID={testID}
        accessibilityLabel={cell.isNext ? `${cell.label} — ${learnerTerm("nextStop")}` : cell.label}
        selected={selected}
        onPress={() => onSelectNode(cell.derivedNodeId)}
        style={frame}
        pressedClassName="opacity-80"
      >
        {playing ? <EnteringCell>{body}</EnteringCell> : body}
      </PressableSurface>
    );
  }
  return (
    <View testID={testID} style={frame}>
      {playing ? <EnteringCell>{body}</EnteringCell> : body}
    </View>
  );
}

// The one-shot collection entrance: the finished crystal's colour rises from its own bedrock in
// its own cell — never a re-growth of any neighbour. Mount-only by design; the played flag
// upstream owns the event identity, so re-renders never replay it.
function EnteringCell({ children }: Readonly<{ children: React.ReactNode }>) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withDelay(80, withTiming(1, { duration: MOTION.celebration })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * 10 }]
  }));
  return (
    <AnimatedView testID="leg-slot-entering" animatedStyle={animatedStyle} style={{ flex: 1 }}>
      {children}
    </AnimatedView>
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
