export type CandidateTier = "core" | "optional" | "reject" | "quarantine";
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

// Source-role / Declared-Domain relevance (R12, ADR-0005). A SEMANTIC judgment
// the admission prompt makes per atomic proposal, replacing the deterministic
// illustrative-section regex (AGENTS rule 16). `out_of_domain_illustration`
// material — an algorithm or SQL example used only to illustrate an
// educational-technology source — must REJECT, never linger as `optional`; the
// application boundary forces the effective tier to `reject` on that role so a
// neural decision, not a lexical heading matcher, removes off-domain noise.
export type AdmissionSourceRole = "declared_domain_concept" | "out_of_domain_illustration";

// Atomic admission proposal (R13, ADR-0005). One discovered Candidate may be a
// CONFLATED label ("The stack and the heap") that yields MULTIPLE atomic
// proposals, each naming a single concept. `parentCandidateKey` is the discovered
// Candidate this atom was split from (provenance); `atomicKey` is a run-local
// stable key unique across all proposals. Core Set Selection operates over the
// atomic proposals, not the discovered candidates.
export type AdmissionProposal = {
  atomicKey: string;
  parentCandidateKey: string;
  proposedCanonicalLabel: string;
  tier: CandidateTier;
  sourceRole: AdmissionSourceRole;
  standaloneLearningObjective: AdmissionCriterionProposal;
  establishedDomainMeaning: AdmissionCriterionProposal;
  organizingPower: OrganizingPowerProposal;
  coreSelected: boolean;
  selectionReasonCode: CoreSelectionReasonCode;
  reasonCodes: string[];
  confidence: number;
};

// ---------------------------------------------------------------------------
// Concept Evidence Profile (ADR-0007 reset). The CEP replaces asserted claims as
// the published Concept context: per admitted atomic Concept, the curated source
// teaches it through one or more meaning-bearing DEFINITION PASSAGES, a bounded
// salience-ranked set of MENTION PASSAGES, and zero or more OPTIONAL TYPED
// ASSERTIONS. Every element is verbatim-grounded against a cited block (R10); the
// neural entailment judge guards ONLY the optional typed assertions. General
// concept-to-concept relationships (taxonomy, structure, contrast, employment)
// survive as untyped mention passages, never typed edges (R6/R7, AE1).
// ---------------------------------------------------------------------------

// The ONLY two guarded typed assertions (R6). `defines` carries a model-authored
// literal definition (a faithful paraphrase, judged for entailment — no surface
// matcher can verify a paraphrase, AGENTS rule 16). `explicit-prerequisite-hint`
// names an admitted Concept the source explicitly flags as needed first. Both are
// guarded EVIDENCE inside the CEP, never authoritative edges or numeric priors
// (KTD): a hint is passed to enrichment with its type label but no boost or
// direction override.
export type OptionalAssertionType = "defines" | "explicit-prerequisite-hint";

// What the concept-conditioned extractor returns for one subject Concept, by
// run-local key. Definition and mention passages are verbatim block quotes; the
// mention order IS the neural salience order (most to least useful for enrichment)
// — the application keeps the first configured number without re-ranking (R4).
export type ExtractedTypedAssertion =
  | { type: "defines"; literalValue: string; evidence: BlockEvidence[] }
  | { type: "explicit-prerequisite-hint"; objectCandidateKey: string; evidence: BlockEvidence[] };

export type ExtractedEvidenceProfile = {
  definitions: BlockEvidence[];
  mentions: BlockEvidence[];
  assertions: ExtractedTypedAssertion[];
};

// One bounded LLM judgment over a single optional typed assertion whose evidence
// already verifies verbatim (ADR-0007). Mirrors the retired claim-entailment
// judge: it can ONLY reject an assertion; a rejected assertion's underlying
// passage is preserved as an untyped mention. `entailingSpan` must be a substring
// of a provided quote; the application boundary fails closed to `entailed: false`.
export type AssertionEntailmentJudgment = {
  entailed: boolean;
  entailingSpan: string;
  rationale: string;
};

