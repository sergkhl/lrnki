import type { CalibrationVerdict, ConceptLesson, ConceptLessonSectionKind, LessonAbsentNode, ResponseLogRow, StudyItem, StudyItemGroundingProvenance, Verdict } from "@lrnki/domain-core";
import type { DerivedGraphDetail, DerivedGraphEdge, LearnerStatePort } from "@lrnki/ports";
import {
  ADAPTIVE_MASTERY_THRESHOLD,
  classifyAdaptedNodes,
  selectScopedFrontierTarget,
  type AdaptedNodeClassification,
  type ReadinessEdge
} from "./adaptivePathProjection";
import { applyDifficultyFloor } from "./applyDifficultyFloor";
import { composeMastery, pruneClosure, struggledNodes, suggestRestorations } from "./calibrationClosure";
import { prerequisiteAncestors } from "./prerequisiteDag";
import { buildMasteryMap, summarizeResponseSources, type ResponseSourceSummary } from "./learnerLoopProjection";
import { projectStatefulLearnerPath, type StatefulLearnerPathStep } from "./statefulLearnerPath";

// The PURE Study Session projection (ADR-0027 projection compute; CONTEXT.md "Study
// Session"). A Study Session is a learner-stateful, goal-scoped projection over one Derived
// Graph Layer that gates each in-scope derived node into locked / frontier / mastered and
// carries its study payload. This module turns already-loaded data — the finished
// `DerivedGraphDetail`, the enrichment's study items, the learner's response rows, and the
// learner's calibration verdicts — into the finished `StudySession`. It is data-in/data-out:
// it imports no store, port, or clock, so it structurally cannot mutate a published graph or
// the Derived Graph Layer (R10) and is replay-testable with plain data. The `getStudySession`
// use-case is the thin reader that loads through injected ports and calls this; the Learner
// Application reuses both unchanged. Mirrors `composeCalibrationSession`.

// --- View contract (rides down with the projection, KTD6) ------------------

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
};

export type StudyMatchingView = {
  studyItemId: string;
  derivedNodeId: string;
  question: string;
  groundingProvenance: StudyItemGroundingProvenance;
  prompts: { promptId: string; text: string }[];
  matches: { matchId: string; text: string }[];
};

// The Concept Lesson view that rides down the projection (ADR-0031, KTD5). A serializable
// teaching artifact rendered AHEAD of the option-select for a frontier node (R12). Each section
// carries its honest provenance badge: `source_cep`/`source_mentioned` is source-cited, otherwise
// `generated` (R6). Reading it is non-graded — the projection has no write path (R13).
export type ConceptLessonSectionView = {
  kind: ConceptLessonSectionKind;
  text: string;
  keyTerms?: string[];
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
};

// A thin lesson-absent record for the operator quality surface (U8): which nodes produced no
// lesson and why. Mirrors the rejected-study-item display shape.
export type LessonAbsentView = {
  derivedNodeId: string;
  label: string;
  reason: string;
};

