import type { ConceptIdentityResolutionOutcome, ExtractionQualityIssue, RunCandidate } from "@lrnki/domain-core";
import { CONCEPT_IDENTITY_DECISION_TYPE } from "@lrnki/domain-core";
import type {
  ConceptIdentityDecisionView,
  GraphVersionInspectionReadPort,
  ProfileAssertion,
  ProfilePassage,
  RunInspection,
  RunInspectionReadPort,
  RunProfile,
  RunSummary,
  SourceInspection,
  SourceInspectionReadPort,
  SourceSummary
} from "@lrnki/ports";
import type { Sql } from "postgres";

// Postgres-backed Inspection Read Model (ADR-0027). Serves the Admin Lab Run
// Inspector and Source Explorer (ADR-0011): pure read, no adaptation compute. One
// adapter satisfies both read ports. Candidate lists read the JSON_TABLE
// projection over the immutable extraction_run artifact envelope (ADR-0003);
// Concept Evidence Profiles (ADR-0007 reset) read the relational run-scoped CEP
// tables. Returns finished models or `undefined`-for-not-found only — real DB
// errors propagate to the caller (ADR-0027 decision 5).

// Counts a run's CEPs into the summary surface. Subqueries keep the list query a
// single round-trip; `definition`/`mention` are the only passage kinds (ADR-0007).
const runSummaryColumns = (sql: Sql) => sql`
  er.run_id, sr.title, sr.declared_domain, er.status, er.degraded, er.latency_ms, er.started_at,
  (SELECT count(*) FROM concept_candidates cc WHERE cc.run_id = er.run_id) AS candidate_count,
  (SELECT count(*) FROM concept_candidates cc JOIN concept_admission_decisions ad ON ad.concept_candidate_id = cc.concept_candidate_id
    WHERE cc.run_id = er.run_id AND ad.tier = 'core') AS core_count,
  (SELECT count(*) FROM run_concept_evidence_profiles p WHERE p.run_id = er.run_id) AS profile_count,
  (SELECT count(*) FROM run_concept_evidence_profiles p WHERE p.run_id = er.run_id AND p.complete) AS complete_profile_count,
  (SELECT count(*) FROM run_evidence_passages ep JOIN run_concept_evidence_profiles p ON p.run_concept_evidence_profile_id = ep.run_concept_evidence_profile_id
    WHERE p.run_id = er.run_id AND ep.kind = 'definition') AS definition_count,
  (SELECT count(*) FROM run_evidence_passages ep JOIN run_concept_evidence_profiles p ON p.run_concept_evidence_profile_id = ep.run_concept_evidence_profile_id
    WHERE p.run_id = er.run_id AND ep.kind = 'mention') AS mention_count,
  (SELECT count(*) FROM run_optional_assertions a JOIN run_concept_evidence_profiles p ON p.run_concept_evidence_profile_id = a.run_concept_evidence_profile_id
    WHERE p.run_id = er.run_id) AS assertion_count`;

type RunSummaryRow = {
  run_id: string; title: string; declared_domain: string; status: string; degraded: boolean; latency_ms: number | null; started_at: string;
  candidate_count: number; core_count: number; profile_count: number; complete_profile_count: number;
  definition_count: number; mention_count: number; assertion_count: number;
};

export class PostgresInspectionRead implements RunInspectionReadPort, SourceInspectionReadPort, GraphVersionInspectionReadPort {
  constructor(private readonly sql: Sql) {}

  // Identity-resolution decisions persisted with a published version (plan U4, R10).
  // Filters refinement_decisions to the identity decision type, so the unrelated
  // exact-label decisions (domain_scoped_merge, cross_domain_homograph_flag) never leak
  // into this view. Quarantine decisions never reach a published version (they fail the
  // build), but the mapper handles all three outcomes uniformly.
  async getConceptIdentityDecisions(graphVersionId: string): Promise<ConceptIdentityDecisionView[]> {
    const rows = await this.sql<IdentityDecisionRow[]>`
      SELECT outcome, rationale, subject, provenance
      FROM refinement_decisions
      WHERE graph_version_id = ${graphVersionId} AND decision_type = ${CONCEPT_IDENTITY_DECISION_TYPE}
      ORDER BY subject->>'declaredDomain', outcome`;
    return assembleIdentityDecisions(rows);
  }