// The validated, run-scoped Concept Evidence Profile assembled at the application
// boundary: definition + mention passages cleared the verbatim floor and were
// deduplicated, mentions were bounded to maxMentionsPerConceptPerSource in neural
// order, and each surviving typed assertion passed entailment. `complete` is true
// only when at least one verified definition passage remains; an admitted Concept
// with no complete CEP makes the Extraction Run unsuccessful (R1).
export type RunTypedAssertion =
  | { type: "defines"; literalValue: string; evidence: BlockEvidence[] }
  | { type: "explicit-prerequisite-hint"; objectCandidateKey: string; evidence: BlockEvidence[] };

export type RunEvidenceProfile = {
  candidateKey: string;
  tier: CandidateTier;
  definitions: BlockEvidence[];
  mentions: BlockEvidence[];
  assertions: RunTypedAssertion[];
  complete: boolean;
};

export type ExtractionQualityIssue = {
  stage: string;
  candidateKey?: string;
  conceptLabel?: string;
  issueType: string;
  severity: "info" | "warning";
  evidenceQuotes: string[];
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
// Persistable Extraction Run aggregate (ADR-0017). Assembled in the application
// boundary after discovery, admission, claim extraction, and deterministic
// evidence validation; persisted once, run-scoped. References blocks by blockId
// (the parser-local id); the store resolves these to source_block_id.
// ---------------------------------------------------------------------------

export type ValidationOutcome = "verified" | "rejected";

export type RunCandidate = {
  // The atomic concept's run-local key (the unit of identity downstream). For an
  // unsplit candidate this equals the discovered candidateKey; for a split one it
  // is the atomic proposal's key.
  candidateKey: string;
  // The discovered Candidate this atom was split from (provenance for R13). Equals
  // candidateKey when admission did not split the candidate.
  parentCandidateKey: string;
  discoveredLabel: string;
  canonicalLabel: string;
  normalizedLabel: string;
  aliases: string[];
  mentions: BlockEvidence[];
  admission: {
    modelTier: CandidateTier;
    tier: CandidateTier;
    sourceRole: AdmissionSourceRole;
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

export type ExtractionRunResult = {
  runId: string;
  sourceResourceId: string;
  sourceDocumentId: string;
  declaredDomain: string;
  pipelineConfigHash: string;
  // Configured bound on mention passages kept per Concept per source (R4); part of
  // the pipeline configuration hash and recorded on the run for inspection.
  maxMentionsPerConceptPerSource: number;
  candidates: RunCandidate[];
  evidenceProfiles: RunEvidenceProfile[];
  qualityIssues: ExtractionQualityIssue[];
  // A run is unsuccessful when any admitted (core|optional) Concept lacks a
  // complete CEP (R1). Publication refuses non-succeeded runs (ADR-0017).
  status: "succeeded" | "failed";
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
  groundingOrigin: "document_anchored";
  role: "anchor";
  layer: "asserted";
};

// ---------------------------------------------------------------------------
// Grounding model for the asserted core plus derived enrichment nodes.
// `web_grounded` is intentionally reserved for a later retrieval-backed upgrade,
// not admitted to this milestone's union.
// ---------------------------------------------------------------------------

export type GroundingOrigin = "document_anchored" | "source_mentioned" | "llm_grounded";
export type ConceptRole = "anchor" | "prerequisite";
export type GraphLayer = "asserted" | "derived";

export function layerOf(origin: GroundingOrigin): GraphLayer {
  return origin === "document_anchored" ? "asserted" : "derived";
}

export function groundingForConcept(_concept: Concept): { groundingOrigin: "document_anchored"; role: "anchor"; layer: "asserted" } {
  return { groundingOrigin: "document_anchored", role: "anchor", layer: "asserted" };
}

// ---------------------------------------------------------------------------
// Published Concept Evidence Profile (ADR-0007 reset, R1/R2/R5/R6). The CEP is
// the published Concept context: there is NO sibling asserted-edge collection, so
// a published snapshot exposes zero asserted relations (R5, AE1/AE4). Each element
// carries full provenance — source, block, verbatim quote, heading path, and
// locator — so the Admin Lab and enrichment inspect a Concept's meaning without
// reconstructing it from claims (R2). Evidence accumulates across graph versions:
// publication UNIONS the base version's CEP with newly selected runs' evidence and
// exact-deduplicates, so a later version never replaces previously published
// evidence (R3, AE2).
// ---------------------------------------------------------------------------

export type PublishedEvidencePassage = {
  sourceResourceId: string;
  sourceBlockId: string;
  evidenceQuote: string;
  headingPath: string[];
  locator: SourceLocator;
};

// The only two guarded typed assertions (R6). Both stay EVIDENCE inside the CEP,
// never authoritative edges or numeric priors. `explicit-prerequisite-hint` names
// the published Concept it points at; a hint whose target is not published in the
// same graph version is omitted at build time (R9 publication discipline).
export type PublishedTypedAssertion =
  | { type: "defines"; literalValue: string; evidence: PublishedEvidencePassage[] }
  | { type: "explicit-prerequisite-hint"; objectConceptId: string; evidence: PublishedEvidencePassage[] };

export type PublishedConceptEvidenceProfile = {
  conceptId: string;
  definitions: PublishedEvidencePassage[];
  mentions: PublishedEvidencePassage[];
  assertions: PublishedTypedAssertion[];
};

// An immutable published graph version: stable Concepts plus one CEP each, and no
// asserted edges (R5). `baseGraphVersionId` names the version this build extends
// (`null` only for the initial build, KTD); the snapshot's evidence is the union
// of that base plus the newly selected runs.
export type GraphSnapshot = {
  graphVersionId: string;
  baseGraphVersionId: string | null;
  concepts: Concept[];
  evidenceProfiles: PublishedConceptEvidenceProfile[];
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

// Run-scoped CEP evidence reduced to the deterministic build read model (ADR-0017).
// Passages carry full resolved provenance (the store maps run-local blockIds to
// persisted source_block_id, heading path, and locator); typed assertions still
// reference the OTHER admitted Concept by run-local candidateKey, which the build
// resolves to a published Concept identity and omits when the target is absent.
export type BuildEvidencePassage = {
  sourceBlockId: string;
  evidenceQuote: string;
  headingPath: string[];
  locator: SourceLocator;
};

export type BuildTypedAssertion =
  | { type: "defines"; literalValue: string; evidence: BuildEvidencePassage[] }
  | { type: "explicit-prerequisite-hint"; objectCandidateKey: string; evidence: BuildEvidencePassage[] };

export type BuildEvidenceProfile = {
  candidateKey: string;
  definitions: BuildEvidencePassage[];
  mentions: BuildEvidencePassage[];
  assertions: BuildTypedAssertion[];
  complete: boolean;
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
  // One CEP per admitted core Concept in this run (ADR-0007 reset). Replaces the
  // retired verifiedClaims: publication unions these by Concept identity.
  evidenceProfiles: BuildEvidenceProfile[];
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

export type GroundingPassageVerbatimCheck =
  | { disposition: "verified"; sourceResourceId: string; sourceBlockId: string }
  | { disposition: "not_applicable_by_grounding"; rationale: string }
  | { disposition: "failed"; sourceResourceId: string; sourceBlockId: string; rationale: string };

export type GeneratedGroundingPassage = {
  passageType: "definition" | "mention";
  text: string;
  groundingOrigin: "llm_grounded";
  headingPath: string[];
  locator: SourceLocator;
  verbatimCheck: Extract<GroundingPassageVerbatimCheck, { disposition: "not_applicable_by_grounding" }>;
};

export type SourceMentionGroundingPassage = {
  passageType: "mention";
  text: string;
  groundingOrigin: "source_mentioned";
  sourceResourceId: string;
  sourceBlockId: string;
  evidenceQuote: string;
  headingPath: string[];
  locator: SourceLocator;
  verbatimCheck: Extract<GroundingPassageVerbatimCheck, { disposition: "verified" | "failed" }>;
};

export type GeneratedGroundingBundle = {
  derivedNodeId: string;
  groundingOrigin: "llm_grounded";
  definitions: GeneratedGroundingPassage[];
  mentions: GeneratedGroundingPassage[];
  scaffoldedAnchorConceptIds: string[];
  generatingModel: string;
  rationale: string;
};

export type AnchorProjectionNode = {
  nodeKind: "anchor";
  derivedNodeId: string;
  conceptId: string;
  groundingOrigin: "document_anchored";
  role: "anchor";
  layer: "asserted";
  canonicalLabel: string;
  normalizedLabel: string;
  declaredDomain: string;
  aliases: string[];
};

export type SourceMentionedEnrichmentNode = {
  nodeKind: "enrichment";
  derivedNodeId: string;
  groundingOrigin: "source_mentioned";
  role: "prerequisite";
  layer: "derived";
  canonicalLabel: string;
  normalizedLabel: string;
  declaredDomain: string;
  aliases: string[];
  groundingPassages: SourceMentionGroundingPassage[];
};

export type LlmGroundedEnrichmentNode = {
  nodeKind: "enrichment";
  derivedNodeId: string;
  groundingOrigin: "llm_grounded";
  role: "prerequisite";
  layer: "derived";
  canonicalLabel: string;
  normalizedLabel: string;
  declaredDomain: string;
  aliases: string[];
  groundingBundle: GeneratedGroundingBundle;
};

export type EnrichmentNode = SourceMentionedEnrichmentNode | LlmGroundedEnrichmentNode;
export type DerivedGraphNode = AnchorProjectionNode | EnrichmentNode;

// One explicit, inspectable proposal that a prerequisite concept the source
// ASSUMES but never teaches should be minted as an `llm_grounded` node (R7, KTD6).
// This is the node-identity decision the minting pass makes BEFORE any grounding is
// generated: `GroundingGenerationPort` fills a chosen label, it never decides which
// labels exist. Proposals are anchor-driven (each names the anchor it scaffolds) and
// bounded; the application dedupes them against existing node labels within domain.
export type MissingPrerequisiteProposal = {
  proposedLabel: string;
  rationale: string;
};

// A member Extraction Run's rejected/optional admission proposal that carries a
// verbatim source MENTION but no Definition Passage (KTD5) — the fully-provenanced
// source for a `source_mentioned` rescued node. `blockText` is carried so the
// verbatim floor (U6) re-verifies each mention quote against its cited block at
// enrichment time rather than trusting the extraction-time check.
export type MentionedNonCoreCandidate = {
  runId: string;
  declaredDomain: string;
  candidateKey: string;
  canonicalLabel: string;
  normalizedLabel: string;
  aliases: string[];
  tier: CandidateTier;
  mentions: {
    sourceResourceId: string;
    sourceBlockId: string;
    evidenceQuote: string;
    blockText: string;
    headingPath: string[];
    locator: SourceLocator;
  }[];
};

// A node-level record that the per-passage verbatim floor (U6, KTD4) ran on an
// enrichment node and what it decided. `not_applicable_by_grounding` is the recorded
// (never silent) exemption for `llm_grounded` generated passages; `verified`/`failed`
// are the real hard-gate outcomes for `source_mentioned` rescue evidence. Kept on the
// run trace so an operator can query why a generated node skipped the floor (R9, AE3).
export type GroundingVerbatimDisposition = {
  derivedNodeId: string;
  groundingOrigin: "source_mentioned" | "llm_grounded";
  outcome: "verified" | "failed" | "not_applicable_by_grounding";
  rationale: string;
};

// Each Concept's published CEP reduced to what the prerequisite judge needs (R11):
// meaning-bearing definition passages, bounded salience-ordered mention passages,
// and LABELED optional typed assertions. An `explicit-prerequisite-hint` appears
// here as labeled evidence the neural judge MAY weigh — never a deterministic edge,
// numeric prior, or direction override (KTD). The exhaustive same-domain design
// (ADR-0019 reset) removed contextual-embedding clustering and candidate groups.
export type PrerequisiteConceptContext = {
  conceptId: string;
  canonicalLabel: string;
  aliases: string[];
  definitions: string[];
  mentions: string[];
  assertions: { type: OptionalAssertionType; detail: string }[];
};

// One bounded LLM prerequisite judgment over an evidence-packed same-domain pair.
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
  provenance: { judgmentRationale: string };
};

export type PrerequisiteJudgmentTrace = {
  declaredDomain: string;
  a: PrerequisiteConceptContext;
  b: PrerequisiteConceptContext;
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
  derivedNodes: DerivedGraphNode[];
  judgments: PrerequisiteJudgmentTrace[];
  dispositions: InferredEdgeDisposition[];
  // Per-node verbatim-floor outcomes for enrichment nodes (R9, AE3). Recorded so the
  // `not_applicable_by_grounding` exemption for generated passages is never silent.
  groundingDispositions: GroundingVerbatimDisposition[];
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
  // The bounded prerequisite-judge model (provenance for the inferred DAG). The
  // embedding model and candidate groups were removed with the embedding tier
  // (ADR-0019 reset): every same-domain CEP pair is judged exhaustively.
  judgeModel: string;
  derivedNodes: DerivedGraphNode[];
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
