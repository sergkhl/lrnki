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

// Deterministic label normalization — the merge key for cross-source identity
// (ADR-0015). Same normalizedLabel within the same Declared Domain merges; the
// same normalizedLabel across domains is a homograph. Must stay stable: changing
// it changes graph identity, so both extraction and build call this one function.
export function normalizeConceptLabel(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Readable slug minted once at first publication (ADR-0015). Collisions get a
// numeric suffix supplied by the caller; the slug is never re-derived afterward.
export function slugifyConceptLabel(label: string): string {
  const base = normalizeConceptLabel(label).replace(/\s+/g, "-");
  return base || "concept";
}

// Evidence verification (ADR-0007): a quote is verified when it traces to the
// cited block. Matching tolerates source formatting noise the model normalizes
// away when quoting — Markdown emphasis/code markers, blockquote prefixes, and
// curly vs straight quotes — but nothing more. No quote, no claim still holds.
function normalizeEvidenceText(text: string): string {
  return text
    .replace(/[`*_]/g, "")
    .replace(/^\s*>+\s?/gm, "")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function evidenceQuoteMatches(blockText: string, evidenceQuote: string): boolean {
  const quote = normalizeEvidenceText(evidenceQuote);
  if (quote.length === 0) return false;
  return normalizeEvidenceText(blockText).includes(quote);
}

// Closed six-relation registry (ADR-0016). Models choose from this enum; only humans extend it.
export type RelationPredicate = "is-a" | "part-of" | "asserted-prerequisite-of" | "contrasts-with" | "uses" | "defined-as";
export const CONCEPT_RELATIONS: RelationPredicate[] = ["is-a", "part-of", "asserted-prerequisite-of", "contrasts-with", "uses"];
export const LITERAL_RELATIONS: RelationPredicate[] = ["defined-as"];

// ---------------------------------------------------------------------------
// Run-scoped extraction artifacts (ADR-0017). These reference CANDIDATES by a
// run-local key, never published concepts. A block reference is `blockId` here;
// the application boundary resolves it to a persisted source_block_id.
// ---------------------------------------------------------------------------

export type BlockEvidence = { blockId: string; evidenceQuote: string };

export type DiscoveredCandidate = {
  candidateKey: string;
  canonicalLabel: string;
  aliases: string[];
  mentions: BlockEvidence[];
};

export type AdmissionDecision = {
  candidateKey: string;
  tier: CandidateTier;
  independentlyMeaningful: boolean;
  independentlyTeachable: boolean;
  durableBeyondSource: boolean;
  reasonCodes: string[];
  confidence: number;
};

export type ExtractedClaimObject =
  | { kind: "concept"; candidateKey: string }
  | { kind: "literal"; value: string };

export type ExtractedClaim = {
  subjectCandidateKey: string;
  predicate: RelationPredicate;
  object: ExtractedClaimObject;
  evidence: BlockEvidence[];
  confidence: number;
};

export type MissingConceptProposal = {
  proposedLabel: string;
  rationale: string;
  evidence?: BlockEvidence;
};

export type ClaimExtractionResult = {
  claims: ExtractedClaim[];
  proposals: MissingConceptProposal[];
};

export type ConceptCandidate = {
  candidateId: string;
  canonicalLabel: string;
  aliases: string[];
  evidence: EvidenceReference[];
};

// ---------------------------------------------------------------------------
// Persistable Extraction Run aggregate (ADR-0017). Assembled in the application
// boundary after discovery, admission, claim extraction, and deterministic
// evidence validation; persisted once, run-scoped. References blocks by blockId
// (the parser-local id); the store resolves these to source_block_id.
// ---------------------------------------------------------------------------

export type ValidationOutcome = "verified" | "rejected";

export type RunCandidate = {
  candidateKey: string;
  canonicalLabel: string;
  normalizedLabel: string;
  aliases: string[];
  mentions: BlockEvidence[];
  admission: {
    tier: CandidateTier;
    independentlyMeaningful: boolean;
    independentlyTeachable: boolean;
    durableBeyondSource: boolean;
    reasonCodes: string[];
    confidence: number;
  };
};

export type RunClaim = {
  subjectCandidateKey: string;
  predicate: RelationPredicate;
  object: ExtractedClaimObject;
  evidence: BlockEvidence[];
  modelConfidence: number;
  evidenceCount: number;
  validationOutcome: ValidationOutcome;
};

export type ExtractionRunResult = {
  runId: string;
  sourceResourceId: string;
  sourceDocumentId: string;
  declaredDomain: string;
  pipelineConfigHash: string;
  candidates: RunCandidate[];
  claims: RunClaim[];
  proposals: MissingConceptProposal[];
  costUsd?: number;
  latencyMs?: number;
};

// ---------------------------------------------------------------------------
// Publication model (ADR-0010, ADR-0015). IRIs minted once, frozen.
// ---------------------------------------------------------------------------

export type Concept = {
  conceptId: string;
  iri: string;
  canonicalLabel: string;
  normalizedLabel: string;
  declaredDomain: string;
  aliases: string[];
  trustTier: TrustTier;
  homograph: boolean;
};

export type PublishedClaimObject =
  | { kind: "concept"; conceptId: string }
  | { kind: "literal"; value: string };

export type PublishedClaim = {
  claimId: string;
  subjectConceptId: string;
  predicate: RelationPredicate;
  object: PublishedClaimObject;
  evidence: EvidenceReference[];
  trustTier: TrustTier;
  modelConfidence: number;
  evidenceCount: number;
  contradictionState: "none" | "possible" | "material";
};

export type GraphSnapshot = {
  graphVersionId: string;
  concepts: Concept[];
  claims: PublishedClaim[];
};

// Read model the deterministic Graph-Version Build consumes (ADR-0017): the
// latest succeeded run per source, reduced to admitted-core concepts and
// evidence-verified claims with resolved source_block_id references.
export type BuildCandidate = {
  candidateKey: string;
  canonicalLabel: string;
  normalizedLabel: string;
  aliases: string[];
};

export type BuildClaim = {
  subjectCandidateKey: string;
  predicate: RelationPredicate;
  object: ExtractedClaimObject;
  evidence: EvidenceReference[];
  modelConfidence: number;
  evidenceCount: number;
};

export type RunForBuild = {
  runId: string;
  sourceResourceId: string;
  declaredDomain: string;
  coreCandidates: BuildCandidate[];
  verifiedClaims: BuildClaim[];
};

export type PublishedConceptIdentity = {
  conceptId: string;
  iri: string;
  normalizedLabel: string;
  declaredDomain: string;
};

export type RefinementDecisionRecord = {
  decisionType: string;
  subject: unknown;
  outcome: string;
  rationale: string;
  provenance: unknown;
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
