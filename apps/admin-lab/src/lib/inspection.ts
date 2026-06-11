import { createDatabaseClient } from "@lrnki/infrastructure-postgres";

type Sql = ReturnType<typeof createDatabaseClient>;

// Server-only, read-only inspection loaders for the Admin Lab Run Inspector and
// Source Explorer (ADR-0011). Candidate and claim lists read the JSON_TABLE
// projections over the immutable extraction_run.v1 artifact envelopes
// (ADR-0003); evidence quotes and proposals read the relational run tables.

export interface RunSummary {
  runId: string;
  sourceTitle: string;
  declaredDomain: string;
  status: string;
  latencyMs: number | null;
  startedAt: string;
  candidateCount: number;
  coreCount: number;
  verifiedClaimCount: number;
  rejectedClaimCount: number;
  proposalCount: number;
}

export interface RunInspection {
  run: RunSummary;
  pipelineConfigHash: string;
  candidates: {
    candidateKey: string;
    canonicalLabel: string;
    aliases: string[];
    mentionCount: number;
    tier: string;
    reasonCodes: string[];
    confidence: number;
  }[];
  claims: {
    subjectLabel: string;
    predicate: string;
    objectLabel: string;
    validationOutcome: string;
    modelConfidence: number;
    evidenceQuotes: string[];
  }[];
  proposals: { proposedLabel: string; rationale: string; evidenceQuote: string | null }[];
}

export interface SourceSummary {
  sourceResourceId: string;
  title: string;
  declaredDomain: string;
  contentType: string;
  contentHash: string;
  blockCount: number;
  runCount: number;
}

export interface SourceInspection {
  source: SourceSummary;
  parserName: string;
  parserVersion: string;
  blocks: { blockId: string; blockType: string; headingPath: string[]; text: string }[];
}

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

export async function listRuns(): Promise<RunSummary[] | undefined> {
  return withClient(async (sql) => {
    const rows = await sql<{
      run_id: string; title: string; declared_domain: string; status: string; latency_ms: number | null; started_at: string;
      candidate_count: number; core_count: number; verified_claim_count: number; rejected_claim_count: number; proposal_count: number;
    }[]>`
      SELECT er.run_id, sr.title, sr.declared_domain, er.status, er.latency_ms, er.started_at,
        (SELECT count(*) FROM concept_candidates cc WHERE cc.run_id = er.run_id) AS candidate_count,
        (SELECT count(*) FROM concept_candidates cc JOIN concept_admission_decisions ad ON ad.concept_candidate_id = cc.concept_candidate_id
          WHERE cc.run_id = er.run_id AND ad.tier = 'core') AS core_count,
        (SELECT count(*) FROM run_claims rc WHERE rc.run_id = er.run_id AND rc.validation_outcome = 'verified') AS verified_claim_count,
        (SELECT count(*) FROM run_claims rc WHERE rc.run_id = er.run_id AND rc.validation_outcome = 'rejected') AS rejected_claim_count,
        (SELECT count(*) FROM missing_concept_proposals mp WHERE mp.run_id = er.run_id) AS proposal_count
      FROM extraction_runs er
      JOIN source_resources sr ON sr.source_resource_id = er.source_resource_id
      ORDER BY er.started_at DESC`;
    return rows.map(toRunSummary);
  });
}

