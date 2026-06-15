import { randomUUID } from "node:crypto";
import type {
  ArtifactEnvelope,
  BuildEvidencePassage,
  BuildEvidenceProfile,
  BuildTypedAssertion,
  ExtractionRunResult,
  GraphSnapshot,
  PublishedConceptEvidenceProfile,
  PublishedConceptIdentity,
  PublishedEvidencePassage,
  PublishedTypedAssertion,
  RefinementDecisionRecord,
  RunForBuild,
  SourceBlock,
  SourceLocator,
  StructuredDocument
} from "@lrnki/domain-core";
import type {
  ExtractionRunStorePort,
  GraphVersionStorePort,
  SourceRegistrationStorePort
} from "@lrnki/ports";
import type { Sql } from "postgres";
import { writeArtifactEnvelope } from "./PostgresArtifactRepository";

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

  async persist(result: ExtractionRunResult, artifact: ArtifactEnvelope<ExtractionRunResult>): Promise<void> {
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

      await tx`
        INSERT INTO extraction_runs (run_id, source_resource_id, source_document_id, pipeline_config_hash, status, cost_usd, latency_ms, completed_at)
        VALUES (${result.runId}, ${result.sourceResourceId}, ${result.sourceDocumentId}, ${result.pipelineConfigHash}, ${result.status}, ${result.costUsd ?? null}, ${result.latencyMs ?? null}, now())`;

      const candidateIdByKey = new Map<string, string>();
      for (const candidate of result.candidates) {
        const candidateId = randomUUID();
        candidateIdByKey.set(candidate.candidateKey, candidateId);
        await tx`
          INSERT INTO concept_candidates (concept_candidate_id, run_id, candidate_key, discovered_label, canonical_label, normalized_label, aliases)
          VALUES (${candidateId}, ${result.runId}, ${candidate.candidateKey}, ${candidate.discoveredLabel}, ${candidate.canonicalLabel}, ${candidate.normalizedLabel}, ${tx.json(candidate.aliases)})`;
        for (const mention of candidate.mentions) {
          await tx`
            INSERT INTO concept_candidate_mentions (concept_candidate_mention_id, concept_candidate_id, source_block_id, evidence_quote)
            VALUES (${randomUUID()}, ${candidateId}, ${resolveBlock(mention.blockId)}, ${mention.evidenceQuote})`;
        }
        const admission = candidate.admission;
        await tx`
          INSERT INTO concept_admission_decisions (
            concept_admission_decision_id, concept_candidate_id, model_tier, tier,
            proposed_canonical_label, standalone_learning_objective,
            established_domain_meaning, organizing_power, core_selected,
            selection_reason_code, reason_codes, boundary_reason_codes, confidence
          )
          VALUES (
            ${randomUUID()}, ${candidateId}, ${admission.modelTier}, ${admission.tier},
            ${admission.proposedCanonicalLabel}, ${tx.json(admission.standaloneLearningObjective)},
            ${tx.json(admission.establishedDomainMeaning)}, ${tx.json(admission.organizingPower)},
            ${admission.coreSelected}, ${admission.selectionReasonCode},
            ${tx.json(admission.reasonCodes)}, ${tx.json(admission.boundaryReasonCodes)},
            ${admission.confidence}
          )`;
      }

      // Run-scoped Concept Evidence Profiles: definition/mention passages and
      // optional typed assertions, each verbatim-grounded at the application
      // boundary. References the run-local candidate id.
      for (const profile of result.evidenceProfiles) {
        const candidateId = candidateIdByKey.get(profile.candidateKey);
        if (!candidateId) continue;
        const profileId = randomUUID();
        await tx`
          INSERT INTO run_concept_evidence_profiles (run_concept_evidence_profile_id, run_id, concept_candidate_id, tier, complete)
          VALUES (${profileId}, ${result.runId}, ${candidateId}, ${profile.tier}, ${profile.complete})`;
        let rank = 0;
        for (const definition of profile.definitions) {
          await tx`
            INSERT INTO run_evidence_passages (run_evidence_passage_id, run_concept_evidence_profile_id, kind, source_block_id, evidence_quote, salience_rank)
            VALUES (${randomUUID()}, ${profileId}, 'definition', ${resolveBlock(definition.blockId)}, ${definition.evidenceQuote}, ${rank++})`;
        }
        rank = 0;
        for (const mention of profile.mentions) {
          await tx`
            INSERT INTO run_evidence_passages (run_evidence_passage_id, run_concept_evidence_profile_id, kind, source_block_id, evidence_quote, salience_rank)
            VALUES (${randomUUID()}, ${profileId}, 'mention', ${resolveBlock(mention.blockId)}, ${mention.evidenceQuote}, ${rank++})`;
        }
        for (const assertion of profile.assertions) {
          const assertionId = randomUUID();
          const objectCandidateId = assertion.type === "explicit-prerequisite-hint" ? candidateIdByKey.get(assertion.objectCandidateKey) ?? null : null;
          if (assertion.type === "explicit-prerequisite-hint" && !objectCandidateId) continue;
          await tx`
            INSERT INTO run_optional_assertions (run_optional_assertion_id, run_concept_evidence_profile_id, assertion_type, literal_value, object_candidate_id)
            VALUES (${assertionId}, ${profileId}, ${assertion.type}, ${assertion.type === "defines" ? assertion.literalValue : null}, ${objectCandidateId})`;
          for (const evidence of assertion.evidence) {
            await tx`
              INSERT INTO run_optional_assertion_evidence (run_optional_assertion_evidence_id, run_optional_assertion_id, source_block_id, evidence_quote)
              VALUES (${randomUUID()}, ${assertionId}, ${resolveBlock(evidence.blockId)}, ${evidence.evidenceQuote})`;
          }
        }
      }

      // The immutable run artifact is written in the SAME transaction, so no
      // authoritative relational state exists without its artifact envelope.
      await tx`
        INSERT INTO artifact_versions (artifact_id, artifact_type, schema_version, run_id, producer, producer_version, config_hash, payload)
        VALUES (${artifact.artifactId}, ${artifact.artifactType}, ${artifact.schemaVersion}, ${result.runId}, ${artifact.producer}, ${artifact.producerVersion}, ${artifact.configHash}, ${tx.json(artifact.payload as Parameters<Sql["json"]>[0])})`;
    });
  }

  // Publication selects runs explicitly (no automatic 'latest succeeded'): the
  // operator names the runs they inspected. Fails closed if any requested id is
  // unknown or has not reached 'succeeded', naming the offenders rather than
  // silently dropping them. Returns runs in the requested order.
  async runsForBuildByIds(runIds: string[]): Promise<RunForBuild[]> {
    if (runIds.length === 0) throw new Error("runsForBuildByIds requires at least one run id.");
    const runs = await this.sql<{ run_id: string; source_resource_id: string; declared_domain: string; status: string }[]>`
      SELECT er.run_id, er.source_resource_id, sr.declared_domain, er.status
      FROM extraction_runs er
      JOIN source_resources sr ON sr.source_resource_id = er.source_resource_id
      WHERE er.run_id::text = ANY(${runIds})`;
    const byId = new Map(runs.map((run) => [run.run_id, run] as const));
    const missing = runIds.filter((id) => !byId.has(id));
    if (missing.length) throw new Error(`Unknown extraction run id(s): ${missing.join(", ")}`);
    const notSucceeded = runs.filter((run) => run.status !== "succeeded");
    if (notSucceeded.length) {
      throw new Error(`Refusing to build: run(s) not in 'succeeded' status: ${notSucceeded.map((run) => `${run.run_id} (${run.status})`).join(", ")}`);
    }

    const result: RunForBuild[] = [];
    for (const run of runIds.map((id) => byId.get(id)!)) {
      const coreRows = await this.sql<{ candidate_key: string; canonical_label: string; normalized_label: string; aliases: string[] }[]>`
        SELECT cc.candidate_key, cc.canonical_label, cc.normalized_label, cc.aliases
        FROM concept_candidates cc
        JOIN concept_admission_decisions ad ON ad.concept_candidate_id = cc.concept_candidate_id
        WHERE cc.run_id = ${run.run_id} AND ad.tier = 'core'`;

      // Quarantine decisions block publication (CONTEXT.md). Surfaced to the
      // build so it can fail closed rather than silently dropping them.
      const quarantineRows = await this.sql<{ candidate_key: string; canonical_label: string }[]>`
        SELECT cc.candidate_key, cc.canonical_label
        FROM concept_candidates cc
        JOIN concept_admission_decisions ad ON ad.concept_candidate_id = cc.concept_candidate_id
        WHERE cc.run_id = ${run.run_id} AND ad.tier = 'quarantine'`;

      // CEPs of admitted-CORE Concepts are the publishable evidence. Optional
      // Concepts are extracted for hint context but never published, so they are
      // excluded here; a prerequisite-hint pointing at an optional Concept resolves
      // to no published target and is omitted by the build (R9).
      const passageRows = await this.sql<{ candidate_key: string; tier: string; complete: boolean; kind: string; source_block_id: string; evidence_quote: string; heading_path: string[]; locator: unknown; salience_rank: number }[]>`
        SELECT cc.candidate_key, p.tier, p.complete, ep.kind, ep.source_block_id, ep.evidence_quote, sb.heading_path, sb.locator, ep.salience_rank
        FROM run_concept_evidence_profiles p
        JOIN concept_candidates cc ON cc.concept_candidate_id = p.concept_candidate_id
        JOIN concept_admission_decisions ad ON ad.concept_candidate_id = cc.concept_candidate_id AND ad.tier = 'core'
        JOIN run_evidence_passages ep ON ep.run_concept_evidence_profile_id = p.run_concept_evidence_profile_id
        JOIN source_blocks sb ON sb.source_block_id = ep.source_block_id
        WHERE p.run_id = ${run.run_id}
        ORDER BY cc.candidate_key, ep.kind, ep.salience_rank`;

      // Profiles with no passages at all (e.g. incomplete) still need a row so the
      // build can fail closed on a core Concept without a complete CEP.
      const profileRows = await this.sql<{ candidate_key: string; tier: string; complete: boolean }[]>`
        SELECT cc.candidate_key, p.tier, p.complete
        FROM run_concept_evidence_profiles p
        JOIN concept_candidates cc ON cc.concept_candidate_id = p.concept_candidate_id
        JOIN concept_admission_decisions ad ON ad.concept_candidate_id = cc.concept_candidate_id AND ad.tier = 'core'
        WHERE p.run_id = ${run.run_id}`;

      const assertionRows = await this.sql<{ candidate_key: string; assertion_type: string; literal_value: string | null; object_candidate_key: string | null; source_block_id: string | null; evidence_quote: string | null; heading_path: string[] | null; locator: unknown }[]>`
        SELECT cc.candidate_key, oa.assertion_type, oa.literal_value, obj.candidate_key AS object_candidate_key,
               oae.source_block_id, oae.evidence_quote, sb.heading_path, sb.locator
        FROM run_optional_assertions oa
        JOIN run_concept_evidence_profiles p ON p.run_concept_evidence_profile_id = oa.run_concept_evidence_profile_id
        JOIN concept_candidates cc ON cc.concept_candidate_id = p.concept_candidate_id
        JOIN concept_admission_decisions ad ON ad.concept_candidate_id = cc.concept_candidate_id AND ad.tier = 'core'
        LEFT JOIN concept_candidates obj ON obj.concept_candidate_id = oa.object_candidate_id
        LEFT JOIN run_optional_assertion_evidence oae ON oae.run_optional_assertion_id = oa.run_optional_assertion_id
        LEFT JOIN source_blocks sb ON sb.source_block_id = oae.source_block_id
        ORDER BY cc.candidate_key, oa.run_optional_assertion_id`;

      result.push({
        runId: run.run_id,
        sourceResourceId: run.source_resource_id,
        declaredDomain: run.declared_domain,
        coreCandidates: coreRows.map((row) => ({ candidateKey: row.candidate_key, canonicalLabel: row.canonical_label, normalizedLabel: row.normalized_label, aliases: row.aliases })),
        quarantinedCandidates: quarantineRows.map((row) => ({ candidateKey: row.candidate_key, canonicalLabel: row.canonical_label })),
        evidenceProfiles: assembleBuildEvidenceProfiles(profileRows, passageRows, assertionRows)
      });
    }
    return result;
  }
}

