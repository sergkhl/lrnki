import type {
  AdmissionLabelJudgment,
  AdmissionProposal,
  ArtifactEnvelope,
  ClaimEntailmentJudgment,
  ClaimExtractionFeedback,
  ClaimExtractionResult,
  Concept,
  RelationPredicate,
  ConceptDifficulty,
  DerivedGraphLayer,
  DiscoveredCandidate,
  EnrichmentRunTrace,
  ExtractionRunResult,
  GraphSnapshot,
  InferredPrerequisiteEdge,
  LearnerPath,
  PrerequisiteJudgment,
  PublishedConceptIdentity,
  RefinementDecisionRecord,
  RunForBuild,
  SourceBlock,
  StructuredDocument
} from "@lrnki/domain-core";

export interface StructuredDocumentParserPort {
  supports(contentType: string): boolean;
  parse(input: { sourceResourceId: string; bytes: Uint8Array; contentType: string }): Promise<StructuredDocument>;
}

export interface ConceptDiscoveryPort {
  // Recall-oriented: "don't miss anything plausibly important" (CONTEXT.md).
  discover(input: { document: StructuredDocument; declaredDomain: string }): Promise<DiscoveredCandidate[]>;
}

export interface ConceptAdmissionPort {
  // Precision-first; a separate stage from discovery, never collapsed into one prompt.
  admit(input: { document: StructuredDocument; declaredDomain: string; candidates: DiscoveredCandidate[] }): Promise<AdmissionProposal[]>;
}

export interface ConceptConditionedClaimExtractionPort {
  // Extract claims in the context of one admitted subject concept. Object concepts
  // must be drawn from the admitted set; anything else becomes a missing-concept proposal.
  extract(input: {
    document: StructuredDocument;
    declaredDomain: string;
    subject: { candidateKey: string; canonicalLabel: string; aliases: string[] };
    admittedConcepts: { candidateKey: string; canonicalLabel: string; aliases: string[] }[];
    evidenceNeighborhood: SourceBlock[];
    feedback?: ClaimExtractionFeedback;
  }): Promise<ClaimExtractionResult>;
}

// Semantic claim-entailment judge (ADR-0020). A bounded, forced-tool LLM judgment
// over ONE claim whose evidence already verifies verbatim. It answers the semantic
// question the deterministic lexical gates got wrong: does the quoted evidence
// actually assert this claim? Used only to DOWNGRADE a deterministically-surviving
// claim; the verbatim floor and structural gates remain deterministic and
// authoritative. Two claim shapes are judged by separate methods because their
// questions differ: `judge` for a concept-to-concept typed relation in a direction,
// `judgeDefinition` for a `defined-as` literal (the extractor PARAPHRASES the
// definition, so no surface matcher can verify it — only entailment can).
export interface ClaimEntailmentJudgmentPort {
  readonly model: string;
  judge(input: {
    declaredDomain: string;
    subject: { canonicalLabel: string; aliases: string[] };
    predicate: RelationPredicate;
    object: { canonicalLabel: string; aliases: string[] };
    evidenceQuotes: string[]; // already verbatim-verified against cited blocks
  }): Promise<ClaimEntailmentJudgment>;
  // Does the verbatim evidence support DEFINING the subject as this literal? The
  // literal is model-authored prose, not a source substring; judge meaning, not
  // wording. `entailingSpan` is the minimal source-grounded sub-quote that carries
  // the definition.
  judgeDefinition(input: {
    declaredDomain: string;
    subject: { canonicalLabel: string; aliases: string[] };
    definition: string;
    evidenceQuotes: string[]; // already verbatim-verified against cited blocks
  }): Promise<ClaimEntailmentJudgment>;
}

// Concept-vs-proposition admission judge (ADR-0021). A bounded, forced-tool LLM
// judgment over ONE admitted-`core` label, run on an independent model family
// (`kg-oracle-judge`) so the judge is not the admission extractor grading its own
// homework. It answers the semantic question the deterministic lexical veto got
// wrong: does this label NAME a concept, or ASSERT a claim about one? Used only
// to DOWNGRADE a `core` candidate whose label is a proposition; it never promotes
// or resurrects. The adapter grounds its verdict fail-closed (an ungrounded
// positive is returned as `concept`), so the application stage reads `labelKind`
// and demotes only on a confident, source-grounded positive.
export interface AdmissionLabelJudgmentPort {
  readonly model: string;
  judge(input: {
    declaredDomain: string;
    label: string; // proposed canonical label of the admitted-core candidate
    aliases: string[];
    evidenceQuotes: string[]; // already verbatim-verified candidate mention/eligibility evidence
  }): Promise<AdmissionLabelJudgment>;
}

export interface ArtifactRepositoryPort {
  append<TPayload>(artifact: ArtifactEnvelope<TPayload>): Promise<void>;
}

