import { neutralResponses, normalizeConceptLabel, type CalibrationVerdict, type ConceptLesson, type ConceptLessonSectionKind, type LessonAbsentNode, type ResponseLogRow, type ScaffoldDetour, type StudyItem, type StudyItemGroundingProvenance, type Verdict } from "@lrnki/domain-core";
import type { DerivedGraphDetail, LearnerStatePort, ScaffoldReferenceActivity } from "@lrnki/ports";
import { composeScaffoldDetours, type ScaffoldDetourView, type ScaffoldGeneratingPhase } from "./studySessionTrail";
// Type-only (plan 2026-07-13-003 U4): the defining module pulls node:crypto at runtime, but
// type imports are erased, so the client-safe projection closure stays Node-builtin-free.
import type { RecallScopeStatus } from "./recallChallenge";
import { conceptLessonSectionToView } from "./conceptLessonSectionView";
import {
  ADAPTIVE_MASTERY_THRESHOLD,
  classifyAdaptedNodes,
  type AdaptedNodeClassification,
  type ReadinessEdge
} from "./adaptivePathProjection";
import { applyDifficultyFloor } from "./applyDifficultyFloor";
import { composeMastery, pruneClosure, struggledNodes, suggestRestorations } from "./calibrationClosure";
import { buildMasteryMap, summarizeResponseSources, type ResponseSourceSummary } from "./learnerLoopProjection";
import { projectExpeditionSections, type ExpeditionSection, type ExpeditionSectionStep } from "./expeditionSections";

// The PURE Study Session projection (ADR-0027 projection compute; CONTEXT.md "Study
// Session"). A Study Session is a learner-stateful, goal-scoped projection over one Derived
// Graph Layer that gates each in-scope derived node into locked / frontier / mastered and
// carries its study payload. This module turns already-loaded data — the finished
// `DerivedGraphDetail`, the enrichment's study items, the learner's response rows, and the
// learner's calibration verdicts — into the finished `StudySession`. It is data-in/data-out:
// it imports no store, port, or clock, so it structurally cannot mutate a published graph or
// the Derived Graph Layer (R10) and is replay-testable with plain data. The `getStudySession`
// use-case is the thin reader that loads through injected ports and calls this; the Learner
// Application reuses both unchanged.

// --- View contract (rides down with the projection, KTD6) ------------------

// Learner support state attached to every projected Explorable Term (plan 2026-07-13-002 U2,
// KTD1/KTD2; R3). The projection is the single authority: it correlates the learner's ACTIVE
// detours by (parent node, normalized term) so the surface renders finished state instead of
// rebuilding detour policy. `available` includes hidden detours by design (KTD10) — hiding a
// path returns its term to the panels, and the idempotent request restores the same detour.
export type ExplorableTermSupport =
  | { kind: "available" }
  | { kind: "generating"; detourId: string; phase: ScaffoldGeneratingPhase }
  | { kind: "failed"; detourId: string }
  | { kind: "ready"; detourId: string; complete: boolean };

// A projected Explorable Term (KTD2): the exact stored term text plus its section anchor.
// Lesson terms keep the `sectionKind` the validator anchored them to (theory highlights only
// that section); Study Item terms carry no anchor (`sectionKind: null`).
export type ExplorableTermView = {
  term: string;
  sectionKind: ConceptLessonSectionKind | null;
  support: ExplorableTermSupport;
};

// The (parent node, term) → support lookup the composition threads into the view mappers.
// Defaults to `available` so callers without learner detour state (Admin Lab inspection,
// tests) compose unchanged.
export type ExplorableTermSupportLookup = (parentDerivedNodeId: string, term: string) => ExplorableTermSupport;

const alwaysAvailable: ExplorableTermSupportLookup = () => ({ kind: "available" });

export type StudyOptionSelectView = {
  studyItemId: string;
  derivedNodeId: string;
  question: string;
  explanation: string;
  groundingProvenance: StudyItemGroundingProvenance;
  options: {
    optionId: string;
    text: string;
    provenance: "source" | "generated";
  }[];
  // Server-owned Explorable Term affordances advertised by this question stem (plan
  // 2026-07-13-002 U2, R2-R4). Zero-to-five validated exact substrings the learner may turn
  // into a Scaffold Detour, each carrying its finished support state (KTD1).
  explorableTerms: ExplorableTermView[];
};

// The serializable Impostor view that rides down the projection (R10/R11). Four statements
// the learner reads; the keyed answer (which is the impostor) is resolved SERVER-SIDE at
// grading time, never read off this payload. Statements are sorted by id so the impostor is
// not positionally predictable.
export type StudyImpostorView = {
  studyItemId: string;
  derivedNodeId: string;
  question: string;
  groundingProvenance: StudyItemGroundingProvenance;
  statements: {
    statementId: string;
    text: string;
    provenance: "source" | "generated";
  }[];
  reveal: string;
  lieSource: "sibling" | "generated";
  siblingLabel?: string;
  // Explorable Term affordances advertised by this question stem (see StudyOptionSelectView).
  explorableTerms: ExplorableTermView[];
};

