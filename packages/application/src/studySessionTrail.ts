import { neutralResponses, type ResponseLogRow, type ScaffoldDetour, type ScaffoldStep } from "@lrnki/domain-core";
import { conceptLessonSectionToView } from "./conceptLessonSectionView";
// Type-only (plan 2026-07-13-003 U4): erased at runtime, keeping this module client-safe.
import type { RecallScopeStatus } from "./recallChallenge";
import type {
  ConceptLessonSectionView,
  ConceptLessonView,
  StudyImpostorView,
  StudyItemView,
  StudyMatchingView,
  StudyOptionSelectView,
  StudySession
} from "./studySessionProjection";

// Learner-scoped detour composition for the Study Session (plan 2026-07-13-002 U2, KTD6/KTD7).
// PURE. Composes active Scaffold Detours under their parent Concept Marker into a finished
// projection the Expedition Trail renders directly: per-step completion, whole-detour
// completion, step counts, the first incomplete step, and the broad generating phase. Generated-step
// evidence is SCOPED (scaffold responses + the step's lessonReadAt); reference-step evidence is
// the NEUTRAL lesson-read + option-select subset for the referenced node — the same neutral
// evidence that drives that node's own trail stop, so completion stays in lockstep with no
// dedup rule. Nothing here touches neutral mastery (R19).

// The learner-renderable, KEY-FREE option-select for a generated Support Step (R11, KTD10). The
// correct option is resolved SERVER-SIDE by `gradeScaffoldOptionSelect` keyed on the step id — it
// is never on this view. Options are sorted by id for a stable, non-positional render.
export type ScaffoldStepItemView = {
  scaffoldStepId: string;
  question: string;
  explanation: string;
  options: { optionId: string; text: string }[];
};

export type ScaffoldStepView =
  | { scaffoldStepId: string; ordinal: number; kind: "reference"; referencedDerivedNodeId: string; complete: boolean }
  | {
      scaffoldStepId: string;
      ordinal: number;
      kind: "generated";
      label: string;
      // The inline generated micro-lesson (always `generated` provenance, uncited) and the
      // key-free option-select the Learner App renders (R11). The correct answer never ships.
      lesson: ConceptLessonSectionView[];
      item: ScaffoldStepItemView;
      lessonRead: boolean;
      itemCorrect: boolean;
      complete: boolean;
    };

// The three broad, stable learner phases (KTD8). The Learner App vocabulary themes these; the
// projection never emits raw stage tags or counts.
export type ScaffoldGeneratingPhase = "preparing" | "building" | "checking";

// One always-visible visual Support Path node per active detour (plan 2026-07-13-002 U2,
// KTD7): the mastered-parent presentation collapse is gone, so the view carries finished
// status, progress counts, and the resume target directly. `firstIncompleteStepId` is null
// for a complete path (the surface opens the overview instead) and for a non-ready detour.
export type ScaffoldDetourView = {
  detourId: string;
  parentDerivedNodeId: string;
  term: string;
  status: ScaffoldDetour["status"];
  steps: ScaffoldStepView[];
  completedStepCount: number;
  totalStepCount: number;
  firstIncompleteStepId: string | null;
  complete: boolean;
  phase: ScaffoldGeneratingPhase | null;
};

// Neutral completion facts for a referenced node: the subset a reference step needs. Derived by
// the caller from the same neutral evidence the node's own stop uses.
export type ReferencedNodeCompletion = {
  lessonRead: boolean;
  optionSelectCorrect: boolean;
};

export type ComposeScaffoldDetoursInput = {
  detours: readonly ScaffoldDetour[];
  // All of the learner's response rows (neutral + scaffold); the fold narrows per scope.
  responses: readonly ResponseLogRow[];
  // Neutral completion for each referenced node id a reference step may point at.
  referencedNodeCompletion: (derivedNodeId: string) => ReferencedNodeCompletion;
  // Broad phase for a generating detour, mapped from its operation stage by the caller.
  generatingPhase?: (detour: ScaffoldDetour) => ScaffoldGeneratingPhase;
};

