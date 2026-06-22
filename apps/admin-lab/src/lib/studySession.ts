import {
  classifyAdaptedNodes,
  prerequisiteAncestors,
  pruneClosure,
  composeMastery,
  struggledNodes,
  suggestRestorations,
  ADAPTIVE_MASTERY_THRESHOLD,
  type AdaptedNodeClassification,
  type ReadinessEdge
} from "@lrnki/application";
import type { Verdict } from "@lrnki/domain-core";
import type { LearnerStatePort } from "@lrnki/ports";
import { createDatabaseClient, PostgresStudyItemBankStore, PostgresEnrichmentRunStore, PostgresResponseLogStore, PostgresCalibrationVerdictStore } from "@lrnki/infrastructure-postgres";
import { getEnrichmentDetail } from "./enrichments";
import { buildMasteryMap, summarizeResponseSources, type ResponseSourceSummary } from "./learnerLoop";
import { labelFor, type DerivedGraphDetail, type DerivedGraphEdge } from "./derivedGraph";
// The transfer-ready study modules own the presentation contract (R15); the loader
// produces data matching it (AGENTS rule 18 — one definition).
import type { SheetContent, StudyCardView, StudyOptionSelectView } from "@/components/study/studyView";

type Sql = ReturnType<typeof createDatabaseClient>;

// Server-only loader + pure gating helpers for the learner Study surface. It composes the
// read-only enrichment/study-item/response-log/verdict loaders with the PURE calibration
// core (pruneClosure + composeMastery, U3) and `classifyAdaptedNodes` — no graph or Derived
// Graph Layer write port is imported, so it structurally cannot mutate a published graph
// (R16). A study session re-derives the prune closure and re-composes mastery live from the
// mutable verdict store + the append-only graded log on every response; nothing about the
// adapted view is persisted (the write actions only upsert verdicts or append graded rows).

