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

// Whether a label NAMES a concept or ASSERTS a proposition about one is a SEMANTIC
// judgment, not a provable property, so it is decided by the measured neural
// concept-vs-proposition admission judge (ADR-0005, `AdmissionLabelJudgment`),
// never a hardcoded lexical matcher (AGENTS rule 16). The earlier deterministic
// `looksLikePropositionLabel` veto was removed: its closed copula/verb/participle
// list both missed real propositions (no listed verb, e.g. "Operator Set as
// Bottleneck to Performance") and would wrongly demote legitimate concepts
// ("Right to Be Forgotten"). Source-grounding of the canonical label stays
// deterministic in `applyAdmissionPolicy` because it IS a provable substring
// property.

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
  extractionAttempt?: number;
};

export type ClaimExtractionFeedback = {
  rejectedClaims: {
    predicate: RelationPredicate;
    object: ExtractedClaimObject;
    evidence: BlockEvidence[];
    boundaryReasonCodes: string[];
  }[];
};

export type MissingConceptProposal = {
  proposedLabel: string;
  rationale: string;
  evidence?: BlockEvidence;
  extractionAttempt: number;
};

export type ClaimExtractionResult = {
  claims: ExtractedClaim[];
  proposals: MissingConceptProposal[];
};

// Semantic claim-entailment judgment (ADR-0007). One bounded LLM judgment over a
// single concept-to-concept claim whose evidence already verifies verbatim. It
// replaces the brittle deterministic lexical-entailment veto (AGENTS rule 16):
// real prose entails relations through pronouns, apposition, lists, and synonym
// verbs that no hardcoded surface matcher can enumerate. The judge can ONLY
// downgrade a deterministically-surviving claim — it never resurrects one that
// failed the verbatim floor or a structural gate. `entailingSpan` must be a
// substring of a provided (already-verbatim) quote; the application boundary
// fails closed to `entailed: false` when it is not.
export type ClaimEntailmentJudgment = {
  entailed: boolean;
  entailingSpan: string;
  rationale: string;
};

// Concept-vs-proposition admission judgment (ADR-0005). One bounded LLM judgment
// over a single admitted-`core` label, replacing the brittle deterministic
// `looksLikePropositionLabel` lexical veto (AGENTS rule 16): "is this label a
// proposition?" is a semantic judgment, not a provable property, so a hardcoded
// copula/verb list both missed real propositions (no listed verb) and would
// wrongly demote legitimate concepts ('Right to Be Forgotten'). The judge is
// DOWNGRADE-ONLY — it demotes a `core` label whose surface asserts a full claim
// to `optional`, naming the underlying noun phrase the concept reduces to; it
// never resurrects an `optional` candidate. Fail closed = preserve recall: the
// application boundary keeps `core` unless `labelKind` is `proposition_or_claim`
// AND both `groundingSpan` and `underlyingNounPhrase` are source-grounded under
// the deterministic evidence normalizer, so the judge can never demote on text
// absent from the candidate's cited evidence.
export type AdmissionLabelKind = "concept" | "proposition_or_claim";

export type AdmissionLabelJudgment = {
  labelKind: AdmissionLabelKind;
  underlyingNounPhrase: string;
  groundingSpan: string;
  rationale: string;
};

export type ConceptCandidate = {
  candidateId: string;
  canonicalLabel: string;
  aliases: string[];
  evidence: EvidenceReference[];
};

// ---------------------------------------------------------------------------
// Gate 2 oracle independence triangle (ADR-0013, AGENTS rule 11). Three model
// families with disjoint roles so no model grades its own homework: DeepSeek
// EXTRACTS (the system under test), MiniMax M3 (`kg-oracle-reference`) AUTHORS
// the admission reference, Mistral Small (`kg-oracle-judge`) AUDITS each
// reference label. Disagreements are quarantined out of the trusted set. The
// frozen reference is a MODEL-authored oracle, never human gold — it carries
// `needsHumanReview` and freezes model/prompt/rubric/evidence/source-hash so it
// can be replayed and inspected before it is trusted.
// ---------------------------------------------------------------------------

// The reference only authors admit-worthy tiers; reject/quarantine are not a
// reference author's call (a source not teaching a concept is simply an absence).
export type OracleAdmissionTier = "core" | "optional";

export type OracleReferenceLabel = {
  label: string;
  normalizedLabel: string;
  expectedTier: OracleAdmissionTier;
  evidenceQuotes: string[]; // verbatim sub-quotes copied from the source blocks
  rationale: string;
};

export type OracleAdmissionReferenceDraft = {
  labels: OracleReferenceLabel[];
};

