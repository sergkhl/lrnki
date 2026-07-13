import type { StudyItem, Verdict } from "@lrnki/domain-core";
import type {
  CalibrationVerdictStorePort,
  EnrichmentInspectionReadPort,
  LearnerExpedition,
  LearnerExpeditionStorePort,
  LessonReadStorePort,
  ResponseLogStorePort,
  ScaffoldDetourStorePort,
  StudyItemBankStorePort
} from "@lrnki/ports";
import { appendGradedMatchingOutcome, appendGradedScaffoldOutcome, appendGradedSelectionOutcome, keyedCorrectIdFor, keyedMatchIdFor, type MatchingAttemptTrace } from "./gradedSelectionOutcome";

// The learner-grading use-case (Candidate 2, ADR-0027). It owns the whole load-guard-resolve-grade
// -append composition the Admin Lab server actions used to hand-write in raw SQL, so the grading
// half of Learner State writes is finally reachable through a testable interface. Every refusal is a
// reason CODE, never learner-facing copy — the UI keeps the themed strings (ADR-0033). No write port
// touches the published graph or the Derived Graph Layer: writes land only on the append-only
// Response Log, the mutable Calibration Verdicts, and the Lesson Reads (AGENTS rule 3).

// A graded submission, discriminated by item type: option-select keys the chosen option, impostor
// keys the chosen statement, matching carries the full attempt trace (R1).
export type StudyResponseSubmission =
  | { itemType: "option_select"; chosenOptionId: string }
  | { itemType: "impostor"; chosenStatementId: string }
  | { itemType: "matching"; trace: MatchingAttemptTrace };

// Why a graded/checked/recorded call could not proceed. These collapse, UI-side, to the two learner
// messages the actions rendered before this refactor ("could not be recorded" / "no longer active").
export type GradeRefusalReason = "invalid_input" | "expedition_inactive" | "item_not_found" | "item_type_mismatch";
export type NodeWriteRefusalReason = "invalid_input" | "expedition_inactive" | "node_not_in_enrichment";

// The graded outcome the actions expose today, keyed correct id / matching tallies included. The
// keyed-correct id is resolved server-side and only ever leaves through this result (KTD2).
export type GradedResponse =
  | { kind: "selection"; chosenId: string; keyedCorrectId: string; correct: boolean }
  | { kind: "matching"; correct: boolean; correctFirstTry: number; pairCount: number };

export type GradeStudyResponseResult =
  | { graded: true; outcome: GradedResponse }
  | { graded: false; refused: GradeRefusalReason };

export type MatchingAttemptCheckResult =
  | { checked: true; correct: boolean }
  | { checked: false; refused: GradeRefusalReason };

export type NodeWriteResult =
  | { recorded: true }
  | { recorded: false; refused: NodeWriteRefusalReason };

type StudyResponsePorts = {
  expeditionStore: LearnerExpeditionStorePort;
  studyItemStore: StudyItemBankStorePort;
  responseLog: ResponseLogStorePort;
};

// The one guard fact every learner-surface write shares: a `ready` + `active` expedition for this
// enrichment. Two existing-shaped reads (getByEnrichment, then the item/node read) replace the
// former single join; the lost atomicity is benign against an append-only log (R2, KTD1).
async function loadActiveExpedition(
  input: { learnerStateRef: string; enrichmentId: string },
  expeditionStore: LearnerExpeditionStorePort
): Promise<LearnerExpedition | undefined> {
  const expedition = await expeditionStore.getByEnrichment(input);
  if (!expedition || expedition.status !== "ready" || !expedition.active) return undefined;
  return expedition;
}

// Load the current-generation item and confirm it belongs to the guarded expedition and matches the
// submitted type. Mirrors the WHERE clauses of the deleted per-type SQL (R3).
async function loadGradableItem(
  input: { enrichmentId: string; studyItemId: string; itemType: StudyItem["itemType"] },
  studyItemStore: StudyItemBankStorePort
): Promise<StudyItem | GradeRefusalReason> {
  const item = await studyItemStore.getStudyItemById(input.studyItemId);
  if (!item || item.enrichmentId !== input.enrichmentId) return "item_not_found";
  if (item.itemType !== input.itemType) return "item_type_mismatch";
  return item;
}

