import { sql } from "drizzle-orm";
import type { GeneratedGroundingBundle } from "@lrnki/domain-core";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth.js";
import { derivedGraphNodes, graphEnrichments } from "./derivedGraph.js";
import { conceptLessons, studyItems } from "./learningAssets.js";

// Every learner-state table keys against Better Auth's `user.id`
// (docs/adr/0041-own-learner-identity-with-self-hosted-better-auth.md). `./auth.js` is a
// generated file: identity columns are never declared here, only referenced.

export const learnerAwards = pgTable(
  "learner_awards",
  {
    awardId: uuid("award_id").primaryKey().notNull(),
    learnerRef: text("learner_ref").notNull(),
    awardType: text("award_type").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    context: jsonb("context").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.learnerRef],
      foreignColumns: [user.id],
      name: "learner_awards_learner_ref_fkey",
    }),
    unique("learner_awards_learner_ref_award_type_dedupe_key_key").on(
      table.learnerRef,
      table.awardType,
      table.dedupeKey,
    ),
    index("learner_awards_learner_idx").on(
      table.learnerRef,
      table.createdAt.desc().nullsFirst(),
    ),
    check("learner_awards_award_type_check", sql`award_type IN ('weekly_podium')`),
  ],
);

export const learnerExpeditions = pgTable(
  "learner_expeditions",
  {
    learnerExpeditionId: uuid("learner_expedition_id").primaryKey().notNull(),
    learnerStateRef: text("learner_state_ref").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    declaredDomain: text("declared_domain"),
    status: text("status").notNull(),
    currentOperationId: uuid("current_operation_id"),
    currentOperationType: text("current_operation_type"),
    enrichmentId: uuid("enrichment_id"),
    assetSetIdentity: text("asset_set_identity"),
    active: boolean("active").default(false).notNull(),
    failureMessage: text("failure_message"),
    generationAttempts: integer("generation_attempts").default(0).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.learnerStateRef],
      foreignColumns: [user.id],
      name: "learner_expeditions_learner_state_ref_fkey",
    }),
    foreignKey({
      columns: [table.enrichmentId],
      foreignColumns: [graphEnrichments.enrichmentId],
      name: "learner_expeditions_enrichment_id_fkey",
    }),
    uniqueIndex("learner_expeditions_one_active_per_learner")
      .on(table.learnerStateRef)
      .where(sql`active`),
    uniqueIndex("learner_expeditions_one_enrichment_per_learner")
      .on(table.learnerStateRef, table.enrichmentId)
      .where(sql`enrichment_id IS NOT NULL`),
    index("learner_expeditions_learner_state_ref_idx").on(
      table.learnerStateRef,
      table.createdAt.desc().nullsFirst(),
    ),
    index("learner_expeditions_enrichment_idx").on(table.enrichmentId),
    check("learner_expeditions_kind_check", sql`kind IN ('topic', 'source')`),
    check(
      "learner_expeditions_status_check",
      sql`status IN ('generating', 'ready', 'failed')`,
    ),
    check(
      "learner_expeditions_current_operation_type_check",
      sql`current_operation_type IN ('extraction', 'minting', 'enrichment', 'study_items')`,
    ),
    check(
      "learner_expeditions_check",
      sql`(current_operation_id IS NULL AND current_operation_type IS NULL)
        OR (current_operation_id IS NOT NULL AND current_operation_type IS NOT NULL)`,
    ),
    check(
      "learner_expeditions_check1",
      sql`(status = 'ready' AND enrichment_id IS NOT NULL AND declared_domain IS NOT NULL)
        OR status <> 'ready'`,
    ),
    check(
      "learner_expeditions_source_asset_identity_check",
      sql`(kind = 'source' AND status = 'ready' AND asset_set_identity IS NOT NULL
        AND current_operation_id IS NULL AND current_operation_type IS NULL)
        OR (kind = 'topic' AND asset_set_identity IS NULL)`,
    ),
  ],
);

export const calibrationVerdicts = pgTable(
  "calibration_verdicts",
  {
    learnerStateRef: text("learner_state_ref").notNull(),
    derivedNodeId: uuid("derived_node_id").notNull(),
    verdict: text("verdict").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.learnerStateRef],
      foreignColumns: [user.id],
      name: "calibration_verdicts_learner_state_ref_fkey",
    }),
    foreignKey({
      columns: [table.derivedNodeId],
      foreignColumns: [derivedGraphNodes.derivedNodeId],
      name: "calibration_verdicts_derived_node_id_fkey",
    }),
    primaryKey({
      columns: [table.learnerStateRef, table.derivedNodeId],
      name: "calibration_verdicts_pkey",
    }),
    check("calibration_verdicts_verdict_check", sql`verdict IN ('known', 'learn')`),
  ],
);

