import { randomUUID } from "node:crypto";
import type {
  ExtractionRunResult,
  GraphSnapshot,
  PublishedConceptIdentity,
  RefinementDecisionRecord,
  RunForBuild,
  SourceBlock,
  StructuredDocument
} from "@lrnki/domain-core";
import type {
  ExtractionRunStorePort,
  GraphVersionStorePort,
  SourceRegistrationStorePort
} from "@lrnki/ports";
import type { Sql } from "postgres";

// Postgres-backed implementations of the kernel store ports. Authoritative state
// is relational; immutable artifacts live in artifact_versions as JSONB (ADR-0003).

export class PostgresSourceRegistrationStore implements SourceRegistrationStorePort {
  constructor(private readonly sql: Sql) {}

  async findByContentHash(contentHash: string) {
    const rows = await this.sql<{ source_resource_id: string; source_document_id: string }[]>`
      SELECT sr.source_resource_id, sd.source_document_id
      FROM source_resources sr
      JOIN source_documents sd ON sd.source_resource_id = sr.source_resource_id
      WHERE sr.content_hash = ${contentHash}
      ORDER BY sd.created_at DESC
      LIMIT 1`;
    if (rows.length === 0) return undefined;
    return { sourceResourceId: rows[0].source_resource_id, sourceDocumentId: rows[0].source_document_id };
  }