// Map a persisted Concept Lesson to its serializable view. A section is `source`-cited only when
// its authoritative provenance is a source kind (the assembler already re-derived this, U6).
export function conceptLessonToView(lesson: ConceptLesson): ConceptLessonView {
  return {
    derivedNodeId: lesson.derivedNodeId,
    canonicalLabel: lesson.canonicalLabel,
    sections: lesson.sections.map((section) => ({
      kind: section.kind,
      text: section.text,
      ...(section.keyTerms?.length ? { keyTerms: section.keyTerms } : {}),
      ...(section.items?.length ? { items: section.items } : {}),
      groundingProvenance: section.groundingProvenance,
      isSourceCited: section.citation?.provenance === "source",
      ...(section.citation?.provenance === "source" ? { matchKind: section.citation.matchKind } : {}),
      ...(section.diagram ? { diagram: section.diagram } : {})
    }))
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
// item type adds one arm. The options are sorted by id for a deterministic render.
export function studyItemToView(item: StudyItem): StudyItemView {
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
            .map((option) => ({ optionId: option.optionId, text: option.text, provenance: option.provenance }))
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
          ...(lie.siblingLabel ? { siblingLabel: lie.siblingLabel } : {})
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
            .map((pair) => ({ matchId: pair.matchId, text: pair.matchText }))
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
// goal target, so the goal itself stays visible even when marked known.
export function adaptedHiddenNodeIds(knownClosure: ReadonlySet<string>, targetDerivedNodeId: string): string[] {
  return [...knownClosure].filter((id) => id !== targetDerivedNodeId);
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

export type StudySession = {
  enrichmentId: string;
  learnerStateRef: string;
  target: { derivedNodeId: string; label: string };
  // How many study items this enrichment carries. 0 means a dead-end session — the surface
  // renders a remedy rather than dropping the learner into a cardless graph.
  studyItemCount: number;
  detail: DerivedGraphDetail;
  // The whole-layer classification, with `selectedFrontierTarget` scoped to the goal cone
  // so the adapted-graph ring marks the node the learner advances to next toward the goal.
  classification: AdaptedNodeClassification;
  // Serializable known-closure hide list for the Adapted render. The full `detail` remains
  // untouched so Neutral can render the original cone.
  adaptedHiddenNodeIds: string[];
  responseSourceSummary: ResponseSourceSummary;
  // A DAG-root goal whose trusted prerequisite cone is just itself — studied directly as a
  // single-node screen; never an empty calibration nor a premature "Goal reached".
  isFoundationalRoot: boolean;
  // Ordered, unpruned target-scoped Learner Path steps. The state is read from the same
  // whole-layer classification that the map overlay uses, so the ladder cannot drift.
  statefulPath: StatefulLearnerPathStep[];
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
  targetDerivedNodeId: string;
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
}): StudySession {
  const { detail, targetDerivedNodeId } = input;

  // The minimal trail-inclusion difficulty floor (ADR-0024 consumer, ADR-0032 projection
  // policy): confident band-1 non-target nodes are excluded BEFORE path/segment
  // composition, with their gating preserved by edge contraction. Everything downstream
  // composes from this contracted view, so floored nodes never reach the trail, the
  // classifier, or the sheets; `detail` itself rides down untouched for the map render.
  const floor = applyDifficultyFloor({
    nodes: detail.nodes.map((node) => ({
      derivedNodeId: node.derivedNodeId,
      difficultyBand: node.difficultyBand ?? null,
      difficultyContested: node.difficultyContested ?? null
    })),
    edges: detail.edges,
    targetDerivedNodeId
  });
  const trailNodes = detail.nodes.filter((node) => floor.includedNodeIds.has(node.derivedNodeId));
  const trailEdges = floor.contractedEdges;

  const itemViews = input.studyItems.map(studyItemToView);
  // Group a node's items into its ordered segment list (R10, KTD7): option_select, then
  // impostor. A node with one type lists one segment. A floored node contributes no
  // activity segments (R5).
  const studySegmentsByNode: Record<string, StudyItemView[]> = {};
  for (const view of itemViews) {
    if (!floor.includedNodeIds.has(view.item.derivedNodeId)) continue;
    (studySegmentsByNode[view.item.derivedNodeId] ??= []).push(view);
  }
  for (const segments of Object.values(studySegmentsByNode)) {
    segments.sort((a, b) => STUDY_ITEM_TYPE_ORDER[a.kind] - STUDY_ITEM_TYPE_ORDER[b.kind]);
  }
  const lessonReadByNode = Object.fromEntries((input.lessonReads ?? []).map((derivedNodeId) => [derivedNodeId, true]));
  const lessonByNode: Record<string, ConceptLessonView> = {};
  for (const lesson of input.lessons ?? []) lessonByNode[lesson.derivedNodeId] = conceptLessonToView(lesson);
  const lessonAbsentNodeIds = new Set((input.lessonAbsent ?? []).map((node) => node.derivedNodeId));

  // Calibration ∘ graded composition (R12): the trusted-edge down-closure of the `known`
  // verdicts is mastered via calibration; un-pruned nodes take their graded mastery; the
  // coexistence of the two is surfaced, never resolved by a hidden precedence rule.
  const knownNodes = input.verdicts.filter((verdict) => verdict.verdict === "known").map((verdict) => verdict.derivedNodeId);
  const knownClosure = pruneClosure(knownNodes, trailEdges);
  const hiddenNodeIds = adaptedHiddenNodeIds(knownClosure, targetDerivedNodeId);
  const gradedByNode = new Map(Object.entries(buildMasteryMap(input.rows)));
  const latestOutcomeByStudyItemId: Record<string, StudyItemOutcome> = {};
  const latestAttemptByStudyItemId = new Map<string, number>();
  for (const row of input.rows) {
    if (row.signalType !== "graded" || !row.judgedOutcome) continue;
    const currentAttempt = latestAttemptByStudyItemId.get(row.studyItemId);
    if (currentAttempt !== undefined && row.attemptSeq <= currentAttempt) continue;
    latestAttemptByStudyItemId.set(row.studyItemId, row.attemptSeq);
    latestOutcomeByStudyItemId[row.studyItemId] = row.judgedOutcome === "correct" ? "correct" : "incorrect";
  }
  const composed = composeMastery({ knownClosure, gradedByNode });
  for (const node of trailNodes) {
    if ((studySegmentsByNode[node.derivedNodeId] ?? []).length > 0) continue;
    if (lessonByNode[node.derivedNodeId] && !lessonReadByNode[node.derivedNodeId]) continue;
    if (!lessonByNode[node.derivedNodeId] && !lessonAbsentNodeIds.has(node.derivedNodeId)) continue;
    composed.masteryByNode[node.derivedNodeId] = 1;
  }
  const learnerState: LearnerStatePort = {
    learnerStateRef: input.learnerStateRef,
    mastery: (derivedNodeId: string) => composed.masteryByNode[derivedNodeId] ?? 0
  };
  const difficulties = trailNodes.map((node) => ({ derivedNodeId: node.derivedNodeId, score: node.difficulty }));

  const baseClassification = classifyAdaptedNodes({
    nodeIds: trailNodes.map((node) => node.derivedNodeId),
    prerequisiteEdges: trailEdges,
    difficulties,
    learnerState,
    masteryThreshold: ADAPTIVE_MASTERY_THRESHOLD
  });
  const selectedFrontierTarget = selectScopedFrontierTarget({
    targetNodeId: targetDerivedNodeId,
    prerequisiteEdges: trailEdges,
    classification: baseClassification,
    difficulties
  });
  const classification: AdaptedNodeClassification = { stateByNode: baseClassification.stateByNode, selectedFrontierTarget };
  const statefulPath = projectStatefulLearnerPath({ targetDerivedNodeId, detail: { nodes: trailNodes, edges: trailEdges }, stateByNode: classification.stateByNode });

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

  // A DAG-root goal: its trusted prerequisite cone is empty, so it is studied directly as a
  // single node. Detected on the trusted edges, matching the prune/readiness trust model.
  const certainEdges: DerivedGraphEdge[] = trailEdges.filter((edge) => !edge.uncertain);
  const isFoundationalRoot = prerequisiteAncestors(targetDerivedNodeId, certainEdges).size === 0;

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
    target: { derivedNodeId: targetDerivedNodeId, label: labelFor(detail, targetDerivedNodeId) },
    studyItemCount: input.studyItems.length,
    detail,
    classification,
    adaptedHiddenNodeIds: hiddenNodeIds,
    responseSourceSummary: summarizeResponseSources(input.rows),
    isFoundationalRoot,
    statefulPath,
    coexistence,
    restorations,
    sheetByNode,
    verdictByNode: Object.fromEntries(verdictByNode),
    studySegmentsByNode,
    latestOutcomeByStudyItemId,
    lessonByNode,
    lessonReadByNode,
    lessonAbsent,
    flooredNodeIds: floor.flooredNodeIds
  };
}