export const lessonReads = pgTable(
  "lesson_reads",
  {
    learnerStateRef: text("learner_state_ref").notNull(),
    derivedNodeId: uuid("derived_node_id").notNull(),
    firstReadAt: timestamp("first_read_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.learnerStateRef],
      foreignColumns: [user.id],
      name: "lesson_reads_learner_state_ref_fkey",
    }),
    foreignKey({
      columns: [table.derivedNodeId],
      foreignColumns: [derivedGraphNodes.derivedNodeId],
      name: "lesson_reads_derived_node_id_fkey",
    }),
    primaryKey({
      columns: [table.learnerStateRef, table.derivedNodeId],
      name: "lesson_reads_pkey",
    }),
  ],
);

export const learnerScaffoldDetours = pgTable(
  "learner_scaffold_detours",
  {
    detourId: uuid("detour_id").primaryKey().notNull(),
    learnerStateRef: text("learner_state_ref").notNull(),
    enrichmentId: uuid("enrichment_id").notNull(),
    parentDerivedNodeId: uuid("parent_derived_node_id").notNull(),
    term: text("term").notNull(),
    normalizedTerm: text("normalized_term").notNull(),
    status: text("status").notNull(),
    latestOperationId: uuid("latest_operation_id"),
    claimToken: uuid("claim_token"),
    generationAttempts: integer("generation_attempts").default(0).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.learnerStateRef],
      foreignColumns: [user.id],
      name: "learner_scaffold_detours_learner_state_ref_fkey",
    }),
    foreignKey({
      columns: [table.enrichmentId],
      foreignColumns: [graphEnrichments.enrichmentId],
      name: "learner_scaffold_detours_enrichment_id_fkey",
    }),
    foreignKey({
      columns: [table.parentDerivedNodeId],
      foreignColumns: [derivedGraphNodes.derivedNodeId],
      name: "learner_scaffold_detours_parent_derived_node_id_fkey",
    }),
    unique("learner_scaffold_detours_learner_state_ref_enrichment_id_pa_key").on(
      table.learnerStateRef,
      table.enrichmentId,
      table.parentDerivedNodeId,
      table.normalizedTerm,
    ),
    index("learner_scaffold_detours_active_idx")
      .on(table.learnerStateRef, table.enrichmentId)
      .where(sql`status <> 'hidden'`),
    check(
      "learner_scaffold_detours_status_check",
      sql`status IN ('generating', 'ready', 'failed', 'hidden')`,
    ),
  ],
);

export const learnerScaffoldSteps = pgTable(
  "learner_scaffold_steps",
  {
    scaffoldStepId: uuid("scaffold_step_id").primaryKey().notNull(),
    detourId: uuid("detour_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    kind: text("kind").notNull(),
    referencedDerivedNodeId: uuid("referenced_derived_node_id"),
    referencedConceptLessonId: uuid("referenced_concept_lesson_id"),
    referencedStudyItemId: uuid("referenced_study_item_id"),
    referencedStudyItemType: text("referenced_study_item_type").generatedAlwaysAs(
      sql`CASE
        WHEN referenced_study_item_id IS NULL THEN NULL
        ELSE 'option_select'
      END`,
    ),
    payload: jsonb("payload"),
    groundingBundle: jsonb("grounding_bundle").$type<GeneratedGroundingBundle>(),
    lessonReadAt: timestamp("lesson_read_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    foreignKey({
      columns: [table.detourId],
      foreignColumns: [learnerScaffoldDetours.detourId],
      name: "learner_scaffold_steps_detour_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.referencedDerivedNodeId],
      foreignColumns: [derivedGraphNodes.derivedNodeId],
      name: "learner_scaffold_steps_referenced_derived_node_id_fkey",
    }),
    foreignKey({
      columns: [table.referencedConceptLessonId, table.referencedDerivedNodeId],
      foreignColumns: [conceptLessons.conceptLessonId, conceptLessons.derivedNodeId],
      name: "learner_scaffold_steps_referenced_concept_lesson_id_refere_fkey",
    }),
    foreignKey({
      columns: [
        table.referencedStudyItemId,
        table.referencedStudyItemType,
        table.referencedDerivedNodeId,
      ],
      foreignColumns: [studyItems.studyItemId, studyItems.itemType, studyItems.derivedNodeId],
      name: "learner_scaffold_steps_referenced_study_item_id_referenced_fkey",
    }),
    unique("learner_scaffold_steps_detour_id_ordinal_key").on(table.detourId, table.ordinal),
    check("learner_scaffold_steps_ordinal_check", sql`ordinal >= 0`),
    check("learner_scaffold_steps_kind_check", sql`kind IN ('reference', 'generated')`),
    check(
      "learner_scaffold_steps_check",
      sql`(
        kind = 'reference'
        AND referenced_derived_node_id IS NOT NULL
        AND referenced_concept_lesson_id IS NOT NULL
        AND referenced_study_item_id IS NOT NULL
        AND payload IS NULL
        AND grounding_bundle IS NULL
        AND lesson_read_at IS NULL
      ) OR (
        kind = 'generated'
        AND referenced_derived_node_id IS NULL
        AND referenced_concept_lesson_id IS NULL
        AND referenced_study_item_id IS NULL
        AND payload IS NOT NULL
        AND grounding_bundle IS NOT NULL
      )`,
    ),
  ],
);

