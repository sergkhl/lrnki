import { useEffect, useRef, useState, type RefObject } from "react";
import { ScrollView, View } from "react-native";
import { Flag, Mountain } from "lucide-react-native";
import type { StudySession } from "@lrnki/application/projection";
import { ActivitySheet } from "./ActivitySheet";
import { CheckpointCircle } from "./CheckpointCircle";
import { ConceptMarker } from "./ConceptMarker";
import { SectionCrystalStrip } from "./SectionCrystalStrip";
import { legBannerLine, terminusLine } from "@/learn/goalCopy";
import { Text, colors } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";
import type { TrailCluster, TrailStop, TrailView } from "@/learn/trailView";

const WINDING_OFFSETS = [0, 1, 2, 1, 0, -1, -2, -1] as const;
const WINDING_STEP_PX = 28;

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
  const scrollRef = useRef<ScrollView>(null);
  // onLayout registry replaces the DOM's scrollIntoView: stop and section rows report
  // their y offsets, and imperative scrolls target those.
  const stopYRef = useRef<Record<string, number>>({});
  const sectionYRef = useRef<Record<number, number>>({});

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
        <View className="relative mx-auto w-full max-w-sm gap-5 px-2 py-2">
          {/* The dashed center trail line. */}
          <View className="absolute bottom-0 left-1/2 top-0 w-[3px] -translate-x-1/2 bg-trail-muted opacity-60" />
          {view.concepts.map((concept, conceptIndex) => (
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
                    const offset = WINDING_OFFSETS[globalStopIndex % WINDING_OFFSETS.length] * WINDING_STEP_PX;
                    return (
                      <View
                        key={stop.stopId}
                        onLayout={(event) => { stopYRef.current[stop.stopId] = event.nativeEvent.layout.y; }}
                      >
                        <CheckpointStopRow stop={stop} concept={concept} offset={offset} onSelect={setSelectedStopId} />
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          ))}
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
      />
    </>
  );
}

// The leg banner (plan 2026-07-10-001 U2): a section boundary that ANNOUNCES the leg's
// goal in advance — how many crystals guard the milestone — and flips to the secured
// state once every concept in the leg is mastered. Its crystal strip previews the
// section's formation growing as concepts complete.
function SectionDivider({ concept, sectionConcepts }: Readonly<{ concept: TrailCluster; sectionConcepts: TrailCluster[] }>) {
  const masteredCount = sectionConcepts.filter((candidate) => candidate.state === "mastered").length;
  const secured = masteredCount >= sectionConcepts.length;
  return (
    <View className="flex-row items-center gap-2 rounded-card border border-line bg-card px-3 py-2">
      <Flag size={16} color={secured ? colors.secured : colors.frontier} />
      <Text variant="label" className="min-w-0 flex-1 font-semibold" numberOfLines={2}>
        {legBannerLine({
          sectionIndex: concept.sectionIndex,
          conceptCount: sectionConcepts.length,
          masteredCount,
          milestoneLabel: concept.milestoneLabel
        })}
      </Text>
      <SectionCrystalStrip concepts={sectionConcepts} className="shrink-0 justify-end" />
    </View>
  );
}

// The trail terminus (U2): the summit made visible from anywhere on the trail — a fixed
// end-of-trail marker with the remaining-crystal count, flipping to the reached state.
function TrailTerminus({ view, summitLabel }: Readonly<{ view: TrailView; summitLabel: string }>) {
  const reached = view.masteredCount >= view.totalClusters;
  return (
    <View className="items-center gap-1.5 rounded-card border border-line bg-card px-3 py-4">
      <Mountain size={28} color={reached ? colors.secured : colors.frontier} />
      <Text variant="label" className="font-semibold" numberOfLines={2}>
        {reached ? learnerTerm("summit") : `${learnerTerm("summitPrefix")}: ${summitLabel}`}
      </Text>
      <Text variant="caption" color="muted" className="text-center" numberOfLines={2}>{terminusLine(view)}</Text>
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
      className={`min-h-24 items-center rounded-xl py-1 ${stop.isFogged ? "opacity-55" : ""}`}
    >
      {/* Per-stop lock dimming (U5): every fogged stop dims individually, so section
          boundaries read as steps rather than one wall. */}
      <View style={{ transform: [{ translateX: offset }] }}>
        <CheckpointCircle stop={stop} concept={concept} onSelect={onSelect} />
      </View>
    </View>
  );
}