// Source registration and normalization persistence (ADR-0004, ADR-0015).
export interface SourceRegistrationStorePort {
  findByContentHash(contentHash: string): Promise<{ sourceResourceId: string; sourceDocumentId: string } | undefined>;
  register(input: {
    contentHash: string;
    contentType: string;
    objectKey: string;
    declaredDomain: string;
    title: string;
    sourceUri?: string;
    license?: string;
    document: StructuredDocument;
  }): Promise<{ sourceResourceId: string; sourceDocumentId: string }>;
  getRegisteredSource(sourceResourceId: string): Promise<{
    sourceResourceId: string;
    sourceDocumentId: string;
    declaredDomain: string;
    document: StructuredDocument;
  } | undefined>;
  listSources(): Promise<{ sourceResourceId: string; title: string; declaredDomain: string; contentType: string }[]>;
}

// Extraction Run persistence — run-scoped, never publishes (ADR-0017).
export interface ExtractionRunStorePort {
  persist(result: ExtractionRunResult): Promise<void>;
  // Explicitly selected runs, reduced to the deterministic build read model.
  // Publication never auto-selects "latest succeeded": the operator names the
  // runs to publish, so a mechanically-valid but semantically-bad run cannot
  // silently mutate the graph (AGENTS rule 11). Fails closed on unknown or
  // not-yet-succeeded ids.
  runsForBuildByIds(runIds: string[]): Promise<RunForBuild[]>;
}

// Atomic graph-version publication (ADR-0010). Refuses to mutate a published version.
export interface GraphVersionStorePort {
  existingConceptIdentities(): Promise<PublishedConceptIdentity[]>;
  publish(input: {
    snapshot: GraphSnapshot;
    refinementConfigHash: string;
    runMemberships: { runId: string; sourceResourceId: string }[];
    refinementDecisions: RefinementDecisionRecord[];
  }): Promise<void>;
  getPublishedSnapshot(graphVersionId: string): Promise<GraphSnapshot | undefined>;
  getLatestPublishedSnapshot(): Promise<GraphSnapshot | undefined>;
}

export interface SourceObjectStoragePort {
  putObject(input: { bucket: string; objectKey: string; bytes: Uint8Array; contentType: string }): Promise<void>;
  getObject(input: { bucket: string; objectKey: string }): Promise<{ bytes: Uint8Array; contentType?: string }>;
}

// ---------------------------------------------------------------------------
// Graph Enrichment ports (ADR-0019). The third operation: LLM proposes, symbolic
// machinery disposes, over one published graph version. Mocked stages sit behind
// REAL ports so Bradley-Terry / IRT-KT drop in later with no upstream change.
// ---------------------------------------------------------------------------

// Contextual embeddings as a propose-only blocking/clustering tier (ADR-0012).
// Computed over a concept's definition + evidence text, NEVER its bare label, and
// never an identity or merge authority — output only narrows candidate pairs and
// forms clusters that gate which prerequisite pairs the LLM judges.
export interface EmbeddingPort {
  readonly model: string;
  embed(input: { texts: string[] }): Promise<number[][]>;
}

// Bounded LLM prerequisite judgment over ONE gated, evidence-packed concept pair
// (ADR-0019). Forced named tool schema; the application boundary validates the
// arguments and maps "uncertain" to a flagged, path-excluded edge. The judge
// proposes; deterministic cycle removal + transitive reduction dispose.
export interface PrerequisiteJudgmentPort {
  readonly model: string;
  judge(input: {
    declaredDomain: string;
    a: { conceptId: string; canonicalLabel: string; definition?: string };
    b: { conceptId: string; canonicalLabel: string; definition?: string };
    evidencePacket: SourceBlock[];
  }): Promise<PrerequisiteJudgment>;
}

// Baseline node difficulty (ADR-0019). MVP impl = deterministic DAG-depth mock
// behind this port; Bradley-Terry pairwise calibration replaces the impl without
// changing the port. Reads concepts + the inferred prereq DAG; one score each.
export interface DifficultyPort {
  readonly method: string;
  score(input: { concepts: Concept[]; prerequisiteEdges: InferredPrerequisiteEdge[] }): Promise<ConceptDifficulty[]>;
}

// Learner mastery seam (ADR-0014 deferred personalization). MVP impl is a mock
// ("knows nothing"): mastery() === 0 for every concept. Real IRT/KT later
// implements the SAME port, so the projection upstream never changes. Pure/sync:
// the projection is a deterministic CLI operation (ADR-0011).
export interface LearnerStatePort {
  readonly learnerStateRef: string;
  mastery(conceptId: string): number; // [0,1]; >= masteryThreshold => pruned from the path
}

// Graph Enrichment persistence (ADR-0019). Append-only; each run has its own
// enrichmentId, so repeated runs over the same graph version and configuration
// remain independently queryable. Persists normalized rows plus one immutable
// JSONB judgment/disposition trace.
export interface EnrichmentRunStorePort {
  persist(input: {
    layer: DerivedGraphLayer;
    artifact: ArtifactEnvelope<EnrichmentRunTrace>;
  }): Promise<void>;
  getLayer(enrichmentId: string): Promise<DerivedGraphLayer | undefined>;
}

// Learner Path persistence (ADR-0019, ADR-0011). The read-only surface the
// Cytoscape view renders; the CLI computes and persists, the UI never computes.
export interface LearnerPathStorePort {
  persist(path: LearnerPath): Promise<void>;
  getPath(input: { enrichmentId: string; targetConceptId: string; learnerStateRef: string }): Promise<LearnerPath | undefined>;
}