export const responseLog = pgTable(
  "response_log",
  {
    responseId: uuid("response_id").primaryKey().notNull(),
    learnerStateRef: text("learner_state_ref").notNull(),
    studyItemId: uuid("study_item_id"),
    derivedNodeId: uuid("derived_node_id"),
    scaffoldStepId: uuid("scaffold_step_id"),
    signalType: text("signal_type").notNull(),
    judgedOutcome: text("judged_outcome"),
    gradedScore: real("graded_score"),
    responseSource: text("response_source").notNull(),
    graderIdentity: text("grader_identity"),
    batchId: uuid("batch_id"),
    attemptSeq: integer("attempt_seq").notNull(),
    submittedAnswer: text("submitted_answer"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.learnerStateRef],
      foreignColumns: [user.id],
      name: "response_log_learner_state_ref_fkey",
    }),
    foreignKey({
      columns: [table.studyItemId],
      foreignColumns: [studyItems.studyItemId],
      name: "response_log_study_item_id_fkey",
    }),
    foreignKey({
      columns: [table.derivedNodeId],
      foreignColumns: [derivedGraphNodes.derivedNodeId],
      name: "response_log_derived_node_id_fkey",
    }),
    foreignKey({
      columns: [table.scaffoldStepId],
      foreignColumns: [learnerScaffoldSteps.scaffoldStepId],
      name: "response_log_scaffold_step_id_fkey",
    }),
    unique("response_log_learner_state_ref_attempt_seq_key").on(
      table.learnerStateRef,
      table.attemptSeq,
    ),
    check("response_log_signal_type_check", sql`signal_type IN ('graded')`),
    check(
      "response_log_judged_outcome_check",
      sql`judged_outcome IN ('correct', 'partial', 'incorrect')`,
    ),
    check("response_log_graded_score_check", sql`graded_score >= 0 AND graded_score <= 1`),
    check(
      "response_log_response_source_check",
      sql`response_source IN ('synthetic', 'human')`,
    ),
    check(
      "response_log_check",
      sql`signal_type = 'graded' AND judged_outcome IS NOT NULL AND graded_score IS NOT NULL`,
    ),
    check(
      "response_log_check1",
      sql`(
        study_item_id IS NOT NULL
        AND derived_node_id IS NOT NULL
        AND scaffold_step_id IS NULL
      ) OR (
        study_item_id IS NULL
        AND derived_node_id IS NULL
        AND scaffold_step_id IS NOT NULL
      )`,
    ),
  ],
);

export const recallChallenges = pgTable(
  "recall_challenges",
  {
    challengeId: uuid("challenge_id").primaryKey().notNull(),
    learnerStateRef: text("learner_state_ref").notNull(),
    enrichmentId: uuid("enrichment_id").notNull(),
    assetSetIdentity: text("asset_set_identity").notNull(),
    scopeKind: text("scope_kind").notNull(),
    scopeAnchorDerivedNodeId: uuid("scope_anchor_derived_node_id").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.learnerStateRef],
      foreignColumns: [user.id],
      name: "recall_challenges_learner_state_ref_fkey",
    }),
    foreignKey({
      columns: [table.enrichmentId],
      foreignColumns: [graphEnrichments.enrichmentId],
      name: "recall_challenges_enrichment_id_fkey",
    }),
    foreignKey({
      columns: [table.scopeAnchorDerivedNodeId],
      foreignColumns: [derivedGraphNodes.derivedNodeId],
      name: "recall_challenges_scope_anchor_derived_node_id_fkey",
    }),
    uniqueIndex("recall_challenges_one_active_per_scope")
      .on(
        table.learnerStateRef,
        table.enrichmentId,
        table.scopeKind,
        table.scopeAnchorDerivedNodeId,
      )
      .where(sql`status = 'active'`),
    index("recall_challenges_learner_enrichment_idx").on(
      table.learnerStateRef,
      table.enrichmentId,
      table.createdAt.desc().nullsFirst(),
    ),
    check("recall_challenges_scope_kind_check", sql`scope_kind IN ('section', 'enrichment')`),
    check("recall_challenges_status_check", sql`status IN ('active', 'won', 'abandoned')`),
  ],
);

