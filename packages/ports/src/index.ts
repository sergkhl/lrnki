import type {
  AdmissionLabelJudgment,
  AdmissionProposal,
  ArtifactEnvelope,
  AssertionEntailmentJudgment,
  ConceptDifficulty,
  DerivedGraphLayer,
  DiscoveredCandidate,
  EnrichmentRunTrace,
  ExtractedEvidenceProfile,
  ExtractionRunResult,
  GeneratedGroundingBundle,
  GraphSnapshot,
  InferredPrerequisiteEdge,
  LearnerPath,
  MentionedNonCoreCandidate,
  MissingPrerequisiteProposal,
  PrerequisiteConceptContext,
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

// Concept-conditioned Concept Evidence Profile extraction (ADR-0007 reset). For
// ONE admitted subject Concept, return meaning-bearing definition passages, a
// salience-ordered set of mention passages, and zero or more optional typed
// assertions (`defines` literal, `explicit-prerequisite-hint` to an admitted
// Concept). Replaces broad claim extraction: there is no retry, no recall
// feedback, and no missing-concept escape hatch (R7). The application boundary
// validates membership, verbatim grounding, deduplication, definition
// completeness, and the configured mention bound.
export interface ConceptConditionedEvidenceProfileExtractionPort {
  extract(input: {
    document: StructuredDocument;
    declaredDomain: string;
    subject: { candidateKey: string; canonicalLabel: string; aliases: string[] };
    admittedConcepts: { candidateKey: string; canonicalLabel: string; aliases: string[] }[];
    evidenceNeighborhood: SourceBlock[];
  }): Promise<ExtractedEvidenceProfile>;
}

// Assertion-entailment judge (ADR-0007 reset). A bounded, forced-tool LLM judgment
// over ONE optional typed assertion whose evidence already verifies verbatim, run
// on an independent model family so the judge is not the extractor grading its own
// homework. It guards ONLY the two optional typed assertions; definition and
// mention passages face the deterministic verbatim floor alone. It can only
// REJECT: a rejected assertion's underlying passage is preserved as an untyped
// mention. `judgeDefinition` checks a `defines` literal (a model paraphrase no
// surface matcher can verify); `judgePrerequisiteHint` checks whether the evidence
// explicitly flags the subject as needed before the object Concept.
export interface AssertionEntailmentJudgmentPort {
  readonly model: string;
  judgeDefinition(input: {
    declaredDomain: string;
    subject: { canonicalLabel: string; aliases: string[] };
    definition: string;
    evidenceQuotes: string[]; // already verbatim-verified against cited blocks
  }): Promise<AssertionEntailmentJudgment>;
  judgePrerequisiteHint(input: {
    declaredDomain: string;
    subject: { canonicalLabel: string; aliases: string[] };
    object: { canonicalLabel: string; aliases: string[] };
    evidenceQuotes: string[]; // already verbatim-verified against cited blocks
  }): Promise<AssertionEntailmentJudgment>;
}

// Concept-vs-proposition admission judge (ADR-0005). A bounded, forced-tool LLM
// judgment over ONE admitted-`core` label, run on an independent model family
// (`kg-independent-judge`) so the judge is not the admission extractor grading its
// own homework. It answers the semantic question the deterministic lexical veto got
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

// Extraction Run persistence — run-scoped, never publishes (ADR-0017). `persist`
// accepts the immutable run artifact so PostgreSQL writes the run, its normalized
// CEP evidence rows, and the artifact envelope in ONE transaction (R: no
// authoritative relational state without its immutable artifact).
export interface ExtractionRunStorePort {
  persist(result: ExtractionRunResult, artifact: ArtifactEnvelope<ExtractionRunResult>): Promise<void>;
  // Explicitly selected runs, reduced to the deterministic build read model.
  // Publication never auto-selects "latest succeeded": the operator names the
  // runs to publish, so a mechanically-valid but semantically-bad run cannot
  // silently mutate the graph (AGENTS rule 11). Fails closed on unknown or
  // not-yet-succeeded ids.
  runsForBuildByIds(runIds: string[]): Promise<RunForBuild[]>;
}

// Atomic graph-version publication (ADR-0010, ADR-0007 reset). Refuses to mutate a
// published version. `publish` accepts the immutable graph-snapshot artifact so
// PostgreSQL writes the graph-version rows, the unioned CEP evidence, and the
// artifact envelope in ONE transaction — no authoritative relational state without
// its immutable artifact (matches the extraction transaction in U3).
export interface GraphVersionStorePort {
  existingConceptIdentities(): Promise<PublishedConceptIdentity[]>;
  publish(input: {
    snapshot: GraphSnapshot;
    refinementConfigHash: string;
    runMemberships: { runId: string; sourceResourceId: string }[];
    refinementDecisions: RefinementDecisionRecord[];
    artifact: ArtifactEnvelope<GraphSnapshot>;
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

// Bounded LLM prerequisite judgment over ONE same-domain concept pair (ADR-0019
// reset). Every same-domain CEP pair is judged exhaustively — there is no
// embedding clustering or candidate-group gate. Each side carries its published
// CEP (definitions, bounded mentions, labeled typed assertions); an
// explicit-prerequisite-hint is labeled evidence the judge MAY weigh, never a
// deterministic edge or direction override (R11, KTD). Forced named tool schema;
// the application validates arguments and maps "uncertain" to a flagged,
// path-excluded edge. The judge proposes; cycle removal + transitive reduction
// dispose.
export interface PrerequisiteJudgmentPort {
  readonly model: string;
  judge(input: {
    declaredDomain: string;
    a: PrerequisiteConceptContext;
    b: PrerequisiteConceptContext;
  }): Promise<PrerequisiteJudgment>;
}

export interface GroundingGenerationPort {
  readonly model: string;
  generate(input: {
    derivedNodeId: string;
    declaredDomain: string;
    nodeLabel: string;
    scaffoldedAnchors: { conceptId: string; canonicalLabel: string; definitionQuotes: string[] }[];
  }): Promise<GeneratedGroundingBundle>;
}

// Missing-prerequisite proposal (R7, KTD6, handoff constraint). The explicit,
// inspectable node-IDENTITY operation that must run BEFORE any grounding is minted:
// for ONE anchor, propose up to `maxProposals` prerequisite concepts the source
// assumes a learner already knows but never teaches. Bounded and anchor-driven (no
// unbounded graph-wide gap-filling); the application dedupes proposals against the
// labels already present in the run (anchors + rescued + already-minted) within the
// Declared Domain. Forced named tool schema; arguments validated and failed closed.
// The generator stays DeepSeek-family (AGENTS rule 5), which is exactly why the
// generated-node ordering judge must be cross-family (KTD7).
export interface MissingPrerequisiteProposalPort {
  readonly model: string;
  propose(input: {
    declaredDomain: string;
    anchor: { conceptId: string; canonicalLabel: string; definitionQuotes: string[] };
    existingNodeLabels: string[];
    maxProposals: number;
  }): Promise<MissingPrerequisiteProposal[]>;
}

// Baseline node difficulty (ADR-0019). MVP impl = deterministic DAG-depth mock
// behind this port; Bradley-Terry pairwise calibration replaces the impl without
// changing the port. Reads concepts + the inferred prereq DAG; one score each.
export interface DifficultyPort {
  readonly method: string;
  // Scores DERIVED NODE ids — anchors AND enrichment nodes (R12) — not asserted
  // Concepts: the inferred DAG spans the union, so difficulty must too. Generated
  // nodes are never fabricated into `Concept` values to satisfy the port (handoff
  // constraint). `nodeIds` are `derived_node_id`s; the returned `conceptId` field
  // carries the derived node id (the difficulty store keys on derived_node_id).
  score(input: { nodeIds: string[]; prerequisiteEdges: InferredPrerequisiteEdge[] }): Promise<ConceptDifficulty[]>;
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
  // Rescue source for Graph Enrichment (KTD5, R7): the member Extraction Runs of
  // `graphVersionId` (resolved via graph_version_run_memberships) reduced to their
  // rejected/optional admission proposals that carry a verbatim MENTION but no
  // Definition Passage. Each carries resolved mention provenance plus the cited
  // block's text so the verbatim floor (U6) re-verifies at enrichment time. These
  // become `source_mentioned`/`derived` nodes only and never touch the asserted core.
  mentionedNonCoreCandidates(graphVersionId: string): Promise<MentionedNonCoreCandidate[]>;
}

// Learner Path persistence (ADR-0019, ADR-0011). The read-only surface the
// Cytoscape view renders; the CLI computes and persists, the UI never computes.
export interface LearnerPathStorePort {
  persist(path: LearnerPath): Promise<void>;
  getPath(input: { enrichmentId: string; targetConceptId: string; learnerStateRef: string }): Promise<LearnerPath | undefined>;
}
