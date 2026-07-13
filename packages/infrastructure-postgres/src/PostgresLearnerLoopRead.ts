import type { CalibrationVerdict, ResponseLogRow, Verdict } from "@lrnki/domain-core";
import type {
  LearnerLoopReadPort,
  LearnerLoopResponseDetailRow,
  LearnerLoopResponseRow
} from "@lrnki/ports";
import type { Sql } from "postgres";

// Postgres-backed Learner Loop Inspection Read Model (ADR-0027, KTD7). Serves the Admin Lab
// learner-loop surface without leaking SQL into the UI or the application: this adapter owns
// the all-learner response/verdict reads and the per-learner joined history. The
// application's learner-loop projection use-cases add the conflict/mastery/summary folds.
// Read-only — it never mutates learner state.
export class PostgresLearnerLoopRead implements LearnerLoopReadPort {
  constructor(private readonly sql: Sql) {}

  async listAllResponses(): Promise<LearnerLoopResponseRow[]> {
    const rows = await this.sql<ResponseRow[]>`
      SELECT response_id, learner_state_ref, study_item_id, derived_node_id, scaffold_step_id, signal_type,
             judged_outcome, graded_score, response_source, grader_identity, batch_id,
             attempt_seq, submitted_answer, created_at
      FROM response_log ORDER BY learner_state_ref, attempt_seq`;
    return rows.map(rowToResponseLogRow);
  }

  async listAllVerdicts(): Promise<CalibrationVerdict[]> {
    const rows = await this.sql<VerdictRow[]>`
      SELECT learner_state_ref, derived_node_id, verdict FROM calibration_verdicts`;
    return rows.map(rowToVerdict);
  }

  async listResponsesForLearner(learnerStateRef: string): Promise<LearnerLoopResponseDetailRow[]> {
    // Scope-aware LEFT JOINs (plan 2026-07-12-002 U2): a neutral row resolves its label +
    // question through derived_graph_nodes/study_items; a scaffold row resolves them from the
    // generated step payload + owning detour. INNER JOINs would silently drop scaffold rows,
    // so admin inspection must not assume every response joins study_items.
    const rows = await this.sql<(ResponseRow & { concept_label: string | null; question: string | null; enrichment_id: string | null; scaffold_label: string | null; scaffold_question: string | null; scaffold_enrichment_id: string | null })[]>`
      SELECT rl.response_id, rl.learner_state_ref, rl.study_item_id, rl.derived_node_id, rl.scaffold_step_id, rl.signal_type,
             rl.judged_outcome, rl.graded_score, rl.response_source, rl.grader_identity, rl.batch_id,
             rl.attempt_seq, rl.submitted_answer, rl.created_at,
             n.canonical_label AS concept_label, n.enrichment_id, cd.question,
             s.payload->>'label' AS scaffold_label, s.payload->'item'->>'question' AS scaffold_question, d.enrichment_id AS scaffold_enrichment_id
      FROM response_log rl
      -- No superseded_at filter on the neutral join: resolve the EXACT item answered even if a
      -- later regeneration superseded it (study_item_id is a stable key).
      LEFT JOIN derived_graph_nodes n ON n.derived_node_id = rl.derived_node_id
      LEFT JOIN study_items cd ON cd.study_item_id = rl.study_item_id
      LEFT JOIN learner_scaffold_steps s ON s.scaffold_step_id = rl.scaffold_step_id
      LEFT JOIN learner_scaffold_detours d ON d.detour_id = s.detour_id
      WHERE rl.learner_state_ref = ${learnerStateRef}
      ORDER BY rl.attempt_seq`;
    return rows.map((row) => ({
      ...rowToResponseLogRow(row),
      nodeLabel: row.scaffold_step_id !== null ? (row.scaffold_label ?? "Scaffold support") : (row.concept_label ?? ""),
      question: row.scaffold_step_id !== null ? (row.scaffold_question ?? "") : (row.question ?? ""),
      enrichmentId: (row.scaffold_step_id !== null ? row.scaffold_enrichment_id : row.enrichment_id) ?? ""
    }));
  }

  async listVerdictsForLearner(learnerStateRef: string): Promise<CalibrationVerdict[]> {
    const rows = await this.sql<VerdictRow[]>`
      SELECT learner_state_ref, derived_node_id, verdict FROM calibration_verdicts WHERE learner_state_ref = ${learnerStateRef}`;
    return rows.map(rowToVerdict);
  }
}

type ResponseRow = {
  response_id: string; learner_state_ref: string; study_item_id: string | null; derived_node_id: string | null; scaffold_step_id: string | null; signal_type: string;
  judged_outcome: string | null; graded_score: number | null;
  response_source: string; grader_identity: string | null; batch_id: string | null;
  attempt_seq: number; submitted_answer: string | null; created_at: string;
};

function rowToResponseLogRow(row: ResponseRow): ResponseLogRow & { createdAt: string } {
  const subject = row.scaffold_step_id !== null
    ? { scope: "scaffold" as const, scaffoldStepId: row.scaffold_step_id }
    : { scope: "neutral" as const, studyItemId: row.study_item_id as string, derivedNodeId: row.derived_node_id as string };
  return {
    ...subject,
    responseId: row.response_id,
    learnerStateRef: row.learner_state_ref,
    signalType: row.signal_type as ResponseLogRow["signalType"],
    judgedOutcome: row.judged_outcome as ResponseLogRow["judgedOutcome"],
    gradedScore: row.graded_score === null ? null : Number(row.graded_score),
    responseSource: row.response_source as ResponseLogRow["responseSource"],
    graderIdentity: row.grader_identity,
    batchId: row.batch_id,
    attemptSeq: Number(row.attempt_seq),
    submittedAnswer: row.submitted_answer,
    createdAt: new Date(row.created_at).toISOString()
  };
}

type VerdictRow = { learner_state_ref: string; derived_node_id: string; verdict: string };
function rowToVerdict(row: VerdictRow): CalibrationVerdict {
  return { learnerStateRef: row.learner_state_ref, derivedNodeId: row.derived_node_id, verdict: row.verdict as Verdict };
}