export type StudyMatchingView = {
  studyItemId: string;
  derivedNodeId: string;
  question: string;
  groundingProvenance: StudyItemGroundingProvenance;
  prompts: { promptId: string; text: string }[];
  matches: { matchId: string; text: string }[];
  // Explorable Term affordances advertised by this question stem (see StudyOptionSelectView).
  explorableTerms: ExplorableTermView[];
};

// The Concept Lesson view that rides down the projection (ADR-0031, KTD5). A serializable
// teaching artifact rendered AHEAD of the option-select for a frontier node (R12). Each section
// carries its honest provenance badge: `source_cep`/`source_mentioned` is source-cited, otherwise
// `generated` (R6). Reading it is non-graded — the projection has no write path (R13).
export type ConceptLessonSectionView = {
  kind: ConceptLessonSectionKind;
  text: string;
  items?: string[];
  groundingProvenance: StudyItemGroundingProvenance;
  // True when the section verified verbatim against a source block; the card shows a distinct
  // `source` vs `generated` badge from this.
  isSourceCited: boolean;
  // For a source-cited section: whether the quote traced byte-exact or only after formatting
  // normalization (grounding fidelity). Absent on a generated section.
  matchKind?: "exact" | "normalized";
  diagram?: { caption: string; spec: string };
};

export type ConceptLessonView = {
  derivedNodeId: string;
  canonicalLabel: string;
  sections: ConceptLessonSectionView[];
  // Lesson-wide Explorable Term affordances (plan 2026-07-13-002 U2, R2-R6). Each term keeps
  // its persisted section anchor (KTD2) so theory highlights the term only in its own section,
  // plus its finished support state (KTD1). Distinct by term text, order-preserving.
  explorableTerms: ExplorableTermView[];
};

// A thin lesson-absent record for the operator quality surface (U8): which nodes produced no
// lesson and why. Mirrors the rejected-study-item display shape.
export type LessonAbsentView = {
  derivedNodeId: string;
  label: string;
  reason: string;
};

// Map a persisted Concept Lesson to its serializable view. Terms keep their section anchor
// (KTD2) and gain their support state; distinct by term text, first anchor wins (the persisted
// validator already guarantees normalized distinctness).
export function conceptLessonToView(lesson: ConceptLesson, supportFor: ExplorableTermSupportLookup = alwaysAvailable): ConceptLessonView {
  const seen = new Set<string>();
  const explorableTerms: ExplorableTermView[] = [];
  for (const entry of lesson.explorableTerms) {
    if (seen.has(entry.term)) continue;
    seen.add(entry.term);
    explorableTerms.push({ term: entry.term, sectionKind: entry.sectionKind, support: supportFor(lesson.derivedNodeId, entry.term) });
  }
  return {
    derivedNodeId: lesson.derivedNodeId,
    canonicalLabel: lesson.canonicalLabel,
    sections: lesson.sections.map(conceptLessonSectionToView),
    explorableTerms
  };
}

// A per-node study-item view, keyed by item type (KTD4). Adding a new study-item type is a
// localized add here — a new arm of this union, one arm in `studyItemToView`, and one arm in
// `studyItemViewToSheet` — inherited by every surface. A node groups its views into an
// ordered `studySegmentsByNode` list (option_select, then impostor).
export type StudyItemView =
  | { kind: "option_select"; item: StudyOptionSelectView }
  | { kind: "matching"; item: StudyMatchingView }
  | { kind: "impostor"; item: StudyImpostorView };

// Canonical render order for a node's study segments (R10): theory (the lesson) is shown
// first by the surface, then option-select, then impostor. A new type extends this rank.
const STUDY_ITEM_TYPE_ORDER: Record<StudyItemView["kind"], number> = { option_select: 0, matching: 1, impostor: 2 };

// Side-sheet content gated by the node's learner state. Frontier nodes either render a study
// item (one arm per item type) or a cardless "skip as known" affordance. A locked node names
// its unmet prerequisites; a mastered node opens a cardless review that can CLEAR a `known`
// verdict. The study-item arms mirror `StudyItemView` so the projection owns the single
// item-type → sheet-payload mapping (KTD4).
export type SheetContent =
  | { kind: "option_select"; item: StudyOptionSelectView }
  | { kind: "matching"; item: StudyMatchingView }
  | { kind: "impostor"; item: StudyImpostorView }
  | { kind: "cardless" }
  | { kind: "locked"; unmetPrerequisiteLabels: string[] }
  | { kind: "mastered_review"; verdict: Verdict | null };

