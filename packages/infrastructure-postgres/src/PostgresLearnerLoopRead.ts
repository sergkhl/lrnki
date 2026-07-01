import type { CalibrationVerdict, ResponseLogRow, Verdict } from "@lrnki/domain-core";
import type {
  LearnerLoopPathScope,
  LearnerLoopReadPort,
  LearnerLoopResponseDetailRow,
  LearnerLoopResponseRow,
  PathStudyItemCoverage,
  PathStudyItemCoverageStep
} from "@lrnki/ports";
import type { Sql } from "postgres";

// Postgres-backed Learner Loop Inspection Read Model (ADR-0027, KTD7). Serves the Admin Lab
// learner-loop surface without leaking SQL into the UI or the application: this adapter owns
// the all-learner response/verdict reads, the per-learner joined history, the path-scope
// read, and the coverage stitch (including the no-item fallback reason). The application's
// learner-loop projection use-cases add the conflict/mastery/summary folds and the
// adapted-graph classify over these rows. Read-only — it never mutates learner state.
export class PostgresLearnerLoopRead implements LearnerLoopReadPort {
  constructor(private readonly sql: Sql) {}

  async listAllResponses(): Promise<LearnerLoopResponseRow[]> {
    const rows = await this.sql<ResponseRow[]>`
      SELECT response_id, learner_state_ref, study_item_id, derived_node_id, signal_type,
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
    const rows = await this.sql<(ResponseRow & { concept_label: string; question: string })[]>`
      SELECT rl.response_id, rl.learner_state_ref, rl.study_item_id, rl.derived_node_id, rl.signal_type,
             rl.judged_outcome, rl.graded_score, rl.response_source, rl.grader_identity, rl.batch_id,
             rl.attempt_seq, rl.submitted_answer, rl.created_at,
             n.canonical_label AS concept_label, cd.question
      FROM response_log rl
      JOIN derived_graph_nodes n ON n.derived_node_id = rl.derived_node_id
      JOIN study_items cd ON cd.study_item_id = rl.study_item_id
      WHERE rl.learner_state_ref = ${learnerStateRef}
      ORDER BY rl.attempt_seq`;
    return rows.map((row) => ({ ...rowToResponseLogRow(row), nodeLabel: row.concept_label, question: row.question }));
  }

  async listVerdictsForLearner(learnerStateRef: string): Promise<CalibrationVerdict[]> {
    const rows = await this.sql<VerdictRow[]>`
      SELECT learner_state_ref, derived_node_id, verdict FROM calibration_verdicts WHERE learner_state_ref = ${learnerStateRef}`;
    return rows.map(rowToVerdict);
  }

  async listPathScopesForLearner(learnerStateRef: string): Promise<LearnerLoopPathScope[]> {
    const rows = await this.sql<{ enrichment_id: string; target_derived_node_id: string; target_label: string }[]>`
      SELECT p.enrichment_id, p.target_derived_node_id, n.canonical_label AS target_label
      FROM learner_paths p JOIN derived_graph_nodes n ON n.derived_node_id = p.target_derived_node_id
      WHERE p.learner_state_ref = ${learnerStateRef}
      ORDER BY p.created_at DESC`;
    return rows.map((row) => ({ enrichmentId: row.enrichment_id, targetDerivedNodeId: row.target_derived_node_id, targetLabel: row.target_label }));
  }

  async listCoverageForLearner(learnerStateRef: string): Promise<PathStudyItemCoverage[]> {
    const coverageRows = await this.sql<{
      enrichment_id: string; target_derived_node_id: string; target_label: string; position: number; derived_node_id: string;
      label: string; grounding_origin: string; included_reason: string; study_item_id: string | null; question: string | null; grounding_provenance: string | null; rejection_reason: string | null;
    }[]>`
      SELECT p.enrichment_id, p.target_derived_node_id, tn.canonical_label AS target_label,
             s.position, s.derived_node_id, n.canonical_label AS label, n.grounding_origin,
             s.included_reason, c.study_item_id, c.question, c.grounding_provenance, rc.reason AS rejection_reason
      FROM learner_paths p
      JOIN derived_graph_nodes tn ON tn.derived_node_id = p.target_derived_node_id
      JOIN learner_path_steps s ON s.learner_path_id = p.learner_path_id
      JOIN derived_graph_nodes n ON n.derived_node_id = s.derived_node_id
      LEFT JOIN study_items c ON c.derived_node_id = s.derived_node_id AND c.item_type = 'option_select'
      LEFT JOIN rejected_study_items rc ON rc.derived_node_id = s.derived_node_id AND rc.item_type = 'option_select'
      WHERE p.learner_state_ref = ${learnerStateRef}
      ORDER BY p.created_at DESC, s.position`;
    const coverageByPath = new Map<string, PathStudyItemCoverage>();
    for (const row of coverageRows) {
      const key = `${row.enrichment_id}:${row.target_derived_node_id}`;
      let coverage = coverageByPath.get(key);
      if (!coverage) {
        coverage = { enrichmentId: row.enrichment_id, targetDerivedNodeId: row.target_derived_node_id, targetLabel: row.target_label, steps: [] };
        coverageByPath.set(key, coverage);
      }
      coverage.steps.push({
        position: Number(row.position),
        derivedNodeId: row.derived_node_id,
        label: row.label,
        groundingOrigin: row.grounding_origin,
        includedReason: row.included_reason,
        studyItem: row.study_item_id && row.question && row.grounding_provenance
          ? { studyItemId: row.study_item_id, question: row.question, provenance: row.grounding_provenance as NonNullable<PathStudyItemCoverageStep["studyItem"]>["provenance"] }
          : null,
        fallbackReason: row.study_item_id ? null : (row.rejection_reason ?? fallbackReasonFor(row.grounding_origin))
      });
    }
    return [...coverageByPath.values()];
  }
}

type ResponseRow = {
  response_id: string; learner_state_ref: string; study_item_id: string; derived_node_id: string; signal_type: string;
  judged_outcome: string | null; graded_score: number | null;
  response_source: string; grader_identity: string | null; batch_id: string | null;
  attempt_seq: number; submitted_answer: string | null; created_at: string;
};

function rowToResponseLogRow(row: ResponseRow): ResponseLogRow & { createdAt: string } {
  return {
    responseId: row.response_id,
    learnerStateRef: row.learner_state_ref,
    studyItemId: row.study_item_id,
    derivedNodeId: row.derived_node_id,
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

// Generic fallback used ONLY when a step's node has neither a study item nor a persisted
// rejection row (e.g. study items were never generated for the enrichment). When a real
// rejection exists, the coverage view shows its persisted reason instead of this guess.
function fallbackReasonFor(groundingOrigin: string): string {
  if (groundingOrigin === "llm_grounded") return "Generated prerequisite, not directly recall-tested yet.";
  if (groundingOrigin === "source_mentioned") return "Source-mentioned prerequisite, not directly recall-tested yet.";
  return "Anchor node, not directly recall-tested yet.";
}
