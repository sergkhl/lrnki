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

export type EvidenceNeighborhoodConfig = {
  maxEvidenceBlocksPerConcept: number;
  siblingCap: number;
  adjacencyRadius: number;
};

export const DEFAULT_EVIDENCE_NEIGHBORHOOD_CONFIG: EvidenceNeighborhoodConfig = {
  maxEvidenceBlocksPerConcept: 12,
  siblingCap: 4,
  adjacencyRadius: 1
};

export type EvidenceNeighborhoodSubject = {
  mentionBlockIds: Set<string>;
  labels: string[];
};

export function selectEvidenceNeighborhood(
  blocks: SourceBlock[],
  subject: EvidenceNeighborhoodSubject,
  config: EvidenceNeighborhoodConfig = DEFAULT_EVIDENCE_NEIGHBORHOOD_CONFIG
): SourceBlock[] {
  const bodyBlocks = extractableBlocks(blocks);
  const bodyIds = new Set(bodyBlocks.map((block) => block.blockId));
  const mentionIds = new Set([...subject.mentionBlockIds].filter((blockId) => bodyIds.has(blockId)));
  const normalizedLabels = subject.labels.map((label) => label.trim().toLowerCase()).filter((label) => label.length > 0);
  const candidates: SourceBlock[] = [];
  const candidateIds = new Set<string>();
  const addCandidate = (block: SourceBlock | undefined): boolean => {
    if (!block || candidateIds.has(block.blockId)) return false;
    candidateIds.add(block.blockId);
    candidates.push(block);
    return true;
  };

  const mentionBlocks: SourceBlock[] = [];
  const mentionIndexes: number[] = [];
  bodyBlocks.forEach((block, index) => {
    if (!mentionIds.has(block.blockId)) return;
    mentionBlocks.push(block);
    mentionIndexes.push(index);
    addCandidate(block);
  });
  for (const index of mentionIndexes) {
    for (let radius = 1; radius <= config.adjacencyRadius; radius += 1) {
      addCandidate(bodyBlocks[index - radius]);
      addCandidate(bodyBlocks[index + radius]);
    }
  }

  const mentionHeadingPaths = uniqueHeadingPaths(mentionBlocks.map((block) => block.headingPath));
  let siblingCount = 0;
  for (const block of bodyBlocks) {
    if (siblingCount >= config.siblingCap) break;
    if (candidateIds.has(block.blockId)) continue;
    if (!mentionHeadingPaths.some((headingPath) => sameHeadingPath(headingPath, block.headingPath))) continue;
    if (addCandidate(block)) siblingCount += 1;
  }

  for (const block of bodyBlocks) {
    const text = block.text.toLowerCase();
    if (normalizedLabels.some((label) => text.includes(label))) {
      addCandidate(block);
    }
  }

  return candidates.slice(0, config.maxEvidenceBlocksPerConcept);
}