  async register(input: {
    contentHash: string;
    contentType: string;
    objectKey: string;
    declaredDomain: string;
    title: string;
    sourceUri?: string;
    license?: string;
    document: StructuredDocument;
  }) {
    const sourceResourceId = randomUUID();
    const sourceDocumentId = randomUUID();
    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO source_resources (source_resource_id, content_hash, content_type, object_key, declared_domain, title, source_uri, license)
        VALUES (${sourceResourceId}, ${input.contentHash}, ${input.contentType}, ${input.objectKey}, ${input.declaredDomain}, ${input.title}, ${input.sourceUri ?? null}, ${input.license ?? null})`;
      await tx`
        INSERT INTO source_documents (source_document_id, source_resource_id, parser_name, parser_version, parser_config_hash)
        VALUES (${sourceDocumentId}, ${sourceResourceId}, ${input.document.parserName}, ${input.document.parserVersion}, ${input.document.parserConfigHash})`;
      for (const block of input.document.blocks) {
        await tx`
          INSERT INTO source_blocks (source_block_id, source_document_id, block_id, block_type, text, heading_path, locator)
          VALUES (${randomUUID()}, ${sourceDocumentId}, ${block.blockId}, ${block.blockType}, ${block.text}, ${tx.json(block.headingPath)}, ${tx.json(block.locator)})`;
      }
    });
    return { sourceResourceId, sourceDocumentId };
  }

  async getRegisteredSource(sourceResourceId: string) {
    const docRows = await this.sql<{ source_document_id: string; parser_name: string; parser_version: string; parser_config_hash: string; declared_domain: string }[]>`
      SELECT sd.source_document_id, sd.parser_name, sd.parser_version, sd.parser_config_hash, sr.declared_domain
      FROM source_documents sd
      JOIN source_resources sr ON sr.source_resource_id = sd.source_resource_id
      WHERE sd.source_resource_id = ${sourceResourceId}
      ORDER BY sd.created_at DESC
      LIMIT 1`;
    if (docRows.length === 0) return undefined;
    const doc = docRows[0];
    const blockRows = await this.sql<{ block_id: string; block_type: string; text: string; heading_path: string[]; locator: SourceBlock["locator"] }[]>`
      SELECT block_id, block_type, text, heading_path, locator
      FROM source_blocks WHERE source_document_id = ${doc.source_document_id} ORDER BY block_id`;
    const document: StructuredDocument = {
      sourceResourceId,
      parserName: doc.parser_name,
      parserVersion: doc.parser_version,
      parserConfigHash: doc.parser_config_hash,
      blocks: blockRows.map((row) => ({
        blockId: row.block_id,
        blockType: row.block_type as SourceBlock["blockType"],
        text: row.text,
        headingPath: row.heading_path,
        locator: row.locator
      }))
    };
    return { sourceResourceId, sourceDocumentId: doc.source_document_id, declaredDomain: doc.declared_domain, document };
  }

  async listSources() {
    const rows = await this.sql<{ source_resource_id: string; title: string; declared_domain: string; content_type: string }[]>`
      SELECT source_resource_id, title, declared_domain, content_type FROM source_resources ORDER BY created_at`;
    return rows.map((row) => ({ sourceResourceId: row.source_resource_id, title: row.title, declaredDomain: row.declared_domain, contentType: row.content_type }));
  }
}

export class PostgresExtractionRunStore implements ExtractionRunStorePort {
  constructor(private readonly sql: Sql) {}

  async persist(result: ExtractionRunResult): Promise<void> {
    await this.sql.begin(async (tx) => {
      // blockId (parser-local) -> source_block_id (uuid) for this run's document.
      const blockRows = await tx<{ block_id: string; source_block_id: string }[]>`
        SELECT block_id, source_block_id FROM source_blocks WHERE source_document_id = ${result.sourceDocumentId}`;
      const blockMap = new Map(blockRows.map((row) => [row.block_id, row.source_block_id] as const));
      const resolveBlock = (blockId: string) => {
        const id = blockMap.get(blockId);
        if (!id) throw new Error(`Run ${result.runId} references unknown blockId ${blockId}.`);
        return id;
      };
      // Optional resolution for model-supplied references that may be placeholders.
      const resolveBlockOptional = (blockId: string) => blockMap.get(blockId) ?? null;

      await tx`
        INSERT INTO extraction_runs (run_id, source_resource_id, source_document_id, pipeline_config_hash, status, cost_usd, latency_ms, completed_at)
        VALUES (${result.runId}, ${result.sourceResourceId}, ${result.sourceDocumentId}, ${result.pipelineConfigHash}, 'succeeded', ${result.costUsd ?? null}, ${result.latencyMs ?? null}, now())`;

      const candidateIdByKey = new Map<string, string>();
      for (const candidate of result.candidates) {
        const candidateId = randomUUID();
        candidateIdByKey.set(candidate.candidateKey, candidateId);
        await tx`
          INSERT INTO concept_candidates (concept_candidate_id, run_id, candidate_key, canonical_label, normalized_label, aliases)
          VALUES (${candidateId}, ${result.runId}, ${candidate.candidateKey}, ${candidate.canonicalLabel}, ${candidate.normalizedLabel}, ${tx.json(candidate.aliases)})`;
        for (const mention of candidate.mentions) {
          await tx`
            INSERT INTO concept_candidate_mentions (concept_candidate_mention_id, concept_candidate_id, source_block_id, evidence_quote)
            VALUES (${randomUUID()}, ${candidateId}, ${resolveBlock(mention.blockId)}, ${mention.evidenceQuote})`;
        }
        const admission = candidate.admission;
        await tx`
          INSERT INTO concept_admission_decisions (concept_admission_decision_id, concept_candidate_id, tier, independently_meaningful, independently_teachable, durable_beyond_source, reason_codes, confidence)
          VALUES (${randomUUID()}, ${candidateId}, ${admission.tier}, ${admission.independentlyMeaningful}, ${admission.independentlyTeachable}, ${admission.durableBeyondSource}, ${tx.json(admission.reasonCodes)}, ${admission.confidence})`;
      }

      for (const claim of result.claims) {
        const subjectId = candidateIdByKey.get(claim.subjectCandidateKey);
        if (!subjectId) continue;
        const objectCandidateId = claim.object.kind === "concept" ? candidateIdByKey.get(claim.object.candidateKey) ?? null : null;
        if (claim.object.kind === "concept" && !objectCandidateId) continue;
        const runClaimId = randomUUID();
        await tx`
          INSERT INTO run_claims (run_claim_id, run_id, subject_candidate_id, predicate, object_kind, object_candidate_id, object_literal, model_confidence, evidence_count, validation_outcome)
          VALUES (${runClaimId}, ${result.runId}, ${subjectId}, ${claim.predicate}, ${claim.object.kind}, ${objectCandidateId}, ${claim.object.kind === "literal" ? tx.json({ value: claim.object.value }) : null}, ${claim.modelConfidence}, ${claim.evidenceCount}, ${claim.validationOutcome})`;
        for (const evidence of claim.evidence) {
          await tx`
            INSERT INTO run_claim_evidence (run_claim_evidence_id, run_claim_id, source_block_id, evidence_quote)
            VALUES (${randomUUID()}, ${runClaimId}, ${resolveBlock(evidence.blockId)}, ${evidence.evidenceQuote})`;
        }
      }

      for (const proposal of result.proposals) {
        const proposalBlockId = proposal.evidence ? resolveBlockOptional(proposal.evidence.blockId) : null;
        await tx`
          INSERT INTO missing_concept_proposals (missing_concept_proposal_id, run_id, proposed_label, rationale, source_block_id, evidence_quote)
          VALUES (${randomUUID()}, ${result.runId}, ${proposal.proposedLabel}, ${proposal.rationale}, ${proposalBlockId}, ${proposalBlockId ? proposal.evidence?.evidenceQuote ?? null : null})`;
      }
    });
  }

  async latestSucceededRunsForBuild(): Promise<RunForBuild[]> {
    const runs = await this.sql<{ run_id: string; source_resource_id: string; declared_domain: string }[]>`
      SELECT DISTINCT ON (er.source_resource_id) er.run_id, er.source_resource_id, sr.declared_domain
      FROM extraction_runs er
      JOIN source_resources sr ON sr.source_resource_id = er.source_resource_id
      WHERE er.status = 'succeeded'
      ORDER BY er.source_resource_id, er.started_at DESC`;

    const result: RunForBuild[] = [];
    for (const run of runs) {
      const coreRows = await this.sql<{ candidate_key: string; canonical_label: string; normalized_label: string; aliases: string[] }[]>`
        SELECT cc.candidate_key, cc.canonical_label, cc.normalized_label, cc.aliases
        FROM concept_candidates cc
        JOIN concept_admission_decisions ad ON ad.concept_candidate_id = cc.concept_candidate_id
        WHERE cc.run_id = ${run.run_id} AND ad.tier = 'core'`;

      const claimRows = await this.sql<{
        run_claim_id: string; subject_key: string; predicate: string; object_kind: string;
        object_key: string | null; object_literal: { value: string } | null; model_confidence: number; evidence_count: number;
      }[]>`
        SELECT rc.run_claim_id, subj.candidate_key AS subject_key, rc.predicate, rc.object_kind,
               obj.candidate_key AS object_key, rc.object_literal, rc.model_confidence, rc.evidence_count
        FROM run_claims rc
        JOIN concept_candidates subj ON subj.concept_candidate_id = rc.subject_candidate_id
        LEFT JOIN concept_candidates obj ON obj.concept_candidate_id = rc.object_candidate_id
        WHERE rc.run_id = ${run.run_id} AND rc.validation_outcome = 'verified'`;

      const verifiedClaims: RunForBuild["verifiedClaims"] = [];
      for (const claim of claimRows) {
        const evidenceRows = await this.sql<{ source_block_id: string; evidence_quote: string }[]>`
          SELECT source_block_id, evidence_quote FROM run_claim_evidence WHERE run_claim_id = ${claim.run_claim_id}`;
        const object = claim.object_kind === "concept"
          ? (claim.object_key ? { kind: "concept" as const, candidateKey: claim.object_key } : null)
          : { kind: "literal" as const, value: claim.object_literal?.value ?? "" };
        if (!object) continue;
        verifiedClaims.push({
          subjectCandidateKey: claim.subject_key,
          predicate: claim.predicate as RunForBuild["verifiedClaims"][number]["predicate"],
          object,
          evidence: evidenceRows.map((row) => ({ sourceResourceId: run.source_resource_id, sourceBlockId: row.source_block_id, evidenceQuote: row.evidence_quote })),
          modelConfidence: claim.model_confidence,
          evidenceCount: claim.evidence_count
        });
      }

      result.push({
        runId: run.run_id,
        sourceResourceId: run.source_resource_id,
        declaredDomain: run.declared_domain,
        coreCandidates: coreRows.map((row) => ({ candidateKey: row.candidate_key, canonicalLabel: row.canonical_label, normalizedLabel: row.normalized_label, aliases: row.aliases })),
        verifiedClaims
      });
    }
    return result;
  }
}

export class PostgresGraphVersionStore implements GraphVersionStorePort {
  constructor(private readonly sql: Sql) {}

  async existingConceptIdentities(): Promise<PublishedConceptIdentity[]> {
    const rows = await this.sql<{ concept_id: string; iri: string; normalized_label: string; declared_domain: string }[]>`
      SELECT concept_id, iri, normalized_label, declared_domain FROM concepts`;
    return rows.map((row) => ({ conceptId: row.concept_id, iri: row.iri, normalizedLabel: row.normalized_label, declaredDomain: row.declared_domain }));
  }

  async publish(input: {
    snapshot: GraphSnapshot;
    refinementConfigHash: string;
    runMemberships: { runId: string; sourceResourceId: string }[];
    refinementDecisions: RefinementDecisionRecord[];
  }): Promise<void> {
    const { snapshot } = input;
    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO graph_versions (graph_version_id, status, refinement_config_hash, published_at)
        VALUES (${snapshot.graphVersionId}, 'published', ${input.refinementConfigHash}, now())`;

      for (const concept of snapshot.concepts) {
        // Reuse the durable concept row when its identity already exists; IRI is frozen (ADR-0015).
        await tx`
          INSERT INTO concepts (concept_id, iri, canonical_label, normalized_label, declared_domain, trust_tier, homograph)
          VALUES (${concept.conceptId}, ${concept.iri}, ${concept.canonicalLabel}, ${concept.normalizedLabel}, ${concept.declaredDomain}, ${concept.trustTier}, ${concept.homograph})
          ON CONFLICT (normalized_label, declared_domain)
          DO UPDATE SET canonical_label = EXCLUDED.canonical_label, trust_tier = EXCLUDED.trust_tier, homograph = EXCLUDED.homograph`;
        for (const alias of concept.aliases) {
          await tx`
            INSERT INTO concept_aliases (concept_alias_id, concept_id, label)
            VALUES (${randomUUID()}, ${concept.conceptId}, ${alias})
            ON CONFLICT (concept_id, label) DO NOTHING`;
        }
        await tx`
          INSERT INTO graph_version_concept_memberships (graph_version_concept_membership_id, graph_version_id, concept_id)
          VALUES (${randomUUID()}, ${snapshot.graphVersionId}, ${concept.conceptId})
          ON CONFLICT (graph_version_id, concept_id) DO NOTHING`;
      }

      for (const claim of snapshot.claims) {
        const publishedClaimId = claim.claimId;
        await tx`
          INSERT INTO published_claims (published_claim_id, graph_version_id, subject_concept_id, predicate, object_kind, object_concept_id, object_literal, trust_tier, model_confidence, evidence_count, contradiction_state)
          VALUES (${publishedClaimId}, ${snapshot.graphVersionId}, ${claim.subjectConceptId}, ${claim.predicate}, ${claim.object.kind},
                  ${claim.object.kind === "concept" ? claim.object.conceptId : null},
                  ${claim.object.kind === "literal" ? tx.json({ value: claim.object.value }) : null},
                  ${claim.trustTier}, ${claim.modelConfidence}, ${claim.evidenceCount}, ${claim.contradictionState})`;
        for (const evidence of claim.evidence) {
          await tx`
            INSERT INTO published_claim_evidence (published_claim_evidence_id, published_claim_id, source_block_id, evidence_quote)
            VALUES (${randomUUID()}, ${publishedClaimId}, ${evidence.sourceBlockId}, ${evidence.evidenceQuote})`;
        }
      }

      for (const membership of input.runMemberships) {
        await tx`
          INSERT INTO graph_version_run_memberships (graph_version_run_membership_id, graph_version_id, run_id, source_resource_id)
          VALUES (${randomUUID()}, ${snapshot.graphVersionId}, ${membership.runId}, ${membership.sourceResourceId})`;
      }

      for (const decision of input.refinementDecisions) {
        await tx`
          INSERT INTO refinement_decisions (refinement_decision_id, graph_version_id, decision_type, subject, outcome, rationale, provenance)
          VALUES (${randomUUID()}, ${snapshot.graphVersionId}, ${decision.decisionType}, ${tx.json(decision.subject as Parameters<Sql["json"]>[0])}, ${decision.outcome}, ${decision.rationale}, ${tx.json(decision.provenance as Parameters<Sql["json"]>[0])})`;
      }
    });
  }

  async getPublishedSnapshot(): Promise<GraphSnapshot | undefined> {
    const versions = await this.sql<{ graph_version_id: string }[]>`
      SELECT graph_version_id FROM graph_versions WHERE status = 'published' ORDER BY published_at DESC LIMIT 1`;
    if (versions.length === 0) return undefined;
    const graphVersionId = versions[0].graph_version_id;

    const conceptRows = await this.sql<{ concept_id: string; iri: string; canonical_label: string; normalized_label: string; declared_domain: string; trust_tier: string; homograph: boolean }[]>`
      SELECT c.concept_id, c.iri, c.canonical_label, c.normalized_label, c.declared_domain, c.trust_tier, c.homograph
      FROM concepts c
      JOIN graph_version_concept_memberships m ON m.concept_id = c.concept_id
      WHERE m.graph_version_id = ${graphVersionId}`;
    const aliasRows = await this.sql<{ concept_id: string; label: string }[]>`
      SELECT ca.concept_id, ca.label FROM concept_aliases ca
      JOIN graph_version_concept_memberships m ON m.concept_id = ca.concept_id
      WHERE m.graph_version_id = ${graphVersionId}`;
    const aliasesByConcept = new Map<string, string[]>();
    for (const row of aliasRows) aliasesByConcept.set(row.concept_id, [...(aliasesByConcept.get(row.concept_id) ?? []), row.label]);

    const claimRows = await this.sql<{ published_claim_id: string; subject_concept_id: string; predicate: string; object_kind: string; object_concept_id: string | null; object_literal: { value: string } | null; trust_tier: string; model_confidence: number; evidence_count: number; contradiction_state: string }[]>`
      SELECT published_claim_id, subject_concept_id, predicate, object_kind, object_concept_id, object_literal, trust_tier, model_confidence, evidence_count, contradiction_state
      FROM published_claims WHERE graph_version_id = ${graphVersionId}`;

    const snapshot: GraphSnapshot = {
      graphVersionId,
      concepts: conceptRows.map((row) => ({
        conceptId: row.concept_id,
        iri: row.iri,
        canonicalLabel: row.canonical_label,
        normalizedLabel: row.normalized_label,
        declaredDomain: row.declared_domain,
        aliases: aliasesByConcept.get(row.concept_id) ?? [],
        trustTier: row.trust_tier as GraphSnapshot["concepts"][number]["trustTier"],
        homograph: row.homograph
      })),
      claims: []
    };

    for (const claim of claimRows) {
      const evidenceRows = await this.sql<{ source_block_id: string; evidence_quote: string }[]>`
        SELECT source_block_id, evidence_quote FROM published_claim_evidence WHERE published_claim_id = ${claim.published_claim_id}`;
      snapshot.claims.push({
        claimId: claim.published_claim_id,
        subjectConceptId: claim.subject_concept_id,
        predicate: claim.predicate as GraphSnapshot["claims"][number]["predicate"],
        object: claim.object_kind === "concept"
          ? { kind: "concept", conceptId: claim.object_concept_id! }
          : { kind: "literal", value: claim.object_literal?.value ?? "" },
        evidence: evidenceRows.map((row) => ({ sourceResourceId: "", sourceBlockId: row.source_block_id, evidenceQuote: row.evidence_quote })),
        trustTier: claim.trust_tier as GraphSnapshot["claims"][number]["trustTier"],
        modelConfidence: claim.model_confidence,
        evidenceCount: claim.evidence_count,
        contradictionState: claim.contradiction_state as GraphSnapshot["claims"][number]["contradictionState"]
      });
    }
    return snapshot;
  }
}
