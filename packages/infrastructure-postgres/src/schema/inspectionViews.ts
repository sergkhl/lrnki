import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  json,
  jsonb,
  numeric,
  pgView,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const artifactRunCandidates = pgView("artifact_run_candidates", {
  runId: uuid("run_id"),
  candidateKey: text("candidate_key"),
  discoveredLabel: text("discovered_label"),
  canonicalLabel: text("canonical_label"),
  aliases: jsonb("aliases"),
  mentionCount: integer("mention_count"),
  modelTier: text("model_tier"),
  tier: text("tier"),
  proposedCanonicalLabel: text("proposed_canonical_label"),
  standaloneLearningObjective: jsonb("standalone_learning_objective"),
  establishedDomainMeaning: jsonb("established_domain_meaning"),
  definitionBearingTreatment: jsonb("definition_bearing_treatment"),
  organizingPower: jsonb("organizing_power"),
  coreSelected: boolean("core_selected"),
  selectionReasonCode: text("selection_reason_code"),
  reasonCodes: jsonb("reason_codes"),
  boundaryReasonCodes: jsonb("boundary_reason_codes"),
  confidence: numeric("confidence"),
}).as(sql`
  SELECT a.run_id, c.candidate_key, c.discovered_label, c.canonical_label,
         c.aliases, c.mention_count, c.model_tier, c.tier,
         c.proposed_canonical_label, c.standalone_learning_objective,
         c.established_domain_meaning, c.definition_bearing_treatment,
         c.organizing_power, c.core_selected,
         c.selection_reason_code,
         c.reason_codes, c.boundary_reason_codes, c.confidence
  FROM artifact_versions a,
  JSON_TABLE(
    a.payload,
    '$.candidates[*]'
    COLUMNS (
      candidate_key text PATH '$.candidateKey',
      discovered_label text PATH '$.discoveredLabel',
      canonical_label text PATH '$.canonicalLabel',
      aliases jsonb PATH '$.aliases',
      mention_count integer PATH '$.mentions.size()',
      model_tier text PATH '$.admission.modelTier',
      tier text PATH '$.admission.tier',
      proposed_canonical_label text PATH '$.admission.proposedCanonicalLabel',
      standalone_learning_objective jsonb PATH '$.admission.standaloneLearningObjective',
      established_domain_meaning jsonb PATH '$.admission.establishedDomainMeaning',
      definition_bearing_treatment jsonb PATH '$.admission.definitionBearingTreatment',
      organizing_power jsonb PATH '$.admission.organizingPower',
      core_selected boolean PATH '$.admission.coreSelected',
      selection_reason_code text PATH '$.admission.selectionReasonCode',
      reason_codes jsonb PATH '$.admission.reasonCodes',
      boundary_reason_codes jsonb PATH '$.admission.boundaryReasonCodes',
      confidence numeric PATH '$.admission.confidence'
    )
  ) AS c
  WHERE a.artifact_type = 'extraction_run'
`);

export const artifactRunEvidenceProfiles = pgView("artifact_run_evidence_profiles", {
  runId: uuid("run_id"),
  candidateKey: text("candidate_key"),
  tier: text("tier"),
  complete: boolean("complete"),
  definitionCount: integer("definition_count"),
  mentionCount: integer("mention_count"),
  assertionCount: integer("assertion_count"),
}).as(sql`
  SELECT a.run_id, p.candidate_key, p.tier, p.complete,
         p.definition_count, p.mention_count, p.assertion_count
  FROM artifact_versions a,
  JSON_TABLE(
    a.payload,
    '$.evidenceProfiles[*]'
    COLUMNS (
      candidate_key text PATH '$.candidateKey',
      tier text PATH '$.tier',
      complete boolean PATH '$.complete',
      definition_count integer PATH '$.definitions.size()',
      mention_count integer PATH '$.mentions.size()',
      assertion_count integer PATH '$.assertions.size()'
    )
  ) AS p
  WHERE a.artifact_type = 'extraction_run'
`);