// Latest scaffold option-select outcome per scaffold item id (append-only; latest wins). A
// later incorrect after a correct reopens the step, matching the neutral latest-outcome rule.
function latestScaffoldItemCorrect(responses: readonly ResponseLogRow[], stepByItemId: Map<string, string>): Map<string, boolean> {
  const latestAttempt = new Map<string, number>();
  const correct = new Map<string, boolean>();
  for (const row of responses) {
    if (row.scope !== "scaffold" || row.signalType !== "graded" || !row.judgedOutcome) continue;
    // A scaffold response keys the STEP; map back to its item via the step's payload item id is
    // not needed — completion is per step, so we key on the step id directly.
    const stepId = row.scaffoldStepId;
    const prior = latestAttempt.get(stepId);
    if (prior !== undefined && row.attemptSeq <= prior) continue;
    latestAttempt.set(stepId, row.attemptSeq);
    correct.set(stepId, row.judgedOutcome === "correct");
  }
  // stepByItemId is retained for symmetry with the neutral path but unused; scaffold responses
  // key the step directly (KTD4).
  void stepByItemId;
  return correct;
}

function stepView(step: ScaffoldStep, input: ComposeScaffoldDetoursInput, scaffoldCorrectByStep: Map<string, boolean>): ScaffoldStepView {
  if (step.kind === "reference") {
    const neutral = input.referencedNodeCompletion(step.referencedDerivedNodeId);
    const complete = neutral.lessonRead && neutral.optionSelectCorrect;
    return { scaffoldStepId: step.scaffoldStepId, ordinal: step.ordinal, kind: "reference", referencedDerivedNodeId: step.referencedDerivedNodeId, complete };
  }
  const lessonRead = step.lessonReadAt !== null;
  const itemCorrect = scaffoldCorrectByStep.get(step.scaffoldStepId) ?? false;
  return {
    scaffoldStepId: step.scaffoldStepId,
    ordinal: step.ordinal,
    kind: "generated",
    label: step.payload.label,
    lesson: step.payload.lesson.map(conceptLessonSectionToView),
    item: {
      scaffoldStepId: step.scaffoldStepId,
      question: step.payload.item.question,
      explanation: step.payload.item.explanation,
      // Drop the server-only `isCorrect` key; sort by id so the answer is not positionally leaked.
      options: [...step.payload.item.options]
        .sort((a, b) => a.optionId.localeCompare(b.optionId))
        .map((option) => ({ optionId: option.optionId, text: option.text }))
    },
    lessonRead,
    itemCorrect,
    complete: lessonRead && itemCorrect
  };
}

export function composeScaffoldDetours(input: ComposeScaffoldDetoursInput): ScaffoldDetourView[] {
  const scaffoldCorrectByStep = latestScaffoldItemCorrect(input.responses, new Map());
  // A scaffold response also has a neutral analog for reference steps; those are neutral rows
  // consumed by referencedNodeCompletion, so we only touch scaffold rows above. Keeping the
  // neutral narrow here documents the boundary.
  void neutralResponses(input.responses);

  return input.detours.map((detour): ScaffoldDetourView => {
    const steps = [...detour.steps].sort((a, b) => a.ordinal - b.ordinal).map((step) => stepView(step, input, scaffoldCorrectByStep));
    const complete = steps.length > 0 && steps.every((step) => step.complete);
    const completedStepCount = steps.filter((step) => step.complete).length;
    // The resume target (R13): the ordinal-first incomplete step of a READY path. A complete
    // path resumes nowhere (the overview is the entry); a generating/failed detour has no
    // playable step yet.
    const firstIncompleteStepId = detour.status === "ready"
      ? steps.find((step) => !step.complete)?.scaffoldStepId ?? null
      : null;
    const phase: ScaffoldGeneratingPhase | null = detour.status === "generating"
      ? (input.generatingPhase ? input.generatingPhase(detour) : "preparing")
      : null;

    return {
      detourId: detour.detourId,
      parentDerivedNodeId: detour.parentDerivedNodeId,
      term: detour.term,
      status: detour.status,
      steps,
      completedStepCount,
      totalStepCount: steps.length,
      firstIncompleteStepId,
      complete,
      phase
    };
  });
}

// --- Finished neutral trail composition (plan 2026-07-12-002 U4, KTD5) --------
//
// The Study Session projection is the single trail/completion authority (Definition of Done):
// this pure composition — moved out of the Learner App's former `trailView.ts`/`activityProgress.ts`
// policy modules — turns a finished `StudySession` into the ordered clusters, stops, sections,
// next-stop choice, crystal growth, and capstone/activity lookup every learner surface renders.
// It imports no store, port, or clock; the Learner App consumes it read-only. Detours are a
// PARALLEL structure grouped under their parent at render time from `session.detours`; the neutral
// trail here stays neutral (R19).

