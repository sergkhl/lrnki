import { Fragment, useEffect, useRef, useState, type RefObject } from "react";
import { ScrollView, View } from "react-native";
import { useIsFocused, useRouter } from "expo-router";
import { Flag, Mountain } from "lucide-react-native";
import Svg, { Path } from "react-native-svg";
import type { RecallScopeStatus, ScaffoldDetourView, StudySession } from "@lrnki/application/projection";
import type { ScaffoldStepView } from "@lrnki/application/projection";
import { ActivitySheet } from "./ActivitySheet";
import { CheckpointCircle } from "./CheckpointCircle";
import { MapGround } from "./MapGround";
import { buildTreasureRoute } from "@/learn/treasureMap";
import { ConceptMarker } from "./ConceptMarker";
import { GuardianArrivalDialog } from "./GuardianArrivalDialog";
import { GuardianTrailNode } from "./GuardianTrailNode";
import { SupportPathNode } from "./SupportPathNode";
import { SupportPathSheet } from "./SupportPathSheet";
import { SupportPathDialog, dialogStateForDetour } from "./SupportPathDialog";
import { hideScaffoldDetour, retryScaffoldDetour } from "@/lib/actions";
import { enterGuardianScope } from "@/lib/guardianEntry";
import { markGuardianArrivalSeen, readGuardianArrivalSeen } from "@/lib/navMemory";
import { legBannerLine, terminusLine } from "@/learn/goalCopy";
import { formationProgress, formationProgressLine } from "@/learn/mineralSpecimen";
import { Progress, Text, colors } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";
import type { TrailCluster, TrailStop, TrailView } from "@lrnki/application/projection";

// The trail winds as one sine wave (plan 2026-07-16-003 D5): checkpoint circles sit at
// AMPLITUDE·sin(stopIndex·π/4) so the drawn wave passes exactly through every circle center.
const WAVE_AMPLITUDE_PX = 56;
const waveOffset = (stopIndex: number) => Math.round(WAVE_AMPLITUDE_PX * Math.sin((stopIndex * Math.PI) / 4));
// A checkpoint circle's vertical center within its stop row: the row's py-1 (4px) plus half
// the fixed 72px circle box CheckpointCircle always renders first.
const CHECKPOINT_CENTER_FROM_ROW_TOP_PX = 40;

export type TrailScrollHandle = {
  scrollToSection: (sectionIndex: number) => void;
  // The memory door's Examine (plan 2026-07-10-001 U3): land on the concept's first stop.
  scrollToNode: (derivedNodeId: string) => void;
};