export const recallChallengeLineup = pgTable(
  "recall_challenge_lineup",
  {
    challengeId: uuid("challenge_id").notNull(),
    lineupIndex: integer("lineup_index").notNull(),
    studyItemId: uuid("study_item_id").notNull(),
    derivedNodeId: uuid("derived_node_id").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.challengeId],
      foreignColumns: [recallChallenges.challengeId],
      name: "recall_challenge_lineup_challenge_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.studyItemId],
      foreignColumns: [studyItems.studyItemId],
      name: "recall_challenge_lineup_study_item_id_fkey",
    }),
    foreignKey({
      columns: [table.derivedNodeId],
      foreignColumns: [derivedGraphNodes.derivedNodeId],
      name: "recall_challenge_lineup_derived_node_id_fkey",
    }),
    primaryKey({
      columns: [table.challengeId, table.lineupIndex],
      name: "recall_challenge_lineup_pkey",
    }),
    unique("recall_challenge_lineup_challenge_id_study_item_id_key").on(
      table.challengeId,
      table.studyItemId,
    ),
    check("recall_challenge_lineup_lineup_index_check", sql`lineup_index >= 0`),
  ],
);

export const recallChallengeEvents = pgTable(
  "recall_challenge_events",
  {
    eventId: uuid("event_id").primaryKey().notNull(),
    challengeId: uuid("challenge_id").notNull(),
    seq: integer("seq").notNull(),
    kind: text("kind").notNull(),
    attemptRef: uuid("attempt_ref"),
    operationRef: uuid("operation_ref"),
    studyItemId: uuid("study_item_id"),
    promptId: text("prompt_id"),
    chosenId: text("chosen_id"),
    correct: boolean("correct"),
    recoveryPhase: boolean("recovery_phase"),
    responseDurationMs: integer("response_duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.challengeId],
      foreignColumns: [recallChallenges.challengeId],
      name: "recall_challenge_events_challenge_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.studyItemId],
      foreignColumns: [studyItems.studyItemId],
      name: "recall_challenge_events_study_item_id_fkey",
    }),
    unique("recall_challenge_events_challenge_id_seq_key").on(table.challengeId, table.seq),
    uniqueIndex("recall_challenge_events_attempt_idempotency")
      .on(table.challengeId, table.attemptRef)
      .where(sql`attempt_ref IS NOT NULL`),
    uniqueIndex("recall_challenge_events_operation_idempotency")
      .on(table.challengeId, table.operationRef)
      .where(sql`operation_ref IS NOT NULL`),
    check("recall_challenge_events_seq_check", sql`seq >= 1`),
    check(
      "recall_challenge_events_kind_check",
      sql`kind IN ('selection_answer', 'matching_pair', 'retreat', 'resume', 'abandon')`,
    ),
    check(
      "recall_challenge_events_response_duration_ms_check",
      sql`response_duration_ms IS NULL
        OR (response_duration_ms >= 0 AND response_duration_ms <= 3600000)`,
    ),
    check(
      "recall_challenge_events_check",
      sql`(
        kind IN ('selection_answer', 'matching_pair')
        AND attempt_ref IS NOT NULL
        AND operation_ref IS NULL
        AND study_item_id IS NOT NULL
        AND chosen_id IS NOT NULL
        AND correct IS NOT NULL
        AND recovery_phase IS NOT NULL
        AND (
          (kind = 'matching_pair' AND prompt_id IS NOT NULL)
          OR (kind = 'selection_answer' AND prompt_id IS NULL)
        )
      ) OR (
        kind IN ('retreat', 'resume', 'abandon')
        AND operation_ref IS NOT NULL
        AND attempt_ref IS NULL
        AND study_item_id IS NULL
        AND prompt_id IS NULL
        AND chosen_id IS NULL
        AND correct IS NULL
        AND recovery_phase IS NULL
        AND response_duration_ms IS NULL
      )`,
    ),
  ],
);
