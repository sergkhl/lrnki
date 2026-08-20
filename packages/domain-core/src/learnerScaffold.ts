import type { ConceptLessonSection, GeneratedGroundingBundle } from "./index";

// Learner-Scoped Scaffold Detour aggregate (plan 2026-07-12-002 U2, KTD2, ADR-0037).
// A Scaffold Detour is a learner-owned, optional, one-level support branch off a parent
// Concept Marker: the smallest useful ordered sequence of easier Support Steps that unblock
// an unfamiliar term. It is NEVER neutral graph knowledge — a generated step's content lives
// entirely on the step (payload-on-step) and only an existing-node REFERENCE step points back
// at the neutral graph. The aggregate owns request identity, lifecycle, claim/fence data, and
// the ordered steps; steps are immutable once published.

// The four and only four durable lifecycle states (R14). `generating` after creation/retry,
// `ready` after atomic publication, `failed` on terminal/exhausted failure, `hidden` after a
// learner hides a ready detour or dismisses a failed one.
export type ScaffoldDetourStatus = "generating" | "ready" | "failed" | "hidden";

// A Support Step is EITHER a reference to an existing neutral node (studied via that node's
// real lesson + option-select, recording normal neutral evidence) OR a generated learner-scoped
// scaffold node whose whole content lives inline (R6-R11, KTD2). Exactly one of the two shapes
// (a DB CHECK enforces it). Steps are ordered by `ordinal`; order guides Continue but creates
// no lock or prerequisite (R7).

// One four-option option-select recall item embedded in a generated step (R11). Mirrors the
// neutral option shape's invariants — four options, exactly one server-keyed correct — but it
// is citation-free and always labeled generated (KTD10). The key never ships to the client.
export type ScaffoldOption = {
  optionId: string;
  text: string;
  isCorrect: boolean;
};

export type ScaffoldItemPayload = {
  scaffoldItemId: string;
  question: string;
  explanation: string;
  options: ScaffoldOption[];
};

// The inline content of a generated scaffold node: a compact micro-lesson (reusing the neutral
// section shape, but always `generated` provenance and uncited) plus one option-select item.
export type ScaffoldNodePayload = {
  scaffoldNodeId: string;
  label: string;
  // Compact generated micro-lesson with one concrete example. Citation-free and labeled
  // generated end to end (R11, KTD10); every section is groundingProvenance "generated".
  lesson: ConceptLessonSection[];
  item: ScaffoldItemPayload;
};

export type ScaffoldReferenceStep = {
  scaffoldStepId: string;
  ordinal: number;
  kind: "reference";
  // The existing neutral node this step studies (R8/R9). Its lesson-read and option-select
  // evidence are NEUTRAL responses; canonical mastery is unchanged.
  referencedDerivedNodeId: string;
  // The exact neutral assets promised when this immutable step was published. Regeneration
  // may supersede either asset, but these identities remain foreign-key-backed and replayable.
  referencedConceptLessonId: string;
  referencedStudyItemId: string;
};

export type ScaffoldGeneratedStep = {
  scaffoldStepId: string;
  ordinal: number;
  kind: "generated";
  // Whole content home (payload-on-step). Immutable once published.
  payload: ScaffoldNodePayload;
  // The owner-neutral, admitted evidence used to generate and verify this exact payload.
  // Immutable beside the payload; never projected to the learner surface.
  groundingBundle: GeneratedGroundingBundle;
  // Mutable: the moment the learner read this generated micro-lesson (R12). Null until read.
  lessonReadAt: string | null;
};

export type ScaffoldStep = ScaffoldReferenceStep | ScaffoldGeneratedStep;

// The detour aggregate. `normalizedTerm` + (learner, enrichment, parent) is the idempotency
// key (R5/R13). `latestOperationId` points at the current/last generation attempt separately
// from the stable `detourId` (R14, KTD7) — retry clears it and the next claim installs a fresh
// operation/fencing UUID. `claimToken` fences the terminal publish (KTD9).
export type ScaffoldDetour = {
  detourId: string;
  learnerStateRef: string;
  enrichmentId: string;
  parentDerivedNodeId: string;
  term: string;
  normalizedTerm: string;
  status: ScaffoldDetourStatus;
  latestOperationId: string | null;
  claimToken: string | null;
  steps: ScaffoldStep[];
  createdAt?: string;
  updatedAt?: string;
};

// A generated step is COMPLETE when its lesson has been read and its option-select item's
// latest graded response is correct (R12). This is separate from neutral node mastery. A
// reference step's completion is the neutral lesson-read + option-select subset result,
// derived from neutral evidence (evaluated in the U4 projection, not here).
export function scaffoldStepHasContent(step: ScaffoldStep): boolean {
  return step.kind === "reference" || step.payload.item.options.length > 0;
}

// A detour has complete publishable content when it is `ready` (or hidden-with-content) and
// carries at least one step — the restore rule (R18) chooses `ready` vs `generating` on this.
export function scaffoldDetourHasPublishedContent(detour: ScaffoldDetour): boolean {
  return detour.steps.length > 0;
}