export function CheckpointPath({
  view,
  session,
  scrollHandleRef
}: Readonly<{ view: TrailView; session: StudySession; scrollHandleRef?: RefObject<TrailScrollHandle | null> }>) {
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  // Learner-scoped Support Path UI state (plan 2026-07-13-002 U4/U5): the state-aware dialog and
  // the full-screen Support Path flow are root-owned here so they survive the activity sheet
  // closing (KTD5). Tapping a node routes by status: ready → the path flow, otherwise → the
  // progress/recovery dialog (R12-R13).
  const [progressDetourId, setProgressDetourId] = useState<string | null>(null);
  const [pathDetourId, setPathDetourId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const router = useRouter();

  // Guardian entry (plan 2026-07-13-003 U6): resume the active challenge or ask the server
  // to create one, then move to the route-addressable fight. The scope facts are entirely
  // server-projected; a failed entry leaves the trail untouched.
  const enterScope = async (scope: RecallScopeStatus) => {
    const result = await enterGuardianScope({ enrichmentId: session.enrichmentId, scope });
    if (!result.entered) return;
    // A successful entry owns the study-surface handoff: close first, then yield a frame
    // before navigation so the Activity Sheet cannot remain visible over the fight.
    setSelectedStopId(null);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    router.push(`/guardian/${result.challengeId}`);
  };

  // The arrival offer (F1): the first unacknowledged available scope whose Leg is complete
  // (or the unlocked summit) opens the non-blocking dialog once per device. Offered only
  // while the trail screen is focused: the trail stays mounted under a pushed /guardian
  // route, and a post-win session refetch there must not pop the next Leg's arrival over
  // the reward — it waits for the learner's return to the trail.
  const isFocused = useIsFocused();
  const [arrivalScope, setArrivalScope] = useState<RecallScopeStatus | null>(null);
  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;
    void (async () => {
      const candidates: RecallScopeStatus[] = [
        ...view.sections.flatMap((section) =>
          section.state === "complete" && section.recallScope?.state === "available" ? [section.recallScope] : []
        ),
        ...(view.enrichmentScope?.state === "available" ? [view.enrichmentScope] : [])
      ];
      for (const scope of candidates) {
        if (await readGuardianArrivalSeen(session.learnerStateRef, scope.anchorDerivedNodeId)) continue;
        if (!cancelled) setArrivalScope(scope);
        return;
      }
    })();
    return () => { cancelled = true; };
  }, [isFocused, view.sections, view.enrichmentScope, session.learnerStateRef]);
  const acknowledgeArrival = () => {
    if (arrivalScope) void markGuardianArrivalSeen(session.learnerStateRef, arrivalScope.anchorDerivedNodeId);
    setArrivalScope(null);
  };

  const referenceLabelFor = (derivedNodeId: string) =>
    session.detail.nodes.find((node) => node.derivedNodeId === derivedNodeId)?.label ?? derivedNodeId;
  // A reference step studies the referenced neutral node through its own trail stops (R15, F3):
  // the path closes, the trail focuses the referenced Concept Marker, and the ordinary Activity
  // Sheet opens the application-resolved first incomplete ordinary stop (KTD8).
  const openReferenceStep = (step: Extract<ScaffoldStepView, { kind: "reference" }>) => {
    if (step.destination.kind !== "checkpoint") return;
    setPathDetourId(null);
    const stopId = step.destination.stopId;
    const y = stopYRef.current[stopId];
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 220), animated: true });
    setSelectedStopId(stopId);
  };
  const openDetour = (detour: ScaffoldDetourView) => {
    if (detour.status === "ready") setPathDetourId(detour.detourId);
    else setProgressDetourId(detour.detourId);
  };
  // onLayout registry replaces the DOM's scrollIntoView: stop and section rows report
  // their y offsets, and imperative scrolls target those.
  const stopYRef = useRef<Record<string, number>>({});
  const sectionYRef = useRef<Record<number, number>>({});

  // The trail wave's measured anchors (D5): each stop row measures its container-relative
  // center into state (rounded, set only on change, so settled layouts never re-render).
  // Rows re-measure when the container resizes — content above a row (a Support Path node
  // appearing) shifts the row without firing its own onLayout.
  const containerRef = useRef<View>(null);
  const rowNodeRef = useRef<Record<string, View | null>>({});
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [waveAnchorYs, setWaveAnchorYs] = useState<Record<string, number>>({});
  const measureWaveAnchor = (stopId: string) => {
    const row = rowNodeRef.current[stopId];
    const container = containerRef.current;
    if (!row || !container) return;
    row.measureLayout(container, (_x, y) => {
      const center = Math.round(y + CHECKPOINT_CENTER_FROM_ROW_TOP_PX);
      setWaveAnchorYs((prev) => (prev[stopId] === center ? prev : { ...prev, [stopId]: center }));
    });
  };

  useEffect(() => {
    if (!scrollHandleRef) return;
    scrollHandleRef.current = {
      scrollToSection: (sectionIndex: number) => {
        const y = sectionYRef.current[sectionIndex];
        if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
      },
      scrollToNode: (derivedNodeId: string) => {
        const stopId = view.concepts.find((concept) => concept.derivedNodeId === derivedNodeId)?.stops[0]?.stopId;
        const y = stopId !== undefined ? stopYRef.current[stopId] : undefined;
        if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 220), animated: true });
      }
    };
  }, [scrollHandleRef, view.concepts]);

  // Landing auto-scrolls to the next stop so the guided "continue" is always in view (F1).
  // Deferred a tick so onLayout has reported; re-runs when the next stop changes after a refresh.
  useEffect(() => {
    if (!view.nextStopId) return;
    const timer = setTimeout(() => {
      const y = stopYRef.current[view.nextStopId ?? ""];
      if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 220), animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [view.nextStopId]);

  return (
    <>
      <ScrollView ref={scrollRef} className="flex-1 px-4" contentContainerClassName="py-4">
        <View
          ref={containerRef}
          className="relative mx-auto w-full max-w-sm gap-5 px-2 py-2"
          onLayout={(event) => {
            setContainerWidth(Math.round(event.nativeEvent.layout.width));
            setContainerHeight(Math.round(event.nativeEvent.layout.height));
            // Container growth means rows moved without their own onLayout firing.
            for (const stopId of Object.keys(rowNodeRef.current)) measureWaveAnchor(stopId);
          }}
        >
          {/* The parchment ground under everything, then the progressively inked route
              over it (plan 2026-07-18-001 U2); trail content overlays both. */}
          <MapGround
            seed={session.enrichmentId}
            width={containerWidth}
            height={containerHeight}
            stopAnchors={view.concepts.flatMap((concept) =>
              concept.stops.flatMap((stop) => {
                const y = waveAnchorYs[stop.stopId];
                return y === undefined ? [] : [{ y, sectionIndex: concept.sectionIndex }];
              })
            )}
          />
          <TrailRoute view={view} seed={session.enrichmentId} containerWidth={containerWidth} anchorYs={waveAnchorYs} />
          {view.concepts.map((concept, conceptIndex) => {
            // The Leg's Guardian node projects after its LAST concept (F5): guarding the
            // milestone the Leg builds toward, persistent across mastered/unfused, active,
            // and won states; won nodes become rematch entries (KTD3).
            const isSectionEnd = view.concepts[conceptIndex + 1]?.sectionIndex !== concept.sectionIndex;
            const sectionView = view.sections.find((section) => section.sectionIndex === concept.sectionIndex);
            return (
            <View key={concept.derivedNodeId} className="gap-5">
              {concept.isSectionStart ? (
                <View onLayout={(event) => { sectionYRef.current[concept.sectionIndex] = event.nativeEvent.layout.y; }}>
                  <SectionDivider
                    concept={concept}
                    sectionConcepts={view.concepts.filter((candidate) => candidate.sectionIndex === concept.sectionIndex)}
                  />
                </View>
              ) : null}
              <View className="gap-3">
                <ConceptMarker concept={concept} session={session} />
                <View className="gap-3">
                  {concept.stops.map((stop, stopIndex) => {
                    const globalStopIndex = view.concepts
                      .slice(0, conceptIndex)
                      .reduce((count, priorConcept) => count + priorConcept.stops.length, stopIndex);
                    const offset = waveOffset(globalStopIndex);
                    // Support Path nodes branch UNDER their parent, after the ordinary activity
                    // stops and just before the capstone (R12): one always-visible compact node
                    // per active detour, no step rows or disclosure state on the map.
                    const conceptDetours = stop.kind === "capstone"
                      ? session.detours.filter((detour) => detour.parentDerivedNodeId === concept.derivedNodeId)
                      : [];
                    return (
                      <Fragment key={stop.stopId}>
                        {conceptDetours.map((detour) => (
                          <SupportPathNode key={detour.detourId} detour={detour} onPress={openDetour} />
                        ))}
                        <View
                          ref={(node) => { rowNodeRef.current[stop.stopId] = node; }}
                          onLayout={(event) => {
                            stopYRef.current[stop.stopId] = event.nativeEvent.layout.y;
                            measureWaveAnchor(stop.stopId);
                          }}
                        >
                          <CheckpointStopRow stop={stop} concept={concept} offset={offset} onSelect={setSelectedStopId} />
                        </View>
                      </Fragment>
                    );
                  })}
                </View>
              </View>
              {isSectionEnd && sectionView?.recallScope ? (
                <GuardianTrailNode
                  scope={sectionView.recallScope}
                  sectionComplete={sectionView.state === "complete"}
                  onEnter={enterScope}
                />
              ) : null}
            </View>
            );
          })}
          {view.enrichmentScope ? (
            <GuardianTrailNode scope={view.enrichmentScope} sectionComplete onEnter={enterScope} />
          ) : null}
          {view.concepts.length > 0 ? <TrailTerminus view={view} summitLabel={session.target.label} /> : null}
        </View>
      </ScrollView>
      <ActivitySheet
        session={session}
        stopId={selectedStopId}
        open={selectedStopId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedStopId(null);
        }}
        onScaffoldRequested={(detourId) => setProgressDetourId(detourId)}
        onOpenDetour={(detourId) => setPathDetourId(detourId)}
      />
      <SupportPathSheet
        enrichmentId={session.enrichmentId}
        detour={session.detours.find((detour) => detour.detourId === pathDetourId) ?? null}
        open={pathDetourId !== null}
        onOpenChange={(open) => {
          if (!open) setPathDetourId(null);
        }}
        onHide={(detourId) => {
          // Hiding preserves the detour and returns its term to the panels (F4).
          void hideScaffoldDetour({ enrichmentId: session.enrichmentId, detourId });
          setPathDetourId(null);
        }}
        onOpenReference={openReferenceStep}
        referenceLabelFor={referenceLabelFor}
      />
      <GuardianArrivalDialog
        scope={arrivalScope}
        open={arrivalScope !== null}
        onFace={() => {
          const scope = arrivalScope;
          acknowledgeArrival();
          if (scope) void enterScope(scope);
        }}
        onDismiss={acknowledgeArrival}
      />
      {(() => {
        // The root-owned state-aware dialog (plan 2026-07-13-002 U3, KTD5): opened by the
        // staged handoff after a request. It branches on the DURABLE detour's projected
        // status — a restored already-ready detour shows ready actions immediately, with no
        // generating flash. `Open support path` enters the full-screen Support Path flow.
        const progressDetour = session.detours.find((detour) => detour.detourId === progressDetourId);
        return (
          <SupportPathDialog
            open={progressDetourId !== null}
            onOpenChange={(open) => {
              if (!open) setProgressDetourId(null);
            }}
            term={progressDetour?.term ?? ""}
            state={dialogStateForDetour(progressDetour)}
            onRetry={() => {
              if (progressDetourId !== null) void retryScaffoldDetour({ enrichmentId: session.enrichmentId, detourId: progressDetourId });
            }}
            onDismiss={() => {
              if (progressDetourId !== null) void hideScaffoldDetour({ enrichmentId: session.enrichmentId, detourId: progressDetourId });
              setProgressDetourId(null);
            }}
            onOpenPath={() => {
              if (progressDetourId !== null) setPathDetourId(progressDetourId);
              setProgressDetourId(null);
            }}
          />
        );
      })()}
    </>
  );
}