  async getRunInspection(runId: string): Promise<RunInspection | undefined> {
    const sql = this.sql;
    const headers = await sql<(RunSummaryRow & { pipeline_config_hash: string })[]>`
      SELECT ${runSummaryColumns(sql)}, er.pipeline_config_hash
      FROM extraction_runs er
      JOIN source_resources sr ON sr.source_resource_id = er.source_resource_id
      WHERE er.run_id = ${runId}`;
    if (headers.length === 0) return undefined;
    const header = headers[0];

    // JSON_TABLE projection over the immutable run artifact (ADR-0003).
    const candidates = await sql<{
      candidate_key: string;
      discovered_label: string;
      canonical_label: string;
      aliases: string[];
      mention_count: number;
      model_tier: string;
      tier: string;
      proposed_canonical_label: string;
      standalone_learning_objective: RunCandidate["admission"]["standaloneLearningObjective"];
      established_domain_meaning: RunCandidate["admission"]["establishedDomainMeaning"];
      definition_bearing_treatment: RunCandidate["admission"]["definitionBearingTreatment"];
      organizing_power: RunCandidate["admission"]["organizingPower"];
      core_selected: boolean;
      selection_reason_code: string;
      reason_codes: string[];
      boundary_reason_codes: string[];
      confidence: number;
    }[]>`
      SELECT candidate_key, discovered_label, canonical_label, aliases, mention_count,
             model_tier, tier, proposed_canonical_label, standalone_learning_objective,
             established_domain_meaning, definition_bearing_treatment, organizing_power, core_selected,
             selection_reason_code, reason_codes,
             boundary_reason_codes, confidence
      FROM artifact_run_candidates WHERE run_id = ${runId}
      ORDER BY CASE tier WHEN 'core' THEN 0 WHEN 'quarantine' THEN 1 WHEN 'optional' THEN 2 ELSE 3 END, canonical_label`;

    const artifactRows = await sql<{ quality_issues: ExtractionQualityIssue[] | null }[]>`
      SELECT payload -> 'qualityIssues' AS quality_issues
      FROM artifact_versions
      WHERE run_id = ${runId} AND artifact_type = 'extraction_run'
      ORDER BY created_at DESC
      LIMIT 1`;

    // Concept Evidence Profiles: one CEP per admitted Concept (ADR-0007 reset).
    const profileRows = await sql<{ profile_id: string; candidate_key: string; canonical_label: string; tier: string; complete: boolean }[]>`
      SELECT p.run_concept_evidence_profile_id AS profile_id, cc.candidate_key, cc.canonical_label, p.tier, p.complete
      FROM run_concept_evidence_profiles p
      JOIN concept_candidates cc ON cc.concept_candidate_id = p.concept_candidate_id
      WHERE p.run_id = ${runId}
      ORDER BY p.complete DESC, CASE p.tier WHEN 'core' THEN 0 ELSE 1 END, cc.canonical_label`;
    const passageRows = await sql<{ profile_id: string; kind: string; source_block_id: string; heading_path: string[]; evidence_quote: string; salience_rank: number }[]>`
      SELECT ep.run_concept_evidence_profile_id AS profile_id, ep.kind, ep.source_block_id, sb.heading_path, ep.evidence_quote, ep.salience_rank
      FROM run_evidence_passages ep
      JOIN run_concept_evidence_profiles p ON p.run_concept_evidence_profile_id = ep.run_concept_evidence_profile_id
      JOIN source_blocks sb ON sb.source_block_id = ep.source_block_id
      WHERE p.run_id = ${runId}
      ORDER BY ep.kind, ep.salience_rank`;
    const assertionRows = await sql<{ assertion_id: string; profile_id: string; assertion_type: string; literal_value: string | null }[]>`
      SELECT a.run_optional_assertion_id AS assertion_id, a.run_concept_evidence_profile_id AS profile_id,
             a.assertion_type, a.literal_value
      FROM run_optional_assertions a
      JOIN run_concept_evidence_profiles p ON p.run_concept_evidence_profile_id = a.run_concept_evidence_profile_id
      WHERE p.run_id = ${runId}`;
    const assertionEvidenceRows = await sql<{ assertion_id: string; evidence_quote: string }[]>`
      SELECT ae.run_optional_assertion_id AS assertion_id, ae.evidence_quote
      FROM run_optional_assertion_evidence ae
      JOIN run_optional_assertions a ON a.run_optional_assertion_id = ae.run_optional_assertion_id
      JOIN run_concept_evidence_profiles p ON p.run_concept_evidence_profile_id = a.run_concept_evidence_profile_id
      WHERE p.run_id = ${runId}`;

    return {
      run: toRunSummary(header),
      pipelineConfigHash: header.pipeline_config_hash,
      candidates: candidates.map((row) => ({
        candidateKey: row.candidate_key,
        discoveredLabel: row.discovered_label,
        canonicalLabel: row.canonical_label,
        aliases: row.aliases,
        mentionCount: row.mention_count,
        modelTier: row.model_tier,
        tier: row.tier,
        proposedCanonicalLabel: row.proposed_canonical_label,
        standaloneLearningObjective: row.standalone_learning_objective,
        establishedDomainMeaning: row.established_domain_meaning,
        definitionBearingTreatment: row.definition_bearing_treatment,
        organizingPower: row.organizing_power,
        coreSelected: row.core_selected,
        selectionReasonCode: row.selection_reason_code,
        reasonCodes: row.reason_codes,
        boundaryReasonCodes: row.boundary_reason_codes,
        confidence: Number(row.confidence)
      })),
      qualityIssues: artifactRows[0]?.quality_issues ?? [],
      profiles: assembleProfiles(profileRows, passageRows, assertionRows, assertionEvidenceRows)
    };
  }