export type TrailStopKind = "theory" | StudyItemView["kind"] | "capstone";
export type TrailStopState = "complete" | "available" | "locked";

export type TrailStop = {
  stopId: string;
  kind: TrailStopKind;
  derivedNodeId: string;
  label: string;
  state: TrailStopState;
  isNext: boolean;
  isFogged: boolean;
  studyItemId: string | null;
};

export type TrailCluster = {
  derivedNodeId: string;
  label: string;
  difficulty: number;
  topologicalDepth: number;
  state: StudySession["expeditionPath"][number]["state"];
  isTarget: boolean;
  isKnownSkipped: boolean;
  // Section metadata: which milestone-anchored section this concept belongs to, and whether it
  // opens that section on the trail (the first concept of the section).
  sectionIndex: number;
  // The concept's neutral position within its own section (already ordered on the
  // expedition path) — learner surfaces key deterministic cosmetic cycles off it.
  sectionPositionIndex: number;
  milestoneLabel: string;
  isSectionStart: boolean;
  // How far this concept's crystal has grown: the fraction of its own non-capstone stops
  // complete. Mastery forces 1 (a calibration `known` node may have unread stops), so the
  // crystal finishes exactly when the completion rule says so.
  growthFraction: number;
  stops: TrailStop[];
};

// One section as the non-blocking overview and the trail dividers render it. State and gating are
// derived from the SAME classification/sheets the trail stops use, so the overview never drifts
// from the trail.
export type TrailSectionView = {
  sectionIndex: number;
  milestoneLabel: string;
  state: "complete" | "available" | "locked";
  conceptCount: number;
  masteredCount: number;
  stopsComplete: number;
  stopsTotal: number;
  // The first concept id of the section — the overview scrolls the trail here when tapped.
  firstConceptId: string;
  // For a locked section: the unmet prerequisite milestone/concept labels gating entry, deduped.
  gatingLabels: string[];
  // This Leg's Recall Challenge scope (plan 2026-07-13-003 U4, KTD3), matched by section index
  // from the session's server-owned scope views. Leg fusion derives ONLY from its
  // `wonChallengeId` — a fully mastered section with no won challenge stays unfused. Null when
  // the session composed without a challenge store.
  recallScope: RecallScopeStatus | null;
};

export type TrailView = {
  concepts: TrailCluster[];
  sections: TrailSectionView[];
  // The section the next stop lives in (for the header "k of n" indicator). 0 when the trail is
  // empty or fully complete.
  currentSectionIndex: number;
  nextStopId: string | null;
  nextStopLabel: string | null;
  masteredCount: number;
  totalClusters: number;
  // The Expedition (summit) Recall Challenge scope (plan 2026-07-13-003 U4, KTD3): `locked`
  // until every Leg formation exists; the summit keystone derives ONLY from its
  // `wonChallengeId`. Null when the session composed without a challenge store or the layer
  // has no summit.
  enrichmentScope: RecallScopeStatus | null;
};

// The DOM id the trail gives a section's opening divider, so the non-blocking overview can scroll
// to it. One definition shared by the renderer and the overview (rule 18).
export function sectionAnchorId(sectionIndex: number): string {
  return `trail-section-${sectionIndex}`;
}