// The progressively inked route (plan 2026-07-18-001 U2, KTD5): one static SVG behind
// the trail content, keeping TrailWave's measured-anchor serpentine — x from the same
// sine offset the circles use, y from the measured-anchor state — with treasureMap's
// seeded hand-drawn jitter. Segments through the last completed stop draw as solid ink;
// segments ahead stay faint irregular dashes — a shape distinction, never color alone,
// never gold, and no route motion (the mastery beat stays on the capstone).
function TrailRoute({
  view,
  seed,
  containerWidth,
  anchorYs
}: Readonly<{ view: TrailView; seed: string; containerWidth: number; anchorYs: Record<string, number> }>) {
  if (containerWidth === 0) return null;
  const centerX = containerWidth / 2;
  const stops = view.concepts.flatMap((concept) => concept.stops);
  const measured = stops.flatMap((stop, stopIndex) => {
    const y = anchorYs[stop.stopId];
    return y === undefined ? [] : [{ x: centerX + waveOffset(stopIndex), y, state: stop.state }];
  });
  if (measured.length < 2) return null;
  // Solid ink runs through the last completed stop of the leading complete run; the
  // uncharted rhythm takes over at the first incomplete stop.
  const firstIncomplete = measured.findIndex((point) => point.state !== "complete");
  const completedCount = firstIncomplete === -1 ? measured.length : firstIncomplete;
  const route = buildTreasureRoute({
    seed,
    points: measured.map(({ x, y }) => ({ x, y })),
    completedCount
  });
  return (
    <View className="absolute inset-0" pointerEvents="none">
      <Svg width="100%" height="100%">
        {route.inkedPath ? (
          <Path
            d={route.inkedPath}
            fill="none"
            stroke={colors["map-ink"]}
            strokeOpacity={0.85}
            strokeWidth={3}
            strokeLinecap="round"
          />
        ) : null}
        {route.unchartedPath ? (
          <Path
            d={route.unchartedPath}
            fill="none"
            stroke={colors["map-ink-soft"]}
            strokeOpacity={0.65}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={route.unchartedDash}
          />
        ) : null}
      </Svg>
    </View>
  );
}