  async listSourceSummaries(): Promise<SourceSummary[]> {
    const sql = this.sql;
    const rows = await sql<{ source_resource_id: string; title: string; declared_domain: string; content_type: string; content_hash: string; block_count: number; run_count: number }[]>`
      SELECT sr.source_resource_id, sr.title, sr.declared_domain, sr.content_type, sr.content_hash,
        (SELECT count(*) FROM source_blocks sb JOIN source_documents sd ON sd.source_document_id = sb.source_document_id
          WHERE sd.source_resource_id = sr.source_resource_id) AS block_count,
        (SELECT count(*) FROM extraction_runs er WHERE er.source_resource_id = sr.source_resource_id) AS run_count
      FROM source_resources sr
      ORDER BY sr.created_at`;
    return rows.map((row) => ({
      sourceResourceId: row.source_resource_id,
      title: row.title,
      declaredDomain: row.declared_domain,
      contentType: row.content_type,
      contentHash: row.content_hash,
      blockCount: Number(row.block_count),
      runCount: Number(row.run_count)
    }));
  }

  async getSourceInspection(sourceResourceId: string): Promise<SourceInspection | undefined> {
    const sql = this.sql;
    const sources = await sql<{ source_resource_id: string; title: string; declared_domain: string; content_type: string; content_hash: string; run_count: number; source_document_id: string; parser_name: string; parser_version: string }[]>`
      SELECT sr.source_resource_id, sr.title, sr.declared_domain, sr.content_type, sr.content_hash,
        (SELECT count(*) FROM extraction_runs er WHERE er.source_resource_id = sr.source_resource_id) AS run_count,
        sd.source_document_id, sd.parser_name, sd.parser_version
      FROM source_resources sr
      JOIN source_documents sd ON sd.source_resource_id = sr.source_resource_id
      WHERE sr.source_resource_id = ${sourceResourceId}
      ORDER BY sd.created_at DESC LIMIT 1`;
    if (sources.length === 0) return undefined;
    const source = sources[0];
    const blocks = await sql<{ block_id: string; block_type: string; heading_path: string[]; text: string }[]>`
      SELECT block_id, block_type, heading_path, text
      FROM source_blocks WHERE source_document_id = ${source.source_document_id} ORDER BY block_id`;
    // This source's extraction runs, newest first — the Source Explorer is the one
    // door to run detail (the standalone run list was folded in here).
    const runs = await sql<{ run_id: string; status: string; degraded: boolean; latency_ms: number | null; started_at: string }[]>`
      SELECT run_id, status, degraded, latency_ms, started_at
      FROM extraction_runs WHERE source_resource_id = ${sourceResourceId}
      ORDER BY started_at DESC`;
    return {
      source: {
        sourceResourceId: source.source_resource_id,
        title: source.title,
        declaredDomain: source.declared_domain,
        contentType: source.content_type,
        contentHash: source.content_hash,
        blockCount: blocks.length,
        runCount: Number(source.run_count)
      },
      parserName: source.parser_name,
      parserVersion: source.parser_version,
      blocks: blocks.map((row) => ({ blockId: row.block_id, blockType: row.block_type, headingPath: row.heading_path, text: row.text })),
      runs: runs.map((row) => ({
        runId: row.run_id,
        status: row.status,
        degraded: row.degraded,
        latencyMs: row.latency_ms,
        startedAt: new Date(row.started_at).toISOString()
      }))
    };
  }
}