// Map a persisted study item to its per-node view (KTD4). Dispatches on `itemType`; a new
// item type adds one arm. The options are sorted by id for a deterministic render. Item
// terms carry no section anchor (`sectionKind: null`, KTD2).
export function studyItemToView(item: StudyItem, supportFor: ExplorableTermSupportLookup = alwaysAvailable): StudyItemView {
  const itemTerms = (): ExplorableTermView[] =>
    item.explorableTerms.map((term) => ({ term, sectionKind: null, support: supportFor(item.derivedNodeId, term) }));
  switch (item.itemType) {
    case "option_select":
      return {
        kind: "option_select",
        item: {
          studyItemId: item.studyItemId,
          derivedNodeId: item.derivedNodeId,
          question: item.question,
          explanation: item.explanation,
          groundingProvenance: item.groundingProvenance,
          options: [...item.options]
            .sort((a, b) => a.optionId.localeCompare(b.optionId))
            .map((option) => ({ optionId: option.optionId, text: option.text, provenance: option.provenance })),
          explorableTerms: itemTerms()
        }
      };
    case "impostor": {
      const lie = item.statements.find((statement) => statement.isImpostor);
      if (!lie) throw new Error(`impostor item ${item.studyItemId} has no keyed impostor statement.`);
      return {
        kind: "impostor",
        item: {
          studyItemId: item.studyItemId,
          derivedNodeId: item.derivedNodeId,
          question: item.question,
          groundingProvenance: item.groundingProvenance,
          // Sort by id so the impostor is not always last (positional give-away), mirroring
          // option-select's option shuffle.
          statements: [...item.statements]
            .sort((a, b) => a.statementId.localeCompare(b.statementId))
            .map((statement) => ({ statementId: statement.statementId, text: statement.text, provenance: statement.provenance })),
          reveal: lie.reveal,
          lieSource: lie.lieSource,
          ...(lie.siblingLabel ? { siblingLabel: lie.siblingLabel } : {}),
          explorableTerms: itemTerms()
        }
      };
    }
    case "matching":
      return {
        kind: "matching",
        item: {
          studyItemId: item.studyItemId,
          derivedNodeId: item.derivedNodeId,
          question: item.question,
          groundingProvenance: item.groundingProvenance,
          prompts: [...item.pairs]
            .sort((a, b) => a.pairId.localeCompare(b.pairId))
            .map((pair) => ({ promptId: pair.pairId, text: pair.promptText })),
          matches: [...item.pairs]
            .sort((a, b) => a.matchId.localeCompare(b.matchId))
            .map((pair) => ({ matchId: pair.matchId, text: pair.matchText })),
          explorableTerms: itemTerms()
        }
      };
  }
}

// Map a per-node study-item view to the frontier sheet payload it renders (KTD4). The one
// place item type → sheet kind is decided, so the Admin Lab and the Learner App
// render each type without re-learning. Dispatches on `kind`; a new type adds one arm.
export function studyItemViewToSheet(view: StudyItemView): SheetContent {
  switch (view.kind) {
    case "option_select":
      return { kind: "option_select", item: view.item };
    case "matching":
      return { kind: "matching", item: view.item };
    case "impostor":
      return { kind: "impostor", item: view.item };
  }
}

// --- Pure gating helpers ----------------------------------------------------

// The label of a derived node, falling back to its id. Shared by the projection and the
// admin-lab cytoscape view-builder (AGENTS rule 18 — one definition).
export function labelFor(detail: Pick<DerivedGraphDetail, "nodes">, derivedNodeId: string): string {
  return detail.nodes.find((node) => node.derivedNodeId === derivedNodeId)?.label ?? derivedNodeId;
}

// Direct prerequisites of a node that are not yet mastered — what keeps a locked node locked
// (R9). Mirrors `classifyAdaptedNodes` readiness: uncertain edges are excluded, so the unmet
// set is exactly the readiness gap the classifier used to lock the node.
export function unmetPrerequisites(nodeId: string, edges: ReadinessEdge[], classification: AdaptedNodeClassification): string[] {
  return edges
    .filter((edge) => !edge.uncertain && edge.dependentDerivedNodeId === nodeId)
    .map((edge) => edge.prerequisiteDerivedNodeId)
    .filter((prerequisiteId) => classification.stateByNode[prerequisiteId] !== "mastered");
}

// Serializable known-closure hide list for the Adapted render: the known closure minus the
// derived summit, so the summit itself stays visible even when marked known.
export function adaptedHiddenNodeIds(knownClosure: ReadonlySet<string>, summitDerivedNodeId: string | null): string[] {
  return [...knownClosure].filter((id) => id !== summitDerivedNodeId);
}

