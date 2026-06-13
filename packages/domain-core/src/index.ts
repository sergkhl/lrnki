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

// Block types that carry the source's teachable body. The single source of truth
// for what discovery, admission, and claim extraction may see: non-teachable
// regions (bibliography, appendices, figure/table placeholders, captions) are
// stored for provenance but never fed to an LLM stage. Evidence verification
// still spans every stored block — prompts only expose body text, so a kept
// quote can only come from a body block anyway.
export const EXTRACTABLE_BLOCK_TYPES: SourceBlockType[] = ["title", "abstract", "heading", "paragraph", "list_item", "code"];

export function isExtractableBlock(block: SourceBlock): boolean {
  return EXTRACTABLE_BLOCK_TYPES.includes(block.blockType);
}

export function extractableBlocks(blocks: SourceBlock[]): SourceBlock[] {
  return blocks.filter(isExtractableBlock);
}

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
    .replace(/["']/g, "")
    .replace(/([([])\s+/g, "$1")
    .replace(/\s+([)\],.;:!?%])/g, "$1")
    .replace(/(\d)\s+([a-zA-Z])/g, "$1$2")
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

export type AdmissionCriterionProposal = {
  passed: boolean;
  rationale: string;
  evidence: BlockEvidence[];
};

export type OrganizingPowerAspectProposal = {
  summary: string;
  nature:
    | "definition-or-property"
    | "mechanism"
    | "structural-relationship"
    | "contrast"
    | "constraint"
    | "causal-or-limiting"
    | "empirical-evidence"
    | "motivation-or-example";
  evidence: BlockEvidence;
};

export type OrganizingPowerProposal = {
  passed: boolean;
  rationale: string;
  aspects: OrganizingPowerAspectProposal[];
};

export type CoreSelectionReasonCode =
  | "source_level_core"
  | "reducible_to_broader_candidate"
  | "supporting_mechanism"
  | "example_or_application"
  | "pseudo_concept_or_heading"
  | "insufficient_source_treatment"
  | "redundant_granularity"
  | "failed_model_eligibility"
  | "missing_core_selection";

export type AdmissionProposal = {
  candidateKey: string;
  proposedCanonicalLabel: string;
  tier: CandidateTier;
  standaloneLearningObjective: AdmissionCriterionProposal;
  establishedDomainMeaning: AdmissionCriterionProposal;
  organizingPower: OrganizingPowerProposal;
  coreSelected: boolean;
  selectionReasonCode: CoreSelectionReasonCode;
  reasonCodes: string[];
  confidence: number;
};

export type ExtractedClaimObject =
  | { kind: "concept"; candidateKey: string }
  | { kind: "literal"; value: string };

export type ClaimEvidenceLinkNature =
  | "taxonomic"
  | "structural"
  | "mechanism-employment"
  | "explicit-contrast"
  | "explicit-prerequisite"
  | "definitional"
  | "causal-or-motivational";

export type ClaimEvidenceDirection =
  | "subject-is-kind-of-object"
  | "subject-is-part-of-object"
  | "object-is-part-of-subject"
  | "subject-uses-object"
  | "object-uses-subject"
  | "subject-contrasts-with-object"
  | "subject-prerequisite-of-object"
  | "object-prerequisite-of-subject"
  | "subject-defined-by-literal"
  | "causal-or-motivational";

export type ExtractedClaim = {
  subjectCandidateKey: string;
  predicate: RelationPredicate;
  object: ExtractedClaimObject;
  evidenceLinkNature: ClaimEvidenceLinkNature;
  evidenceDirection: ClaimEvidenceDirection;
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
  discoveredLabel: string;
  canonicalLabel: string;
  normalizedLabel: string;
  aliases: string[];
  mentions: BlockEvidence[];
  admission: {
    modelTier: CandidateTier;
    tier: CandidateTier;
    proposedCanonicalLabel: string;
    standaloneLearningObjective: {
      modelPassed: boolean;
      passed: boolean;
      rationale: string;
      submittedEvidence: BlockEvidence[];
      evidence: BlockEvidence[];
    };
    establishedDomainMeaning: {
      modelPassed: boolean;
      passed: boolean;
      rationale: string;
      submittedEvidence: BlockEvidence[];
      evidence: BlockEvidence[];
    };
    organizingPower: {
      modelPassed: boolean;
      passed: boolean;
      rationale: string;
      submittedAspects: OrganizingPowerAspectProposal[];
      aspects: OrganizingPowerAspectProposal[];
    };
    coreSelected: boolean;
    selectionReasonCode: CoreSelectionReasonCode;
    reasonCodes: string[];
    boundaryReasonCodes: string[];
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
  boundaryReasonCodes: string[];
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
  // Quarantine decisions in a selected run block publication until resolved
  // (CONTEXT.md Graph-Version Build). Carried so the deterministic build can
  // fail closed and name the unresolved conflict rather than silently publish.
  quarantinedCandidates: { candidateKey: string; canonicalLabel: string }[];
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