function sameHeadingPath(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function uniqueHeadingPaths(paths: string[][]): string[][] {
  const seen = new Set<string>();
  const unique: string[][] = [];
  for (const path of paths) {
    const key = JSON.stringify(path);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(path);
  }
  return unique;
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
  // Fourth core-eligibility criterion (ADR-0005 refinement, KTD1): the source gives
  // the atom DEFINITION-BEARING treatment — a passage that establishes the concept's
  // meaning, distinct from a bare mention. The model judges this; the application
  // boundary verifies the cited passage verbatim (like the other criteria) and gates
  // `core` on it. NOT a lexical copula or "X is Y" matcher — a definition passage need
  // not use a copula (AGENTS rule 16). The verified evidence is carried into CEP
  // extraction (U2) so the admission-proven definition is not lost under fan-out.
  definitionBearingTreatment: AdmissionCriterionProposal;
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

// The sole guarded typed assertion (R6). `defines` carries a model-authored
// literal definition (a faithful paraphrase, judged for entailment — no surface
// matcher can verify a paraphrase, AGENTS rule 16). Other concept-to-concept
// relationships survive as mentions and are interpreted by Graph Enrichment.
export type OptionalAssertionType = "defines";

// What the concept-conditioned extractor returns for one subject Concept, by
// run-local key. Definition and mention passages are verbatim block quotes; the
// mention order IS the neural salience order (most to least useful for enrichment)
// — the application keeps the first configured number without re-ranking (R4).
export type ExtractedTypedAssertion = { type: "defines"; literalValue: string; evidence: BlockEvidence[] };

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
// only when at least one verified definition passage remains; an incomplete core
// Concept is demoted to optional before publication, while optional incomplete
// profiles stay inspectable as run-scoped evidence.
export type RunTypedAssertion = { type: "defines"; literalValue: string; evidence: BlockEvidence[] };

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
  severity: "info" | "warning" | "critical";
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
    // Validated definition-bearing-treatment criterion (KTD1). `evidence` holds the
    // verbatim-verified definition passages; U2 carries them into CEP extraction.
    definitionBearingTreatment: {
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

// The boundary reason code stamped on a candidate whose admitted `core` tier was
// demoted to `optional` because its CEP could not be grounded with a verbatim
// Definition Passage (ADR-0007). One exported token shared by the demotion policy
// that writes it onto `boundaryReasonCodes` and every consumer that reads it back
// (the quality-issue detector, Admin Lab), so a rename can never silently desync a
// `string[]` reason code into invisibility.
export const CORE_DEMOTED_UNGROUNDABLE_REASON = "core_demoted_ungroundable";

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
  // A run with an incomplete core Concept demotes that Concept to optional before
  // publication. Genuine non-succeeded runs remain reserved for pipeline or
  // persistence failures; publication refuses non-succeeded runs (ADR-0017).
  status: "succeeded" | "failed";
  // True when the run succeeded but every model-selected core was demoted, leaving
  // zero published cores.
  degraded: boolean;
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

// The single guarded typed assertion (R6). It stays EVIDENCE inside the CEP,
// never an authoritative edge or numeric prior.
export type PublishedTypedAssertion = { type: "defines"; literalValue: string; evidence: PublishedEvidencePassage[] };

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
// persisted source_block_id, heading path, and locator).
export type BuildEvidencePassage = {
  sourceBlockId: string;
  evidenceQuote: string;
  headingPath: string[];
  locator: SourceLocator;
};

export type BuildTypedAssertion = { type: "defines"; literalValue: string; evidence: BuildEvidencePassage[] };

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

export type MintingReason = "assumed_prerequisite";

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
  mintingReason: MintingReason;
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

// Rescue durability judgment (U3, KTD3/KTD4). One bounded LLM verdict over ONE
// aggregated `source_mentioned` rescue candidate, judged against the same-domain
// anchors it would scaffold: is it a DURABLE prerequisite a learner must grasp
// before those anchors, or an incidental artifact (a method label, an ablation, a
// pedagogical-role label, a source-local detail)? Mirrors AdmissionLabelJudgment:
// the verdict is advisory and the application boundary grounds the veto fail-OPEN.
// `groundingSpan` is the minimal verbatim sub-quote of the node's OWN mention
// evidence that a `not_durable` verdict rests on; an ungrounded veto is not honored.
export type RescueDurabilityVerdict = "durable" | "not_durable";

export type RescueDurabilityJudgment = {
  verdict: RescueDurabilityVerdict;
  groundingSpan: string;
  rationale: string;
};

// The recorded disposition of one aggregated rescue candidate after durability
// judging (U3/R4). `accepted` — a derived `source_mentioned` node exists; `dropped`
// — vetoed on a CONFIDENT, source-grounded `not_durable` verdict; `kept_judge_unavailable`
// — transport failure, invalid tool args, or an ungrounded verdict, so the node is
// KEPT and flagged (fail-open, never a silent veto, AGENTS rule 16). Persisted (U4)
// so an operator can read why each rescued node survived or was dropped.
export type RescueDispositionKind = "accepted" | "dropped" | "kept_judge_unavailable";

export type RescueDisposition = {
  derivedNodeId: string;
  canonicalLabel: string;
  normalizedLabel: string;
  declaredDomain: string;
  disposition: RescueDispositionKind;
  rationale: string;
  groundingSpan: string;
};

// Each Concept's published CEP reduced to what the prerequisite judge needs (R11):
// meaning-bearing definition passages, bounded salience-ordered mention passages,
// and LABELED `defines` assertions. The exhaustive same-domain design (ADR-0019
// reset) removed contextual-embedding clustering and candidate groups.
export type PrerequisiteConceptContext = {
  // The Derived Graph Layer node being judged (anchor projection OR enrichment node),
  // never the asserted Concept id — enrichment nodes have no Concept identity.
  derivedNodeId: string;
  canonicalLabel: string;
  aliases: string[];
  definitions: string[];
  mentions: string[];
  assertions: { type: OptionalAssertionType; detail: string }[];
};

// Per-derived-node evidence reduced for learner-neutral intrinsic difficulty.
// Anchors carry CEP evidence; source-mentioned nodes carry rescued mention quotes;
// llm_grounded nodes carry their generated grounding bundle text. This is not a
// Concept projection and does not weaken the verbatim floor.
export type DifficultyNodeContext = {
  derivedNodeId: string;
  canonicalLabel: string;
  aliases: string[];
  declaredDomain: string;
  groundingOrigin: GroundingOrigin;
  definitions: string[];
  mentions: string[];
};

// One bounded LLM prerequisite judgment over an evidence-packed same-domain pair.
// "uncertain" is flagged for review and excluded from the path, never silently
// promoted to an edge (concept-first method stack §4; goal 1.6/4).
export type PrerequisiteJudgment = {
  prerequisiteDerivedNodeId: string;
  dependentDerivedNodeId: string;
  outcome: "directed" | "none" | "uncertain";
  confidence: number;
  rationale: string;
};

// An edge of the inferred prerequisite DAG: prerequisite must precede dependent.
// Survives only after deterministic cycle removal + transitive reduction +
// weak-edge cut (ADR-0019). `uncertain` edges are retained for inspection but
// excluded from path traversal.
export type InferredPrerequisiteEdge = {
  prerequisiteDerivedNodeId: string;
  dependentDerivedNodeId: string;
  predicate: InferredRelationPredicate;
  confidence: number;
  uncertain: boolean;
  provenance: { judgmentRationale: string };
};

export type PrerequisiteJudgmentTrace = {
  declaredDomain: string;
  // Which judge model ordered this pair (U4): the cross-family generated-node alias
  // for any pair touching an llm_grounded node, the validated DeepSeek alias otherwise.
  judgeModel: string;
  a: PrerequisiteConceptContext;
  b: PrerequisiteConceptContext;
  judgment: PrerequisiteJudgment;
};

export type InferredEdgeDisposition = {
  prerequisiteDerivedNodeId: string;
  dependentDerivedNodeId: string;
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
  // Per-aggregated-rescue-candidate durability dispositions (U3/R4). Records which
  // `source_mentioned` candidates the durability judge accepted, dropped, or kept on
  // judge-unavailable, so an operator can audit why each rescued node is (or is not)
  // in the derived layer. Persisted in U4.
  rescueDispositions: RescueDisposition[];
};

// Node difficulty keeps a stable output shape while the producer evolves. The
// current direction is learner-neutral intrinsic difficulty; learner-calibrated
// IRT/BT remains deferred until learner-response data exists. Keyed to the Derived
// Graph Layer node (anchors ∪ enrichment nodes), never the asserted Concept.
export type ConceptDifficulty = {
  derivedNodeId: string;
  score: number;
  method: string;
  components: Record<string, number>;
  // The neural judge's free-text justification for its difficulty subscore (ADR-0024).
  // Kept beside the strictly-numeric `components` so an operator can read WHY a node
  // scored as it did. Empty for deterministic structural-only producers that never
  // consult the judge; the persisted production port always carries the judge's text.
  neuralRationale: string;
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
  derivedNodeId: string;
  difficulty: number;
  includedReason: "prerequisite" | "target";
};

export type LearnerPath = {
  learnerPathId: string;
  graphVersionId: string;
  enrichmentId: string;
  targetDerivedNodeId: string;
  // Identifies the learner state used; the mock is "mock:empty" (knows nothing).
  learnerStateRef: string;
  steps: LearnerPathStep[];
};

// ---------------------------------------------------------------------------
// Learner Study Loop — Typed Study Item Bank (R7–R15, ADR-0026). A learner-NEUTRAL
// derived asset: per Derived Graph Layer node, the bank holds whichever typed study
// items the build could ground, conditioned on that node's grounding and keyed to the
// enrichment node identity. Regenerable without affecting learner state; never written
// into the asserted graph or the Derived Graph Layer (CONTEXT.md "Learner State",
// AGENTS rule 3). The discriminant is `itemType`: `self_assessment` (calibration only)
// and `option_select` (auto-graded studying) are concrete this round; the remaining
// three are reserved in the discriminant with no payload built yet (R14). The
// concept→type map is never stored — supported types are `SELECT DISTINCT item_type`
// over persisted items (KTD2). ADR-0026 supersedes ADR-0025 for item identity.
// ---------------------------------------------------------------------------

// Every item type the discriminant accommodates. The first two are implemented; the
// last three are reserved so new mechanics slot in without a model reshape (R14).
export type StudyItemType =
  | "self_assessment"
  | "option_select"
  | "multi_option_select"
  | "free_text"
  | "mini_game";

export type StudyItemGroundingProvenance = "source_cep" | "source_mentioned" | "generated";

// Provenance-tagged citations keep generated grounding honest: source citations
// must verify against source text, generated citations verify only against the
// generated grounding bundle and never carry source ids. Shared by the self-assessment
// answer key and the option-select correct answer.
export type StudyItemCitation =
  | { provenance: "source"; sourceResourceId: string; sourceBlockId: string; evidenceQuote: string }
  | { provenance: "generated"; derivedNodeId: string; passageText: string };

// One option in an option-select item. Exactly one is `isCorrect` (the guard enforces
// it, U2). The correct option is source-grounded and carries a verified `citation`;
// distractors are `generated` and carry none (R10, ADR-0026 provenance).
export type StudyItemOption = {
  optionId: string;
  text: string;
  isCorrect: boolean;
  provenance: "source" | "generated";
  citation?: StudyItemCitation;
};

// Fields shared by every persisted study item, independent of `itemType`.
type StudyItemBase = {
  studyItemId: string;
  graphVersionId: string;
  enrichmentId: string;
  derivedNodeId: string;
  groundingProvenance: StudyItemGroundingProvenance;
  generatingModel: string;
  configHash: string;
};

// Self-assessment item — calibration only (R8). Keeps the prior recall-card payload:
// a question, a grounded answer key, a self-report prompt, and verified citations.
export type SelfAssessmentItem = StudyItemBase & {
  itemType: "self_assessment";
  question: string;
  answerKey: string;
  selfReportPrompt: string;
  citations: StudyItemCitation[];
};

// Option-select item — auto-graded studying (R9). Four options, exactly one keyed
// correct and source-grounded; the other three are sibling-conditioned distractors
// labeled `generated`. A click writes a deterministic `graded(auto)` row, no judge.
export type OptionSelectItem = StudyItemBase & {
  itemType: "option_select";
  question: string;
  options: StudyItemOption[];
};

export type StudyItem = SelfAssessmentItem | OptionSelectItem;

// A derived node that produced NO study item at all (no usable grounding), recorded as
// a durable fact rather than a transient log line. A node that grounds a self-assessment
// item but fails to yield an option-select item is NOT rejected — it simply lacks that
// type and the frontier surfaces it as cardless-for-studying (R13). Only a node the build
// could ground for nothing lands here, with the exact reason.
export type RejectedStudyItem = {
  derivedNodeId: string;
  canonicalLabel: string;
  reason: string;
};

// Pre-verification drafts the generators return (U3). The model cites grounding passages
// by `passageId` + a quote; the application boundary verifies each quote verbatim against
// the cited grounding passage before promoting a draft to a persisted item (AGENTS rule 6
// fail-closed). `passageId` is a source block id for source-grounded nodes but a synthetic
// generated-passage id for `llm_grounded` nodes, so the field is NOT a source block id and
// must never be persisted as one. A draft whose grounding does not verify is rejected.
export type SelfAssessmentItemDraft = {
  itemType: "self_assessment";
  question: string;
  answerKey: string;
  selfReportPrompt: string;
  citations: { passageId: string; evidenceQuote: string }[];
};

// One option in a pre-verification option-select draft. The correct option carries its
// citation by `passageId` + quote (verified by the guard, U2); distractors carry none.
export type StudyItemOptionDraft = {
  text: string;
  isCorrect: boolean;
  provenance: "source" | "generated";
  citation?: { passageId: string; evidenceQuote: string };
};

export type OptionSelectItemDraft = {
  itemType: "option_select";
  question: string;
  options: StudyItemOptionDraft[];
};

export type StudyItemDraft = SelfAssessmentItemDraft | OptionSelectItemDraft;

// ---------------------------------------------------------------------------
// Response Log — the durable, append-only commitment (R4–R6). Every recall attempt
// is an immutable row. `self_report` rows carry an anki-style rating; `graded` rows
// carry a judged outcome plus a [0,1] score (the partial/binary distinction the
// estimator and a later IRT/BKT fit need, AE4). The skill is the Derived Graph Layer
// `derivedNodeId`; the item is `studyItemId` (per-item IRT key).
// ---------------------------------------------------------------------------

export type SignalType = "self_report" | "graded";
export type SelfReportRating = "again" | "hard" | "good" | "easy";
export type JudgedOutcome = "correct" | "partial" | "incorrect";
export type ResponseSource = "synthetic" | "human";

export type ResponseLogRow = {
  responseId: string;
  learnerStateRef: string;
  studyItemId: string;
  derivedNodeId: string;
  signalType: SignalType;
  selfReportRating: SelfReportRating | null;
  judgedOutcome: JudgedOutcome | null;
  gradedScore: number | null;
  evidenceWeight: number;
  responseSource: ResponseSource;
  graderIdentity: string | null;
  // Groups one calibration sweep so re-calibration appends a distinct batch (R10).
  batchId: string | null;
  // Monotonic per learner_state_ref — the ordered sequence BKT/IRT consume (R6).
  attemptSeq: number;
  submittedAnswer: string | null;
  // Set by the store (DB default) on append; populated on read.
  createdAt?: string;
};

// Append shape: a row before the store stamps `createdAt`. There is deliberately no
// update/delete shape — corrections APPEND (R5).
export type NewResponseLogRow = Omit<ResponseLogRow, "createdAt">;
