import type {
  ArtifactEnvelope,
  Concept,
  ConceptAdmissionDecision,
  ConceptCandidate,
  ConceptClaim,
  GraphSnapshot,
  SourceBlock,
  StructuredDocument
} from "@lrnki/domain-core";

export interface StructuredDocumentParserPort {
  supports(contentType: string): boolean;
  parse(input: { sourceResourceId: string; bytes: Uint8Array; contentType: string }): Promise<StructuredDocument>;
}

export interface ConceptDiscoveryPort {
  discover(input: { document: StructuredDocument }): Promise<ConceptCandidate[]>;
}

export interface ConceptAdmissionPort {
  admit(input: { document: StructuredDocument; candidates: ConceptCandidate[] }): Promise<ConceptAdmissionDecision[]>;
}

export interface ConceptConditionedClaimExtractionPort {
  extract(input: { document: StructuredDocument; concept: Concept; evidenceNeighborhood: SourceBlock[] }): Promise<ConceptClaim[]>;
}

export interface ArtifactRepositoryPort {
  append<TPayload>(artifact: ArtifactEnvelope<TPayload>): Promise<void>;
}

export interface GraphPublicationRepositoryPort {
  publish(snapshot: GraphSnapshot): Promise<void>;
  getPublishedSnapshot(): Promise<GraphSnapshot | undefined>;
}

export interface SourceObjectStoragePort {
  putObject(input: { bucket: string; objectKey: string; bytes: Uint8Array; contentType: string }): Promise<void>;
  getObject(input: { bucket: string; objectKey: string }): Promise<{ bytes: Uint8Array; contentType?: string }>;
}
