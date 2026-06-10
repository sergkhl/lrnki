export type CandidateTier = "core" | "optional" | "reject" | "quarantine";
export type ClaimScope = "durable_domain_knowledge" | "scoped_empirical_result" | "reference_expansion" | "inferred_relationship";
export type TrustTier = "curated_source_grounded" | "cross_source_synthesized" | "reference_expansion" | "inferred_relationship" | "model_proposed" | "quarantined";

export type SourceLocator = {
  page?: number;
  slide?: number;
  xpath?: string;
  characterStart?: number;
  characterEnd?: number;
};

export type SourceBlockType = "title" | "abstract" | "heading" | "paragraph" | "list_item" | "caption" | "reference" | "appendix" | "code" | "table_placeholder" | "figure_placeholder";

export type SourceBlock = {
  blockId: string;
  blockType: SourceBlockType;
  text: string;
  headingPath: string[];
  locator: SourceLocator;
};

export type StructuredDocument = {
  sourceResourceId: string;
  parserName: string;
  parserVersion: string;
  parserConfigHash: string;
  blocks: SourceBlock[];
};

export type EvidenceReference = {
  sourceResourceId: string;
  sourceBlockId: string;
  evidenceQuote: string;
};

export type ConceptCandidate = {
  candidateId: string;
  canonicalLabel: string;
  aliases: string[];
  evidence: EvidenceReference[];
};

export type ConceptAdmissionDecision = {
  candidateId: string;
  tier: CandidateTier;
  independentlyMeaningful: boolean;
  independentlyTeachable: boolean;
  durableBeyondSource: boolean;
  reasonCodes: string[];
  confidence: number;
};

export type Concept = {
  conceptId: string;
  iri: string;
  canonicalLabel: string;
  aliases: string[];
  trustTier: TrustTier;
};

export type ClaimObject =
  | { kind: "concept"; conceptId: string }
  | { kind: "literal"; value: unknown; datatype: string }
  | { kind: "scoped_statement"; text: string };

export type ConceptClaim = {
  claimId: string;
  subjectConceptId: string;
  predicate: string;
  object: ClaimObject;
  scope: ClaimScope;
  evidence: EvidenceReference[];
  confidence: number;
  contradictionState: "none" | "possible" | "material";
};

export type GraphSnapshot = {
  graphVersionId: string;
  concepts: Concept[];
  claims: ConceptClaim[];
};

export type ArtifactEnvelope<TPayload = unknown> = {
  artifactId: string;
  artifactType: string;
  schemaVersion: string;
  runId?: string;
  graphVersionId?: string;
  producer: string;
  producerVersion: string;
  configHash: string;
  createdAt: string;
  payload: TPayload;
};