export function buildTrailView(session: StudySession): TrailView {
  const labelByNode = new Map(session.detail.nodes.map((node) => [node.derivedNodeId, node.label] as const));
  let previousSectionIndex = -1;
  const clusters: TrailCluster[] = session.expeditionPath.map((step) => {
    const label = labelByNode.get(step.derivedNodeId) ?? step.derivedNodeId;
    const isKnownSkipped = session.verdictByNode[step.derivedNodeId] === "known";
    const baseState: TrailStopState = step.state === "mastered" ? "complete" : step.state === "frontier" ? "available" : "locked";
    const stops: TrailStop[] = [];
    const addStop = (kind: TrailStopKind, studyItemId: string | null) => {
      const stopId = `${step.derivedNodeId}:${kind}:${studyItemId ?? "main"}`;
      const state = stateForStop({ baseState, kind, studyItemId, derivedNodeId: step.derivedNodeId, session });
      stops.push({ stopId, kind, derivedNodeId: step.derivedNodeId, label, state, isNext: false, isFogged: baseState === "locked", studyItemId });
    };

    if (session.lessonByNode[step.derivedNodeId]) addStop("theory", null);
    for (const segment of session.studySegmentsByNode[step.derivedNodeId] ?? []) {
      addStop(segment.kind, segment.item.studyItemId);
    }
    addStop("capstone", null);

    const isSectionStart = step.sectionIndex !== previousSectionIndex;
    previousSectionIndex = step.sectionIndex;

    const activityStops = stops.filter((stop) => stop.kind !== "capstone");
    const growthFraction =
      step.state === "mastered"
        ? 1
        : activityStops.length === 0
          ? 0
          : activityStops.filter((stop) => stop.state === "complete").length / activityStops.length;

    return {
      derivedNodeId: step.derivedNodeId,
      label,
      difficulty: step.difficulty,
      topologicalDepth: step.topologicalDepth,
      state: step.state,
      isTarget: step.isSummit,
      isKnownSkipped,
      sectionIndex: step.sectionIndex,
      sectionPositionIndex: step.sectionPositionIndex,
      milestoneLabel: step.milestoneLabel,
      isSectionStart,
      growthFraction,
      stops
    };
  });

  const flatStops = clusters.flatMap((cluster) => cluster.stops);
  const nextStop = flatStops.find((stop) => stop.state !== "complete" && stop.state !== "locked") ?? null;
  if (nextStop) nextStop.isNext = true;

  const sections = buildSections(clusters, session);
  const currentSectionIndex = nextStop
    ? clusters.find((cluster) => cluster.derivedNodeId === nextStop.derivedNodeId)?.sectionIndex ?? 0
    : Math.max(0, sections.length - 1);

  return {
    concepts: clusters,
    sections,
    currentSectionIndex,
    nextStopId: nextStop?.stopId ?? null,
    nextStopLabel: nextStop?.label ?? null,
    masteredCount: clusters.filter((cluster) => cluster.state === "mastered" && !cluster.isKnownSkipped).length,
    totalClusters: clusters.length,
    enrichmentScope: session.recallScopes.find((scope) => scope.scopeKind === "enrichment") ?? null
  };
}

// Group clusters into their sections and derive per-section state, progress, and gating labels.
// Gating labels reuse the projection's locked-sheet `unmetPrerequisiteLabels`, so the overview's
// "gated by" reasons match exactly what keeps the stops locked (one source of truth).
function buildSections(clusters: TrailCluster[], session: StudySession): TrailSectionView[] {
  const bySection = new Map<number, TrailCluster[]>();
  for (const cluster of clusters) {
    (bySection.get(cluster.sectionIndex) ?? bySection.set(cluster.sectionIndex, []).get(cluster.sectionIndex)!).push(cluster);
  }
  return [...bySection.entries()]
    .sort(([a], [b]) => a - b)
    .map(([sectionIndex, sectionClusters]) => {
      const conceptCount = sectionClusters.length;
      const masteredCount = sectionClusters.filter((cluster) => cluster.state === "mastered").length;
      const hasFrontier = sectionClusters.some((cluster) => cluster.state === "frontier");
      const state: TrailSectionView["state"] =
        masteredCount === conceptCount ? "complete" : hasFrontier || masteredCount > 0 ? "available" : "locked";
      const stops = sectionClusters.flatMap((cluster) => cluster.stops);
      const gatingLabels = state === "locked"
        ? [...new Set(sectionClusters.flatMap((cluster) => {
            const sheet = session.sheetByNode[cluster.derivedNodeId];
            return sheet?.kind === "locked" ? sheet.unmetPrerequisiteLabels : [];
          }))]
        : [];
      return {
        sectionIndex,
        milestoneLabel: sectionClusters[0]?.milestoneLabel ?? "",
        state,
        conceptCount,
        masteredCount,
        stopsComplete: stops.filter((stop) => stop.state === "complete").length,
        stopsTotal: stops.length,
        firstConceptId: sectionClusters[0]?.derivedNodeId ?? "",
        gatingLabels,
        recallScope: session.recallScopes.find((scope) => scope.scopeKind === "section" && scope.sectionIndex === sectionIndex) ?? null
      };
    });
}

