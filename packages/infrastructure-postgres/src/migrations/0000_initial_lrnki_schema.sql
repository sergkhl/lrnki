CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"profile_complete" boolean DEFAULT false,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concept_admission_decisions" (
	"concept_admission_decision_id" uuid PRIMARY KEY NOT NULL,
	"concept_candidate_id" uuid NOT NULL,
	"model_tier" text NOT NULL,
	"tier" text NOT NULL,
	"proposed_canonical_label" text NOT NULL,
	"standalone_learning_objective" jsonb NOT NULL,
	"established_domain_meaning" jsonb NOT NULL,
	"definition_bearing_treatment" jsonb NOT NULL,
	"organizing_power" jsonb NOT NULL,
	"core_selected" boolean NOT NULL,
	"selection_reason_code" text NOT NULL,
	"reason_codes" jsonb NOT NULL,
	"boundary_reason_codes" jsonb NOT NULL,
	"confidence" real NOT NULL,
	CONSTRAINT "concept_admission_decisions_model_tier_check" CHECK (model_tier IN ('core', 'optional', 'reject', 'quarantine')),
	CONSTRAINT "concept_admission_decisions_tier_check" CHECK (tier IN ('core', 'optional', 'reject', 'quarantine')),
	CONSTRAINT "concept_admission_decisions_confidence_check" CHECK (confidence >= 0 AND confidence <= 1)
);
--> statement-breakpoint
CREATE TABLE "concept_candidate_mentions" (
	"concept_candidate_mention_id" uuid PRIMARY KEY NOT NULL,
	"concept_candidate_id" uuid NOT NULL,
	"source_block_id" uuid NOT NULL,
	"evidence_quote" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concept_candidates" (
	"concept_candidate_id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"candidate_key" text NOT NULL,
	"discovered_label" text NOT NULL,
	"canonical_label" text NOT NULL,
	"normalized_label" text NOT NULL,
	"aliases" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concept_candidates_run_id_candidate_key_key" UNIQUE("run_id","candidate_key")
);
--> statement-breakpoint
CREATE TABLE "extraction_runs" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"source_resource_id" uuid NOT NULL,
	"source_document_id" uuid NOT NULL,
	"pipeline_config_hash" text NOT NULL,
	"status" text NOT NULL,
	"degraded" boolean DEFAULT false NOT NULL,
	"latency_ms" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "extraction_runs_status_check" CHECK (status IN ('running', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "run_concept_evidence_profiles" (
	"run_concept_evidence_profile_id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"concept_candidate_id" uuid NOT NULL,
	"tier" text NOT NULL,
	"complete" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_concept_evidence_profiles_run_id_concept_candidate_id_key" UNIQUE("run_id","concept_candidate_id"),
	CONSTRAINT "run_concept_evidence_profiles_tier_check" CHECK (tier IN ('core', 'optional', 'reject', 'quarantine'))
);
--> statement-breakpoint
CREATE TABLE "run_evidence_passages" (
	"run_evidence_passage_id" uuid PRIMARY KEY NOT NULL,
	"run_concept_evidence_profile_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"source_block_id" uuid NOT NULL,
	"evidence_quote" text NOT NULL,
	"salience_rank" integer NOT NULL,
	CONSTRAINT "run_evidence_passages_kind_check" CHECK (kind IN ('definition', 'mention'))
);
--> statement-breakpoint
CREATE TABLE "run_optional_assertion_evidence" (
	"run_optional_assertion_evidence_id" uuid PRIMARY KEY NOT NULL,
	"run_optional_assertion_id" uuid NOT NULL,
	"source_block_id" uuid NOT NULL,
	"evidence_quote" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_optional_assertions" (
	"run_optional_assertion_id" uuid PRIMARY KEY NOT NULL,
	"run_concept_evidence_profile_id" uuid NOT NULL,
	"assertion_type" text NOT NULL,
	"literal_value" text,
	CONSTRAINT "run_optional_assertions_assertion_type_check" CHECK (assertion_type IN ('defines')),
	CONSTRAINT "run_optional_assertions_check" CHECK (assertion_type = 'defines' AND literal_value IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "source_blocks" (
	"source_block_id" uuid PRIMARY KEY NOT NULL,
	"source_document_id" uuid NOT NULL,
	"block_id" text NOT NULL,
	"block_type" text NOT NULL,
	"text" text NOT NULL,
	"heading_path" jsonb NOT NULL,
	"locator" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"source_document_id" uuid PRIMARY KEY NOT NULL,
	"source_resource_id" uuid NOT NULL,
	"parser_name" text NOT NULL,
	"parser_version" text NOT NULL,
	"parser_config_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_resources" (
	"source_resource_id" uuid PRIMARY KEY NOT NULL,
	"content_hash" text NOT NULL,
	"content_type" text NOT NULL,
	"object_key" text NOT NULL,
	"declared_domain" text NOT NULL,
	"title" text NOT NULL,
	"source_uri" text,
	"license" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_resources_content_hash_key" UNIQUE("content_hash")
);
--> statement-breakpoint
CREATE TABLE "artifact_versions" (
	"artifact_id" text PRIMARY KEY NOT NULL,
	"artifact_type" text NOT NULL,
	"run_id" uuid,
	"graph_version_id" uuid,
	"producer" text NOT NULL,
	"producer_version" text NOT NULL,
	"config_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concepts" (
	"concept_id" uuid PRIMARY KEY NOT NULL,
	"iri" text NOT NULL,
	"normalized_label" text NOT NULL,
	"declared_domain" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concepts_iri_key" UNIQUE("iri"),
	CONSTRAINT "concepts_normalized_label_declared_domain_key" UNIQUE("normalized_label","declared_domain")
);
--> statement-breakpoint
CREATE TABLE "graph_version_concept_aliases" (
	"graph_version_concept_alias_id" uuid PRIMARY KEY NOT NULL,
	"graph_version_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "graph_version_concept_aliases_graph_version_id_concept_id_l_key" UNIQUE("graph_version_id","concept_id","label")
);
--> statement-breakpoint
CREATE TABLE "graph_version_concept_evidence_profiles" (
	"graph_version_concept_evidence_profile_id" uuid PRIMARY KEY NOT NULL,
	"graph_version_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	CONSTRAINT "graph_version_concept_evidence__graph_version_id_concept_id_key" UNIQUE("graph_version_id","concept_id")
);
--> statement-breakpoint
CREATE TABLE "graph_version_concepts" (
	"graph_version_concept_id" uuid PRIMARY KEY NOT NULL,
	"graph_version_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"canonical_label" text NOT NULL,
	"trust_tier" text NOT NULL,
	"homograph" boolean DEFAULT false NOT NULL,
	CONSTRAINT "graph_version_concepts_graph_version_id_concept_id_key" UNIQUE("graph_version_id","concept_id")
);
--> statement-breakpoint
CREATE TABLE "graph_version_evidence_passages" (
	"graph_version_evidence_passage_id" uuid PRIMARY KEY NOT NULL,
	"graph_version_concept_evidence_profile_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"source_resource_id" uuid NOT NULL,
	"source_block_id" uuid NOT NULL,
	"evidence_quote" text NOT NULL,
	"heading_path" jsonb NOT NULL,
	"locator" jsonb NOT NULL,
	"salience_rank" integer NOT NULL,
	CONSTRAINT "graph_version_evidence_passages_kind_check" CHECK (kind IN ('definition', 'mention'))
);
--> statement-breakpoint
CREATE TABLE "graph_version_optional_assertions" (
	"graph_version_optional_assertion_id" uuid PRIMARY KEY NOT NULL,
	"graph_version_concept_evidence_profile_id" uuid NOT NULL,
	"assertion_type" text NOT NULL,
	"literal_value" text,
	CONSTRAINT "graph_version_optional_assertions_assertion_type_check" CHECK (assertion_type IN ('defines')),
	CONSTRAINT "graph_version_optional_assertions_check" CHECK (assertion_type = 'defines' AND literal_value IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "graph_version_optional_assertion_evidence" (
	"graph_version_optional_assertion_evidence_id" uuid PRIMARY KEY NOT NULL,
	"graph_version_optional_assertion_id" uuid NOT NULL,
	"source_resource_id" uuid NOT NULL,
	"source_block_id" uuid NOT NULL,
	"evidence_quote" text NOT NULL,
	"heading_path" jsonb NOT NULL,
	"locator" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graph_version_run_memberships" (
	"graph_version_run_membership_id" uuid PRIMARY KEY NOT NULL,
	"graph_version_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"source_resource_id" uuid NOT NULL,
	CONSTRAINT "graph_version_run_memberships_graph_version_id_run_id_key" UNIQUE("graph_version_id","run_id")
);
--> statement-breakpoint
CREATE TABLE "graph_versions" (
	"graph_version_id" uuid PRIMARY KEY NOT NULL,
	"base_graph_version_id" uuid,
	"status" text NOT NULL,
	"refinement_config_hash" text NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "graph_versions_status_check" CHECK (status IN ('building', 'published', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "refinement_decisions" (
	"refinement_decision_id" uuid PRIMARY KEY NOT NULL,
	"graph_version_id" uuid NOT NULL,
	"decision_type" text NOT NULL,
	"subject" jsonb NOT NULL,
	"outcome" text NOT NULL,
	"rationale" text NOT NULL,
	"provenance" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concept_difficulties" (
	"concept_difficulty_id" uuid PRIMARY KEY NOT NULL,
	"enrichment_id" uuid NOT NULL,
	"derived_node_id" uuid NOT NULL,
	"score" real NOT NULL,
	"method" text NOT NULL,
	"components" jsonb NOT NULL,
	"neural_rationale" text NOT NULL,
	CONSTRAINT "concept_difficulties_enrichment_id_derived_node_id_key" UNIQUE("enrichment_id","derived_node_id")
);
--> statement-breakpoint
CREATE TABLE "derived_graph_nodes" (
	"derived_node_id" uuid PRIMARY KEY NOT NULL,
	"enrichment_id" uuid NOT NULL,
	"node_kind" text NOT NULL,
	"concept_id" uuid,
	"grounding_origin" text NOT NULL,
	"role" text NOT NULL,
	"canonical_label" text NOT NULL,
	"normalized_label" text NOT NULL,
	"declared_domain" text NOT NULL,
	"aliases" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "derived_graph_nodes_enrichment_id_concept_id_key" UNIQUE("enrichment_id","concept_id"),
	CONSTRAINT "derived_graph_nodes_node_kind_check" CHECK (node_kind IN ('anchor', 'enrichment')),
	CONSTRAINT "derived_graph_nodes_grounding_origin_check" CHECK (grounding_origin IN ('document_anchored', 'source_mentioned', 'llm_grounded')),
	CONSTRAINT "derived_graph_nodes_role_check" CHECK (role IN ('anchor', 'prerequisite', 'synthetic_primary')),
	CONSTRAINT "derived_graph_nodes_check" CHECK ((
        node_kind = 'anchor'
        AND concept_id IS NOT NULL
        AND grounding_origin = 'document_anchored'
        AND role = 'anchor'
      ) OR (
        node_kind = 'enrichment'
        AND concept_id IS NULL
        AND grounding_origin IN ('source_mentioned', 'llm_grounded')
        AND role IN ('prerequisite', 'synthetic_primary')
      ))
);
--> statement-breakpoint
CREATE TABLE "derived_node_merges" (
	"derived_node_merge_id" uuid PRIMARY KEY NOT NULL,
	"enrichment_id" uuid NOT NULL,
	"declared_domain" text NOT NULL,
	"canonical_derived_node_id" uuid NOT NULL,
	"canonical_label" text NOT NULL,
	"canonical_node_kind" text NOT NULL,
	"absorbed_derived_node_id" uuid NOT NULL,
	"absorbed_label" text NOT NULL,
	"absorbed_aliases" jsonb NOT NULL,
	"absorbed_node_kind" text NOT NULL,
	"absorbed_evidence" jsonb NOT NULL,
	"proposing_signal" text NOT NULL,
	"proposing_score" real NOT NULL,
	"rationale" text NOT NULL,
	"canonical_selection_reason" text NOT NULL,
	CONSTRAINT "derived_node_merges_canonical_node_kind_check" CHECK (canonical_node_kind IN ('anchor', 'enrichment')),
	CONSTRAINT "derived_node_merges_absorbed_node_kind_check" CHECK (absorbed_node_kind IN ('anchor', 'enrichment')),
	CONSTRAINT "derived_node_merges_proposing_signal_check" CHECK (proposing_signal IN ('embedding_cosine')),
	CONSTRAINT "derived_node_merges_canonical_selection_reason_check" CHECK (canonical_selection_reason IN (
        'anchor_over_enrichment',
        'higher_evidence_count',
        'stable_id_tiebreak'
      )),
	CONSTRAINT "derived_node_merges_check" CHECK (canonical_derived_node_id <> absorbed_derived_node_id)
);
--> statement-breakpoint
CREATE TABLE "enrichment_grounding_bundles" (
	"enrichment_grounding_bundle_id" uuid PRIMARY KEY NOT NULL,
	"derived_node_id" uuid NOT NULL,
	"grounding_origin" text NOT NULL,
	"generating_model" text NOT NULL,
	"rationale" text NOT NULL,
	"bundle" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrichment_grounding_bundles_derived_node_id_key" UNIQUE("derived_node_id"),
	CONSTRAINT "enrichment_grounding_bundles_grounding_origin_check" CHECK (grounding_origin IN ('llm_grounded'))
);
--> statement-breakpoint
CREATE TABLE "enrichment_grounding_passages" (
	"enrichment_grounding_passage_id" uuid PRIMARY KEY NOT NULL,
	"derived_node_id" uuid NOT NULL,
	"passage_type" text NOT NULL,
	"grounding_origin" text NOT NULL,
	"source_resource_id" uuid,
	"source_block_id" uuid,
	"evidence_quote" text,
	"generated_text" text,
	"heading_path" jsonb NOT NULL,
	"locator" jsonb NOT NULL,
	"verbatim_check" jsonb NOT NULL,
	"salience_rank" integer NOT NULL,
	CONSTRAINT "enrichment_grounding_passages_passage_type_check" CHECK (passage_type IN ('definition', 'mention')),
	CONSTRAINT "enrichment_grounding_passages_grounding_origin_check" CHECK (grounding_origin IN ('source_mentioned', 'llm_grounded')),
	CONSTRAINT "enrichment_grounding_passages_check" CHECK ((
        grounding_origin = 'source_mentioned'
        AND source_resource_id IS NOT NULL
        AND source_block_id IS NOT NULL
        AND evidence_quote IS NOT NULL
        AND generated_text IS NULL
      ) OR (
        grounding_origin = 'llm_grounded'
        AND source_resource_id IS NULL
        AND source_block_id IS NULL
        AND evidence_quote IS NULL
        AND generated_text IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "graph_enrichments" (
	"enrichment_id" uuid PRIMARY KEY NOT NULL,
	"graph_version_id" uuid,
	"enrichment_config_hash" text NOT NULL,
	"status" text NOT NULL,
	"judge_model" text NOT NULL,
	"difficulty_method" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "graph_enrichments_status_check" CHECK (status IN ('running', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "inferred_prerequisite_edges" (
	"inferred_prerequisite_edge_id" uuid PRIMARY KEY NOT NULL,
	"enrichment_id" uuid NOT NULL,
	"predicate" text DEFAULT 'inferred-prerequisite-of' NOT NULL,
	"prerequisite_derived_node_id" uuid NOT NULL,
	"dependent_derived_node_id" uuid NOT NULL,
	"confidence" real NOT NULL,
	"uncertain" boolean DEFAULT false NOT NULL,
	"judge_model" text NOT NULL,
	"provenance" jsonb NOT NULL,
	CONSTRAINT "inferred_prerequisite_edges_enrichment_id_prerequisite_deri_key" UNIQUE("enrichment_id","prerequisite_derived_node_id","dependent_derived_node_id"),
	CONSTRAINT "inferred_prerequisite_edges_confidence_check" CHECK (confidence >= 0 AND confidence <= 1),
	CONSTRAINT "inferred_prerequisite_edges_check" CHECK (prerequisite_derived_node_id <> dependent_derived_node_id)
);
--> statement-breakpoint
CREATE TABLE "minting_dispositions" (
	"minting_disposition_id" uuid PRIMARY KEY NOT NULL,
	"enrichment_id" uuid NOT NULL,
	"derived_node_id" uuid NOT NULL,
	"proposed_label" text NOT NULL,
	"normalized_label" text NOT NULL,
	"declared_domain" text NOT NULL,
	"anchor_concept_id" uuid NOT NULL,
	"disposition" text NOT NULL,
	"rationale" text NOT NULL,
	CONSTRAINT "minting_dispositions_disposition_check" CHECK (disposition IN ('accepted', 'dropped', 'kept_judge_unavailable'))
);
--> statement-breakpoint
CREATE TABLE "rescue_dispositions" (
	"rescue_disposition_id" uuid PRIMARY KEY NOT NULL,
	"enrichment_id" uuid NOT NULL,
	"derived_node_id" uuid NOT NULL,
	"canonical_label" text NOT NULL,
	"normalized_label" text NOT NULL,
	"declared_domain" text NOT NULL,
	"disposition" text NOT NULL,
	"rationale" text NOT NULL,
	"grounding_span" text NOT NULL,
	CONSTRAINT "rescue_dispositions_disposition_check" CHECK (disposition IN ('accepted', 'dropped', 'kept_judge_unavailable'))
);
--> statement-breakpoint
CREATE TABLE "concept_lesson_section_citations" (
	"concept_lesson_section_citation_id" uuid PRIMARY KEY NOT NULL,
	"concept_lesson_section_id" uuid NOT NULL,
	"provenance" text NOT NULL,
	"source_resource_id" uuid,
	"source_block_id" uuid,
	"evidence_quote" text,
	"match_kind" text,
	"derived_node_id" uuid,
	"generated_passage_text" text,
	CONSTRAINT "concept_lesson_section_citations_concept_lesson_section_id_key" UNIQUE("concept_lesson_section_id"),
	CONSTRAINT "concept_lesson_section_citations_provenance_check" CHECK (provenance IN ('source', 'generated')),
	CONSTRAINT "concept_lesson_section_citations_match_kind_check" CHECK (match_kind IN ('exact', 'normalized')),
	CONSTRAINT "concept_lesson_section_citations_check" CHECK ((
        provenance = 'source'
        AND source_resource_id IS NOT NULL
        AND source_block_id IS NOT NULL
        AND evidence_quote IS NOT NULL
        AND match_kind IS NOT NULL
        AND derived_node_id IS NULL
        AND generated_passage_text IS NULL
      ) OR (
        provenance = 'generated'
        AND source_resource_id IS NULL
        AND source_block_id IS NULL
        AND evidence_quote IS NULL
        AND match_kind IS NULL
        AND derived_node_id IS NOT NULL
        AND generated_passage_text IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "concept_lesson_sections" (
	"concept_lesson_section_id" uuid PRIMARY KEY NOT NULL,
	"concept_lesson_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"kind" text NOT NULL,
	"body_text" text NOT NULL,
	"items" text[],
	"grounding_provenance" text NOT NULL,
	"diagram_caption" text,
	"diagram_spec" text,
	CONSTRAINT "concept_lesson_sections_concept_lesson_id_ordinal_key" UNIQUE("concept_lesson_id","ordinal"),
	CONSTRAINT "concept_lesson_sections_ordinal_check" CHECK (ordinal >= 0),
	CONSTRAINT "concept_lesson_sections_kind_check" CHECK (kind IN ('gist', 'intuition', 'definition', 'examples', 'applications', 'formulas')),
	CONSTRAINT "concept_lesson_sections_grounding_provenance_check" CHECK (grounding_provenance IN ('source_cep', 'source_mentioned', 'generated')),
	CONSTRAINT "concept_lesson_sections_check" CHECK ((diagram_caption IS NULL AND diagram_spec IS NULL)
        OR (diagram_caption IS NOT NULL AND diagram_spec IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "concept_lessons" (
	"concept_lesson_id" uuid PRIMARY KEY NOT NULL,
	"graph_version_id" uuid,
	"enrichment_id" uuid NOT NULL,
	"derived_node_id" uuid NOT NULL,
	"canonical_label" text NOT NULL,
	"explorable_terms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generating_model" text NOT NULL,
	"config_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	CONSTRAINT "concept_lessons_concept_lesson_id_derived_node_id_key" UNIQUE("concept_lesson_id","derived_node_id")
);
--> statement-breakpoint
CREATE TABLE "enrichment_layer_purposes" (
	"enrichment_id" uuid PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "impostor_statements" (
	"impostor_statement_id" uuid PRIMARY KEY NOT NULL,
	"study_item_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"statement_text" text NOT NULL,
	"is_impostor" boolean NOT NULL,
	"provenance" text NOT NULL,
	"source_resource_id" uuid,
	"source_block_id" uuid,
	"evidence_quote" text,
	"match_kind" text,
	"derived_node_id" uuid,
	"generated_passage_text" text,
	"reveal_text" text,
	"lie_source" text,
	"sibling_label" text,
	CONSTRAINT "impostor_statements_study_item_id_ordinal_key" UNIQUE("study_item_id","ordinal"),
	CONSTRAINT "impostor_statements_ordinal_check" CHECK (ordinal BETWEEN 0 AND 3),
	CONSTRAINT "impostor_statements_provenance_check" CHECK (provenance IN ('source', 'generated')),
	CONSTRAINT "impostor_statements_match_kind_check" CHECK (match_kind IN ('exact', 'normalized')),
	CONSTRAINT "impostor_statements_lie_source_check" CHECK (lie_source IN ('sibling', 'generated')),
	CONSTRAINT "impostor_statements_check" CHECK ((
        is_impostor = false
        AND provenance = 'source'
        AND source_resource_id IS NOT NULL
        AND source_block_id IS NOT NULL
        AND evidence_quote IS NOT NULL
        AND match_kind IS NOT NULL
        AND derived_node_id IS NULL
        AND generated_passage_text IS NULL
        AND reveal_text IS NULL
        AND lie_source IS NULL
        AND sibling_label IS NULL
      ) OR (
        is_impostor = false
        AND provenance = 'generated'
        AND source_resource_id IS NULL
        AND source_block_id IS NULL
        AND evidence_quote IS NULL
        AND match_kind IS NULL
        AND derived_node_id IS NOT NULL
        AND generated_passage_text IS NOT NULL
        AND reveal_text IS NULL
        AND lie_source IS NULL
        AND sibling_label IS NULL
      ) OR (
        is_impostor = true
        AND provenance = 'generated'
        AND source_resource_id IS NULL
        AND source_block_id IS NULL
        AND evidence_quote IS NULL
        AND match_kind IS NULL
        AND derived_node_id IS NULL
        AND generated_passage_text IS NULL
        AND reveal_text IS NOT NULL
        AND lie_source IS NOT NULL
        AND (sibling_label IS NOT NULL) = (lie_source = 'sibling')
      ))
);
--> statement-breakpoint
CREATE TABLE "lesson_absent_nodes" (
	"lesson_absent_node_id" uuid PRIMARY KEY NOT NULL,
	"graph_version_id" uuid,
	"enrichment_id" uuid NOT NULL,
	"derived_node_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"config_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_absent_nodes_derived_node_id_key" UNIQUE("derived_node_id")
);
--> statement-breakpoint
CREATE TABLE "matching_pairs" (
	"matching_pair_id" uuid PRIMARY KEY NOT NULL,
	"match_tile_id" uuid NOT NULL,
	"study_item_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"prompt_text" text NOT NULL,
	"match_text" text NOT NULL,
	"provenance" text NOT NULL,
	"source_resource_id" uuid,
	"source_block_id" uuid,
	"evidence_quote" text,
	"match_kind" text,
	"derived_node_id" uuid,
	"generated_passage_text" text,
	CONSTRAINT "matching_pairs_match_tile_id_key" UNIQUE("match_tile_id"),
	CONSTRAINT "matching_pairs_study_item_id_ordinal_key" UNIQUE("study_item_id","ordinal"),
	CONSTRAINT "matching_pairs_study_item_id_prompt_text_key" UNIQUE("study_item_id","prompt_text"),
	CONSTRAINT "matching_pairs_study_item_id_match_text_key" UNIQUE("study_item_id","match_text"),
	CONSTRAINT "matching_pairs_study_item_id_match_tile_id_key" UNIQUE("study_item_id","match_tile_id"),
	CONSTRAINT "matching_pairs_ordinal_check" CHECK (ordinal BETWEEN 0 AND 3),
	CONSTRAINT "matching_pairs_provenance_check" CHECK (provenance IN ('source', 'generated')),
	CONSTRAINT "matching_pairs_match_kind_check" CHECK (match_kind IN ('exact', 'normalized')),
	CONSTRAINT "matching_pairs_check" CHECK (btrim(prompt_text) <> ''
        AND btrim(match_text) <> ''
        AND lower(btrim(prompt_text)) <> lower(btrim(match_text))),
	CONSTRAINT "matching_pairs_check1" CHECK ((
        provenance = 'source'
        AND source_resource_id IS NOT NULL
        AND source_block_id IS NOT NULL
        AND evidence_quote IS NOT NULL
        AND match_kind IS NOT NULL
        AND derived_node_id IS NULL
        AND generated_passage_text IS NULL
      ) OR (
        provenance = 'generated'
        AND source_resource_id IS NULL
        AND source_block_id IS NULL
        AND evidence_quote IS NULL
        AND match_kind IS NULL
        AND derived_node_id IS NOT NULL
        AND generated_passage_text IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "rejected_study_items" (
	"rejected_study_item_id" uuid PRIMARY KEY NOT NULL,
	"graph_version_id" uuid,
	"enrichment_id" uuid NOT NULL,
	"derived_node_id" uuid NOT NULL,
	"item_type" text NOT NULL,
	"reason" text NOT NULL,
	"config_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rejected_study_items_derived_node_id_item_type_key" UNIQUE("derived_node_id","item_type"),
	CONSTRAINT "rejected_study_items_item_type_check" CHECK (item_type IN ('option_select', 'matching', 'impostor'))
);
--> statement-breakpoint
CREATE TABLE "study_item_citations" (
	"study_item_citation_id" uuid PRIMARY KEY NOT NULL,
	"study_item_id" uuid NOT NULL,
	"provenance" text NOT NULL,
	"source_resource_id" uuid,
	"source_block_id" uuid,
	"evidence_quote" text,
	"match_kind" text,
	"derived_node_id" uuid,
	"generated_passage_text" text,
	CONSTRAINT "study_item_citations_provenance_check" CHECK (provenance IN ('source', 'generated')),
	CONSTRAINT "study_item_citations_match_kind_check" CHECK (match_kind IN ('exact', 'normalized')),
	CONSTRAINT "study_item_citations_check" CHECK ((
        provenance = 'source'
        AND source_resource_id IS NOT NULL
        AND source_block_id IS NOT NULL
        AND evidence_quote IS NOT NULL
        AND match_kind IS NOT NULL
        AND derived_node_id IS NULL
        AND generated_passage_text IS NULL
      ) OR (
        provenance = 'generated'
        AND source_resource_id IS NULL
        AND source_block_id IS NULL
        AND evidence_quote IS NULL
        AND match_kind IS NULL
        AND derived_node_id IS NOT NULL
        AND generated_passage_text IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "study_item_options" (
	"option_id" uuid PRIMARY KEY NOT NULL,
	"study_item_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"option_text" text NOT NULL,
	"is_correct" boolean NOT NULL,
	"provenance" text NOT NULL,
	CONSTRAINT "study_item_options_study_item_id_ordinal_key" UNIQUE("study_item_id","ordinal"),
	CONSTRAINT "study_item_options_ordinal_check" CHECK (ordinal BETWEEN 0 AND 3),
	CONSTRAINT "study_item_options_provenance_check" CHECK (provenance IN ('source', 'generated'))
);
--> statement-breakpoint
CREATE TABLE "study_items" (
	"study_item_id" uuid PRIMARY KEY NOT NULL,
	"item_type" text NOT NULL,
	"graph_version_id" uuid,
	"enrichment_id" uuid NOT NULL,
	"derived_node_id" uuid NOT NULL,
	"grounding_provenance" text NOT NULL,
	"question" text NOT NULL,
	"explanation" text,
	"facet" text,
	"explorable_terms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generating_model" text NOT NULL,
	"config_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	CONSTRAINT "study_items_study_item_id_item_type_derived_node_id_key" UNIQUE("study_item_id","item_type","derived_node_id"),
	CONSTRAINT "study_items_item_type_check" CHECK (item_type IN ('option_select', 'matching', 'impostor')),
	CONSTRAINT "study_items_grounding_provenance_check" CHECK (grounding_provenance IN ('source_cep', 'source_mentioned', 'generated'))
);
--> statement-breakpoint
CREATE TABLE "calibration_verdicts" (
	"learner_state_ref" text NOT NULL,
	"derived_node_id" uuid NOT NULL,
	"verdict" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calibration_verdicts_pkey" PRIMARY KEY("learner_state_ref","derived_node_id"),
	CONSTRAINT "calibration_verdicts_verdict_check" CHECK (verdict IN ('known', 'learn'))
);
--> statement-breakpoint
CREATE TABLE "learner_awards" (
	"award_id" uuid PRIMARY KEY NOT NULL,
	"learner_ref" text NOT NULL,
	"award_type" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"context" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_awards_learner_ref_award_type_dedupe_key_key" UNIQUE("learner_ref","award_type","dedupe_key"),
	CONSTRAINT "learner_awards_award_type_check" CHECK (award_type IN ('weekly_podium'))
);
--> statement-breakpoint
CREATE TABLE "learner_expeditions" (
	"learner_expedition_id" uuid PRIMARY KEY NOT NULL,
	"learner_state_ref" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"declared_domain" text,
	"status" text NOT NULL,
	"current_operation_id" uuid,
	"current_operation_type" text,
	"enrichment_id" uuid,
	"active" boolean DEFAULT false NOT NULL,
	"failure_message" text,
	"generation_attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_expeditions_kind_check" CHECK (kind IN ('topic')),
	CONSTRAINT "learner_expeditions_status_check" CHECK (status IN ('generating', 'ready', 'failed')),
	CONSTRAINT "learner_expeditions_current_operation_type_check" CHECK (current_operation_type IN ('extraction', 'minting', 'enrichment', 'study_items')),
	CONSTRAINT "learner_expeditions_check" CHECK ((current_operation_id IS NULL AND current_operation_type IS NULL)
        OR (current_operation_id IS NOT NULL AND current_operation_type IS NOT NULL)),
	CONSTRAINT "learner_expeditions_check1" CHECK ((status = 'ready' AND enrichment_id IS NOT NULL AND declared_domain IS NOT NULL)
        OR status <> 'ready')
);
--> statement-breakpoint
CREATE TABLE "learner_scaffold_detours" (
	"detour_id" uuid PRIMARY KEY NOT NULL,
	"learner_state_ref" text NOT NULL,
	"enrichment_id" uuid NOT NULL,
	"parent_derived_node_id" uuid NOT NULL,
	"term" text NOT NULL,
	"normalized_term" text NOT NULL,
	"status" text NOT NULL,
	"latest_operation_id" uuid,
	"claim_token" uuid,
	"generation_attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_scaffold_detours_learner_state_ref_enrichment_id_pa_key" UNIQUE("learner_state_ref","enrichment_id","parent_derived_node_id","normalized_term"),
	CONSTRAINT "learner_scaffold_detours_status_check" CHECK (status IN ('generating', 'ready', 'failed', 'hidden'))
);
--> statement-breakpoint
CREATE TABLE "learner_scaffold_steps" (
	"scaffold_step_id" uuid PRIMARY KEY NOT NULL,
	"detour_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"kind" text NOT NULL,
	"referenced_derived_node_id" uuid,
	"referenced_concept_lesson_id" uuid,
	"referenced_study_item_id" uuid,
	"referenced_study_item_type" text GENERATED ALWAYS AS (CASE
        WHEN referenced_study_item_id IS NULL THEN NULL
        ELSE 'option_select'
      END) STORED,
	"payload" jsonb,
	"grounding_bundle" jsonb,
	"lesson_read_at" timestamp with time zone,
	CONSTRAINT "learner_scaffold_steps_detour_id_ordinal_key" UNIQUE("detour_id","ordinal"),
	CONSTRAINT "learner_scaffold_steps_ordinal_check" CHECK (ordinal >= 0),
	CONSTRAINT "learner_scaffold_steps_kind_check" CHECK (kind IN ('reference', 'generated')),
	CONSTRAINT "learner_scaffold_steps_check" CHECK ((
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
      ))
);
--> statement-breakpoint
CREATE TABLE "lesson_reads" (
	"learner_state_ref" text NOT NULL,
	"derived_node_id" uuid NOT NULL,
	"first_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_reads_pkey" PRIMARY KEY("learner_state_ref","derived_node_id")
);
--> statement-breakpoint
CREATE TABLE "recall_challenge_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"challenge_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"attempt_ref" uuid,
	"operation_ref" uuid,
	"study_item_id" uuid,
	"prompt_id" text,
	"chosen_id" text,
	"correct" boolean,
	"recovery_phase" boolean,
	"response_duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recall_challenge_events_challenge_id_seq_key" UNIQUE("challenge_id","seq"),
	CONSTRAINT "recall_challenge_events_seq_check" CHECK (seq >= 1),
	CONSTRAINT "recall_challenge_events_kind_check" CHECK (kind IN ('selection_answer', 'matching_pair', 'retreat', 'resume', 'abandon')),
	CONSTRAINT "recall_challenge_events_response_duration_ms_check" CHECK (response_duration_ms IS NULL
        OR (response_duration_ms >= 0 AND response_duration_ms <= 3600000)),
	CONSTRAINT "recall_challenge_events_check" CHECK ((
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
      ))
);
--> statement-breakpoint
CREATE TABLE "recall_challenge_lineup" (
	"challenge_id" uuid NOT NULL,
	"lineup_index" integer NOT NULL,
	"study_item_id" uuid NOT NULL,
	"derived_node_id" uuid NOT NULL,
	CONSTRAINT "recall_challenge_lineup_pkey" PRIMARY KEY("challenge_id","lineup_index"),
	CONSTRAINT "recall_challenge_lineup_challenge_id_study_item_id_key" UNIQUE("challenge_id","study_item_id"),
	CONSTRAINT "recall_challenge_lineup_lineup_index_check" CHECK (lineup_index >= 0)
);
--> statement-breakpoint
CREATE TABLE "recall_challenges" (
	"challenge_id" uuid PRIMARY KEY NOT NULL,
	"learner_state_ref" text NOT NULL,
	"enrichment_id" uuid NOT NULL,
	"scope_kind" text NOT NULL,
	"scope_anchor_derived_node_id" uuid NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recall_challenges_scope_kind_check" CHECK (scope_kind IN ('section', 'enrichment')),
	CONSTRAINT "recall_challenges_status_check" CHECK (status IN ('active', 'won', 'abandoned'))
);
--> statement-breakpoint
CREATE TABLE "response_log" (
	"response_id" uuid PRIMARY KEY NOT NULL,
	"learner_state_ref" text NOT NULL,
	"study_item_id" uuid,
	"derived_node_id" uuid,
	"scaffold_step_id" uuid,
	"signal_type" text NOT NULL,
	"judged_outcome" text,
	"graded_score" real,
	"response_source" text NOT NULL,
	"grader_identity" text,
	"batch_id" uuid,
	"attempt_seq" integer NOT NULL,
	"submitted_answer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "response_log_learner_state_ref_attempt_seq_key" UNIQUE("learner_state_ref","attempt_seq"),
	CONSTRAINT "response_log_signal_type_check" CHECK (signal_type IN ('graded')),
	CONSTRAINT "response_log_judged_outcome_check" CHECK (judged_outcome IN ('correct', 'partial', 'incorrect')),
	CONSTRAINT "response_log_graded_score_check" CHECK (graded_score >= 0 AND graded_score <= 1),
	CONSTRAINT "response_log_response_source_check" CHECK (response_source IN ('synthetic', 'human')),
	CONSTRAINT "response_log_check" CHECK (signal_type = 'graded' AND judged_outcome IS NOT NULL AND graded_score IS NOT NULL),
	CONSTRAINT "response_log_check1" CHECK ((
        study_item_id IS NOT NULL
        AND derived_node_id IS NOT NULL
        AND scaffold_step_id IS NULL
      ) OR (
        study_item_id IS NULL
        AND derived_node_id IS NULL
        AND scaffold_step_id IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "operation_run_stages" (
	"operation_run_stage_id" uuid PRIMARY KEY NOT NULL,
	"operation_run_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"ok" boolean,
	"progress_done" integer,
	"progress_total" integer,
	"error_detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "operation_runs" (
	"operation_run_id" uuid PRIMARY KEY NOT NULL,
	"operation_type" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"status" text NOT NULL,
	"current_stage" text,
	"progress_done" integer,
	"progress_total" integer,
	"last_progress_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"config_hash" text,
	CONSTRAINT "operation_runs_operation_type_operation_id_key" UNIQUE("operation_type","operation_id"),
	CONSTRAINT "operation_runs_operation_type_check" CHECK (operation_type IN ('extraction', 'canonicalization', 'minting', 'enrichment', 'study_items', 'scaffold')),
	CONSTRAINT "operation_runs_status_check" CHECK (status IN ('running', 'succeeded', 'failed')),
	CONSTRAINT "operation_runs_check" CHECK (operation_type NOT IN ('canonicalization', 'scaffold') OR config_hash IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_admission_decisions" ADD CONSTRAINT "concept_admission_decisions_concept_candidate_id_fkey" FOREIGN KEY ("concept_candidate_id") REFERENCES "public"."concept_candidates"("concept_candidate_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_candidate_mentions" ADD CONSTRAINT "concept_candidate_mentions_concept_candidate_id_fkey" FOREIGN KEY ("concept_candidate_id") REFERENCES "public"."concept_candidates"("concept_candidate_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_candidate_mentions" ADD CONSTRAINT "concept_candidate_mentions_source_block_id_fkey" FOREIGN KEY ("source_block_id") REFERENCES "public"."source_blocks"("source_block_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_candidates" ADD CONSTRAINT "concept_candidates_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."extraction_runs"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_runs" ADD CONSTRAINT "extraction_runs_source_resource_id_fkey" FOREIGN KEY ("source_resource_id") REFERENCES "public"."source_resources"("source_resource_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_runs" ADD CONSTRAINT "extraction_runs_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("source_document_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_concept_evidence_profiles" ADD CONSTRAINT "run_concept_evidence_profiles_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."extraction_runs"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_concept_evidence_profiles" ADD CONSTRAINT "run_concept_evidence_profiles_concept_candidate_id_fkey" FOREIGN KEY ("concept_candidate_id") REFERENCES "public"."concept_candidates"("concept_candidate_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_evidence_passages" ADD CONSTRAINT "run_evidence_passages_run_concept_evidence_profile_id_fkey" FOREIGN KEY ("run_concept_evidence_profile_id") REFERENCES "public"."run_concept_evidence_profiles"("run_concept_evidence_profile_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_evidence_passages" ADD CONSTRAINT "run_evidence_passages_source_block_id_fkey" FOREIGN KEY ("source_block_id") REFERENCES "public"."source_blocks"("source_block_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_optional_assertion_evidence" ADD CONSTRAINT "run_optional_assertion_evidence_run_optional_assertion_id_fkey" FOREIGN KEY ("run_optional_assertion_id") REFERENCES "public"."run_optional_assertions"("run_optional_assertion_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_optional_assertion_evidence" ADD CONSTRAINT "run_optional_assertion_evidence_source_block_id_fkey" FOREIGN KEY ("source_block_id") REFERENCES "public"."source_blocks"("source_block_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_optional_assertions" ADD CONSTRAINT "run_optional_assertions_run_concept_evidence_profile_id_fkey" FOREIGN KEY ("run_concept_evidence_profile_id") REFERENCES "public"."run_concept_evidence_profiles"("run_concept_evidence_profile_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_blocks" ADD CONSTRAINT "source_blocks_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("source_document_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_source_resource_id_fkey" FOREIGN KEY ("source_resource_id") REFERENCES "public"."source_resources"("source_resource_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_versions" ADD CONSTRAINT "artifact_versions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."extraction_runs"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_versions" ADD CONSTRAINT "artifact_versions_graph_version_id_fkey" FOREIGN KEY ("graph_version_id") REFERENCES "public"."graph_versions"("graph_version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_version_concept_aliases" ADD CONSTRAINT "graph_version_concept_aliases_graph_version_id_fkey" FOREIGN KEY ("graph_version_id") REFERENCES "public"."graph_versions"("graph_version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_version_concept_aliases" ADD CONSTRAINT "graph_version_concept_aliases_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("concept_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_version_concept_evidence_profiles" ADD CONSTRAINT "graph_version_concept_evidence_profiles_graph_version_id_fkey" FOREIGN KEY ("graph_version_id") REFERENCES "public"."graph_versions"("graph_version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_version_concept_evidence_profiles" ADD CONSTRAINT "graph_version_concept_evidence_profiles_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("concept_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_version_concepts" ADD CONSTRAINT "graph_version_concepts_graph_version_id_fkey" FOREIGN KEY ("graph_version_id") REFERENCES "public"."graph_versions"("graph_version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_version_concepts" ADD CONSTRAINT "graph_version_concepts_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("concept_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_version_evidence_passages" ADD CONSTRAINT "graph_version_evidence_passag_graph_version_concept_eviden_fkey" FOREIGN KEY ("graph_version_concept_evidence_profile_id") REFERENCES "public"."graph_version_concept_evidence_profiles"("graph_version_concept_evidence_profile_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_version_evidence_passages" ADD CONSTRAINT "graph_version_evidence_passages_source_resource_id_fkey" FOREIGN KEY ("source_resource_id") REFERENCES "public"."source_resources"("source_resource_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_version_evidence_passages" ADD CONSTRAINT "graph_version_evidence_passages_source_block_id_fkey" FOREIGN KEY ("source_block_id") REFERENCES "public"."source_blocks"("source_block_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_version_optional_assertions" ADD CONSTRAINT "graph_version_optional_assert_graph_version_concept_eviden_fkey" FOREIGN KEY ("graph_version_concept_evidence_profile_id") REFERENCES "public"."graph_version_concept_evidence_profiles"("graph_version_concept_evidence_profile_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_version_optional_assertion_evidence" ADD CONSTRAINT "graph_version_optional_assert_graph_version_optional_asser_fkey" FOREIGN KEY ("graph_version_optional_assertion_id") REFERENCES "public"."graph_version_optional_assertions"("graph_version_optional_assertion_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_version_optional_assertion_evidence" ADD CONSTRAINT "graph_version_optional_assertion_eviden_source_resource_id_fkey" FOREIGN KEY ("source_resource_id") REFERENCES "public"."source_resources"("source_resource_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_version_optional_assertion_evidence" ADD CONSTRAINT "graph_version_optional_assertion_evidence_source_block_id_fkey" FOREIGN KEY ("source_block_id") REFERENCES "public"."source_blocks"("source_block_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_version_run_memberships" ADD CONSTRAINT "graph_version_run_memberships_graph_version_id_fkey" FOREIGN KEY ("graph_version_id") REFERENCES "public"."graph_versions"("graph_version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_version_run_memberships" ADD CONSTRAINT "graph_version_run_memberships_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."extraction_runs"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_version_run_memberships" ADD CONSTRAINT "graph_version_run_memberships_source_resource_id_fkey" FOREIGN KEY ("source_resource_id") REFERENCES "public"."source_resources"("source_resource_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_versions" ADD CONSTRAINT "graph_versions_base_graph_version_id_fkey" FOREIGN KEY ("base_graph_version_id") REFERENCES "public"."graph_versions"("graph_version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refinement_decisions" ADD CONSTRAINT "refinement_decisions_graph_version_id_fkey" FOREIGN KEY ("graph_version_id") REFERENCES "public"."graph_versions"("graph_version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_difficulties" ADD CONSTRAINT "concept_difficulties_enrichment_id_fkey" FOREIGN KEY ("enrichment_id") REFERENCES "public"."graph_enrichments"("enrichment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_difficulties" ADD CONSTRAINT "concept_difficulties_derived_node_id_fkey" FOREIGN KEY ("derived_node_id") REFERENCES "public"."derived_graph_nodes"("derived_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_graph_nodes" ADD CONSTRAINT "derived_graph_nodes_enrichment_id_fkey" FOREIGN KEY ("enrichment_id") REFERENCES "public"."graph_enrichments"("enrichment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_graph_nodes" ADD CONSTRAINT "derived_graph_nodes_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("concept_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_node_merges" ADD CONSTRAINT "derived_node_merges_enrichment_id_fkey" FOREIGN KEY ("enrichment_id") REFERENCES "public"."graph_enrichments"("enrichment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_node_merges" ADD CONSTRAINT "derived_node_merges_canonical_derived_node_id_fkey" FOREIGN KEY ("canonical_derived_node_id") REFERENCES "public"."derived_graph_nodes"("derived_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment_grounding_bundles" ADD CONSTRAINT "enrichment_grounding_bundles_derived_node_id_fkey" FOREIGN KEY ("derived_node_id") REFERENCES "public"."derived_graph_nodes"("derived_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment_grounding_passages" ADD CONSTRAINT "enrichment_grounding_passages_derived_node_id_fkey" FOREIGN KEY ("derived_node_id") REFERENCES "public"."derived_graph_nodes"("derived_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment_grounding_passages" ADD CONSTRAINT "enrichment_grounding_passages_source_resource_id_fkey" FOREIGN KEY ("source_resource_id") REFERENCES "public"."source_resources"("source_resource_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment_grounding_passages" ADD CONSTRAINT "enrichment_grounding_passages_source_block_id_fkey" FOREIGN KEY ("source_block_id") REFERENCES "public"."source_blocks"("source_block_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_enrichments" ADD CONSTRAINT "graph_enrichments_graph_version_id_fkey" FOREIGN KEY ("graph_version_id") REFERENCES "public"."graph_versions"("graph_version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inferred_prerequisite_edges" ADD CONSTRAINT "inferred_prerequisite_edges_enrichment_id_fkey" FOREIGN KEY ("enrichment_id") REFERENCES "public"."graph_enrichments"("enrichment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inferred_prerequisite_edges" ADD CONSTRAINT "inferred_prerequisite_edges_prerequisite_derived_node_id_fkey" FOREIGN KEY ("prerequisite_derived_node_id") REFERENCES "public"."derived_graph_nodes"("derived_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inferred_prerequisite_edges" ADD CONSTRAINT "inferred_prerequisite_edges_dependent_derived_node_id_fkey" FOREIGN KEY ("dependent_derived_node_id") REFERENCES "public"."derived_graph_nodes"("derived_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minting_dispositions" ADD CONSTRAINT "minting_dispositions_enrichment_id_fkey" FOREIGN KEY ("enrichment_id") REFERENCES "public"."graph_enrichments"("enrichment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minting_dispositions" ADD CONSTRAINT "minting_dispositions_anchor_concept_id_fkey" FOREIGN KEY ("anchor_concept_id") REFERENCES "public"."concepts"("concept_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rescue_dispositions" ADD CONSTRAINT "rescue_dispositions_enrichment_id_fkey" FOREIGN KEY ("enrichment_id") REFERENCES "public"."graph_enrichments"("enrichment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_lesson_section_citations" ADD CONSTRAINT "concept_lesson_section_citations_concept_lesson_section_id_fkey" FOREIGN KEY ("concept_lesson_section_id") REFERENCES "public"."concept_lesson_sections"("concept_lesson_section_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_lesson_section_citations" ADD CONSTRAINT "concept_lesson_section_citations_source_resource_id_fkey" FOREIGN KEY ("source_resource_id") REFERENCES "public"."source_resources"("source_resource_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_lesson_section_citations" ADD CONSTRAINT "concept_lesson_section_citations_source_block_id_fkey" FOREIGN KEY ("source_block_id") REFERENCES "public"."source_blocks"("source_block_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_lesson_section_citations" ADD CONSTRAINT "concept_lesson_section_citations_derived_node_id_fkey" FOREIGN KEY ("derived_node_id") REFERENCES "public"."derived_graph_nodes"("derived_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_lesson_sections" ADD CONSTRAINT "concept_lesson_sections_concept_lesson_id_fkey" FOREIGN KEY ("concept_lesson_id") REFERENCES "public"."concept_lessons"("concept_lesson_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_lessons" ADD CONSTRAINT "concept_lessons_graph_version_id_fkey" FOREIGN KEY ("graph_version_id") REFERENCES "public"."graph_versions"("graph_version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_lessons" ADD CONSTRAINT "concept_lessons_enrichment_id_fkey" FOREIGN KEY ("enrichment_id") REFERENCES "public"."graph_enrichments"("enrichment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_lessons" ADD CONSTRAINT "concept_lessons_derived_node_id_fkey" FOREIGN KEY ("derived_node_id") REFERENCES "public"."derived_graph_nodes"("derived_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment_layer_purposes" ADD CONSTRAINT "enrichment_layer_purposes_enrichment_id_fkey" FOREIGN KEY ("enrichment_id") REFERENCES "public"."graph_enrichments"("enrichment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impostor_statements" ADD CONSTRAINT "impostor_statements_study_item_id_fkey" FOREIGN KEY ("study_item_id") REFERENCES "public"."study_items"("study_item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impostor_statements" ADD CONSTRAINT "impostor_statements_source_resource_id_fkey" FOREIGN KEY ("source_resource_id") REFERENCES "public"."source_resources"("source_resource_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impostor_statements" ADD CONSTRAINT "impostor_statements_source_block_id_fkey" FOREIGN KEY ("source_block_id") REFERENCES "public"."source_blocks"("source_block_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impostor_statements" ADD CONSTRAINT "impostor_statements_derived_node_id_fkey" FOREIGN KEY ("derived_node_id") REFERENCES "public"."derived_graph_nodes"("derived_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_absent_nodes" ADD CONSTRAINT "lesson_absent_nodes_graph_version_id_fkey" FOREIGN KEY ("graph_version_id") REFERENCES "public"."graph_versions"("graph_version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_absent_nodes" ADD CONSTRAINT "lesson_absent_nodes_enrichment_id_fkey" FOREIGN KEY ("enrichment_id") REFERENCES "public"."graph_enrichments"("enrichment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_absent_nodes" ADD CONSTRAINT "lesson_absent_nodes_derived_node_id_fkey" FOREIGN KEY ("derived_node_id") REFERENCES "public"."derived_graph_nodes"("derived_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matching_pairs" ADD CONSTRAINT "matching_pairs_study_item_id_fkey" FOREIGN KEY ("study_item_id") REFERENCES "public"."study_items"("study_item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matching_pairs" ADD CONSTRAINT "matching_pairs_source_resource_id_fkey" FOREIGN KEY ("source_resource_id") REFERENCES "public"."source_resources"("source_resource_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matching_pairs" ADD CONSTRAINT "matching_pairs_source_block_id_fkey" FOREIGN KEY ("source_block_id") REFERENCES "public"."source_blocks"("source_block_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matching_pairs" ADD CONSTRAINT "matching_pairs_derived_node_id_fkey" FOREIGN KEY ("derived_node_id") REFERENCES "public"."derived_graph_nodes"("derived_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejected_study_items" ADD CONSTRAINT "rejected_study_items_graph_version_id_fkey" FOREIGN KEY ("graph_version_id") REFERENCES "public"."graph_versions"("graph_version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejected_study_items" ADD CONSTRAINT "rejected_study_items_enrichment_id_fkey" FOREIGN KEY ("enrichment_id") REFERENCES "public"."graph_enrichments"("enrichment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejected_study_items" ADD CONSTRAINT "rejected_study_items_derived_node_id_fkey" FOREIGN KEY ("derived_node_id") REFERENCES "public"."derived_graph_nodes"("derived_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_item_citations" ADD CONSTRAINT "study_item_citations_study_item_id_fkey" FOREIGN KEY ("study_item_id") REFERENCES "public"."study_items"("study_item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_item_citations" ADD CONSTRAINT "study_item_citations_source_resource_id_fkey" FOREIGN KEY ("source_resource_id") REFERENCES "public"."source_resources"("source_resource_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_item_citations" ADD CONSTRAINT "study_item_citations_source_block_id_fkey" FOREIGN KEY ("source_block_id") REFERENCES "public"."source_blocks"("source_block_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_item_citations" ADD CONSTRAINT "study_item_citations_derived_node_id_fkey" FOREIGN KEY ("derived_node_id") REFERENCES "public"."derived_graph_nodes"("derived_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_item_options" ADD CONSTRAINT "study_item_options_study_item_id_fkey" FOREIGN KEY ("study_item_id") REFERENCES "public"."study_items"("study_item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_items" ADD CONSTRAINT "study_items_graph_version_id_fkey" FOREIGN KEY ("graph_version_id") REFERENCES "public"."graph_versions"("graph_version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_items" ADD CONSTRAINT "study_items_enrichment_id_fkey" FOREIGN KEY ("enrichment_id") REFERENCES "public"."graph_enrichments"("enrichment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_items" ADD CONSTRAINT "study_items_derived_node_id_fkey" FOREIGN KEY ("derived_node_id") REFERENCES "public"."derived_graph_nodes"("derived_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_verdicts" ADD CONSTRAINT "calibration_verdicts_learner_state_ref_fkey" FOREIGN KEY ("learner_state_ref") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_verdicts" ADD CONSTRAINT "calibration_verdicts_derived_node_id_fkey" FOREIGN KEY ("derived_node_id") REFERENCES "public"."derived_graph_nodes"("derived_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_awards" ADD CONSTRAINT "learner_awards_learner_ref_fkey" FOREIGN KEY ("learner_ref") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_expeditions" ADD CONSTRAINT "learner_expeditions_learner_state_ref_fkey" FOREIGN KEY ("learner_state_ref") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_expeditions" ADD CONSTRAINT "learner_expeditions_enrichment_id_fkey" FOREIGN KEY ("enrichment_id") REFERENCES "public"."graph_enrichments"("enrichment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_scaffold_detours" ADD CONSTRAINT "learner_scaffold_detours_learner_state_ref_fkey" FOREIGN KEY ("learner_state_ref") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_scaffold_detours" ADD CONSTRAINT "learner_scaffold_detours_enrichment_id_fkey" FOREIGN KEY ("enrichment_id") REFERENCES "public"."graph_enrichments"("enrichment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_scaffold_detours" ADD CONSTRAINT "learner_scaffold_detours_parent_derived_node_id_fkey" FOREIGN KEY ("parent_derived_node_id") REFERENCES "public"."derived_graph_nodes"("derived_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_scaffold_steps" ADD CONSTRAINT "learner_scaffold_steps_detour_id_fkey" FOREIGN KEY ("detour_id") REFERENCES "public"."learner_scaffold_detours"("detour_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_scaffold_steps" ADD CONSTRAINT "learner_scaffold_steps_referenced_derived_node_id_fkey" FOREIGN KEY ("referenced_derived_node_id") REFERENCES "public"."derived_graph_nodes"("derived_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_scaffold_steps" ADD CONSTRAINT "learner_scaffold_steps_referenced_concept_lesson_id_refere_fkey" FOREIGN KEY ("referenced_concept_lesson_id","referenced_derived_node_id") REFERENCES "public"."concept_lessons"("concept_lesson_id","derived_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_scaffold_steps" ADD CONSTRAINT "learner_scaffold_steps_referenced_study_item_id_referenced_fkey" FOREIGN KEY ("referenced_study_item_id","referenced_study_item_type","referenced_derived_node_id") REFERENCES "public"."study_items"("study_item_id","item_type","derived_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_reads" ADD CONSTRAINT "lesson_reads_learner_state_ref_fkey" FOREIGN KEY ("learner_state_ref") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_reads" ADD CONSTRAINT "lesson_reads_derived_node_id_fkey" FOREIGN KEY ("derived_node_id") REFERENCES "public"."derived_graph_nodes"("derived_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_challenge_events" ADD CONSTRAINT "recall_challenge_events_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."recall_challenges"("challenge_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_challenge_events" ADD CONSTRAINT "recall_challenge_events_study_item_id_fkey" FOREIGN KEY ("study_item_id") REFERENCES "public"."study_items"("study_item_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_challenge_lineup" ADD CONSTRAINT "recall_challenge_lineup_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."recall_challenges"("challenge_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_challenge_lineup" ADD CONSTRAINT "recall_challenge_lineup_study_item_id_fkey" FOREIGN KEY ("study_item_id") REFERENCES "public"."study_items"("study_item_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_challenge_lineup" ADD CONSTRAINT "recall_challenge_lineup_derived_node_id_fkey" FOREIGN KEY ("derived_node_id") REFERENCES "public"."derived_graph_nodes"("derived_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_challenges" ADD CONSTRAINT "recall_challenges_learner_state_ref_fkey" FOREIGN KEY ("learner_state_ref") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_challenges" ADD CONSTRAINT "recall_challenges_enrichment_id_fkey" FOREIGN KEY ("enrichment_id") REFERENCES "public"."graph_enrichments"("enrichment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_challenges" ADD CONSTRAINT "recall_challenges_scope_anchor_derived_node_id_fkey" FOREIGN KEY ("scope_anchor_derived_node_id") REFERENCES "public"."derived_graph_nodes"("derived_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_log" ADD CONSTRAINT "response_log_learner_state_ref_fkey" FOREIGN KEY ("learner_state_ref") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_log" ADD CONSTRAINT "response_log_study_item_id_fkey" FOREIGN KEY ("study_item_id") REFERENCES "public"."study_items"("study_item_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_log" ADD CONSTRAINT "response_log_derived_node_id_fkey" FOREIGN KEY ("derived_node_id") REFERENCES "public"."derived_graph_nodes"("derived_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_log" ADD CONSTRAINT "response_log_scaffold_step_id_fkey" FOREIGN KEY ("scaffold_step_id") REFERENCES "public"."learner_scaffold_steps"("scaffold_step_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_run_stages" ADD CONSTRAINT "operation_run_stages_operation_run_id_fkey" FOREIGN KEY ("operation_run_id") REFERENCES "public"."operation_runs"("operation_run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "concept_lessons_one_current_per_node" ON "concept_lessons" USING btree ("derived_node_id") WHERE superseded_at IS NULL;--> statement-breakpoint
CREATE INDEX "concept_lessons_enrichment_current_idx" ON "concept_lessons" USING btree ("enrichment_id") WHERE superseded_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "impostor_statements_one_impostor_per_item" ON "impostor_statements" USING btree ("study_item_id") WHERE is_impostor;--> statement-breakpoint
CREATE UNIQUE INDEX "study_item_options_one_correct_per_item" ON "study_item_options" USING btree ("study_item_id") WHERE is_correct;--> statement-breakpoint
CREATE UNIQUE INDEX "study_items_one_current_per_node_type" ON "study_items" USING btree ("derived_node_id","item_type") WHERE superseded_at IS NULL;--> statement-breakpoint
CREATE INDEX "study_items_enrichment_current_idx" ON "study_items" USING btree ("enrichment_id") WHERE superseded_at IS NULL;--> statement-breakpoint
CREATE INDEX "learner_awards_learner_idx" ON "learner_awards" USING btree ("learner_ref","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE UNIQUE INDEX "learner_expeditions_one_active_per_learner" ON "learner_expeditions" USING btree ("learner_state_ref") WHERE active;--> statement-breakpoint
CREATE UNIQUE INDEX "learner_expeditions_one_enrichment_per_learner" ON "learner_expeditions" USING btree ("learner_state_ref","enrichment_id") WHERE enrichment_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "learner_expeditions_learner_state_ref_idx" ON "learner_expeditions" USING btree ("learner_state_ref","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "learner_expeditions_enrichment_idx" ON "learner_expeditions" USING btree ("enrichment_id");--> statement-breakpoint
CREATE INDEX "learner_scaffold_detours_active_idx" ON "learner_scaffold_detours" USING btree ("learner_state_ref","enrichment_id") WHERE status <> 'hidden';--> statement-breakpoint
CREATE UNIQUE INDEX "recall_challenge_events_attempt_idempotency" ON "recall_challenge_events" USING btree ("challenge_id","attempt_ref") WHERE attempt_ref IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "recall_challenge_events_operation_idempotency" ON "recall_challenge_events" USING btree ("challenge_id","operation_ref") WHERE operation_ref IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "recall_challenges_one_active_per_scope" ON "recall_challenges" USING btree ("learner_state_ref","enrichment_id","scope_kind","scope_anchor_derived_node_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "recall_challenges_learner_enrichment_idx" ON "recall_challenges" USING btree ("learner_state_ref","enrichment_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "operation_run_stages_run_idx" ON "operation_run_stages" USING btree ("operation_run_id");--> statement-breakpoint
CREATE VIEW "public"."artifact_concept_lessons" AS (
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
);--> statement-breakpoint
CREATE VIEW "public"."artifact_derived_graph_nodes" AS (
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
);--> statement-breakpoint
CREATE VIEW "public"."artifact_graph_cep_assertions" AS (
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
);--> statement-breakpoint
CREATE VIEW "public"."artifact_graph_cep_profiles" AS (
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
);--> statement-breakpoint
CREATE VIEW "public"."artifact_graph_concepts" AS (
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
);--> statement-breakpoint
CREATE VIEW "public"."artifact_response_log" AS (
  SELECT response_id, learner_state_ref, study_item_id, derived_node_id, scaffold_step_id,
         signal_type, judged_outcome, graded_score, response_source, grader_identity,
         batch_id, attempt_seq, submitted_answer, created_at
  FROM response_log
);--> statement-breakpoint
CREATE VIEW "public"."artifact_run_candidates" AS (
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
);--> statement-breakpoint
CREATE VIEW "public"."artifact_run_evidence_profiles" AS (
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
);--> statement-breakpoint
CREATE VIEW "public"."artifact_study_items" AS (
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
);