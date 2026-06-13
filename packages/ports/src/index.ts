import type {
  AdmissionProposal,
  ArtifactEnvelope,
  ClaimExtractionResult,
  DiscoveredCandidate,
  ExtractionRunResult,
  GraphSnapshot,
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
    subject: { candidateKey: string; canonicalLabel: string };
    admittedConcepts: { candidateKey: string; canonicalLabel: string }[];
    evidenceNeighborhood: SourceBlock[];
  }): Promise<ClaimExtractionResult>;
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
  getPublishedSnapshot(): Promise<GraphSnapshot | undefined>;
}

export interface SourceObjectStoragePort {
  putObject(input: { bucket: string; objectKey: string; bytes: Uint8Array; contentType: string }): Promise<void>;
  getObject(input: { bucket: string; objectKey: string }): Promise<{ bytes: Uint8Array; contentType?: string }>;
}
