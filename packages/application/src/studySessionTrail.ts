import { neutralResponses, type ResponseLogRow, type ScaffoldDetour, type ScaffoldStep } from "@lrnki/domain-core";

// Learner-scoped detour composition for the Study Session (plan 2026-07-12-002 U4, KTD5/KTD8).
// PURE. Composes active Scaffold Detours under their parent Concept Marker into a finished
// projection the Expedition Trail renders directly: per-step completion, whole-detour
// completion, the R20 collapsed grouping, and the broad generating phase. Generated-step
// evidence is SCOPED (scaffold responses + the step's lessonReadAt); reference-step evidence is
// the NEUTRAL lesson-read + option-select subset for the referenced node — the same neutral
// evidence that drives that node's own trail stop, so completion stays in lockstep with no
// dedup rule. Nothing here touches neutral mastery (R19).

export type ScaffoldStepView =
  | { scaffoldStepId: string; ordinal: number; kind: "reference"; referencedDerivedNodeId: string; complete: boolean }
  | { scaffoldStepId: string; ordinal: number; kind: "generated"; label: string; lessonRead: boolean; itemCorrect: boolean; complete: boolean };

// The three broad, stable learner phases (KTD8). The Learner App vocabulary themes these; the
// projection never emits raw stage tags or counts.
export type ScaffoldGeneratingPhase = "preparing" | "building" | "checking";

// R14/R20 presentation group. `active` = a ready detour that is expanded on the live trail;
// `support_available` = a ready, not-yet-complete detour collapsed under a mastered parent;
// `support_explored` = a completed detour collapsed under a mastered parent.
export type ScaffoldDetourGroup = "generating" | "failed" | "active" | "support_available" | "support_explored";

export type ScaffoldDetourView = {
  detourId: string;
  parentDerivedNodeId: string;
  term: string;
  status: ScaffoldDetour["status"];
  group: ScaffoldDetourGroup;
  steps: ScaffoldStepView[];
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
  // Parent nodes the learner has fully mastered (drives the R20 collapse).
  masteredParentNodeIds: ReadonlySet<string>;
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
  return { scaffoldStepId: step.scaffoldStepId, ordinal: step.ordinal, kind: "generated", label: step.payload.label, lessonRead, itemCorrect, complete: lessonRead && itemCorrect };
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
    const parentMastered = input.masteredParentNodeIds.has(detour.parentDerivedNodeId);

    let group: ScaffoldDetourGroup;
    let phase: ScaffoldGeneratingPhase | null = null;
    if (detour.status === "generating") {
      group = "generating";
      phase = input.generatingPhase ? input.generatingPhase(detour) : "preparing";
    } else if (detour.status === "failed") {
      group = "failed";
    } else if (detour.status === "ready" && parentMastered && complete) {
      group = "support_explored"; // R20: completed under a mastered parent
    } else if (detour.status === "ready" && parentMastered && !complete) {
      group = "support_available"; // R20: not-yet-complete (unstudied OR partial) under a mastered parent
    } else {
      group = "active"; // a live, expandable ready detour
    }

    return { detourId: detour.detourId, parentDerivedNodeId: detour.parentDerivedNodeId, term: detour.term, status: detour.status, group, steps, complete, phase };
  });
}