export async function gradeStudyResponse(
  input: {
    learnerStateRef: string;
    enrichmentId: string;
    studyItemId: string;
    submission: StudyResponseSubmission;
  },
  ports: StudyResponsePorts
): Promise<GradeStudyResponseResult> {
  const { learnerStateRef, enrichmentId, studyItemId, submission } = input;
  if (!learnerStateRef || !enrichmentId || !studyItemId) return { graded: false, refused: "invalid_input" };
  if (submission.itemType === "matching" && (!Array.isArray(submission.trace) || submission.trace.length === 0)) {
    return { graded: false, refused: "invalid_input" };
  }
  if (submission.itemType === "option_select" && !submission.chosenOptionId) return { graded: false, refused: "invalid_input" };
  if (submission.itemType === "impostor" && !submission.chosenStatementId) return { graded: false, refused: "invalid_input" };

  const expedition = await loadActiveExpedition({ learnerStateRef, enrichmentId }, ports.expeditionStore);
  if (!expedition) return { graded: false, refused: "expedition_inactive" };

  const loaded = await loadGradableItem({ enrichmentId, studyItemId, itemType: submission.itemType }, ports.studyItemStore);
  if (typeof loaded === "string") return { graded: false, refused: loaded };
  const item = loaded;

  if ((item.itemType === "option_select" && submission.itemType === "option_select") || (item.itemType === "impostor" && submission.itemType === "impostor")) {
    const keyedCorrectId = keyedCorrectIdFor(item);
    if (!keyedCorrectId) return { graded: false, refused: "item_not_found" };
    const chosenId = submission.itemType === "option_select" ? submission.chosenOptionId : submission.chosenStatementId;
    await appendGradedSelectionOutcome({
      learnerStateRef,
      item: { studyItemId, derivedNodeId: item.derivedNodeId },
      chosenId,
      keyedCorrectId,
      responseSource: "human",
      responseLog: ports.responseLog
    });
    return { graded: true, outcome: { kind: "selection", chosenId, keyedCorrectId, correct: chosenId === keyedCorrectId } };
  }

  if (item.itemType === "matching" && submission.itemType === "matching") {
    const result = await appendGradedMatchingOutcome({
      learnerStateRef,
      item,
      trace: submission.trace,
      responseSource: "human",
      responseLog: ports.responseLog
    });
    return { graded: true, outcome: { kind: "matching", correct: result.row.judgedOutcome === "correct", correctFirstTry: result.correctFirstTry, pairCount: result.pairCount } };
  }

  // Unreachable: type equality was verified above. Guards the discriminants exhaustively.
  return { graded: false, refused: "item_type_mismatch" };
}

// Scaffold-scoped grading (plan 2026-07-12-002 U5, KTD4). A generated Scaffold Step's option-select
// grades through the SAME keyed-selection rule as neutral items, but resolves from the scaffold
// store and appends a `scaffold`-scoped response — so scaffold study is durable and separate and
// can NEVER touch base mastery. A reference step submits its neutral ids through the normal
// `gradeStudyResponse` path instead; it is not gradable here.
export type ScaffoldGradeRefusal = "invalid_input" | "step_not_found" | "step_not_gradable";
export type GradeScaffoldOptionSelectResult =
  | { graded: true; chosenId: string; keyedCorrectId: string; correct: boolean }
  | { graded: false; refused: ScaffoldGradeRefusal };

export async function gradeScaffoldOptionSelect(
  input: { learnerStateRef: string; scaffoldStepId: string; chosenOptionId: string },
  ports: { scaffoldStore: ScaffoldDetourStorePort; responseLog: ResponseLogStorePort }
): Promise<GradeScaffoldOptionSelectResult> {
  if (!input.learnerStateRef || !input.scaffoldStepId || !input.chosenOptionId) return { graded: false, refused: "invalid_input" };
  const found = await ports.scaffoldStore.getStep({ scaffoldStepId: input.scaffoldStepId, learnerStateRef: input.learnerStateRef });
  if (!found) return { graded: false, refused: "step_not_found" };
  if (found.step.kind !== "generated") return { graded: false, refused: "step_not_gradable" };
  const keyed = found.step.payload.item.options.find((option) => option.isCorrect);
  if (!keyed) return { graded: false, refused: "step_not_gradable" };
  await appendGradedScaffoldOutcome({
    learnerStateRef: input.learnerStateRef,
    scaffoldStepId: input.scaffoldStepId,
    chosenId: input.chosenOptionId,
    keyedCorrectId: keyed.optionId,
    responseSource: "human",
    responseLog: ports.responseLog
  });
  return { graded: true, chosenId: input.chosenOptionId, keyedCorrectId: keyed.optionId, correct: input.chosenOptionId === keyed.optionId };
}