export async function getRunInspection(runId: string): Promise<RunInspection | undefined> {
  return withClient(async (sql) => {
    const headers = await sql<{
      run_id: string; title: string; declared_domain: string; status: string; latency_ms: number | null; started_at: string;
      pipeline_config_hash: string;
      candidate_count: number; core_count: number; verified_claim_count: number; rejected_claim_count: number; proposal_count: number;
    }[]>`
      SELECT er.run_id, sr.title, sr.declared_domain, er.status, er.latency_ms, er.started_at, er.pipeline_config_hash,
        (SELECT count(*) FROM concept_candidates cc WHERE cc.run_id = er.run_id) AS candidate_count,
        (SELECT count(*) FROM concept_candidates cc JOIN concept_admission_decisions ad ON ad.concept_candidate_id = cc.concept_candidate_id
          WHERE cc.run_id = er.run_id AND ad.tier = 'core') AS core_count,
        (SELECT count(*) FROM run_claims rc WHERE rc.run_id = er.run_id AND rc.validation_outcome = 'verified') AS verified_claim_count,
        (SELECT count(*) FROM run_claims rc WHERE rc.run_id = er.run_id AND rc.validation_outcome = 'rejected') AS rejected_claim_count,
        (SELECT count(*) FROM missing_concept_proposals mp WHERE mp.run_id = er.run_id) AS proposal_count
      FROM extraction_runs er
      JOIN source_resources sr ON sr.source_resource_id = er.source_resource_id
      WHERE er.run_id = ${runId}`;
    if (headers.length === 0) return undefined;
    const header = headers[0];

    // JSON_TABLE projection over the immutable run artifact (ADR-0003).
    const candidates = await sql<{ candidate_key: string; canonical_label: string; aliases: string[]; mention_count: number; tier: string; reason_codes: string[]; confidence: number }[]>`
      SELECT candidate_key, canonical_label, aliases, mention_count, tier, reason_codes, confidence
      FROM artifact_run_candidates WHERE run_id = ${runId}
      ORDER BY CASE tier WHEN 'core' THEN 0 WHEN 'quarantine' THEN 1 WHEN 'optional' THEN 2 ELSE 3 END, canonical_label`;

    const claims = await sql<{ run_claim_id: string; subject_label: string; predicate: string; object_kind: string; object_label: string | null; object_literal: { value: string } | null; validation_outcome: string; model_confidence: number }[]>`
      SELECT rc.run_claim_id, subj.canonical_label AS subject_label, rc.predicate, rc.object_kind,
             obj.canonical_label AS object_label, rc.object_literal, rc.validation_outcome, rc.model_confidence
      FROM run_claims rc
      JOIN concept_candidates subj ON subj.concept_candidate_id = rc.subject_candidate_id
      LEFT JOIN concept_candidates obj ON obj.concept_candidate_id = rc.object_candidate_id
      WHERE rc.run_id = ${runId}
      ORDER BY rc.validation_outcome DESC, subj.canonical_label, rc.predicate`;
    const evidence = await sql<{ run_claim_id: string; evidence_quote: string }[]>`
      SELECT rce.run_claim_id, rce.evidence_quote
      FROM run_claim_evidence rce
      JOIN run_claims rc ON rc.run_claim_id = rce.run_claim_id
      WHERE rc.run_id = ${runId}`;
    const quotesByClaim = new Map<string, string[]>();
    for (const row of evidence) quotesByClaim.set(row.run_claim_id, [...(quotesByClaim.get(row.run_claim_id) ?? []), row.evidence_quote]);

    const proposals = await sql<{ proposed_label: string; rationale: string; evidence_quote: string | null }[]>`
      SELECT proposed_label, rationale, evidence_quote FROM missing_concept_proposals WHERE run_id = ${runId} ORDER BY proposed_label`;

    return {
      run: toRunSummary(header),
      pipelineConfigHash: header.pipeline_config_hash,
      candidates: candidates.map((row) => ({
        candidateKey: row.candidate_key,
        canonicalLabel: row.canonical_label,
        aliases: row.aliases,
        mentionCount: row.mention_count,
        tier: row.tier,
        reasonCodes: row.reason_codes,
        confidence: Number(row.confidence)
      })),
      claims: claims.map((row) => ({
        subjectLabel: row.subject_label,
        predicate: row.predicate,
        objectLabel: row.object_kind === "concept" ? row.object_label ?? "?" : `"${row.object_literal?.value ?? ""}"`,
        validationOutcome: row.validation_outcome,
        modelConfidence: Number(row.model_confidence),
        evidenceQuotes: quotesByClaim.get(row.run_claim_id) ?? []
      })),
      proposals: proposals.map((row) => ({ proposedLabel: row.proposed_label, rationale: row.rationale, evidenceQuote: row.evidence_quote }))
    };
  });
}

export async function listSourcesWithStats(): Promise<SourceSummary[] | undefined> {
  return withClient(async (sql) => {
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
  });
}

export async function getSourceInspection(sourceResourceId: string): Promise<SourceInspection | undefined> {
  return withClient(async (sql) => {
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
      blocks: blocks.map((row) => ({ blockId: row.block_id, blockType: row.block_type, headingPath: row.heading_path, text: row.text }))
    };
  });
}

function toRunSummary(row: {
  run_id: string; title: string; declared_domain: string; status: string; latency_ms: number | null; started_at: string;
  candidate_count: number; core_count: number; verified_claim_count: number; rejected_claim_count: number; proposal_count: number;
}): RunSummary {
  return {
    runId: row.run_id,
    sourceTitle: row.title,
    declaredDomain: row.declared_domain,
    status: row.status,
    latencyMs: row.latency_ms,
    startedAt: new Date(row.started_at).toISOString(),
    candidateCount: Number(row.candidate_count),
    coreCount: Number(row.core_count),
    verifiedClaimCount: Number(row.verified_claim_count),
    rejectedClaimCount: Number(row.rejected_claim_count),
    proposalCount: Number(row.proposal_count)
  };
}