// Reduce the relational CEP rows of one run to the deterministic build read model.
// Passages carry resolved provenance (heading path + locator from source_blocks);
// assertions keep the OTHER admitted Concept's run-local candidateKey so the build
// resolves it to a published identity. Only admitted-core profiles are present.
function assembleBuildEvidenceProfiles(
  profileRows: { candidate_key: string; tier: string; complete: boolean }[],
  passageRows: { candidate_key: string; kind: string; source_block_id: string; evidence_quote: string; heading_path: string[]; locator: unknown; salience_rank: number }[],
  assertionRows: { candidate_key: string; assertion_type: string; literal_value: string | null; object_candidate_key: string | null; source_block_id: string | null; evidence_quote: string | null; heading_path: string[] | null; locator: unknown }[]
): BuildEvidenceProfile[] {
  const byKey = new Map<string, BuildEvidenceProfile>();
  for (const row of profileRows) {
    byKey.set(row.candidate_key, { candidateKey: row.candidate_key, definitions: [], mentions: [], assertions: [], complete: row.complete });
  }
  const passage = (row: { source_block_id: string; evidence_quote: string; heading_path: string[]; locator: unknown }): BuildEvidencePassage => ({
    sourceBlockId: row.source_block_id,
    evidenceQuote: row.evidence_quote,
    headingPath: row.heading_path,
    locator: row.locator as SourceLocator
  });
  for (const row of passageRows) {
    const profile = byKey.get(row.candidate_key);
    if (!profile) continue;
    if (row.kind === "definition") profile.definitions.push(passage(row));
    else profile.mentions.push(passage(row));
  }
  // Assertion rows are joined to their evidence, so one assertion may span multiple
  // rows; group consecutive rows of the same (candidate, type, target) into one.
  const assertionByKey = new Map<string, BuildTypedAssertion>();
  for (const row of assertionRows) {
    const profile = byKey.get(row.candidate_key);
    if (!profile) continue;
    const target = row.assertion_type === "defines" ? row.literal_value ?? "" : row.object_candidate_key ?? "";
    const groupKey = `${row.candidate_key}|${row.assertion_type}|${target}`;
    let assertion = assertionByKey.get(groupKey);
    if (!assertion) {
      if (row.assertion_type === "defines") {
        assertion = { type: "defines", literalValue: row.literal_value ?? "", evidence: [] };
      } else {
        if (!row.object_candidate_key) continue; // hint target was an absent candidate
        assertion = { type: "explicit-prerequisite-hint", objectCandidateKey: row.object_candidate_key, evidence: [] };
      }
      assertionByKey.set(groupKey, assertion);
      profile.assertions.push(assertion);
    }
    if (row.source_block_id && row.evidence_quote) {
      assertion.evidence.push(passage({ source_block_id: row.source_block_id, evidence_quote: row.evidence_quote, heading_path: row.heading_path ?? [], locator: row.locator }));
    }
  }
  return [...byKey.values()];
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
    artifact: ArtifactEnvelope<GraphSnapshot>;
  }): Promise<void> {
    const { snapshot } = input;
    const profileByConcept = new Map(snapshot.evidenceProfiles.map((profile) => [profile.conceptId, profile] as const));
    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO graph_versions (graph_version_id, base_graph_version_id, status, refinement_config_hash, published_at)
        VALUES (${snapshot.graphVersionId}, ${snapshot.baseGraphVersionId}, 'published', ${input.refinementConfigHash}, now())`;

      for (const concept of snapshot.concepts) {
        // Reuse stable identity while storing presentation in this immutable version.
        await tx`
          INSERT INTO concepts (concept_id, iri, normalized_label, declared_domain)
          VALUES (${concept.conceptId}, ${concept.iri}, ${concept.normalizedLabel}, ${concept.declaredDomain})
          ON CONFLICT (normalized_label, declared_domain)
          DO NOTHING`;
        await tx`
          INSERT INTO graph_version_concepts (graph_version_concept_id, graph_version_id, concept_id, canonical_label, trust_tier, homograph)
          VALUES (${randomUUID()}, ${snapshot.graphVersionId}, ${concept.conceptId}, ${concept.canonicalLabel}, ${concept.trustTier}, ${concept.homograph})`;
        for (const alias of concept.aliases) {
          await tx`
            INSERT INTO graph_version_concept_aliases (graph_version_concept_alias_id, graph_version_id, concept_id, label)
            VALUES (${randomUUID()}, ${snapshot.graphVersionId}, ${concept.conceptId}, ${alias})`;
        }

        // Published Concept Evidence Profile: the unioned, deduplicated evidence for
        // this Concept in this version. No asserted edges are written (R5).
        const profile = profileByConcept.get(concept.conceptId);
        if (!profile) continue;
        const profileId = randomUUID();
        await tx`
          INSERT INTO graph_version_concept_evidence_profiles (graph_version_concept_evidence_profile_id, graph_version_id, concept_id)
          VALUES (${profileId}, ${snapshot.graphVersionId}, ${concept.conceptId})`;
        let rank = 0;
        for (const definition of profile.definitions) {
          await tx`
            INSERT INTO graph_version_evidence_passages (graph_version_evidence_passage_id, graph_version_concept_evidence_profile_id, kind, source_resource_id, source_block_id, evidence_quote, heading_path, locator, salience_rank)
            VALUES (${randomUUID()}, ${profileId}, 'definition', ${definition.sourceResourceId}, ${definition.sourceBlockId}, ${definition.evidenceQuote}, ${tx.json(definition.headingPath)}, ${tx.json(definition.locator)}, ${rank++})`;
        }
        rank = 0;
        for (const mention of profile.mentions) {
          await tx`
            INSERT INTO graph_version_evidence_passages (graph_version_evidence_passage_id, graph_version_concept_evidence_profile_id, kind, source_resource_id, source_block_id, evidence_quote, heading_path, locator, salience_rank)
            VALUES (${randomUUID()}, ${profileId}, 'mention', ${mention.sourceResourceId}, ${mention.sourceBlockId}, ${mention.evidenceQuote}, ${tx.json(mention.headingPath)}, ${tx.json(mention.locator)}, ${rank++})`;
        }
        for (const assertion of profile.assertions) {
          const assertionId = randomUUID();
          await tx`
            INSERT INTO graph_version_optional_assertions (graph_version_optional_assertion_id, graph_version_concept_evidence_profile_id, assertion_type, literal_value, object_concept_id)
            VALUES (${assertionId}, ${profileId}, ${assertion.type}, ${assertion.type === "defines" ? assertion.literalValue : null}, ${assertion.type === "explicit-prerequisite-hint" ? assertion.objectConceptId : null})`;
          for (const evidence of assertion.evidence) {
            await tx`
              INSERT INTO graph_version_optional_assertion_evidence (graph_version_optional_assertion_evidence_id, graph_version_optional_assertion_id, source_resource_id, source_block_id, evidence_quote, heading_path, locator)
              VALUES (${randomUUID()}, ${assertionId}, ${evidence.sourceResourceId}, ${evidence.sourceBlockId}, ${evidence.evidenceQuote}, ${tx.json(evidence.headingPath)}, ${tx.json(evidence.locator)})`;
          }
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

      // The immutable graph-snapshot artifact is written in the SAME transaction
      // (R: no authoritative relational state without its artifact). A failed write
      // here rolls back the whole publication, including the CEP rows above.
      await writeArtifactEnvelope(tx, input.artifact);
    });
  }

  async getPublishedSnapshot(graphVersionId: string): Promise<GraphSnapshot | undefined> {
    const versions = await this.sql<{ graph_version_id: string }[]>`
      SELECT graph_version_id FROM graph_versions
      WHERE graph_version_id = ${graphVersionId} AND status = 'published'
      LIMIT 1`;
    if (versions.length === 0) return undefined;
    return this.hydratePublishedSnapshot(graphVersionId);
  }

  async getLatestPublishedSnapshot(): Promise<GraphSnapshot | undefined> {
    const versions = await this.sql<{ graph_version_id: string }[]>`
      SELECT graph_version_id FROM graph_versions WHERE status = 'published' ORDER BY published_at DESC LIMIT 1`;
    if (versions.length === 0) return undefined;
    return this.hydratePublishedSnapshot(versions[0].graph_version_id);
  }

  private async hydratePublishedSnapshot(graphVersionId: string): Promise<GraphSnapshot> {
    const versionRows = await this.sql<{ base_graph_version_id: string | null }[]>`
      SELECT base_graph_version_id FROM graph_versions WHERE graph_version_id = ${graphVersionId} LIMIT 1`;
    const conceptRows = await this.sql<{ concept_id: string; iri: string; canonical_label: string; normalized_label: string; declared_domain: string; trust_tier: string; homograph: boolean }[]>`
      SELECT c.concept_id, c.iri, gvc.canonical_label, c.normalized_label, c.declared_domain, gvc.trust_tier, gvc.homograph
      FROM concepts c
      JOIN graph_version_concepts gvc ON gvc.concept_id = c.concept_id
      WHERE gvc.graph_version_id = ${graphVersionId}`;
    const aliasRows = await this.sql<{ concept_id: string; label: string }[]>`
      SELECT concept_id, label FROM graph_version_concept_aliases
      WHERE graph_version_id = ${graphVersionId}`;
    const aliasesByConcept = new Map<string, string[]>();
    for (const row of aliasRows) aliasesByConcept.set(row.concept_id, [...(aliasesByConcept.get(row.concept_id) ?? []), row.label]);

    // Published CEP evidence (ADR-0007 reset). Definition/mention passages and
    // optional typed assertions carry full provenance; there are no asserted edges.
    const passageRows = await this.sql<{ concept_id: string; kind: string; source_resource_id: string; source_block_id: string; evidence_quote: string; heading_path: string[]; locator: unknown; salience_rank: number }[]>`
      SELECT p.concept_id, ep.kind, ep.source_resource_id, ep.source_block_id, ep.evidence_quote, ep.heading_path, ep.locator, ep.salience_rank
      FROM graph_version_concept_evidence_profiles p
      JOIN graph_version_evidence_passages ep ON ep.graph_version_concept_evidence_profile_id = p.graph_version_concept_evidence_profile_id
      WHERE p.graph_version_id = ${graphVersionId}
      ORDER BY p.concept_id, ep.kind, ep.salience_rank`;
    const assertionRows = await this.sql<{ graph_version_optional_assertion_id: string; concept_id: string; assertion_type: string; literal_value: string | null; object_concept_id: string | null }[]>`
      SELECT oa.graph_version_optional_assertion_id, p.concept_id, oa.assertion_type, oa.literal_value, oa.object_concept_id
      FROM graph_version_optional_assertions oa
      JOIN graph_version_concept_evidence_profiles p ON p.graph_version_concept_evidence_profile_id = oa.graph_version_concept_evidence_profile_id
      WHERE p.graph_version_id = ${graphVersionId}`;
    const assertionEvidenceRows = await this.sql<{ graph_version_optional_assertion_id: string; source_resource_id: string; source_block_id: string; evidence_quote: string; heading_path: string[]; locator: unknown }[]>`
      SELECT oae.graph_version_optional_assertion_id, oae.source_resource_id, oae.source_block_id, oae.evidence_quote, oae.heading_path, oae.locator
      FROM graph_version_optional_assertion_evidence oae
      JOIN graph_version_optional_assertions oa ON oa.graph_version_optional_assertion_id = oae.graph_version_optional_assertion_id
      JOIN graph_version_concept_evidence_profiles p ON p.graph_version_concept_evidence_profile_id = oa.graph_version_concept_evidence_profile_id
      WHERE p.graph_version_id = ${graphVersionId}`;

    const toPassage = (row: { source_resource_id: string; source_block_id: string; evidence_quote: string; heading_path: string[]; locator: unknown }): PublishedEvidencePassage => ({
      sourceResourceId: row.source_resource_id,
      sourceBlockId: row.source_block_id,
      evidenceQuote: row.evidence_quote,
      headingPath: row.heading_path,
      locator: row.locator as SourceLocator
    });

    const profileByConcept = new Map<string, PublishedConceptEvidenceProfile>();
    const profileFor = (conceptId: string): PublishedConceptEvidenceProfile => {
      let profile = profileByConcept.get(conceptId);
      if (!profile) {
        profile = { conceptId, definitions: [], mentions: [], assertions: [] };
        profileByConcept.set(conceptId, profile);
      }
      return profile;
    };
    for (const concept of conceptRows) profileFor(concept.concept_id);
    for (const row of passageRows) {
      const profile = profileFor(row.concept_id);
      if (row.kind === "definition") profile.definitions.push(toPassage(row));
      else profile.mentions.push(toPassage(row));
    }
    const evidenceByAssertion = new Map<string, PublishedEvidencePassage[]>();
    for (const row of assertionEvidenceRows) {
      evidenceByAssertion.set(row.graph_version_optional_assertion_id, [...(evidenceByAssertion.get(row.graph_version_optional_assertion_id) ?? []), toPassage(row)]);
    }
    for (const row of assertionRows) {
      const profile = profileFor(row.concept_id);
      const evidence = evidenceByAssertion.get(row.graph_version_optional_assertion_id) ?? [];
      const assertion: PublishedTypedAssertion = row.assertion_type === "defines"
        ? { type: "defines", literalValue: row.literal_value ?? "", evidence }
        : { type: "explicit-prerequisite-hint", objectConceptId: row.object_concept_id ?? "", evidence };
      profile.assertions.push(assertion);
    }

    return {
      graphVersionId,
      baseGraphVersionId: versionRows[0]?.base_graph_version_id ?? null,
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
      evidenceProfiles: conceptRows.map((row) => profileFor(row.concept_id))
    };
  }
}