// The state-gated side-sheet payload for one node. Frontier nodes study their item when one
// exists, else expose a cardless "skip as known" affordance. A mastered node opens a cardless
// review carrying its verdict (so a `known` verdict can be cleared); a locked node names its
// unmet prerequisites.
function sheetContentFor(input: {
  derivedNodeId: string;
  classification: AdaptedNodeClassification;
  segmentsByNode: Record<string, StudyItemView[]>;
  verdictByNode: Map<string, Verdict>;
  edges: ReadinessEdge[];
  labelByNode: Map<string, string>;
}): SheetContent {
  const state = input.classification.stateByNode[input.derivedNodeId] ?? "locked";
  if (state === "locked") {
    const unmet = unmetPrerequisites(input.derivedNodeId, input.edges, input.classification);
    return { kind: "locked", unmetPrerequisiteLabels: unmet.map((id) => input.labelByNode.get(id) ?? id) };
  }
  if (state === "mastered") return { kind: "mastered_review", verdict: input.verdictByNode.get(input.derivedNodeId) ?? null };
  // A frontier node with study segments resolves to its FIRST segment as the node-level
  // content (state-gating + badge); the surface renders the FULL ordered list from
  // `studySegmentsByNode` and never re-renders this one (R10). A frontier node with no
  // segment is the cardless "skip as known" affordance.
  const segments = input.segmentsByNode[input.derivedNodeId];
  return segments && segments.length > 0 ? studyItemViewToSheet(segments[0]) : { kind: "cardless" };
}

// --- Output shape -----------------------------------------------------------

export type CoexistenceFlag = { derivedNodeId: string; label: string; gradedMastery: number };

// A restoration nudge (R13/R14): a gap node the learner answered incorrectly (latest graded
// = incorrect), paired with the directly-`known` prerequisites it depends on that they had
// skipped. Restoring one clears that verdict, returning it to the gap. Derived on read,
// never persisted.
export type RestorationSuggestion = {
  struggledNodeId: string;
  struggledLabel: string;
  prerequisites: { derivedNodeId: string; label: string }[];
};

export type StudyItemOutcome = "correct" | "incorrect";

export type NeutralReferenceAssets = {
  conceptLessonId: string;
  studyItemId: string;
};

export type StudySession = {
  enrichmentId: string;
  learnerStateRef: string;
  // The DERIVED summit — the last section's milestone (ADR-0032). No longer a learner-chosen
  // target; the whole floored layer is the trail. `derivedNodeId` is empty on an empty layer.
  target: { derivedNodeId: string; label: string };
  // The enrichment's plain-register capability statement (plan 2026-07-10-001 U1), themed
  // only at render (ADR-0033). Null when no purpose row exists — surfaces render the
  // mechanical template (fail-open).
  layerPurpose: string | null;
  // How many study items this enrichment carries. 0 means a dead-end session — the surface
  // renders a remedy rather than dropping the learner into a cardless graph.
  studyItemCount: number;
  detail: DerivedGraphDetail;
  // The whole-layer classification, with `selectedFrontierTarget` = the single hardest ready
  // node so the adapted-graph ring marks the node the learner advances to next.
  classification: AdaptedNodeClassification;
  // Serializable known-closure hide list for the Adapted render. The full `detail` remains
  // untouched so Neutral can render the original cone.
  adaptedHiddenNodeIds: string[];
  responseSourceSummary: ResponseSourceSummary;
  // The ordered, layer-wide SECTIONED expedition path (ADR-0032; R1–R3): every non-floored
  // node in exactly one milestone-anchored section, concatenated in easiest-section-first
  // order. Each step carries its section metadata alongside the per-step state. State is read
  // from the same whole-layer classification the map overlay uses, so the trail cannot drift.
  expeditionPath: ExpeditionSectionStep[];
  // The section skeleton in trail order (milestone, claimed stops, mean difficulty) — the
  // non-blocking overview and header counts render from this (R5, R9).
  sections: ExpeditionSection[];
  // Calibration `known` ∩ graded — coexistence SURFACED, not silently resolved.
  coexistence: CoexistenceFlag[];
  // Restoration nudges for nodes the learner missed while studying the gap.
  restorations: RestorationSuggestion[];
  // Per-node gated side-sheet payloads and the lookups the surfaces render from.
  sheetByNode: Record<string, SheetContent>;
  verdictByNode: Record<string, Verdict>;
  // The ordered study segments per node (R10, KTD7): each frontier node renders theory (the
  // lesson) then this list in canonical order (option_select, then impostor), each segment
  // independently answerable. The durable seam the Learner App consumes; supersedes the prior
  // single-item-per-node `optionItemsByNode` (rule 18).
  studySegmentsByNode: Record<string, StudyItemView[]>;
  // Latest graded result per study item, folded from the response log. The Learner App uses
  // this for per-circle honest fill: only latest-correct fills; any other graded latest result
  // remains open.
  latestOutcomeByStudyItemId: Record<string, StudyItemOutcome>;
  // The Concept Lesson substrate that rides down (ADR-0031, KTD5): one teaching view per node
  // that has a lesson, rendered ahead of the option-select for a frontier node (R12). Reading
  // writes nothing (R13). `lessonAbsent` gives the operator thin visibility into which nodes
  // produced no lesson and why.
  lessonByNode: Record<string, ConceptLessonView>;
  lessonReadByNode: Record<string, boolean>;
  lessonAbsent: LessonAbsentView[];
  // Current reusable neutral identities, projected only when a node has exactly the required
  // Concept Lesson + option-select substrate. Stable ids are safe to serialize; answer keys and
  // learner-specific eligibility remain outside this map.
  neutralReferenceAssetsByNode: Record<string, NeutralReferenceAssets>;
  // Composed learner-scoped Scaffold Detours under their parent Concept Marker (plan
  // 2026-07-13-002 U2): per-step + whole-detour completion, step counts, resume target, and the broad
  // generating phase. `generatingDetours` is the polling flag — a finished session with a
  // generating detour tells the client to keep polling (U5).
  detours: ScaffoldDetourView[];
  generatingDetours: boolean;
  // Server-owned Recall Challenge scope views (plan 2026-07-13-003 U4, KTD3): one per Leg
  // (section milestone) plus the Expedition (summit) scope, PRODUCED by the Recall Challenge
  // module and attached here as finished data — the projection never re-derives challenge
  // state. The Learner App maps these to Guardian entry, Leg fusion, and the summit keystone;
  // fusion derives ONLY from `wonChallengeId`, never from mastery. Empty when the caller wires
  // no challenge store (Admin Lab inspection composes unchanged). These facts ride OUTSIDE the
  // neutral mastery fold: no field below reads them.
  recallScopes: RecallScopeStatus[];
  // Nodes excluded as trail stops by the minimal difficulty floor (ADR-0024 consumer):
  // confident band-1, non-target. Their prerequisite gating survives by edge contraction
  // inside the projection; this list exists for inspection — no surface renders it.
  flooredNodeIds: string[];
};