export const artifactGraphConcepts = pgView("artifact_graph_concepts", {
  graphVersionId: uuid("graph_version_id"),
  conceptId: text("concept_id"),
  iri: text("iri"),
  canonicalLabel: text("canonical_label"),
  normalizedLabel: text("normalized_label"),
  declaredDomain: text("declared_domain"),
  trustTier: text("trust_tier"),
  homograph: boolean("homograph"),
}).as(sql`
  SELECT a.graph_version_id, c.concept_id, c.iri, c.canonical_label,
         c.normalized_label, c.declared_domain, c.trust_tier, c.homograph
  FROM artifact_versions a,
  JSON_TABLE(
    a.payload,
    '$.concepts[*]'
    COLUMNS (
      concept_id text PATH '$.conceptId',
      iri text PATH '$.iri',
      canonical_label text PATH '$.canonicalLabel',
      normalized_label text PATH '$.normalizedLabel',
      declared_domain text PATH '$.declaredDomain',
      trust_tier text PATH '$.trustTier',
      homograph boolean PATH '$.homograph'
    )
  ) AS c
  WHERE a.artifact_type = 'graph_snapshot'
`);

export const artifactGraphCepProfiles = pgView("artifact_graph_cep_profiles", {
  graphVersionId: uuid("graph_version_id"),
  conceptId: text("concept_id"),
  definitionCount: integer("definition_count"),
  mentionCount: integer("mention_count"),
  assertionCount: integer("assertion_count"),
}).as(sql`
  SELECT a.graph_version_id, p.concept_id,
         p.definition_count, p.mention_count, p.assertion_count
  FROM artifact_versions a,
  JSON_TABLE(
    a.payload,
    '$.evidenceProfiles[*]'
    COLUMNS (
      concept_id text PATH '$.conceptId',
      definition_count integer PATH '$.definitions.size()',
      mention_count integer PATH '$.mentions.size()',
      assertion_count integer PATH '$.assertions.size()'
    )
  ) AS p
  WHERE a.artifact_type = 'graph_snapshot'
`);

export const artifactGraphCepAssertions = pgView("artifact_graph_cep_assertions", {
  graphVersionId: uuid("graph_version_id"),
  conceptId: text("concept_id"),
  assertionType: text("assertion_type"),
  literalValue: text("literal_value"),
}).as(sql`
  SELECT a.graph_version_id, t.concept_id, t.assertion_type,
         t.literal_value
  FROM artifact_versions a,
  JSON_TABLE(
    a.payload,
    '$.evidenceProfiles[*]'
    COLUMNS (
      concept_id text PATH '$.conceptId',
      NESTED PATH '$.assertions[*]' COLUMNS (
        assertion_type text PATH '$.type',
        literal_value text PATH '$.literalValue'
      )
    )
  ) AS t
  WHERE a.artifact_type = 'graph_snapshot' AND t.assertion_type IS NOT NULL
`);

export const artifactDerivedGraphNodes = pgView("artifact_derived_graph_nodes", {
  graphVersionId: uuid("graph_version_id"),
  enrichmentId: text("enrichment_id"),
  derivedNodeId: text("derived_node_id"),
  nodeKind: text("node_kind"),
  conceptId: text("concept_id"),
  groundingOrigin: text("grounding_origin"),
  role: text("role"),
  canonicalLabel: text("canonical_label"),
  normalizedLabel: text("normalized_label"),
  declaredDomain: text("declared_domain"),
}).as(sql`
  SELECT a.graph_version_id, a.payload->>'enrichmentId' AS enrichment_id,
         n.derived_node_id, n.node_kind, n.concept_id, n.grounding_origin,
         n.role, n.canonical_label, n.normalized_label, n.declared_domain
  FROM artifact_versions a,
  JSON_TABLE(
    a.payload,
    '$.derivedNodes[*]'
    COLUMNS (
      derived_node_id text PATH '$.derivedNodeId',
      node_kind text PATH '$.nodeKind',
      concept_id text PATH '$.conceptId',
      grounding_origin text PATH '$.groundingOrigin',
      role text PATH '$.role',
      canonical_label text PATH '$.canonicalLabel',
      normalized_label text PATH '$.normalizedLabel',
      declared_domain text PATH '$.declaredDomain'
    )
  ) AS n
  WHERE a.artifact_type = 'enrichment_run'
`);