// Pure stitch of normalized CEP rows into the inspection view model. Exported so
// the row-shaping logic is unit-testable without a live database.
export function assembleProfiles(
  profileRows: { profile_id: string; candidate_key: string; canonical_label: string; tier: string; complete: boolean }[],
  passageRows: { profile_id: string; kind: string; source_block_id: string; heading_path: string[]; evidence_quote: string; salience_rank: number }[],
  assertionRows: { assertion_id: string; profile_id: string; assertion_type: string; literal_value: string | null }[],
  assertionEvidenceRows: { assertion_id: string; evidence_quote: string }[]
): RunProfile[] {
  const quotesByAssertion = new Map<string, string[]>();
  for (const row of assertionEvidenceRows) {
    quotesByAssertion.set(row.assertion_id, [...(quotesByAssertion.get(row.assertion_id) ?? []), row.evidence_quote]);
  }
  const assertionsByProfile = new Map<string, ProfileAssertion[]>();
  for (const row of assertionRows) {
    const target = row.literal_value ?? "";
    assertionsByProfile.set(row.profile_id, [
      ...(assertionsByProfile.get(row.profile_id) ?? []),
      { assertionType: row.assertion_type, target, evidenceQuotes: quotesByAssertion.get(row.assertion_id) ?? [] }
    ]);
  }
  const passagesByProfile = new Map<string, ProfilePassage[]>();
  for (const row of passageRows) {
    passagesByProfile.set(row.profile_id, [
      ...(passagesByProfile.get(row.profile_id) ?? []),
      {
        kind: row.kind === "definition" ? "definition" : "mention",
        sourceBlockId: row.source_block_id,
        headingPath: row.heading_path,
        evidenceQuote: row.evidence_quote,
        salienceRank: row.salience_rank
      }
    ]);
  }
  return profileRows.map((row) => {
    const passages = passagesByProfile.get(row.profile_id) ?? [];
    return {
      candidateKey: row.candidate_key,
      conceptLabel: row.canonical_label,
      tier: row.tier,
      complete: row.complete,
      definitions: passages.filter((passage) => passage.kind === "definition"),
      mentions: passages.filter((passage) => passage.kind === "mention"),
      assertions: assertionsByProfile.get(row.profile_id) ?? []
    };
  });
}

// The refinement_decisions row shape for an identity decision (KTD3): `subject`/
// `provenance` come back as parsed jsonb objects from the `postgres` driver.
type IdentityDecisionRow = {
  outcome: string;
  rationale: string;
  subject: {
    declaredDomain?: string;
    survivorNormalizedLabel?: string | null;
    members?: { normalizedLabel: string; canonicalLabel: string }[];
  } | null;
  provenance: { proposingScore?: number; decidingModel?: string } | null;
};

// Pure stitch of identity-decision rows into the inspection view (plan U4). Exported so
// the mapping is unit-testable without a live database, mirroring assembleProfiles. A
// `merge` names its survivor; `distinct`/`quarantine` carry a null survivor and list all
// members as the involved (absorbed/colliding) labels.
export function assembleIdentityDecisions(rows: IdentityDecisionRow[]): ConceptIdentityDecisionView[] {
  return rows.map((row) => {
    const subject = row.subject ?? {};
    const members = subject.members ?? [];
    const survivorNormalizedLabel = subject.survivorNormalizedLabel ?? null;
    const survivor = members.find((member) => member.normalizedLabel === survivorNormalizedLabel);
    return {
      outcome: row.outcome as ConceptIdentityResolutionOutcome,
      declaredDomain: subject.declaredDomain ?? "",
      survivorLabel: row.outcome === "merge" ? survivor?.canonicalLabel ?? null : null,
      absorbedLabels: members.filter((member) => member.normalizedLabel !== survivorNormalizedLabel).map((member) => member.canonicalLabel),
      proposingScore: Number(row.provenance?.proposingScore ?? 0),
      rationale: row.rationale,
      decidingModel: row.provenance?.decidingModel ?? ""
    };
  });
}

export function toRunSummary(row: RunSummaryRow): RunSummary {
  return {
    runId: row.run_id,
    sourceTitle: row.title,
    declaredDomain: row.declared_domain,
    status: row.status,
    degraded: row.degraded,
    latencyMs: row.latency_ms,
    startedAt: new Date(row.started_at).toISOString(),
    candidateCount: Number(row.candidate_count),
    coreCount: Number(row.core_count),
    profileCount: Number(row.profile_count),
    completeProfileCount: Number(row.complete_profile_count),
    definitionCount: Number(row.definition_count),
    mentionCount: Number(row.mention_count),
    assertionCount: Number(row.assertion_count)
  };
}