// One second-judge verdict over a single reference label. `agrees` keeps the
// label in the trusted set; a disagreement quarantines it. `correctedTier` is
// advisory provenance only — the trusted set uses the reference author's tier
// for agreed labels and excludes quarantined ones (no silent relabel).
export type OracleAuditVerdict = {
  agrees: boolean;
  correctedTier?: OracleAdmissionTier;
  rationale: string;
};

export type OracleSecondJudgeStatus = "agreed" | "quarantined";

export type FrozenOracleLabel = OracleReferenceLabel & {
  secondJudgeStatus: OracleSecondJudgeStatus;
  // Why the label was kept or quarantined: an audit disagreement, or a
  // fail-closed grounding failure (evidence not verbatim in the source).
  quarantineReason?: "audit_disagreement" | "evidence_not_grounded";
  auditRationale: string;
};

export type FrozenAdmissionOracle = {
  meta: {
    sourceResourceId: string;
    declaredDomain: string;
    title: string;
    sourceContentHash: string;
    referenceModel: string;
    auditModel: string;
    promptVersion: string;
    rubricVersion: string;
    authoredAt: string;
    authoredBy: "oracle-triangle";
    needsHumanReview: true;
  };
  // Every authored label, including quarantined ones (kept for inspection); the
  // scorer trusts only the `agreed` subset.
  labels: FrozenOracleLabel[];
};

// One production candidate's admitted tier, the minimal projection the scorer
// compares against the trusted reference set.
export type ProductionAdmittedConcept = {
  canonicalLabel: string;
  normalizedLabel: string;
  tier: CandidateTier;
};

export type OracleTierMetrics = {
  referenceCount: number; // trusted (agreed) reference labels at/above this tier
  productionCount: number; // production candidates at/above this tier
  matched: number; // reference labels a production candidate covers
  precision: number;
  recall: number;
  f1: number;
};

export type AdmissionOracleScore = {
  sourceResourceId: string;
  runId: string;
  quarantinedReferenceLabels: number;
  core: OracleTierMetrics; // core-set agreement
  admit: OracleTierMetrics; // core ∪ optional agreement
  missedCore: string[]; // trusted core references no production core covers
  extraCore: string[]; // production core labels absent from the trusted reference
};

// ---------------------------------------------------------------------------
// Measured neural label-aligner for Gate 2 SCORING ONLY (TODO #1, AGENTS rule 16).
//
// Exact normalizedLabel matching is the graph's identity key (ADR-0015) and stays
// authoritative for publication — but as a SCORER it UNDER-counts oracle agreement:
// a reference "Monte Carlo Tree Search" and a production "Monte Carlo Tree Search
// (MCTS)" are the SAME concept in different surface forms, yet exact matching
// scores each as both a miss AND an extra, halving precision/recall on identity it
// actually has. A hardcoded plural/hyphen/acronym matcher is forbidden (rule 16) —
// and would wrongly merge genuinely distinct concepts that share surface words
// ("Operator" vs "Operator set" vs "Operator policy"). So concept identity for
// scoring is decided by a bounded neural aligner, run OFF the publication path.
//
// Discipline that keeps this honest (rules 11/16): the aligner only ever MERGES a
// production label into the reference concept it is a surface variant of (it never
// relabels the graph); merging the wrong thing INFLATES the score, so the exact
// baseline is always reported beside the aligned score and the frozen alignment is
// human-reviewable. The aligner earns its keep only while it raises measured recall
// without merging distinct concepts.
// ---------------------------------------------------------------------------

export type OracleLabelAlignmentPair = {
  productionLabel: string;
  productionNormalizedLabel: string;
  referenceLabel: string;
  referenceNormalizedLabel: string;
  rationale: string;
};

export type OracleLabelAlignmentDraft = {
  pairs: OracleLabelAlignmentPair[];
};

export type FrozenOracleLabelAlignment = {
  meta: {
    sourceResourceId: string;
    runId: string;
    declaredDomain: string;
    alignmentModel: string;
    promptVersion: string;
    alignedAt: string;
    needsHumanReview: true;
  };
  // Only SURFACE-VARIANT merges (productionNormalizedLabel != referenceNormalizedLabel);
  // exact-equal labels already match and need no alignment. Each production label
  // appears at most once (a production label denotes at most one reference concept).
  pairs: OracleLabelAlignmentPair[];
};