export const artifactStudyItems = pgView("artifact_study_items", {
  graphVersionId: uuid("graph_version_id"),
  studyItemId: text("study_item_id"),
  itemType: text("item_type"),
  enrichmentId: text("enrichment_id"),
  derivedNodeId: text("derived_node_id"),
  groundingProvenance: text("grounding_provenance"),
  question: text("question"),
  facet: text("facet"),
  optionCount: integer("option_count"),
  pairCount: integer("pair_count"),
  statementCount: integer("statement_count"),
}).as(sql`
  SELECT a.graph_version_id, si.study_item_id, si.item_type, si.enrichment_id, si.derived_node_id,
         si.grounding_provenance, si.question, si.facet, si.option_count, si.pair_count, si.statement_count
  FROM artifact_versions a,
  JSON_TABLE(
    a.payload,
    '$.studyItems[*]'
    COLUMNS (
      study_item_id text PATH '$.studyItemId',
      item_type text PATH '$.itemType',
      enrichment_id text PATH '$.enrichmentId',
      derived_node_id text PATH '$.derivedNodeId',
      grounding_provenance text PATH '$.groundingProvenance',
      question text PATH '$.question',
      facet text PATH '$.facet',
      option_count integer PATH '$.options.size()',
      pair_count integer PATH '$.pairs.size()',
      statement_count integer PATH '$.statements.size()'
    )
  ) AS si
  WHERE a.artifact_type = 'study_item_bank'
`);

export const artifactConceptLessons = pgView("artifact_concept_lessons", {
  graphVersionId: uuid("graph_version_id"),
  conceptLessonId: text("concept_lesson_id"),
  derivedNodeId: text("derived_node_id"),
  enrichmentId: text("enrichment_id"),
  canonicalLabel: text("canonical_label"),
  sectionCount: integer("section_count"),
  sections: json("sections"),
}).as(sql`
  SELECT a.graph_version_id, cl.concept_lesson_id, cl.derived_node_id, cl.enrichment_id,
         cl.canonical_label, cl.section_count, cl.sections
  FROM artifact_versions a,
  JSON_TABLE(
    a.payload,
    '$.lessons[*]'
    COLUMNS (
      concept_lesson_id text PATH '$.conceptLessonId',
      derived_node_id text PATH '$.derivedNodeId',
      enrichment_id text PATH '$.enrichmentId',
      canonical_label text PATH '$.canonicalLabel',
      section_count integer PATH '$.sections.size()',
      sections json PATH '$.sections'
    )
  ) AS cl
  WHERE a.artifact_type = 'concept_lesson_bank'
`);

export const artifactResponseLog = pgView("artifact_response_log", {
  responseId: uuid("response_id"),
  learnerStateRef: text("learner_state_ref"),
  studyItemId: uuid("study_item_id"),
  derivedNodeId: uuid("derived_node_id"),
  scaffoldStepId: uuid("scaffold_step_id"),
  signalType: text("signal_type"),
  judgedOutcome: text("judged_outcome"),
  gradedScore: real("graded_score"),
  responseSource: text("response_source"),
  graderIdentity: text("grader_identity"),
  batchId: uuid("batch_id"),
  attemptSeq: integer("attempt_seq"),
  submittedAnswer: text("submitted_answer"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
}).as(sql`
  SELECT response_id, learner_state_ref, study_item_id, derived_node_id, scaffold_step_id,
         signal_type, judged_outcome, graded_score, response_source, grader_identity,
         batch_id, attempt_seq, submitted_answer, created_at
  FROM response_log
`);