// Compose the finished Study Session from already-loaded data (KTD2). Pure: the caller is
// responsible for the existence checks (detail present, target is a node). The compute reads
// only the structural fields of `detail.nodes`/`detail.edges`, so a future caller could feed a
// Derived Graph Layer instead of the inspection model; `detail` is threaded into the output for
// the surfaces to render. Deterministic and ordering-independent in its row/verdict inputs.
export function composeStudySession(input: {
  enrichmentId: string;
  learnerStateRef: string;
  detail: DerivedGraphDetail;
  studyItems: StudyItem[];
  rows: ResponseLogRow[];
  verdicts: CalibrationVerdict[];
  // The Concept Lesson substrate for this enrichment (ADR-0031). Optional so existing callers
  // that have not yet wired the lesson store compose a session with no lessons (unchanged
  // behavior) rather than a type break; the real readers pass them (U8).
  lessons?: ConceptLesson[];
  lessonReads?: string[];
  lessonAbsent?: LessonAbsentNode[];
  layerPurpose?: string | null;
  // The learner's ACTIVE (non-hidden) Scaffold Detours for this enrichment (plan 2026-07-12-002
  // U4, KTD5). The projection owns detour composition so Study Session is the single trail
  // authority; absent/empty leaves `detours` empty and `generatingDetours` false (unchanged
  // behavior for callers that do not wire the scaffold store).
  detours?: readonly ScaffoldDetour[];
  // Pinned neutral activities loaded through the learner-owned reference read seam. These may
  // contain superseded assets; composition converts them to key-free views only when a Support
  // Path fallback destination needs them.
  referenceActivities?: readonly ScaffoldReferenceActivity[];
  // Finished Recall Challenge scope statuses for this learner/enrichment (plan 2026-07-13-003
  // U4). Already projected by the Recall Challenge module; attached verbatim. Absent/empty
  // composes an unchanged session — and by construction the neutral fold below cannot read
  // this input, so challenge history can never move mastery, gating, or points (KTD4).
  recallScopes?: readonly RecallScopeStatus[];
}): StudySession {
  const { detail } = input;

  // The minimal trail-inclusion difficulty floor (ADR-0024 consumer, ADR-0032 projection
  // policy): confident band-1 nodes are excluded BEFORE path/segment composition, with their
  // gating preserved by edge contraction. Everything downstream composes from this contracted
  // view, so floored nodes never reach the trail, the classifier, or the sheets; `detail`
  // itself rides down untouched for the map render.
  const floor = applyDifficultyFloor({
    nodes: detail.nodes.map((node) => ({
      derivedNodeId: node.derivedNodeId,
      difficultyBand: node.difficultyBand ?? null,
      difficultyContested: node.difficultyContested ?? null
    })),
    edges: detail.edges
  });
  const trailNodes = detail.nodes.filter((node) => floor.includedNodeIds.has(node.derivedNodeId));
  const trailEdges = floor.contractedEdges;

  const lessonReadByNode = Object.fromEntries((input.lessonReads ?? []).map((derivedNodeId) => [derivedNodeId, true]));
  const lessonAbsentNodeIds = new Set((input.lessonAbsent ?? []).map((node) => node.derivedNodeId));

  // The neutral trail's per-item latest-outcome map folds NEUTRAL responses only; scaffold
  // step evidence is composed separately inside `composeScaffoldDetours` (KTD4).
  const latestOutcomeByStudyItemId: Record<string, StudyItemOutcome> = {};
  const latestAttemptByStudyItemId = new Map<string, number>();
  for (const row of neutralResponses(input.rows)) {
    if (row.signalType !== "graded" || !row.judgedOutcome) continue;
    const currentAttempt = latestAttemptByStudyItemId.get(row.studyItemId);
    if (currentAttempt !== undefined && row.attemptSeq <= currentAttempt) continue;
    latestAttemptByStudyItemId.set(row.studyItemId, row.attemptSeq);
    latestOutcomeByStudyItemId[row.studyItemId] = row.judgedOutcome === "correct" ? "correct" : "incorrect";
  }

  // Build support-neutral views first. Classification and completion depend on lesson/item
  // identities and outcomes, never on Explorable Term presentation state. After reference
  // destinations are known, final views are rebuilt with the finished detour support index.
  const baseItemViews = input.studyItems.map((item) => studyItemToView(item));
  const baseStudySegmentsByNode: Record<string, StudyItemView[]> = {};
  for (const view of baseItemViews) {
    if (!floor.includedNodeIds.has(view.item.derivedNodeId)) continue;
    (baseStudySegmentsByNode[view.item.derivedNodeId] ??= []).push(view);
  }
  for (const segments of Object.values(baseStudySegmentsByNode)) {
    segments.sort((a, b) => STUDY_ITEM_TYPE_ORDER[a.kind] - STUDY_ITEM_TYPE_ORDER[b.kind]);
  }
  const baseLessonByNode: Record<string, ConceptLessonView> = {};
  for (const lesson of input.lessons ?? []) baseLessonByNode[lesson.derivedNodeId] = conceptLessonToView(lesson);

  const currentLessonByNode = new Map((input.lessons ?? []).map((lesson) => [lesson.derivedNodeId, lesson] as const));
  const currentOptionByNode = new Map(
    input.studyItems
      .filter((item): item is Extract<StudyItem, { itemType: "option_select" }> => item.itemType === "option_select")
      .map((item) => [item.derivedNodeId, item] as const)
  );
  const neutralReferenceAssetsByNode: Record<string, NeutralReferenceAssets> = {};
  for (const [derivedNodeId, lesson] of currentLessonByNode) {
    const item = currentOptionByNode.get(derivedNodeId);
    if (item) neutralReferenceAssetsByNode[derivedNodeId] = { conceptLessonId: lesson.conceptLessonId, studyItemId: item.studyItemId };
  }

  // Calibration ∘ graded composition (R12): the trusted-edge down-closure of the `known`
  // verdicts is mastered via calibration; un-pruned nodes take their graded mastery; the
  // coexistence of the two is surfaced, never resolved by a hidden precedence rule.
  const knownNodes = input.verdicts.filter((verdict) => verdict.verdict === "known").map((verdict) => verdict.derivedNodeId);
  const knownClosure = pruneClosure(knownNodes, trailEdges);
  const gradedByNode = new Map(Object.entries(buildMasteryMap(input.rows)));
  // Gating mastery is a COMPLETION rule now (U2, R7/R8 — ADR-0032), not a graded threshold
  // crossing: a node is mastered only when its lesson (if any) is read AND every activity
  // segment is latest-correct. This is the ONE rule that drives gating, the gem, and per-stop
  // visuals, so a single correct answer can no longer complete a multi-segment node
  // (the retired `foldConceptMastery` per-node latest-graded bug). The real graded fold still
  // rides in `gradedByNode` for the calibration↔graded coexistence signal only. `known`
  // verdicts keep instant mastery via `composeMastery`; partial graded progress folds to 0, so
  // it stays below `ADAPTIVE_MASTERY_THRESHOLD` and the node stays frontier.
  const nodeIsComplete = (derivedNodeId: string): boolean => {
    const lessonPresent = Boolean(baseLessonByNode[derivedNodeId]);
    const lessonRead = lessonReadByNode[derivedNodeId] === true;
    if (lessonPresent && !lessonRead) return false; // an unread lesson always blocks completion
    const segments = baseStudySegmentsByNode[derivedNodeId] ?? [];
    if (segments.length > 0) return segments.every((segment) => latestOutcomeByStudyItemId[segment.item.studyItemId] === "correct");
    // Itemless carve-outs (preserved): a read lesson masters a lesson-only node; an explicitly
    // lesson-absent node auto-masters so it never blocks. An itemless node with no lesson and no
    // recorded absence stays unmastered (its teaching state is unknown).
    return (lessonPresent && lessonRead) || lessonAbsentNodeIds.has(derivedNodeId);
  };
  const composed = composeMastery({ knownClosure, gradedByNode });
  for (const node of trailNodes) {
    if (knownClosure.has(node.derivedNodeId)) continue; // a `known` node keeps its calibration mastery
    composed.masteryByNode[node.derivedNodeId] = nodeIsComplete(node.derivedNodeId) ? 1 : 0;
  }
  const learnerState: LearnerStatePort = {
    learnerStateRef: input.learnerStateRef,
    mastery: (derivedNodeId: string) => composed.masteryByNode[derivedNodeId] ?? 0
  };
  const difficulties = trailNodes.map((node) => ({ derivedNodeId: node.derivedNodeId, score: node.difficulty }));

  // The whole-layer classification over the floored trail. Its `selectedFrontierTarget` — the
  // single hardest ready+unmastered node — is the advance-to-next ring (no goal cone to scope
  // to now that the trail is layer-wide).
  const classification = classifyAdaptedNodes({
    nodeIds: trailNodes.map((node) => node.derivedNodeId),
    prerequisiteEdges: trailEdges,
    difficulties,
    learnerState,
    masteryThreshold: ADAPTIVE_MASTERY_THRESHOLD
  });
  // The layer-wide SECTIONED expedition (ADR-0032; R1–R3, R6): milestone-anchored sections over
  // the floored/contracted layer, easiest section first, summit derived as the last milestone.
  const expedition = projectExpeditionSections({ detail: { nodes: trailNodes, edges: trailEdges }, stateByNode: classification.stateByNode });
  const summitId = expedition.summit?.derivedNodeId ?? null;
  const hiddenNodeIds = adaptedHiddenNodeIds(knownClosure, summitId);

  const referenceActivityByStep = new Map((input.referenceActivities ?? []).map((activity) => [activity.scaffoldStepId, activity] as const));
  const checkpointStopId = (derivedNodeId: string): string => {
    if (baseLessonByNode[derivedNodeId] && lessonReadByNode[derivedNodeId] !== true) {
      return `${derivedNodeId}:theory:main`;
    }
    const firstIncomplete = (baseStudySegmentsByNode[derivedNodeId] ?? [])
      .find((segment) => latestOutcomeByStudyItemId[segment.item.studyItemId] !== "correct");
    return firstIncomplete
      ? `${derivedNodeId}:${firstIncomplete.kind}:${firstIncomplete.item.studyItemId}`
      : `${derivedNodeId}:capstone:main`;
  };

  // Reference destinations are decided from the SAME classification and floor that own the
  // neutral trail. A canonical checkpoint is valid only while both pinned assets remain current
  // and the included node is playable; every other valid reference uses its pinned key-free
  // activity without changing neutral trail inclusion or gating.
  const detours = composeScaffoldDetours({
    detours: input.detours ?? [],
    responses: input.rows,
    projectReference: (step, detour) => {
      const activity = referenceActivityByStep.get(step.scaffoldStepId);
      if (
        !activity
        || activity.detourId !== detour.detourId
        || activity.referencedDerivedNodeId !== step.referencedDerivedNodeId
        || activity.lesson.conceptLessonId !== step.referencedConceptLessonId
        || activity.item.studyItemId !== step.referencedStudyItemId
        || activity.lesson.derivedNodeId !== step.referencedDerivedNodeId
        || activity.item.derivedNodeId !== step.referencedDerivedNodeId
        || activity.lesson.enrichmentId !== input.enrichmentId
        || activity.item.enrichmentId !== input.enrichmentId
      ) {
        throw new Error(`pinned scaffold reference ${step.scaffoldStepId} is missing or inconsistent`);
      }
      const lessonRead = lessonReadByNode[step.referencedDerivedNodeId] === true;
      const itemCorrect = latestOutcomeByStudyItemId[step.referencedStudyItemId] === "correct";
      const current = neutralReferenceAssetsByNode[step.referencedDerivedNodeId];
      const state = classification.stateByNode[step.referencedDerivedNodeId];
      const pinnedItemView = studyItemToView(activity.item);
      if (pinnedItemView.kind !== "option_select") {
        throw new Error(`pinned scaffold reference ${step.scaffoldStepId} is not option-select`);
      }
      const usesCheckpoint =
        (state === "frontier" || state === "mastered")
        && current?.conceptLessonId === step.referencedConceptLessonId
        && current.studyItemId === step.referencedStudyItemId;
      return {
        lessonRead,
        itemCorrect,
        destination: usesCheckpoint
          ? { kind: "checkpoint", stopId: checkpointStopId(step.referencedDerivedNodeId) }
          : {
              kind: "support_activity",
              lesson: conceptLessonToView(activity.lesson),
              item: pinnedItemView.item
            }
      };
    },
    // The broad, honest phase at the projection level; the fine stage→phase refinement is a
    // progress-dialog concern. The client renders one indeterminate bar and a phase sentence.
    generatingPhase: () => "preparing"
  });
  const generatingDetours = detours.some((detour) => detour.status === "generating");

  // The (parent node, normalized term) support index is presentation state only. Build it after
  // the authoritative reference fold, then decorate the final neutral lesson/item views.
  const supportByTermKey = new Map<string, ExplorableTermSupport>();
  for (const detour of detours) {
    const support: ExplorableTermSupport =
      detour.status === "generating"
        ? { kind: "generating", detourId: detour.detourId, phase: detour.phase ?? "preparing" }
        : detour.status === "failed"
          ? { kind: "failed", detourId: detour.detourId }
          : { kind: "ready", detourId: detour.detourId, complete: detour.complete };
    supportByTermKey.set(`${detour.parentDerivedNodeId}\u0000${normalizeConceptLabel(detour.term)}`, support);
  }
  const supportFor: ExplorableTermSupportLookup = (parentDerivedNodeId, term) =>
    supportByTermKey.get(`${parentDerivedNodeId}\u0000${normalizeConceptLabel(term)}`) ?? { kind: "available" };

  const studySegmentsByNode: Record<string, StudyItemView[]> = {};
  for (const item of input.studyItems) {
    if (!floor.includedNodeIds.has(item.derivedNodeId)) continue;
    const view = studyItemToView(item, supportFor);
    (studySegmentsByNode[item.derivedNodeId] ??= []).push(view);
  }
  for (const segments of Object.values(studySegmentsByNode)) {
    segments.sort((a, b) => STUDY_ITEM_TYPE_ORDER[a.kind] - STUDY_ITEM_TYPE_ORDER[b.kind]);
  }
  const lessonByNode: Record<string, ConceptLessonView> = {};
  for (const lesson of input.lessons ?? []) lessonByNode[lesson.derivedNodeId] = conceptLessonToView(lesson, supportFor);

  const labelByNode = new Map(detail.nodes.map((node) => [node.derivedNodeId, node.label] as const));
  const verdictByNode = new Map(input.verdicts.map((verdict) => [verdict.derivedNodeId, verdict.verdict] as const));
  const sheetByNode: Record<string, SheetContent> = {};
  for (const node of trailNodes) {
    sheetByNode[node.derivedNodeId] = sheetContentFor({
      derivedNodeId: node.derivedNodeId,
      classification,
      segmentsByNode: studySegmentsByNode,
      verdictByNode,
      edges: trailEdges,
      labelByNode
    });
  }

  const coexistence: CoexistenceFlag[] = composed.calibrationGradedCoexistence.map((flag) => ({
    derivedNodeId: flag.derivedNodeId,
    label: labelByNode.get(flag.derivedNodeId) ?? flag.derivedNodeId,
    gradedMastery: flag.gradedMastery
  }));

  // Restoration suggestions (R13/R14): for each gap node whose latest graded is incorrect,
  // the DIRECTLY-`known` prerequisites it depends on that the learner skipped. We pass the
  // direct-verdict set (not the full closure) so a "restore" — clearVerdict on the suggested
  // node — actually returns it to the gap (a transitively-pruned node has no verdict to clear).
  const directlyKnown = new Set(knownNodes);
  const restorationMap = suggestRestorations({ struggledNodeIds: struggledNodes(input.rows), knownClosure: directlyKnown, edges: trailEdges });
  const restorations: RestorationSuggestion[] = Object.entries(restorationMap)
    .filter(([, prerequisiteIds]) => prerequisiteIds.length > 0)
    .map(([struggledNodeId, prerequisiteIds]) => ({
      struggledNodeId,
      struggledLabel: labelByNode.get(struggledNodeId) ?? struggledNodeId,
      prerequisites: prerequisiteIds.map((id) => ({ derivedNodeId: id, label: labelByNode.get(id) ?? id }))
    }))
    .sort((a, b) => a.struggledLabel.localeCompare(b.struggledLabel));

  // The lesson substrate rides down keyed by node (KTD5). Absences become a thin operator view.
  const lessonAbsent: LessonAbsentView[] = (input.lessonAbsent ?? [])
    .map((node) => ({ derivedNodeId: node.derivedNodeId, label: labelByNode.get(node.derivedNodeId) ?? node.canonicalLabel, reason: node.reason }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    enrichmentId: input.enrichmentId,
    learnerStateRef: input.learnerStateRef,
    target: expedition.summit ?? { derivedNodeId: "", label: "" },
    layerPurpose: input.layerPurpose ?? null,
    studyItemCount: input.studyItems.length,
    detail,
    classification,
    adaptedHiddenNodeIds: hiddenNodeIds,
    responseSourceSummary: summarizeResponseSources(input.rows),
    expeditionPath: expedition.steps,
    sections: expedition.sections,
    coexistence,
    restorations,
    sheetByNode,
    verdictByNode: Object.fromEntries(verdictByNode),
    studySegmentsByNode,
    latestOutcomeByStudyItemId,
    lessonByNode,
    lessonReadByNode,
    lessonAbsent,
    neutralReferenceAssetsByNode,
    detours,
    generatingDetours,
    recallScopes: [...(input.recallScopes ?? [])],
    flooredNodeIds: floor.flooredNodeIds
  };
}
