import { randomUUID } from "node:crypto";
import type {
  ArtifactEnvelope,
  CandidateTier,
  ConceptDifficulty,
  DerivedGraphNode,
  DerivedGraphLayer,
  EnrichmentRunTrace,
  GeneratedGroundingBundle,
  InferredPrerequisiteEdge,
  LearnerPath,
  LearnerPathStep,
  MentionedNonCoreCandidate,
  SourceLocator,
  SourceMentionGroundingPassage
} from "@lrnki/domain-core";
import type { EnrichmentRunStorePort, LearnerPathStorePort } from "@lrnki/ports";
import type { Sql } from "postgres";
import { writeArtifactEnvelope } from "./PostgresArtifactRepository";

// Each Enrichment Run is appended once. Normalized rows are the query surface;
// the JSONB artifact is the complete judgment/disposition trace.
export class PostgresEnrichmentRunStore implements EnrichmentRunStorePort {
  constructor(private readonly sql: Sql) {}

  async persist(input: {
    layer: DerivedGraphLayer;
    artifact: ArtifactEnvelope<EnrichmentRunTrace>;
  }): Promise<void> {
    const { layer, artifact } = input;
    const difficultyMethod = layer.difficulties[0]?.method ?? "dag-depth-mock";
    // Whole-set ordering (U4): ONE non-DeepSeek ordering alias orders every domain, so
    // every edge's judging model is the layer-level `judgeModel` — there is no per-pair
    // model split any more (the per-pair routing was deleted, rule 18).
    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO graph_enrichments (enrichment_id, graph_version_id, enrichment_config_hash, status, judge_model, difficulty_method, completed_at)
        VALUES (${layer.enrichmentId}, ${layer.graphVersionId}, ${layer.enrichmentConfigHash}, 'succeeded', ${layer.judgeModel}, ${difficultyMethod}, now())`;

      for (const node of layer.derivedNodes) {
        await tx`
          INSERT INTO derived_graph_nodes (
            derived_node_id, enrichment_id, node_kind, concept_id, grounding_origin, role,
            canonical_label, normalized_label, declared_domain, aliases
          )
          VALUES (
            ${node.derivedNodeId}, ${layer.enrichmentId}, ${node.nodeKind}, ${node.nodeKind === "anchor" ? node.conceptId : null},
            ${node.groundingOrigin}, ${node.role}, ${node.canonicalLabel}, ${node.normalizedLabel},
            ${node.declaredDomain}, ${tx.json(node.aliases)}
          )`;

        if (node.nodeKind === "enrichment" && node.groundingOrigin === "llm_grounded") {
          await tx`
            INSERT INTO enrichment_grounding_bundles (enrichment_grounding_bundle_id, derived_node_id, grounding_origin, generating_model, rationale, bundle)
            VALUES (${randomUUID()}, ${node.derivedNodeId}, ${node.groundingOrigin}, ${node.groundingBundle.generatingModel}, ${node.groundingBundle.rationale}, ${tx.json(node.groundingBundle as Parameters<Sql["json"]>[0])})`;
          const passages = [...node.groundingBundle.definitions, ...node.groundingBundle.mentions];
          for (const [index, passage] of passages.entries()) {
            await tx`
              INSERT INTO enrichment_grounding_passages (
                enrichment_grounding_passage_id, derived_node_id, passage_type, grounding_origin,
                generated_text, heading_path, locator, verbatim_check, salience_rank
              )
              VALUES (
                ${randomUUID()}, ${node.derivedNodeId}, ${passage.passageType}, ${passage.groundingOrigin},
                ${passage.text}, ${tx.json(passage.headingPath)}, ${tx.json(passage.locator as Parameters<Sql["json"]>[0])},
                ${tx.json(passage.verbatimCheck as Parameters<Sql["json"]>[0])}, ${index}
              )`;
          }
        }

        if (node.nodeKind === "enrichment" && node.groundingOrigin === "source_mentioned") {
          for (const [index, passage] of node.groundingPassages.entries()) {
            await tx`
              INSERT INTO enrichment_grounding_passages (
                enrichment_grounding_passage_id, derived_node_id, passage_type, grounding_origin,
                source_resource_id, source_block_id, evidence_quote, heading_path, locator, verbatim_check, salience_rank
              )
              VALUES (
                ${randomUUID()}, ${node.derivedNodeId}, ${passage.passageType}, ${passage.groundingOrigin},
                ${passage.sourceResourceId}, ${passage.sourceBlockId}, ${passage.evidenceQuote},
                ${tx.json(passage.headingPath)}, ${tx.json(passage.locator as Parameters<Sql["json"]>[0])},
                ${tx.json(passage.verbatimCheck as Parameters<Sql["json"]>[0])}, ${index}
              )`;
          }
        }
      }

      for (const edge of layer.prerequisiteEdges) {
        await tx`
          INSERT INTO inferred_prerequisite_edges (inferred_prerequisite_edge_id, enrichment_id, predicate, prerequisite_derived_node_id, dependent_derived_node_id, confidence, uncertain, judge_model, provenance)
          VALUES (${randomUUID()}, ${layer.enrichmentId}, ${edge.predicate}, ${edge.prerequisiteDerivedNodeId}, ${edge.dependentDerivedNodeId}, ${edge.confidence}, ${edge.uncertain}, ${layer.judgeModel}, ${tx.json(edge.provenance as Parameters<Sql["json"]>[0])})`;
      }

      // Rescue durability dispositions (U4): the relational mirror of the trace's
      // accept/drop/kept-judge-unavailable record, so Admin Lab reads it without recompute.
      for (const disposition of artifact.payload.rescueDispositions) {
        await tx`
          INSERT INTO rescue_dispositions (
            rescue_disposition_id, enrichment_id, derived_node_id, canonical_label,
            normalized_label, declared_domain, disposition, rationale, grounding_span
          )
          VALUES (
            ${randomUUID()}, ${layer.enrichmentId}, ${disposition.derivedNodeId}, ${disposition.canonicalLabel},
            ${disposition.normalizedLabel}, ${disposition.declaredDomain}, ${disposition.disposition},
            ${disposition.rationale}, ${disposition.groundingSpan}
          )`;
      }

      // Minting durability dispositions: relational mirror of the trace's reserved
      // proposal decisions. Dropped proposal ids are correlation-only because no
      // derived_graph_nodes row exists for them.
      for (const disposition of artifact.payload.mintingDispositions) {
        await tx`
          INSERT INTO minting_dispositions (
            minting_disposition_id, enrichment_id, derived_node_id, proposed_label,
            normalized_label, declared_domain, anchor_concept_id, disposition, rationale
          )
          VALUES (
            ${randomUUID()}, ${layer.enrichmentId}, ${disposition.derivedNodeId}, ${disposition.proposedLabel},
            ${disposition.normalizedLabel}, ${disposition.declaredDomain}, ${disposition.anchorConceptId},
            ${disposition.disposition}, ${disposition.rationale}
          )`;
      }

      // Derived-layer semantic merges (U4): one row per absorbed node, the relational
      // mirror of the trace's merge records so Admin Lab reads them without recompute
      // (rules 11/12). The canonical FK resolves to a surviving derived_graph_nodes row;
      // the absorbed id is correlation-only (the node was removed from the layer).
      for (const merge of artifact.payload.nodeMerges) {
        await tx`
          INSERT INTO derived_node_merges (
            derived_node_merge_id, enrichment_id, declared_domain,
            canonical_derived_node_id, canonical_label, canonical_node_kind,
            absorbed_derived_node_id, absorbed_label, absorbed_aliases, absorbed_node_kind, absorbed_evidence,
            proposing_signal, proposing_score, rationale, canonical_selection_reason
          )
          VALUES (
            ${randomUUID()}, ${layer.enrichmentId}, ${merge.declaredDomain},
            ${merge.canonicalDerivedNodeId}, ${merge.canonicalLabel}, ${merge.canonicalNodeKind},
            ${merge.absorbedDerivedNodeId}, ${merge.absorbedLabel}, ${tx.json(merge.absorbedAliases)}, ${merge.absorbedNodeKind}, ${tx.json(merge.absorbedEvidence)},
            ${merge.proposingSignal}, ${merge.proposingScore}, ${merge.rationale}, ${merge.canonicalSelectionReason}
          )`;
      }

      for (const difficulty of layer.difficulties) {
        await tx`
          INSERT INTO concept_difficulties (concept_difficulty_id, enrichment_id, derived_node_id, score, method, components, neural_rationale)
          VALUES (${randomUUID()}, ${layer.enrichmentId}, ${difficulty.derivedNodeId}, ${difficulty.score}, ${difficulty.method}, ${tx.json(difficulty.components as Parameters<Sql["json"]>[0])}, ${difficulty.neuralRationale})`;
      }

      await writeArtifactEnvelope(tx, artifact);
    });
  }

  // Rescue source for Graph Enrichment (KTD5, R7). The member Extraction Runs of
  // `graphVersionId` reduced to their rejected/optional admission proposals that have
  // a verbatim MENTION but no Definition Passage — concepts the source mentions but
  // never defines. Each mention carries resolved provenance plus the cited block's
  // text so the verbatim floor (U6) re-verifies at enrichment time. Never touches the
  // asserted core; these become `source_mentioned`/`derived` nodes only.
  async mentionedNonCoreCandidates(graphVersionId: string): Promise<MentionedNonCoreCandidate[]> {
    const rows = await this.sql<{
      run_id: string; declared_domain: string; candidate_key: string; canonical_label: string;
      normalized_label: string; aliases: string[]; tier: string;
      source_block_id: string; evidence_quote: string; block_text: string;
      heading_path: string[]; locator: unknown; block_source_resource_id: string;
    }[]>`
      SELECT er.run_id, sr.declared_domain, cc.candidate_key, cc.canonical_label,
             cc.normalized_label, cc.aliases, ad.tier,
             sb.source_block_id, ccm.evidence_quote, sb.text AS block_text,
             sb.heading_path, sb.locator, sd.source_resource_id AS block_source_resource_id
      FROM graph_version_run_memberships gm
      JOIN extraction_runs er ON er.run_id = gm.run_id
      JOIN source_resources sr ON sr.source_resource_id = er.source_resource_id
      JOIN concept_candidates cc ON cc.run_id = er.run_id
      JOIN concept_admission_decisions ad ON ad.concept_candidate_id = cc.concept_candidate_id
      JOIN concept_candidate_mentions ccm ON ccm.concept_candidate_id = cc.concept_candidate_id
      JOIN source_blocks sb ON sb.source_block_id = ccm.source_block_id
      JOIN source_documents sd ON sd.source_document_id = sb.source_document_id
      WHERE gm.graph_version_id = ${graphVersionId}
        AND ad.tier IN ('optional', 'reject')
        AND NOT EXISTS (
          SELECT 1 FROM run_concept_evidence_profiles p
          JOIN run_evidence_passages rep ON rep.run_concept_evidence_profile_id = p.run_concept_evidence_profile_id
          WHERE p.concept_candidate_id = cc.concept_candidate_id AND rep.kind = 'definition'
        )
      ORDER BY er.run_id, cc.candidate_key, sb.source_block_id`;

    const byCandidate = new Map<string, MentionedNonCoreCandidate>();
    for (const row of rows) {
      const key = `${row.run_id}|${row.candidate_key}`;
      let candidate = byCandidate.get(key);
      if (!candidate) {
        candidate = {
          runId: row.run_id,
          declaredDomain: row.declared_domain,
          candidateKey: row.candidate_key,
          canonicalLabel: row.canonical_label,
          normalizedLabel: row.normalized_label,
          aliases: row.aliases,
          tier: row.tier as CandidateTier,
          mentions: []
        };
        byCandidate.set(key, candidate);
      }
      candidate.mentions.push({
        sourceResourceId: row.block_source_resource_id,
        sourceBlockId: row.source_block_id,
        evidenceQuote: row.evidence_quote,
        blockText: row.block_text,
        headingPath: row.heading_path,
        locator: row.locator as SourceLocator
      });
    }
    return [...byCandidate.values()];
  }

  async getLayer(enrichmentId: string): Promise<DerivedGraphLayer | undefined> {
    const rows = await this.sql<EnrichmentRow[]>`
      SELECT enrichment_id, graph_version_id, enrichment_config_hash, judge_model
      FROM graph_enrichments
      WHERE enrichment_id = ${enrichmentId}
      LIMIT 1`;
    return rows.length ? this.hydrate(rows[0]) : undefined;
  }

  private async hydrate(row: EnrichmentRow): Promise<DerivedGraphLayer> {
    const nodeRows = await this.sql<{
      derived_node_id: string; node_kind: string; concept_id: string | null; grounding_origin: string; role: string;
      canonical_label: string; normalized_label: string; declared_domain: string; aliases: string[];
    }[]>`
      SELECT derived_node_id, node_kind, concept_id, grounding_origin, role,
             canonical_label, normalized_label, declared_domain, aliases
      FROM derived_graph_nodes
      WHERE enrichment_id = ${row.enrichment_id}
      ORDER BY declared_domain, canonical_label, derived_node_id`;

    const nodeIds = nodeRows.map((node) => node.derived_node_id);
    type BundleRow = { derived_node_id: string; bundle: unknown };
    type GroundingPassageRow = {
      derived_node_id: string; passage_type: string; grounding_origin: string;
      source_resource_id: string | null; source_block_id: string | null; evidence_quote: string | null; generated_text: string | null;
      heading_path: string[]; locator: unknown; verbatim_check: unknown; salience_rank: number;
    };
    const bundleRows: BundleRow[] = nodeIds.length
      ? await this.sql<BundleRow[]>`
          SELECT derived_node_id, bundle FROM enrichment_grounding_bundles
          WHERE derived_node_id IN ${this.sql(nodeIds)}`
      : [];
    const bundleByNode = new Map(bundleRows.map((bundle) => [bundle.derived_node_id, bundle.bundle]));

    const passageRows: GroundingPassageRow[] = nodeIds.length
      ? await this.sql<GroundingPassageRow[]>`
          SELECT derived_node_id, passage_type, grounding_origin, source_resource_id, source_block_id,
                 evidence_quote, generated_text, heading_path, locator, verbatim_check, salience_rank
          FROM enrichment_grounding_passages
          WHERE derived_node_id IN ${this.sql(nodeIds)}
          ORDER BY derived_node_id, salience_rank`
      : [];
    const passagesByNode = new Map<string, typeof passageRows>();
    for (const passage of passageRows) {
      passagesByNode.set(passage.derived_node_id, [...(passagesByNode.get(passage.derived_node_id) ?? []), passage]);
    }

    const derivedNodes: DerivedGraphNode[] = nodeRows.map((node) => {
      if (node.node_kind === "anchor") {
        return {
          nodeKind: "anchor",
          derivedNodeId: node.derived_node_id,
          conceptId: node.concept_id ?? "",
          groundingOrigin: "document_anchored",
          role: "anchor",
          layer: "asserted",
          canonicalLabel: node.canonical_label,
          normalizedLabel: node.normalized_label,
          declaredDomain: node.declared_domain,
          aliases: node.aliases
        };
      }
      if (node.grounding_origin === "llm_grounded") {
        return {
          nodeKind: "enrichment",
          derivedNodeId: node.derived_node_id,
          groundingOrigin: "llm_grounded",
          mintingReason: "assumed_prerequisite",
          role: "prerequisite",
          layer: "derived",
          canonicalLabel: node.canonical_label,
          normalizedLabel: node.normalized_label,
          declaredDomain: node.declared_domain,
          aliases: node.aliases,
          groundingBundle: bundleByNode.get(node.derived_node_id) as GeneratedGroundingBundle
        };
      }
      return {
        nodeKind: "enrichment",
        derivedNodeId: node.derived_node_id,
        groundingOrigin: "source_mentioned",
        role: "prerequisite",
        layer: "derived",
        canonicalLabel: node.canonical_label,
        normalizedLabel: node.normalized_label,
        declaredDomain: node.declared_domain,
        aliases: node.aliases,
        groundingPassages: (passagesByNode.get(node.derived_node_id) ?? []).map((passage) => ({
          passageType: "mention",
          text: passage.evidence_quote ?? "",
          groundingOrigin: "source_mentioned",
          sourceResourceId: passage.source_resource_id ?? "",
          sourceBlockId: passage.source_block_id ?? "",
          evidenceQuote: passage.evidence_quote ?? "",
          headingPath: passage.heading_path,
          locator: passage.locator as SourceLocator,
          verbatimCheck: passage.verbatim_check as SourceMentionGroundingPassage["verbatimCheck"]
        }))
      };
    });

    const edgeRows = await this.sql<{
      predicate: string; prerequisite_derived_node_id: string; dependent_derived_node_id: string;
      confidence: number; uncertain: boolean;
      provenance: InferredPrerequisiteEdge["provenance"];
    }[]>`
      SELECT predicate, prerequisite_derived_node_id, dependent_derived_node_id, confidence, uncertain, provenance
      FROM inferred_prerequisite_edges WHERE enrichment_id = ${row.enrichment_id}
      ORDER BY prerequisite_derived_node_id, dependent_derived_node_id`;
    const prerequisiteEdges: InferredPrerequisiteEdge[] = edgeRows.map((edge) => ({
      prerequisiteDerivedNodeId: edge.prerequisite_derived_node_id,
      dependentDerivedNodeId: edge.dependent_derived_node_id,
      predicate: edge.predicate as InferredPrerequisiteEdge["predicate"],
      confidence: edge.confidence,
      uncertain: edge.uncertain,
      provenance: edge.provenance
    }));

    const difficultyRows = await this.sql<{ derived_node_id: string; score: number; method: string; components: ConceptDifficulty["components"]; neural_rationale: string }[]>`
      SELECT derived_node_id, score, method, components, neural_rationale FROM concept_difficulties WHERE enrichment_id = ${row.enrichment_id} ORDER BY derived_node_id`;
    const difficulties: ConceptDifficulty[] = difficultyRows.map((difficulty) => ({
      derivedNodeId: difficulty.derived_node_id,
      score: difficulty.score,
      method: difficulty.method,
      components: difficulty.components,
      neuralRationale: difficulty.neural_rationale
    }));

    return {
      enrichmentId: row.enrichment_id,
      graphVersionId: row.graph_version_id,
      enrichmentConfigHash: row.enrichment_config_hash,
      judgeModel: row.judge_model,
      derivedNodes,
      prerequisiteEdges,
      difficulties
    };
  }
}

type EnrichmentRow = {
  enrichment_id: string;
  graph_version_id: string;
  enrichment_config_hash: string;
  judge_model: string;
};

// Learner Path persistence (ADR-0019, ADR-0011). The CLI computes and persists;
// the Admin Lab Cytoscape view only reads. A path is a pure deterministic
// projection, so persist replaces any prior path for the same
// (enrichmentId, targetDerivedNodeId, learnerStateRef) — replay, not mutation.
export class PostgresLearnerPathStore implements LearnerPathStorePort {
  constructor(private readonly sql: Sql) {}

  async persist(path: LearnerPath): Promise<void> {
    await this.sql.begin(async (tx) => {
      const prior = await tx<{ learner_path_id: string }[]>`
        SELECT learner_path_id FROM learner_paths
        WHERE enrichment_id = ${path.enrichmentId} AND target_derived_node_id = ${path.targetDerivedNodeId} AND learner_state_ref = ${path.learnerStateRef}`;
      for (const row of prior) {
        await tx`DELETE FROM learner_path_steps WHERE learner_path_id = ${row.learner_path_id}`;
        await tx`DELETE FROM learner_paths WHERE learner_path_id = ${row.learner_path_id}`;
      }
      await tx`
        INSERT INTO learner_paths (learner_path_id, graph_version_id, enrichment_id, target_derived_node_id, learner_state_ref)
        VALUES (${path.learnerPathId}, ${path.graphVersionId}, ${path.enrichmentId}, ${path.targetDerivedNodeId}, ${path.learnerStateRef})`;
      for (const step of path.steps) {
        await tx`
          INSERT INTO learner_path_steps (learner_path_step_id, learner_path_id, position, derived_node_id, difficulty, included_reason)
          VALUES (${randomUUID()}, ${path.learnerPathId}, ${step.position}, ${step.derivedNodeId}, ${step.difficulty}, ${step.includedReason})`;
      }
    });
  }

  async getPath(input: { enrichmentId: string; targetDerivedNodeId: string; learnerStateRef: string }): Promise<LearnerPath | undefined> {
    const rows = await this.sql<{ learner_path_id: string; graph_version_id: string; enrichment_id: string; target_derived_node_id: string; learner_state_ref: string }[]>`
      SELECT learner_path_id, graph_version_id, enrichment_id, target_derived_node_id, learner_state_ref
      FROM learner_paths
      WHERE enrichment_id = ${input.enrichmentId} AND target_derived_node_id = ${input.targetDerivedNodeId} AND learner_state_ref = ${input.learnerStateRef}
      LIMIT 1`;
    if (rows.length === 0) return undefined;
    const row = rows[0];
    const stepRows = await this.sql<{ position: number; derived_node_id: string; difficulty: number; included_reason: string }[]>`
      SELECT position, derived_node_id, difficulty, included_reason FROM learner_path_steps WHERE learner_path_id = ${row.learner_path_id} ORDER BY position`;
    const steps: LearnerPathStep[] = stepRows.map((step) => ({
      position: step.position,
      derivedNodeId: step.derived_node_id,
      difficulty: step.difficulty,
      includedReason: step.included_reason as LearnerPathStep["includedReason"]
    }));
    return {
      learnerPathId: row.learner_path_id,
      graphVersionId: row.graph_version_id,
      enrichmentId: row.enrichment_id,
      targetDerivedNodeId: row.target_derived_node_id,
      learnerStateRef: row.learner_state_ref,
      steps
    };
  }
}