async function withClient<T>(fn: (sql: Sql) => Promise<T>): Promise<T | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const sql = createDatabaseClient();
  try {
    return await fn(sql);
  } catch {
    return undefined;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// --- Pure gating helpers (R9, R13) -----------------------------------------

// Direct prerequisites of a node that are not yet mastered — what keeps a locked node
// locked (R9). Mirrors `classifyAdaptedNodes` readiness: uncertain edges are excluded, so
// the unmet set is exactly the readiness gap the classifier used to lock the node.
export function unmetPrerequisites(nodeId: string, edges: ReadinessEdge[], classification: AdaptedNodeClassification): string[] {
  return edges
    .filter((edge) => !edge.uncertain && edge.dependentDerivedNodeId === nodeId)
    .map((edge) => edge.prerequisiteDerivedNodeId)
    .filter((prerequisiteId) => classification.stateByNode[prerequisiteId] !== "mastered");
}

// The state-gated side-sheet payload for one node (R5/R9/R13). A non-mastered cone node with
// a self-assessment opens the CALIBRATION card (reveal → "I knew it"/"I forgot"), carrying its
// current verdict and, when present, the option-select item so it can be studied after staying
// in the gap. A frontier node without a self-assessment falls back to its option-select study,
// else cardless. A mastered node opens a read-only review carrying its verdict (so a `known`
// verdict can be cleared, R7); a locked node names its unmet prerequisites.
export function sheetContentFor(input: {
  derivedNodeId: string;
  classification: AdaptedNodeClassification;
  optionItemsByNode: Map<string, StudyOptionSelectView>;
  selfAssessmentItemsByNode: Map<string, StudyCardView>;
  verdictByNode: Map<string, Verdict>;
  edges: ReadinessEdge[];
  labelByNode: Map<string, string>;
}): SheetContent {
  const state = input.classification.stateByNode[input.derivedNodeId] ?? "locked";
  const optionItem = input.optionItemsByNode.get(input.derivedNodeId) ?? null;
  const card = input.selfAssessmentItemsByNode.get(input.derivedNodeId) ?? null;
  const verdict = input.verdictByNode.get(input.derivedNodeId) ?? null;
  if (state === "locked") {
    const unmet = unmetPrerequisites(input.derivedNodeId, input.edges, input.classification);
    return { kind: "locked", unmetPrerequisiteLabels: unmet.map((id) => input.labelByNode.get(id) ?? id) };
  }
  if (state === "mastered") return { kind: "mastered_review", card, verdict };
  // frontier — calibrate it when there is an answer to reveal, else study/flag it.
  if (card) return { kind: "calibration", card, verdict, optionItem };
  return optionItem ? { kind: "option_select", item: optionItem } : { kind: "cardless" };
}

// The node within the goal's ancestor cone (∪ the goal itself) the learner advances to
// NEXT — the hardest ready+unmastered ("frontier") node in scope (R5). Unlike the
// whole-layer classification's global frontier, this is scoped to "teach me Z", so a
// calibrated learner is routed only through what Z still needs. Returns null when nothing
// in scope is frontier (the goal cone is fully mastered). Hardest-first, ties by id —
// matching the selector's ordering so the ring and the path agree.
export function selectScopedFrontier(input: {
  targetDerivedNodeId: string;
  edges: DerivedGraphEdge[];
  classification: AdaptedNodeClassification;
  difficultyByNode: Map<string, number>;
}): string | null {
  // Scope on CERTAIN edges only, as the readiness classifier does. `prerequisiteAncestors`
  // reads only the two endpoint ids, so the loader-facing edge shape serves it structurally.
  const certainEdges = input.edges.filter((edge) => !edge.uncertain);
  const scope = prerequisiteAncestors(input.targetDerivedNodeId, certainEdges);
  scope.add(input.targetDerivedNodeId);
  const frontier = [...scope].filter((id) => input.classification.stateByNode[id] === "frontier");
  if (frontier.length === 0) return null;
  return frontier.sort((a, b) => (input.difficultyByNode.get(b) ?? 0) - (input.difficultyByNode.get(a) ?? 0) || a.localeCompare(b))[0];
}

// --- Study-session loader (R3, R5, R7, R9, R12) ----------------------------

export type CoexistenceFlag = { derivedNodeId: string; label: string; gradedMastery: number };

// A restoration nudge (R13/R14): a gap node the learner answered incorrectly (latest graded
// = incorrect), paired with the directly-`known` prerequisites it depends on that they had
// skipped. Restoring one clears that verdict, returning it to the gap. Derived on read, never
// persisted (KTD6).
export type RestorationSuggestion = {
  struggledNodeId: string;
  struggledLabel: string;
  prerequisites: { derivedNodeId: string; label: string }[];
};

export type StudySession = {
  enrichmentId: string;
  learnerStateRef: string;
  target: { derivedNodeId: string; label: string };
  detail: DerivedGraphDetail;
  // The whole-layer classification, with `selectedFrontierTarget` scoped to the goal cone
  // so the adapted-graph ring marks the node the learner advances to next toward Z.
  classification: AdaptedNodeClassification;
  responseSourceSummary: ResponseSourceSummary;
  // A DAG-root goal whose trusted prerequisite cone is just itself — studied directly as a
  // single-node screen; never an empty calibration nor a premature "Goal reached" (R3, AE1).
  isFoundationalRoot: boolean;
  // Calibration `known` ∩ graded — coexistence SURFACED, not silently resolved (R12, AE3).
  coexistence: CoexistenceFlag[];
  // Restoration nudges for nodes the learner missed while studying the gap (R13, R14).
  restorations: RestorationSuggestion[];
  // Per-node gated side-sheet payloads (R5/R9) and the lookups the modules render from.
  sheetByNode: Record<string, SheetContent>;
  verdictByNode: Record<string, Verdict>;
  selfAssessmentItemsByNode: Record<string, StudyCardView>;
  optionItemsByNode: Record<string, StudyOptionSelectView>;
};

export async function getStudySession(
  enrichmentId: string,
  targetDerivedNodeId: string,
  learnerStateRef: string
): Promise<StudySession | undefined> {
  const detail = await getEnrichmentDetail(enrichmentId);
  if (!detail) return undefined;
  if (!detail.nodes.some((node) => node.derivedNodeId === targetDerivedNodeId)) return undefined;

  const loaded = await withClient(async (sql) => {
    const layer = await new PostgresEnrichmentRunStore(sql).getLayer(enrichmentId);
    const studyItems = await new PostgresStudyItemBankStore(sql).listStudyItemsForEnrichment(enrichmentId);
    const rows = await new PostgresResponseLogStore(sql).listForLearner(learnerStateRef);
    const verdicts = await new PostgresCalibrationVerdictStore(sql).listForLearner(learnerStateRef);
    return { layer, studyItems, rows, verdicts };
  });
  if (!loaded || !loaded.layer) return undefined;

  const selfAssessmentViews: StudyCardView[] = loaded.studyItems
    .filter((item) => item.itemType === "self_assessment")
    .map((item) => ({
      studyItemId: item.studyItemId,
      derivedNodeId: item.derivedNodeId,
      question: item.question,
      answerKey: item.answerKey,
      selfReportPrompt: item.selfReportPrompt,
      groundingProvenance: item.groundingProvenance
    }));
  const optionViews: StudyOptionSelectView[] = loaded.studyItems
    .filter((item) => item.itemType === "option_select")
    .map((item) => ({
      studyItemId: item.studyItemId,
      derivedNodeId: item.derivedNodeId,
      question: item.question,
      groundingProvenance: item.groundingProvenance,
      options: [...item.options].sort((a, b) => a.optionId.localeCompare(b.optionId)).map((option) => ({
        optionId: option.optionId,
        text: option.text,
        isCorrect: option.isCorrect,
        provenance: option.provenance
      }))
    }));
  const selfAssessmentItemsByNode = new Map(selfAssessmentViews.map((item) => [item.derivedNodeId, item] as const));
  const optionItemsByNode = new Map(optionViews.map((item) => [item.derivedNodeId, item] as const));

  // Calibration ∘ graded composition (U3, R12): the trusted-edge down-closure of the `known`
  // verdicts is mastered via calibration; un-pruned nodes take their graded mastery; the
  // coexistence of the two is surfaced, never resolved by a hidden precedence rule.
  const knownNodes = loaded.verdicts.filter((verdict) => verdict.verdict === "known").map((verdict) => verdict.derivedNodeId);
  const knownClosure = pruneClosure(knownNodes, detail.edges);
  const gradedByNode = new Map(Object.entries(buildMasteryMap(loaded.rows)));
  const composed = composeMastery({ knownClosure, gradedByNode });
  const learnerState: LearnerStatePort = {
    learnerStateRef,
    mastery: (derivedNodeId: string) => composed.masteryByNode[derivedNodeId] ?? 0
  };
  const difficultyByNode = new Map(detail.nodes.map((node) => [node.derivedNodeId, node.difficulty ?? 0] as const));

  const baseClassification = classifyAdaptedNodes({
    nodeIds: detail.nodes.map((node) => node.derivedNodeId),
    prerequisiteEdges: detail.edges,
    difficulties: detail.nodes.map((node) => ({ derivedNodeId: node.derivedNodeId, score: node.difficulty })),
    learnerState,
    masteryThreshold: ADAPTIVE_MASTERY_THRESHOLD
  });
  const selectedFrontierTarget = selectScopedFrontier({
    targetDerivedNodeId,
    edges: detail.edges,
    classification: baseClassification,
    difficultyByNode
  });
  const classification: AdaptedNodeClassification = { stateByNode: baseClassification.stateByNode, selectedFrontierTarget };

  const labelByNode = new Map(detail.nodes.map((node) => [node.derivedNodeId, node.label] as const));
  const verdictByNode = new Map(loaded.verdicts.map((verdict) => [verdict.derivedNodeId, verdict.verdict] as const));
  const sheetByNode: Record<string, SheetContent> = {};
  for (const node of detail.nodes) {
    sheetByNode[node.derivedNodeId] = sheetContentFor({
      derivedNodeId: node.derivedNodeId,
      classification,
      optionItemsByNode,
      selfAssessmentItemsByNode,
      verdictByNode,
      edges: detail.edges,
      labelByNode
    });
  }

  // A DAG-root goal: its trusted prerequisite cone is empty, so it is studied directly as a
  // single node (R3). Detected on the trusted edges, matching the prune/readiness trust model.
  const certainEdges = detail.edges.filter((edge) => !edge.uncertain);
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
  const restorationMap = suggestRestorations({ struggledNodeIds: struggledNodes(loaded.rows), knownClosure: directlyKnown, edges: detail.edges });
  const restorations: RestorationSuggestion[] = Object.entries(restorationMap)
    .filter(([, prerequisiteIds]) => prerequisiteIds.length > 0)
    .map(([struggledNodeId, prerequisiteIds]) => ({
      struggledNodeId,
      struggledLabel: labelByNode.get(struggledNodeId) ?? struggledNodeId,
      prerequisites: prerequisiteIds.map((id) => ({ derivedNodeId: id, label: labelByNode.get(id) ?? id }))
    }))
    .sort((a, b) => a.struggledLabel.localeCompare(b.struggledLabel));

  return {
    enrichmentId,
    learnerStateRef,
    target: { derivedNodeId: targetDerivedNodeId, label: labelFor(detail, targetDerivedNodeId) },
    detail,
    classification,
    responseSourceSummary: summarizeResponseSources(loaded.rows),
    isFoundationalRoot,
    coexistence,
    restorations,
    sheetByNode,
    verdictByNode: Object.fromEntries(verdictByNode),
    selfAssessmentItemsByNode: Object.fromEntries(selfAssessmentItemsByNode),
    optionItemsByNode: Object.fromEntries(optionItemsByNode)
  };
}
