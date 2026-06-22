import {
  classifyAdaptedNodes,
  prerequisiteAncestors,
  buildCalibrationSet,
  ADAPTIVE_MASTERY_THRESHOLD,
  type AdaptedNodeClassification,
  type CalibrationItem,
  type ReadinessEdge
} from "@lrnki/application";
import type { InferredPrerequisiteEdge } from "@lrnki/domain-core";
import type { LearnerStatePort } from "@lrnki/ports";
import { createDatabaseClient, PostgresStudyItemBankStore, PostgresEnrichmentRunStore, PostgresResponseLogStore } from "@lrnki/infrastructure-postgres";
import { getEnrichmentDetail } from "./enrichments";
import { buildMasteryMap, summarizeResponseSources, type ResponseSourceSummary } from "./learnerLoop";
import { labelFor, type DerivedGraphDetail, type DerivedGraphEdge } from "./derivedGraph";
// The transfer-ready study modules own the presentation contract (R15); the loader
// produces data matching it (AGENTS rule 18 — one definition).
import type { SheetContent, StudyCardView, StudyOptionSelectView } from "@/components/study/studyView";

type Sql = ReturnType<typeof createDatabaseClient>;

// Server-only loader + pure gating helpers for the learner Study surface (U3, KTD3). It
// composes the read-only enrichment/study-item/response-log loaders with the pure mastery fold
// and `classifyAdaptedNodes` — no graph or Derived Graph Layer write port is imported, so
// it structurally cannot mutate a published graph (R16). A study session re-folds mastery
// live from the append-only log and re-classifies on every response; nothing about the
// adapted view is persisted (the write actions only append response rows).

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

export function sheetContentFor(input: {
  derivedNodeId: string;
  classification: AdaptedNodeClassification;
  optionItemsByNode: Map<string, StudyOptionSelectView>;
  selfAssessmentItemsByNode: Map<string, StudyCardView>;
  edges: ReadinessEdge[];
  labelByNode: Map<string, string>;
}): SheetContent {
  const state = input.classification.stateByNode[input.derivedNodeId] ?? "locked";
  const optionItem = input.optionItemsByNode.get(input.derivedNodeId) ?? null;
  const selfAssessmentItem = input.selfAssessmentItemsByNode.get(input.derivedNodeId) ?? null;
  if (state === "locked") {
    const unmet = unmetPrerequisites(input.derivedNodeId, input.edges, input.classification);
    return { kind: "locked", unmetPrerequisiteLabels: unmet.map((id) => input.labelByNode.get(id) ?? id) };
  }
  if (state === "mastered") return { kind: "mastered_review", card: selfAssessmentItem };
  // frontier
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
  const certainEdges = input.edges.filter((edge) => !edge.uncertain) as unknown as InferredPrerequisiteEdge[];
  const scope = prerequisiteAncestors(input.targetDerivedNodeId, certainEdges);
  scope.add(input.targetDerivedNodeId);
  const frontier = [...scope].filter((id) => input.classification.stateByNode[id] === "frontier");
  if (frontier.length === 0) return null;
  return frontier.sort((a, b) => (input.difficultyByNode.get(b) ?? 0) - (input.difficultyByNode.get(a) ?? 0) || a.localeCompare(b))[0];
}

// --- Study-session loader (R5, R7, R9) -------------------------------------

export type StudySession = {
  enrichmentId: string;
  learnerStateRef: string;
  target: { derivedNodeId: string; label: string };
  detail: DerivedGraphDetail;
  // The whole-layer classification, with `selectedFrontierTarget` scoped to the goal cone
  // so the adapted-graph ring marks the node the learner advances to next toward Z.
  classification: AdaptedNodeClassification;
  responseSourceSummary: ResponseSourceSummary;
  // Hardest-first calibration sweep over the goal's prerequisite-ancestor self-assessment items.
  calibrationItems: (CalibrationItem & { label: string; question: string })[];
  // Per-node gated side-sheet payloads (R9) and the item lookups the modules render from.
  sheetByNode: Record<string, SheetContent>;
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
    return { layer, studyItems, rows };
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

  const masteryByNode = buildMasteryMap(loaded.rows);
  const learnerState: LearnerStatePort = {
    learnerStateRef,
    mastery: (derivedNodeId: string) => masteryByNode[derivedNodeId] ?? 0
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
  const sheetByNode: Record<string, SheetContent> = {};
  for (const node of detail.nodes) {
    sheetByNode[node.derivedNodeId] = sheetContentFor({
      derivedNodeId: node.derivedNodeId,
      classification,
      optionItemsByNode,
      selfAssessmentItemsByNode,
      edges: detail.edges,
      labelByNode
    });
  }

  const calibrationItems = buildCalibrationSet({
    layer: loaded.layer,
    targetDerivedNodeId,
    studyItems: selfAssessmentViews.map((item) => ({ derivedNodeId: item.derivedNodeId, studyItemId: item.studyItemId }))
  }).map((item) => ({
    ...item,
    label: labelByNode.get(item.derivedNodeId) ?? item.derivedNodeId,
    question: selfAssessmentItemsByNode.get(item.derivedNodeId)?.question ?? ""
  }));

  return {
    enrichmentId,
    learnerStateRef,
    target: { derivedNodeId: targetDerivedNodeId, label: labelFor(detail, targetDerivedNodeId) },
    detail,
    classification,
    responseSourceSummary: summarizeResponseSources(loaded.rows),
    calibrationItems,
    sheetByNode,
    selfAssessmentItemsByNode: Object.fromEntries(selfAssessmentItemsByNode),
    optionItemsByNode: Object.fromEntries(optionItemsByNode)
  };
}