// The leg banner (plan 2026-07-10-001 U2): a section boundary that ANNOUNCES the leg's
// goal in advance — how many crystals guard the milestone — and flips to the secured
// state once every concept in the leg is mastered. An accessible completion meter plus
// exact crystal/known counts replaced the miniature specimen row (U1, R14-R15).
function SectionDivider({ concept, sectionConcepts }: Readonly<{ concept: TrailCluster; sectionConcepts: TrailCluster[] }>) {
  const masteredCount = sectionConcepts.filter((candidate) => candidate.state === "mastered").length;
  const secured = masteredCount >= sectionConcepts.length;
  const progress = formationProgress(sectionConcepts);
  // Region cartouche (plan 2026-07-18-001 U3): a double-rule ink frame with the Leg
  // heading in the map display face; the Progress bar and its copy are unchanged.
  return (
    <View className="rounded-card border border-map-ink bg-card p-1" testID="section-cartouche">
      <View className="gap-1.5 rounded-[6px] border border-map-ink-soft px-3 py-2">
        <View className="flex-row items-center gap-2">
          <Flag size={16} color={secured ? colors.secured : colors.frontier} />
          <Text variant="map-title" className="min-w-0 flex-1" numberOfLines={2}>
            {legBannerLine({
              sectionIndex: concept.sectionIndex,
              conceptCount: sectionConcepts.length,
              masteredCount,
              milestoneLabel: concept.milestoneLabel
            })}
          </Text>
        </View>
        <Progress fraction={progress.completionFraction} accessibilityLabel={formationProgressLine(progress)} />
        <Text variant="caption" color="muted">{formationProgressLine(progress)}</Text>
      </View>
    </View>
  );
}