// Per-stop state from that stop's OWN evidence (R8): a theory stop completes when its lesson is
// read; an activity stop completes only when its own latest outcome is correct. The node-level
// `baseState` only distinguishes locked from playable — a "complete" node state never leaks into an
// individual stop (that was the one-answer-completes-all bug). The capstone is the gem: it mirrors
// the node's completion-based state (mastered ⟺ every stop complete).
function stateForStop(input: {
  baseState: TrailStopState;
  kind: TrailStopKind;
  studyItemId: string | null;
  derivedNodeId: string;
  session: StudySession;
}): TrailStopState {
  if (input.kind === "capstone") return input.baseState;
  if (input.baseState === "locked") return "locked";
  if (input.kind === "theory") {
    return input.session.lessonReadByNode[input.derivedNodeId] ? "complete" : "available";
  }
  if (!input.studyItemId) return "available";
  return input.session.latestOutcomeByStudyItemId[input.studyItemId] === "correct" ? "complete" : "available";
}

// --- Reference-step destination (plan 2026-07-13-002 U2, KTD8; R15, F3) -------
//
// A reference Support Step routes back to the CANONICAL neutral surface: the referenced
// node's first incomplete ordinary (non-capstone) stop, so the learner studies the one real
// concept and its normal evidence completes the step. When every ordinary stop is already
// complete, fall back to the node's capstone — the review entry — so the tap still lands
// somewhere meaningful. Returns null when the node is not on the trail (e.g. floored).
export function resolveReferenceStopId(session: StudySession, referencedDerivedNodeId: string): string | null {
  const cluster = buildTrailView(session).concepts.find((candidate) => candidate.derivedNodeId === referencedDerivedNodeId);
  if (!cluster) return null;
  const ordinaryStops = cluster.stops.filter((stop) => stop.kind !== "capstone");
  const firstIncomplete = ordinaryStops.find((stop) => stop.state !== "complete");
  if (firstIncomplete) return firstIncomplete.stopId;
  return cluster.stops.find((stop) => stop.kind === "capstone")?.stopId ?? null;
}

// --- Activity lookup (former client `activityProgress.ts`, KTD5) --------------

export type StopActivity =
  | { kind: "theory"; derivedNodeId: string; label: string; lesson: ConceptLessonView | undefined }
  | { kind: "option_select"; derivedNodeId: string; label: string; item: StudyOptionSelectView }
  | { kind: "matching"; derivedNodeId: string; label: string; item: StudyMatchingView }
  | { kind: "impostor"; derivedNodeId: string; label: string; item: StudyImpostorView }
  | { kind: "capstone"; derivedNodeId: string; label: string; mastered: boolean; difficulty: number; growthFraction: number; isKnownSkipped: boolean }
  | { kind: "missing"; message: string };

export function resolveStopActivity(session: StudySession, stopId: string): StopActivity {
  const [derivedNodeId, kind, studyItemId] = stopId.split(":");
  const label = session.detail.nodes.find((node) => node.derivedNodeId === derivedNodeId)?.label ?? derivedNodeId;
  if (!derivedNodeId || !kind) return { kind: "missing", message: "This stop is no longer on the trail." };
  if (kind === "theory") return { kind: "theory", derivedNodeId, label, lesson: session.lessonByNode[derivedNodeId] };
  if (kind === "capstone") {
    // The capstone reveal shows the node's crystal, so it carries the same growth number every
    // other surface reads (one completion rule, one visible truth).
    const cluster = buildTrailView(session).concepts.find((candidate) => candidate.derivedNodeId === derivedNodeId);
    return {
      kind: "capstone",
      derivedNodeId,
      label,
      mastered: cluster?.state === "mastered",
      difficulty: cluster?.difficulty ?? 0,
      growthFraction: cluster?.growthFraction ?? 0,
      isKnownSkipped: cluster?.isKnownSkipped ?? false
    };
  }
  const segment = (session.studySegmentsByNode[derivedNodeId] ?? []).find((candidate) => candidate.item.studyItemId === studyItemId);
  if (!segment) return { kind: "missing", message: "This activity is no longer available." };
  switch (segment.kind) {
    case "option_select":
      return { kind: "option_select", derivedNodeId, label, item: segment.item };
    case "matching":
      return { kind: "matching", derivedNodeId, label, item: segment.item };
    case "impostor":
      return { kind: "impostor", derivedNodeId, label, item: segment.item };
  }
}