// Mark a generated Scaffold Step's micro-lesson read (R12). A reference step's lesson-read rides
// the existing NEUTRAL lesson-read path (`recordLessonRead`); only generated steps resolve here.
export type RecordScaffoldLessonReadResult = { recorded: true } | { recorded: false; refused: "invalid_input" | "step_not_found" };
export async function recordScaffoldLessonRead(
  input: { learnerStateRef: string; scaffoldStepId: string },
  ports: { scaffoldStore: ScaffoldDetourStorePort }
): Promise<RecordScaffoldLessonReadResult> {
  if (!input.learnerStateRef || !input.scaffoldStepId) return { recorded: false, refused: "invalid_input" };
  const found = await ports.scaffoldStore.getStep({ scaffoldStepId: input.scaffoldStepId, learnerStateRef: input.learnerStateRef });
  if (!found || found.step.kind !== "generated") return { recorded: false, refused: "step_not_found" };
  await ports.scaffoldStore.markLessonRead({ scaffoldStepId: input.scaffoldStepId, learnerStateRef: input.learnerStateRef, readAt: new Date().toISOString() });
  return { recorded: true };
}

// Mid-play single-pair check for matching (R5): guard, resolve the item once, answer purely — no
// write to the Response Log.
export async function checkMatchingAttempt(
  input: { learnerStateRef: string; enrichmentId: string; studyItemId: string; promptId: string; matchId: string },
  ports: { expeditionStore: LearnerExpeditionStorePort; studyItemStore: StudyItemBankStorePort }
): Promise<MatchingAttemptCheckResult> {
  const { learnerStateRef, enrichmentId, studyItemId, promptId, matchId } = input;
  if (!learnerStateRef || !enrichmentId || !studyItemId || !promptId || !matchId) return { checked: false, refused: "invalid_input" };

  const expedition = await loadActiveExpedition({ learnerStateRef, enrichmentId }, ports.expeditionStore);
  if (!expedition) return { checked: false, refused: "expedition_inactive" };

  const loaded = await loadGradableItem({ enrichmentId, studyItemId, itemType: "matching" }, ports.studyItemStore);
  if (typeof loaded === "string") return { checked: false, refused: loaded };
  if (loaded.itemType !== "matching") return { checked: false, refused: "item_type_mismatch" };
  const keyedMatchId = keyedMatchIdFor(loaded, promptId);
  if (!keyedMatchId) return { checked: false, refused: "item_not_found" };
  return { checked: true, correct: keyedMatchId === matchId };
}

// Node-membership guard shared by verdict and lesson-read writes (R4). `lesson_reads`/
// `calibration_verdicts` key on (learner, node) GLOBALLY, so a write must prove the node lives in
// the guarded active expedition — otherwise a client could mark nodes read/known in expeditions that
// are not active, bypassing completion gating in other Study Sessions.
async function guardNodeWrite(
  input: { learnerStateRef: string; enrichmentId: string; derivedNodeId: string },
  ports: { expeditionStore: LearnerExpeditionStorePort; enrichmentRead: EnrichmentInspectionReadPort }
): Promise<NodeWriteRefusalReason | undefined> {
  if (!input.learnerStateRef || !input.enrichmentId || !input.derivedNodeId) return "invalid_input";
  const expedition = await loadActiveExpedition({ learnerStateRef: input.learnerStateRef, enrichmentId: input.enrichmentId }, ports.expeditionStore);
  if (!expedition) return "expedition_inactive";
  const belongs = await ports.enrichmentRead.derivedNodeBelongsToEnrichment(input.enrichmentId, input.derivedNodeId);
  if (!belongs) return "node_not_in_enrichment";
  return undefined;
}

// Set or clear a calibration verdict (R4). Clearing stays an upsert to `learn`, exactly as before —
// the caller passes the target verdict, so one path covers set and clear.
export async function recordLearnerVerdict(
  input: { learnerStateRef: string; enrichmentId: string; derivedNodeId: string; verdict: Verdict },
  ports: { expeditionStore: LearnerExpeditionStorePort; enrichmentRead: EnrichmentInspectionReadPort; verdictStore: CalibrationVerdictStorePort }
): Promise<NodeWriteResult> {
  const refused = await guardNodeWrite(input, ports);
  if (refused) return { recorded: false, refused };
  await ports.verdictStore.upsert({ learnerStateRef: input.learnerStateRef, derivedNodeId: input.derivedNodeId, verdict: input.verdict });
  return { recorded: true };
}

export async function recordLessonRead(
  input: { learnerStateRef: string; enrichmentId: string; derivedNodeId: string },
  ports: { expeditionStore: LearnerExpeditionStorePort; enrichmentRead: EnrichmentInspectionReadPort; lessonReadStore: LessonReadStorePort }
): Promise<NodeWriteResult> {
  const refused = await guardNodeWrite(input, ports);
  if (refused) return { recorded: false, refused };
  await ports.lessonReadStore.markRead({ learnerStateRef: input.learnerStateRef, derivedNodeId: input.derivedNodeId });
  return { recorded: true };
}