// The trail terminus: the summit made visible from anywhere on the trail, now the map's
// one "X marks the summit" cartouche (plan 2026-07-18-001 KTD6 — the X appears exactly
// here) — a drawn ink X beside the peak glyph, with the existing summit/remaining copy;
// reached vs not-reached stays a text + icon-color distinction, never color alone.
function TrailTerminus({ view, summitLabel }: Readonly<{ view: TrailView; summitLabel: string }>) {
  const reached = view.masteredCount >= view.totalClusters;
  return (
    <View className="rounded-card border border-map-ink bg-card p-1" testID="terminus-cartouche">
      <View className="items-center gap-1.5 rounded-[6px] border border-map-ink-soft px-3 py-4">
        <View className="flex-row items-center gap-2">
          <Svg width={24} height={24} testID="terminus-x">
            <Path
              d="M 5 5 C 9 10 15 14 19 19 M 19 5 C 15 10 9 14 5 19"
              fill="none"
              stroke={colors["map-ink"]}
              strokeWidth={3}
              strokeLinecap="round"
            />
          </Svg>
          <Mountain size={28} color={reached ? colors.secured : colors.frontier} />
        </View>
        <Text variant="map-title" numberOfLines={2}>
          {reached ? learnerTerm("summit") : `${learnerTerm("summitPrefix")}: ${summitLabel}`}
        </Text>
        <Text variant="caption" color="muted" className="text-center" numberOfLines={2}>{terminusLine(view)}</Text>
      </View>
    </View>
  );
}

function CheckpointStopRow({
  stop,
  concept,
  offset,
  onSelect
}: Readonly<{ stop: TrailStop; concept: TrailCluster; offset: number; onSelect: (stopId: string) => void }>) {
  return (
    <View
      className={`min-h-24 items-center rounded-xl py-1 ${stop.isFogged ? "bg-map-parchment-deep" : ""}`}
    >
      {/* Uncharted parchment (plan 2026-07-18-001 KTD7): every fogged stop reads as
          not-yet-charted map — a quiet deep wash plus faded ink — per stop, so section
          boundaries read as steps rather than one wall. Lock semantics and the stop's
          text labels are unchanged (state = shape + text). */}
      <View className={stop.isFogged ? "opacity-60" : ""} style={{ transform: [{ translateX: offset }] }}>
        <CheckpointCircle stop={stop} concept={concept} onSelect={onSelect} />
      </View>
    </View>
  );
}