export type AlignedAdmissionOracleScore = {
  sourceResourceId: string;
  runId: string;
  quarantinedReferenceLabels: number;
  // Deterministic exact-normalized baseline (the provable floor) — always reported.
  exact: { core: OracleTierMetrics; admit: OracleTierMetrics };
  // Same metric after the measured aligner merges production surface variants into
  // the reference concept they name. Reported BESIDE exact so any inflation is visible.
  aligned: { core: OracleTierMetrics; admit: OracleTierMetrics };
  // The surface-variant merges actually applied (the agreement exact matching missed).
  surfaceVariantMatches: OracleLabelAlignmentPair[];
  // Genuinely missing/extra core AFTER alignment (surface variants no longer counted).
  missedCore: string[];
  extraCore: string[];
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
  extractionAttempt: number;
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
// explicitly selected succeeded runs, reduced to admitted-core concepts and
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

// ---------------------------------------------------------------------------
// Graph Enrichment — the third operation (ADR-0019). Produces a Derived Graph
// Layer keyed to a published version: graph-global structure no single source
// asserted. LLM-proposed, symbolically constrained, never mutates the asserted
// core. The inferred-relation vocabulary is SEPARATE from the closed asserted
// RelationPredicate registry (ADR-0016) — these names must never collide.
// ---------------------------------------------------------------------------

export type InferredRelationPredicate = "inferred-prerequisite-of";

export type PrerequisiteCandidateGroup = {
  groupId: string;
  // Contextual-embedding group used only for Prerequisite Candidate Selection.
  // It never decides Concept identity or creates an edge.
  conceptIds: string[];
  embeddingModel: string;
};

// One bounded LLM prerequisite judgment over a gated, evidence-packed pair.
// "uncertain" is flagged for review and excluded from the path, never silently
// promoted to an edge (concept-first method stack §4; goal 1.6/4).
export type PrerequisiteJudgment = {
  prerequisiteConceptId: string;
  dependentConceptId: string;
  outcome: "directed" | "none" | "uncertain";
  confidence: number;
  rationale: string;
};

// An edge of the inferred prerequisite DAG: prerequisite must precede dependent.
// Survives only after deterministic cycle removal + transitive reduction +
// weak-edge cut (ADR-0019). `uncertain` edges are retained for inspection but
// excluded from path traversal.
export type InferredPrerequisiteEdge = {
  prerequisiteConceptId: string;
  dependentConceptId: string;
  predicate: InferredRelationPredicate;
  confidence: number;
  uncertain: boolean;
  candidateGroupId?: string;
  provenance: { judgmentRationale: string; evidencePacketRef?: string };
};

export type PrerequisiteJudgmentTrace = {
  declaredDomain: string;
  a: { conceptId: string; canonicalLabel: string; definition?: string };
  b: { conceptId: string; canonicalLabel: string; definition?: string };
  evidencePacket: SourceBlock[];
  judgment: PrerequisiteJudgment;
};

export type InferredEdgeDisposition = {
  prerequisiteConceptId: string;
  dependentConceptId: string;
  disposition: "insufficient_evidence" | "uncertain" | "weak_cut" | "cycle_removed" | "transitive_reduction" | "kept";
};

export type EnrichmentRunTrace = {
  enrichmentId: string;
  graphVersionId: string;
  enrichmentConfigHash: string;
  judgments: PrerequisiteJudgmentTrace[];
  dispositions: InferredEdgeDisposition[];
};

// Baseline node difficulty. MVP `method` is "dag-depth-mock" (topological depth);
// Bradley-Terry calibration replaces the producer later behind the same shape.
export type ConceptDifficulty = {
  conceptId: string;
  score: number;
  method: string;
  components: Record<string, number>;
};

// The immutable output of Graph Enrichment, keyed to (graphVersionId +
// enrichmentConfigHash) and replayable from that key plus captured judgments.
export type DerivedGraphLayer = {
  enrichmentId: string;
  graphVersionId: string;
  enrichmentConfigHash: string;
  embeddingModel: string;
  // The bounded prerequisite-judge model (provenance for the inferred DAG). Stored
  // alongside embeddingModel so a layer fully records which models proposed it.
  judgeModel: string;
  prerequisiteCandidateGroups: PrerequisiteCandidateGroup[];
  prerequisiteEdges: InferredPrerequisiteEdge[];
  difficulties: ConceptDifficulty[];
};

// ---------------------------------------------------------------------------
// Learner Path — the vertical slice's projection output (ADR-0019). A real port
// boundary (LearnerState) with a mock impl; real IRT/KT (ADR-0014) replaces the
// impl, never the shape. Computed by a CLI op, rendered read-only (ADR-0011).
// ---------------------------------------------------------------------------

export type LearnerPathStep = {
  position: number;
  conceptId: string;
  difficulty: number;
  includedReason: "prerequisite" | "target";
};

export type LearnerPath = {
  learnerPathId: string;
  graphVersionId: string;
  enrichmentId: string;
  targetConceptId: string;
  // Identifies the learner state used; the mock is "mock:empty" (knows nothing).
  learnerStateRef: string;
  steps: LearnerPathStep[];
};
