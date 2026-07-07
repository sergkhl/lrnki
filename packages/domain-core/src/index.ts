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

// PostgreSQL `text` columns reject U+0000 (the NUL byte). Two boundaries can
// admit one: a parser decoding raw source bytes, and the forced-tool client
// decoding a model's JSON arguments (an escaped `\u0000` becomes a real NUL
// after JSON.parse). Both strip it here so no value — source block text or a
// model-emitted evidence quote — ever reaches persistence carrying a NUL. Only
// U+0000 is removed; every other character is preserved verbatim so evidence
// still verifies against its source block (AGENTS rules 11/16).
const NUL_BYTE = new RegExp(String.fromCharCode(0), "g");

export function stripNullBytes(text: string): string {
  return text.replace(NUL_BYTE, "");
}

// Recursively strip NUL bytes from every string in an arbitrary JSON-parsed
// value, so the model-output boundary (forced-tool arguments) is sanitized
// before schema validation regardless of which field carried the byte.
export function deepStripNullBytes<T>(value: T): T {
  if (typeof value === "string") return stripNullBytes(value) as T;
  if (Array.isArray(value)) return value.map((item) => deepStripNullBytes(item)) as T;
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = deepStripNullBytes(item);
    return result as T;
  }
  return value;
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

// How a quote traced to its cited block. `exact` = a byte-exact substring (the model
// quoted perfectly); `normalized` = it only matched after formatting noise was normalized
// away (emphasis/blockquote/curly-quote drift); `none` = not in the block. Surfacing the
// exact-vs-normalized split lets an operator see grounding fidelity, not just pass/fail.
export type EvidenceMatchKind = "exact" | "normalized" | "none";

export function classifyEvidenceMatch(blockText: string, evidenceQuote: string): EvidenceMatchKind {
  if (evidenceQuote.length > 0 && blockText.includes(evidenceQuote)) return "exact";
  const quote = normalizeEvidenceText(evidenceQuote);
  if (quote.length === 0) return "none";
  return normalizeEvidenceText(blockText).includes(quote) ? "normalized" : "none";
}

export function evidenceQuoteMatches(blockText: string, evidenceQuote: string): boolean {
  return classifyEvidenceMatch(blockText, evidenceQuote) !== "none";
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

export type ImpostorLieValidityVerdict = "lie_is_false" | "lie_is_true_of_node";

export type ImpostorLieValidityJudgment = {
  verdict: ImpostorLieValidityVerdict;
  reason: string;
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

// The boundary reason code stamped on a candidate whose admitted `core` tier was
// demoted to `optional` because its ONLY Definition Passage was verbatim-grounded
// but conveyed no meaning — a bare repetition of the name, a heading/title, or a
// citation/bibliographic snippet — and the Definition-Passage quality judge vetoed
// it (ADR-0007 extension). DISTINCT from CORE_DEMOTED_UNGROUNDABLE_REASON ("the
// extractor never produced a verifiable definition at all"): the two codes split
// "genuinely never defined" from "defined only by a hollow passage", the measurement
// hook layer B (TODO #3) consumes. One exported token shared by the demotion policy
// that writes it onto `boundaryReasonCodes` and every reader (quality-issue detector,
// Admin Lab), so a rename can never silently desync the `string[]` code (AGENTS rule 18).
export const CORE_DEMOTED_HOLLOW_DEFINITION_REASON = "core_demoted_hollow_definition";

// Structural verdict categories the Definition-Passage quality judge returns per
// passage (ADR-0007 extension). DOMAIN-NEUTRAL — each names a structural shape of a
// non-defining passage, never a fixture concept (AGENTS rule 17). `establishes_meaning`
// is the keep verdict; the other three are veto reasons the judge surfaces for the
// run trace and the operator.
export type DefinitionPassageVetoCategory =
  | "establishes_meaning"
  | "bare_name_repetition"
  | "heading_or_title"
  | "citation_or_bibliographic";

// One bounded LLM judgment over a single already-verbatim-verified Definition Passage
// (ADR-0007 extension). The judge decides whether the passage ESTABLISHES the Concept's
// meaning (defining properties, distinguishing criteria, mechanism, or contrast) versus
// being a hollow passage. `judgedSpan` must be a verbatim substring of the passage; the
// application boundary fails closed to `establishesMeaning: true` (keep) when the span
// does not ground, so the judge can never veto on text absent from the passage.
export type DefinitionPassageQualityJudgment = {
  establishesMeaning: boolean;
  category: DefinitionPassageVetoCategory;
  judgedSpan: string;
  rationale: string;
};

// The recorded disposition of one Definition Passage after quality judging (ADR-0007
// extension). `kept` — establishes meaning (or no veto applied); `vetoed` — dropped on
// a confident, source-grounded hollow verdict; `kept_judge_unavailable` — transport
// failure, invalid tool args, or an ungrounded verdict, so the passage is KEPT and
// flagged (fail-closed = preserve recall, AGENTS rule 16). Persisted on the run artifact
// JSONB (KTD8) so the demotions are auditable and replayable for rule-14 inspection.
export type DefinitionPassageDispositionKind = "kept" | "vetoed" | "kept_judge_unavailable";

export type DefinitionPassageDisposition = {
  candidateKey: string;
  sourceBlockId: string;
  evidenceQuote: string;
  disposition: DefinitionPassageDispositionKind;
  category: DefinitionPassageVetoCategory;
  rationale: string;
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
  // Per-passage Definition-Passage quality dispositions (ADR-0007 extension, KTD8).
  // Captured in the immutable artifact envelope payload (rule 7 JSONB) so the hollow
  // demotions are inspectable and replayable without a relational migration.
  definitionQualityDispositions: DefinitionPassageDisposition[];
  qualityIssues: ExtractionQualityIssue[];
  // A run with an incomplete core Concept demotes that Concept to optional before
  // publication. Genuine non-succeeded runs remain reserved for pipeline or
  // persistence failures; publication refuses non-succeeded runs (ADR-0017).
  status: "succeeded" | "failed";
  // True when the run succeeded but every model-selected core was demoted, leaving
  // zero published cores.
  degraded: boolean;
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
  passageType: "mention" | "definition";
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

// ---------------------------------------------------------------------------
// Synthetic topic generation (ADR-0019 amended, plan 2026-06-30-001). The
// source-less front half: a topic + Declared Domain yields a bounded concept set,
// each concept probed for the model's knowledge boundary before any grounding is
// generated. These artifacts never reference a curated source block — they are the
// anchor-less analog of Candidate Discovery + admission.
// ---------------------------------------------------------------------------

// One synthesized concept proposed from `topic + declaredDomain` alone (R2). The
// source-less analog of `DiscoveredCandidate`: a run-local key plus a precise label,
// carrying no source mention because no source exists. The set is generated, not
// gated for coverage or grain in this build (deferred).
export type SynthesizedConcept = {
  conceptKey: string;
  canonicalLabel: string;
  aliases: string[];
};

// One draw of the knowledge-boundary probe (R7). A single pointed factual answer
// about ONE concept, returned via a forced named tool. The application samples this
// K times at moderate temperature and measures semantic agreement across the K
// `answer` strings with the existing embedding port (ADR-0012 similarity use, not a
// new judge) to route the concept to `core_knowledge` or `boundary` (U3).
export type KnowledgeBoundaryProbeAnswer = {
  answer: string;
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
  // Absent for `synthetic_primary` nodes: they are first-class topic concepts generated by
  // the synthetic arm, not prerequisites minted to fill a source gap (KTD3).
  mintingReason?: MintingReason;
  // `prerequisite` for enrichment-minted gap-fillers; `synthetic_primary` for topic concepts
  // produced by synthetic generation over an anchor-less layer. No consumer branches on role.
  role: "prerequisite" | "synthetic_primary";
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

// A member Extraction Run's non-core admission proposal reused as the fully-provenanced
// source for a `source_mentioned` rescued node (KTD1/KTD5). `optional`-tier candidates
// carry their verbatim Definition Passages in `definitions` IN ADDITION to `mentions`, so
// rescue reuses already-extracted grounded evidence instead of re-minting it at a lower
// trust tier (the rule-21 reuse-over-regeneration fix). `reject`-tier candidates carry
// `mentions` only with an empty `definitions` (KTD3 precision guard — admission already
// judged them non-atomic). `blockText` is carried on every passage so the verbatim floor
// (U3) re-verifies each quote against its cited block at enrichment time rather than
// trusting the extraction-time check.
export type NonCoreRescuePassage = {
  sourceResourceId: string;
  sourceBlockId: string;
  evidenceQuote: string;
  blockText: string;
  headingPath: string[];
  locator: SourceLocator;
};

export type NonCoreRescueCandidate = {
  runId: string;
  declaredDomain: string;
  candidateKey: string;
  canonicalLabel: string;
  normalizedLabel: string;
  aliases: string[];
  tier: CandidateTier;
  definitions: NonCoreRescuePassage[];
  mentions: NonCoreRescuePassage[];
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

// Minting durability judgment. One bounded cross-family verdict over ONE generated
// assumed-prerequisite proposal before grounding is generated. Unlike rescue
// durability there is no candidate-owned source span to ground against, so this is
// decision-only; the application stage owns the drop-only, fail-open semantics.
export type MintingDurabilityVerdict = "durable" | "not_durable";

export type MintingDurabilityJudgment = {
  verdict: MintingDurabilityVerdict;
  rationale: string;
};

// Merge-adjudication decision for semantic dedup (plan U2, AGENTS rule 20). The
// DECIDE half of the propose/decide split: given two same-domain near-duplicate
// candidates the embedding proposer surfaced, a cross-family LLM judge decides whether
// they are two surface forms of the SAME domain concept (`merge`) or genuinely distinct
// (`keep_distinct`). Decision-only — no score; the proposing cosine score is recorded
// separately on the merge record. Mirrors the advisory shape of RescueDurabilityJudgment;
// the dedup stage owns the fail-closed default (transport/validation failure →
// keep_distinct, no merge — R13).
export type NodeMergeDecision = "merge" | "keep_distinct";

export type NodeMergeAdjudication = {
  decision: NodeMergeDecision;
  rationale: string;
};

// The proposing signal behind a merge (plan U3/U4, AGENTS rule 20). Today only
// embedding cosine proposes; kept as a named union so a future propose signal records
// its own provenance rather than overloading one string.
export type NodeMergeProposingSignal = "embedding_cosine";

// Why the canonical side won canonical selection (plan KTD6, deterministic + recorded).
// An anchor always beats an enrichment node (preserves published Concept identity / IRI
// permanence, R7); a same-kind tie breaks by evidence count, then by stable derived-node
// id. Stored on the merge record so replay and audit are deterministic.
export type CanonicalSelectionReason =
  | "anchor_over_enrichment"
  | "higher_evidence_count"
  | "stable_id_tiebreak";

// One recorded derived-layer semantic merge (plan U3/U4, R5/R6). Provenance for a
// collapsed near-duplicate pair: the surviving canonical node, a SNAPSHOT of the
// absorbed node (its derived_graph_nodes row never persists, so the label/aliases/kind/
// evidence are captured here for Admin Lab), the proposing signal + score, the deciding
// rationale, and the canonical-selection reason. The absorbed node is always an
// enrichment node — an anchor is never absorbed (KTD6). Lives on the Derived Graph Layer
// only; published Concept identity and IRIs are untouched (R7).
export type NodeMergeRecord = {
  declaredDomain: string;
  canonicalDerivedNodeId: string;
  canonicalLabel: string;
  canonicalNodeKind: "anchor" | "enrichment";
  absorbedDerivedNodeId: string;
  absorbedLabel: string;
  absorbedAliases: string[];
  absorbedNodeKind: "anchor" | "enrichment";
  absorbedEvidence: string[];
  proposingSignal: NodeMergeProposingSignal;
  proposingScore: number;
  rationale: string;
  canonicalSelectionReason: CanonicalSelectionReason;
};

// ---------------------------------------------------------------------------
// Published-Concept Semantic Identity Resolution (plan 2026-06-26-002, ADR-0015,
// ADR-0012). The propose-decide pass that collapses same-domain near-duplicate
// PUBLISHED Concept identities BEFORE the deterministic Graph-Version Build. Unlike
// the derived-layer dedup (which may only absorb enrichment nodes), this resolves
// authoritative published identity, so it classifies each merged cluster by how many
// already-published members it contains and refuses (quarantines) a two-already-
// published collision rather than retiring a minted IRI (KTD4, R7). The build consumes
// these decisions and stays LLM-free (KTD1/R8).
// ---------------------------------------------------------------------------

// One exact-label identity representative on a side of an identity decision (KTD5).
// `definitions` are verbatim Definition-Passage spans carried for the adjudicator and
// for R4 provenance; `published` marks an identity already present in
// existingConceptIdentities() (an anchor), which drives the case A/B/C classification.
export type ConceptIdentityRef = {
  declaredDomain: string;
  normalizedLabel: string;
  canonicalLabel: string;
  aliases: string[];
  definitions: string[];
  published: boolean;
};

// `merge` — the cluster's members are one Concept (case A keeps the published IRI,
// case C mints once); `distinct` — an adjudicated-distinct pair recorded for audit
// (R4), no identity change; `quarantine` — a cluster with two or more already-published
// members (case B), which the build refuses to publish (R7, KTD4).
export type ConceptIdentityResolutionOutcome = "merge" | "distinct" | "quarantine";

// One recorded identity-resolution decision (R4/R5). `members` are the involved
// identity representatives (exactly two for a `distinct` pair; the whole union-find
// cluster for `merge`/`quarantine`). `survivorNormalizedLabel` names the surviving
// identity for a `merge` (the build remaps the absorbed members' keys onto it and
// keeps/mints its IRI); it is `null` for `distinct` and `quarantine`, which change no
// identity. Persisted into refinement_decisions under a dedicated decision type and
// read back for the Admin Lab (KTD3, R10).
export type ConceptIdentityDecision = {
  outcome: ConceptIdentityResolutionOutcome;
  declaredDomain: string;
  members: ConceptIdentityRef[];
  survivorNormalizedLabel: string | null;
  proposingSignal: NodeMergeProposingSignal;
  proposingScore: number;
  rationale: string;
  decidingModel: string;
  configHash: string;
};

// The single `refinement_decisions.decision_type` an identity decision persists under
// (KTD3). The build writes it; the inspection read model filters on it (plan U4), so it
// has one definition both sides import rather than a string literal duplicated per layer.
export const CONCEPT_IDENTITY_DECISION_TYPE = "concept_identity_resolution";

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
  // When the durability judge proposed a concept-shaped canonical label and minting adopted it
  // (R12), the original sentence-shaped label the node was rescued under. `canonicalLabel` above
  // then carries the adopted concept label and the original survives as a node alias. Absent when
  // no re-label happened (no proposal, a collision, or a dropped node).
  relabeledFrom?: string;
};

// The recorded disposition of one reserved minting proposal after durability judging.
// `accepted` — the proposal was kept and minted as an `llm_grounded` node; `dropped`
// — vetoed by a clear `not_durable` verdict; `kept_judge_unavailable` — transport or
// schema failure, so the proposal is kept and flagged (fail-open). A minting verdict is
// scoped to ONE anchor, so a `dropped` proposal's label is RELEASED, not kept reserved:
// a later same-domain anchor that genuinely depends on the concept can re-propose it and
// be judged independently (unlike rescue, whose verdict is judged against all same-domain
// anchors and so legitimately reserves a dropped label domain-wide).
export type MintingDisposition = {
  derivedNodeId: string;
  proposedLabel: string;
  normalizedLabel: string;
  declaredDomain: string;
  anchorConceptId: string;
  disposition: RescueDispositionKind;
  rationale: string;
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

// One directed edge of a whole-set prerequisite ordering (plan U1, KTD2/KTD3). The
// judge cites each endpoint by the 1-based concept NUMBER shown before it in the prompt
// (a closed-set menu pick, not free text); the application maps number → derivedNodeId by
// position fail-closed (KTD3, R9), so synonyms/paraphrases cannot drift past an exact
// label match. A non-edge is simply absent — there is no `none`/`uncertain` per-edge
// OUTCOME from the whole-set judge: it asserts directed edges only, and uncertainty
// re-sources to cycle-routing in the boundary (KTD5).
export type WholeSetPrerequisiteEdge = {
  prerequisiteNumber: number;
  dependentNumber: number;
  confidence: number;
  rationale: string;
};

// One whole-set prerequisite ordering over a Declared Domain's deduplicated node set
// (R1, R2). `edges` is the directed edge list the judge proposes in ONE draw. The
// application draws this ordering K times on the same input and tallies a per-pair
// directional vote (D1/D2); acyclicity, real-node citation, and the consensus across
// draws are computed in the boundary, never asserted by the model (R9, rules 16/19).
export type WholeSetOrdering = {
  edges: WholeSetPrerequisiteEdge[];
};

// One rescued node's concept-shaped canonical label from ONE whole-domain-set labeling
// draw (TODO #1). A rescued `source_mentioned` node is labeled with the source sentence it
// was mentioned in, which reads as a proposition rather than a concept name. This dedicated
// measured step (replacing the durability judge's under-attended optional field) runs
// UNCONDITIONALLY over the domain's durable rescued nodes, so there is no self-gate for the
// model to skip: it returns the best concept-shaped label for EACH numbered node, which MAY
// equal the current label when that already reads as a concept name. The judge cites the node
// by the 1-based NUMBER shown before it in the prompt (a closed-set position pick, mirroring
// WholeSetPrerequisiteEdge/DifficultyBandEntry); the application maps number → derivedNodeId by
// position fail-open, and minting owns adoption (collision guard, alias demotion, reservation).
export type RescuedNodeLabelEntry = {
  nodeNumber: number;
  conceptLabel: string;
};

export type RescuedNodeLabeling = {
  labels: RescuedNodeLabelEntry[];
};

// One concept's difficulty band from ONE whole-domain-set banding draw (comparative
// banded intrinsic difficulty, ADR-0024). The judge cites the concept by the 1-based
// NUMBER shown before it in the prompt (a closed-set menu pick, mirroring
// WholeSetPrerequisiteEdge); the application maps number → derivedNodeId by position
// fail-closed. `band` is 1–5 RELATIVE to the Declared Domain's concept set, not an
// absolute scale — the pointwise absolute judge this replaces suffered scale-use bias
// (abstract-SOUNDING labels scored high without evidence). K draws are sampled per
// ADR-0028; consensus (modal band) and contested-band calibration live in the
// application, never here.
export type DifficultyBandEntry = {
  conceptNumber: number;
  band: number;
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

// One unordered concept pair's directional vote across the K ordering draws (D2, KTD2).
// `forward`/`reverse` count how many draws cited the pair prerequisite→dependent in the
// MAJORITY direction vs. the minority; the endpoints are stored in that majority direction.
// `consensusConfidence` is the empirical agreement max(f,r)/K that replaces the model's
// per-draw self-report (D4) and feeds the existing weak-edge floor as a presence quorum
// (D5/KTD2). `classification` records why the pair was routed: a stable majority is
// `consensus`; a pair contested in both directions beyond the calibrated minority fraction
// is `direction_contested` and goes to `uncertain` (D3/D6). A pair never cited in any draw
// produces no vote at all.
export type PairDirectionVote = {
  prerequisiteDerivedNodeId: string;
  dependentDerivedNodeId: string;
  forward: number;
  reverse: number;
  k: number;
  consensusConfidence: number;
  classification: "consensus" | "direction_contested";
};

// One K-sampled ordering stage's trace for a single Declared Domain (D1/D2, R15). The
// application draws the whole-set ordering call K times on the same input and tallies a
// per-pair directional vote, so the trace is per-domain and records the FULL judgment
// distribution: the ordering model, how many nodes were judged, K, the per-pair vote
// distribution (`pairVotes`), and which edges were cycle-routed to `uncertain` because a
// cycle survived in the aggregated certain set (R11/KTD3). There is no single-draw
// re-prompt any more — acyclicity is enforced on the aggregate via cycle-routing (KTD4,
// rule 18), so `reprompted`/`assertedEdges` are gone.
export type PrerequisiteOrderingTrace = {
  declaredDomain: string;
  // The single non-DeepSeek ordering alias that ordered this domain (R5).
  judgeModel: string;
  nodeCount: number;
  // The number of ordering draws taken for this domain (D1/D8). 0 for a singleton domain.
  k: number;
  // The per-pair directional vote distribution across the K draws (D2). The auditable,
  // replayable record from which consensus confidence and routing were derived.
  pairVotes: PairDirectionVote[];
  // Edges routed wholesale to `uncertain` because a cycle survived in the aggregated
  // certain set (KTD3). Empty on the acyclic happy path; never silently dropped.
  cycleRoutedEdges: { prerequisiteDerivedNodeId: string; dependentDerivedNodeId: string }[];
};

// A derived node excluded from prerequisite ordering because it had no definition or
// mention evidence to ground a judgment (R4). Recorded ONCE per node — not once per
// pair as the per-node judge did — so an operator audits each exclusion directly.
export type NodeEvidenceExclusion = {
  derivedNodeId: string;
  declaredDomain: string;
  reason: "insufficient_evidence";
};

// The disposal outcome of an asserted edge in the deterministic envelope (plan U1). A
// surviving cycle is routed to `uncertain` (kept, flagged, path-excluded), never
// removed — so there is no `cycle_removed` disposition any more (KTD4, rule 18). Per-node
// insufficient-evidence is its own NodeEvidenceExclusion record, not an edge disposition.
export type InferredEdgeDisposition = {
  prerequisiteDerivedNodeId: string;
  dependentDerivedNodeId: string;
  disposition: "uncertain" | "weak_cut" | "transitive_reduction" | "kept";
};

// One knowledge-boundary probe outcome for a synthesized concept (plan 2026-06-30-001
// U4, R8, AE1/AE2). Recorded in the run trace so an operator can inspect BOTH verdict
// branches. A `core_knowledge` concept became a trusted `synthetic_primary` derived node
// (`derivedNodeId` set); a `boundary` concept was held out of the trusted surface as an
// uncertain disposition — retained here, inspectable, never a node (`derivedNodeId`
// null). The future `web_grounded` retrieval branch replaces the boundary route at this
// exact seam (KTD5, R12), turning boundary concepts into grounded nodes instead.
export type SyntheticProbeDisposition = {
  conceptKey: string;
  canonicalLabel: string;
  declaredDomain: string;
  disposition: "core_knowledge" | "boundary";
  // Mean pairwise cosine over the K probe answers; null when agreement was unmeasurable
  // (fewer than two draws) or the embedding port was unavailable (fail-safe to boundary).
  agreementScore: number | null;
  rationale: string;
  // The trusted derived node this concept became; null for a boundary concept (no node).
  derivedNodeId: string | null;
};

export type EnrichmentRunTrace = {
  enrichmentId: string;
  // NULL for synthetic (source-less) layers; non-null for source-derived enrichment.
  graphVersionId: string | null;
  enrichmentConfigHash: string;
  derivedNodes: DerivedGraphNode[];
  // One ordering trace per Declared Domain (R1, R15): K, the per-pair vote distribution,
  // and cycle-routed edges. Records the full judgment distribution, not one draw.
  orderings: PrerequisiteOrderingTrace[];
  // Per-node insufficient-evidence exclusions (R4), recorded once per node. Replaces the
  // per-pair `insufficient_evidence` edge dispositions the per-node judge produced.
  nodeExclusions: NodeEvidenceExclusion[];
  dispositions: InferredEdgeDisposition[];
  // Per-node verbatim-floor outcomes for enrichment nodes (R9, AE3). Recorded so the
  // `not_applicable_by_grounding` exemption for generated passages is never silent.
  groundingDispositions: GroundingVerbatimDisposition[];
  // Per-aggregated-rescue-candidate durability dispositions (U3/R4). Records which
  // `source_mentioned` candidates the durability judge accepted, dropped, or kept on
  // judge-unavailable, so an operator can audit why each rescued node is (or is not)
  // in the derived layer. Persisted in U4.
  rescueDispositions: RescueDisposition[];
  // Per-passage Definition-Passage quality dispositions for rescued `source_mentioned`
  // nodes (plan 2026-06-26-001 U3, ADR-0007). The rescue seam now carries optional
  // definition-bearing candidates to learners as `definition`-typed study-item passages;
  // this records which of those passages the meaning judge kept, vetoed as hollow, or
  // kept fail-closed on judge-unavailable. `candidateKey` carries the derived node id.
  // Empty when the rescue-definition judge did not run (opt-in). Artifact JSONB only.
  rescuedDefinitionDispositions: DefinitionPassageDisposition[];
  // Per-reserved-minting-proposal durability dispositions. Records which generated
  // assumed-prerequisite proposals were accepted, dropped before grounding, or kept
  // fail-open, so an operator can audit minting without recompute.
  mintingDispositions: MintingDisposition[];
  // Per-absorbed-node semantic merge records (plan U3/U4, R5). One per derived node the
  // dedup sub-stage absorbed into a canonical near-duplicate, with full propose + decide
  // + canonical-selection provenance. Empty when dedup did not run (opt-in). Persisted in
  // U4 to `derived_node_merges` for Admin Lab.
  nodeMerges: NodeMergeRecord[];
  // Per-synthesized-concept knowledge-boundary probe outcomes (plan 2026-06-30-001 U4).
  // Present only for the synthetic operation; absent (undefined) for source-derived
  // enrichment, which runs no probe. Artifact JSONB only.
  syntheticProbeDispositions?: SyntheticProbeDisposition[];
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
  // NULL for synthetic (source-less) layers, which have no published asserted version;
  // non-null for enrichment layers derived from a published graph version (ADR-0019).
  graphVersionId: string | null;
  enrichmentConfigHash: string;
  // The bounded prerequisite-judge model (provenance for the inferred DAG). The
  // embedding model and candidate groups were removed with the embedding tier
  // (ADR-0019 reset): every same-domain relation is judged exhaustively, now via
  // per-node batched calls (plan U5) rather than one call per pair.
  judgeModel: string;
  derivedNodes: DerivedGraphNode[];
  prerequisiteEdges: InferredPrerequisiteEdge[];
  difficulties: ConceptDifficulty[];
};

// ---------------------------------------------------------------------------
// Learner Path steps — live Study Session quest-ladder output.
// ---------------------------------------------------------------------------

export type LearnerPathStep = {
  position: number;
  derivedNodeId: string;
  difficulty: number;
  includedReason: "prerequisite" | "target";
};

// ---------------------------------------------------------------------------
// Learner Study Loop — Typed Study Item Bank (R7–R15, ADR-0026). A learner-NEUTRAL
// derived asset: per Derived Graph Layer node, the bank holds whichever typed study
// items the build could ground, conditioned on that node's grounding and keyed to the
// enrichment node identity. Regenerable without affecting learner state; never written
// into the asserted graph or the Derived Graph Layer (CONTEXT.md "Learner State",
// AGENTS rule 3). The discriminant is `itemType`: `option_select` and `impostor` are both
// auto-graded keyed-selection studying types. The concept→type map is never stored —
// supported types are `SELECT DISTINCT item_type`
// over persisted items (ADR-0026).
// ---------------------------------------------------------------------------

export type StudyItemType = "option_select" | "matching" | "impostor";

export type StudyItemGroundingProvenance = "source_cep" | "source_mentioned" | "generated";

// Provenance-tagged citations keep generated grounding honest: source citations
// must verify against source text, generated citations verify only against the
// generated grounding bundle and never carry source ids. Used by the option-select
// correct answer.
// `matchKind` records whether the source quote traced to its block byte-exact or only
// after formatting normalization — grounding fidelity the operator can inspect. It is
// never `"none"` on a persisted source citation (the citation only exists on a match).
export type StudyItemCitation =
  | { provenance: "source"; sourceResourceId: string; sourceBlockId: string; evidenceQuote: string; matchKind: "exact" | "normalized" }
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
  // NULL for a synthetic (source-less) layer's items; non-null for source-derived layers.
  graphVersionId: string | null;
  enrichmentId: string;
  derivedNodeId: string;
  groundingProvenance: StudyItemGroundingProvenance;
  generatingModel: string;
  configHash: string;
  facet?: string;
};

// Option-select item — auto-graded studying (R9). Four options, exactly one keyed
// correct and source-grounded; the other three are sibling-conditioned distractors
// labeled `generated`. A click writes a deterministic `graded(auto)` row, no judge.
export type OptionSelectItem = StudyItemBase & {
  itemType: "option_select";
  question: string;
  explanation: string;
  options: StudyItemOption[];
};

// One statement of an Impostor item. Three statements are true (one `isImpostor: false`
// each) and exactly one is the planted lie (`isImpostor: true`). A truth is source- or
// generated-grounded and carries a verified `citation`; the impostor is `generated` and
// carries none — never a source quote (R5/R8, ADR-0026 provenance). Provenance is
// re-derived authoritatively at the guard boundary (U4), never trusted from the model.
type ImpostorStatementBase = {
  statementId: string;
  // 0–3 positional order, persisted so the render and hydration are deterministic.
  ordinal: number;
  text: string;
  provenance: "source" | "generated";
};

export type ImpostorTruthStatement = ImpostorStatementBase & {
  isImpostor: false;
  citation: StudyItemCitation;
};

export type ImpostorLieStatement = ImpostorStatementBase & {
  isImpostor: true;
  provenance: "generated";
  reveal: string;
  lieSource: "sibling" | "generated";
  siblingLabel?: string;
};

export type ImpostorStatement = ImpostorTruthStatement | ImpostorLieStatement;

// Impostor item — auto-graded studying (R1). Four statements, exactly one the keyed
// impostor (the learner selects the lie). The `reveal` names the impostor and why it is
// false; for a sibling-sourced lie it states the fact is actually true of `siblingLabel`
// (R6). `lieSource` records whether the lie was a mis-attributed sibling fact or a freshly
// minted misconception (R3). A click writes a deterministic `graded(auto)` row, no judge.
export type ImpostorItem = StudyItemBase & {
  itemType: "impostor";
  question: string;
  statements: ImpostorStatement[];
};

export type MatchingPair = {
  pairId: string;
  matchId: string;
  promptText: string;
  matchText: string;
  citation: StudyItemCitation;
};

export type MatchingItem = StudyItemBase & {
  itemType: "matching";
  question: string;
  pairs: MatchingPair[];
};

export type StudyItem = OptionSelectItem | MatchingItem | ImpostorItem;

// A derived node that produced NO study item of a given type (no usable grounding),
// recorded as a durable fact rather than a transient log line. Keyed per `itemType` so a
// node can be rejected for the impostor independently of having an option-select item (R9,
// KTD8). Only a node the build could ground but for which no item landed appears here, with
// the exact reason.
export type RejectedStudyItem = {
  derivedNodeId: string;
  canonicalLabel: string;
  itemType: StudyItemType;
  reason: string;
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
  explanation: string;
  options: StudyItemOptionDraft[];
};

export type ImpostorTruthDraft = {
  text: string;
  citation: { passageId: string; evidenceQuote: string };
};

export type ImpostorLieDraft = {
  text: string;
  reveal: string;
  lieSource: "sibling" | "generated";
  siblingLabel?: string;
};

export type ImpostorItemDraft = {
  itemType: "impostor";
  question: string;
  truths: [ImpostorTruthDraft, ImpostorTruthDraft, ImpostorTruthDraft];
  lie: ImpostorLieDraft;
};

export type MatchingPairDraft = {
  promptText: string;
  matchText: string;
  citation: { passageId: string; evidenceQuote: string };
};

export type MatchingItemDraft = {
  itemType: "matching";
  question: string;
  pairs: MatchingPairDraft[];
};

export type StudyItemDraft = OptionSelectItemDraft | MatchingItemDraft | ImpostorItemDraft;

export type StudyItemBlueprintTypePlan =
  | { itemType: StudyItemType; generate: true; facet: string }
  | { itemType: StudyItemType; generate: false; reason: string };

export type StudyItemBlueprint = {
  derivedNodeId: string;
  typePlans: StudyItemBlueprintTypePlan[];
};

// ---------------------------------------------------------------------------
// Concept Lesson — the learner-neutral teaching SUBSTRATE (ADR-0031). One lesson
// per derived node: an ordered set of typed, independently-optional sections that
// TEACH the concept before it is tested. Option-select derives FROM this substrate
// (R10, rule 18) rather than from raw passages, so a lesson is the single source of
// grounding for downstream study assets. Generated alongside the Study Item Bank as
// a regenerable derived asset — it never mutates the asserted graph or the Derived
// Graph Layer (R9). Reading a lesson is non-graded (R13).
//
// Honesty is mechanical, not editorial: each section reuses the SAME
// StudyItemGroundingProvenance / StudyItemCitation contract as option-select (KTD2),
// so a `source`-cited section must verify verbatim against a source block and a
// `generated` section carries no source id and never presents as a source quote (R8).
// ---------------------------------------------------------------------------

// The ordered teaching arc (R2). Sections are independently optional — a section that
// cannot be produced or grounded is ABSENT, never a placeholder (R3). Ordering is
// gist → intuition → definition → examples → applications → formulas.
export type ConceptLessonSectionKind =
  | "gist"
  | "intuition"
  | "definition"
  | "examples"
  | "applications"
  | "formulas";

// An optional generated diagram descriptor (R14, KTD6). A thin typed seam: persisted
// and game-ready, but rendering descriptors into visuals is out of scope this iteration.
export type ConceptLessonDiagramDescriptor = { caption: string; spec: string };

// One section of a lesson. `citation` is present only on a `source`-cited section and
// verifies verbatim (R8); a `generated` section carries the generated citation shape or
// none. The provenance is re-derived authoritatively at the assembly boundary (U6) — a
// section is `source` only when its quote matches its cited grounding passage.
export type ConceptLessonSection = {
  kind: ConceptLessonSectionKind;
  text: string;
  items?: string[];
  groundingProvenance: StudyItemGroundingProvenance;
  citation?: StudyItemCitation;
  diagram?: ConceptLessonDiagramDescriptor;
};

// A persisted lesson, keyed like the Study Item Bank so a regeneration replaces the
// prior asset cleanly (replace-by-enrichment). `sections` is ordered and meets the R3
// minimum (a gist, ≥1 application, and ≥1 substantive section).
export type ConceptLesson = {
  derivedNodeId: string;
  // NULL for a synthetic (source-less) layer's lessons; non-null for source-derived layers.
  graphVersionId: string | null;
  enrichmentId: string;
  generatingModel: string;
  configHash: string;
  canonicalLabel: string;
  sections: ConceptLessonSection[];
};

// A derived node whose grounding cannot meet the R3 minimum, recorded as a durable
// fact with its reason rather than a thin or all-placeholder lesson (R3, KTD4). Mirrors
// RejectedStudyItem so the operator visibility surface reuses one display shape (U8).
export type LessonAbsentNode = {
  derivedNodeId: string;
  canonicalLabel: string;
  reason: string;
};

// Pre-verification lesson draft from the generation port (U4). Each section cites a
// grounding passage by `passageId` + quote (the same draft-citation shape option-select
// uses); the assembler verifies the quote verbatim and re-derives provenance before the
// lesson is persisted, so the draft's claimed provenance is never trusted as-is.
export type ConceptLessonSectionDraft = {
  kind: ConceptLessonSectionKind;
  text: string;
  items?: string[];
  citation?: { passageId: string; evidenceQuote: string };
  diagram?: ConceptLessonDiagramDescriptor;
};

export type ConceptLessonDraft = {
  sections: ConceptLessonSectionDraft[];
};

export type ConceptLessonRedundancyJudgment = {
  sectionKind: ConceptLessonSectionKind;
  verdict: "distinct" | "redundant";
  redundantWith?: ConceptLessonSectionKind;
  reason: string;
};

// ---------------------------------------------------------------------------
// Calibration Verdict — the MUTABLE calibration store (R10, KTD1). One verdict per
// (learner, node): `known` claims prior mastery (its trusted prerequisite down-closure
// is treated as mastered, derived at read time); `learn` keeps the node in the study
// gap. Unlike the append-only Response Log, a verdict is current intent — naturally
// upsert/delete — so reversal (R7) is a single overwrite or delete, no stale rows and
// no evidence weights (rule 18, KTD3).
// ---------------------------------------------------------------------------

export type Verdict = "known" | "learn";

export type CalibrationVerdict = {
  learnerStateRef: string;
  derivedNodeId: string;
  verdict: Verdict;
  // Set by the store (DB default) on upsert; populated on read.
  updatedAt?: string;
};

// ---------------------------------------------------------------------------
// Response Log — the durable, append-only commitment (R4–R6). Every GRADED recall
// attempt is an immutable row carrying a judged outcome plus a [0,1] score (the
// partial/binary distinction the estimator and a later IRT/BKT fit need, AE4). With
// the weighted self-report sweep retired (R18, KTD5), the log is graded-only: there
// is no `self_report` signal type, no anki-style rating, and no evidence weight. The
// skill is the Derived Graph Layer `derivedNodeId`; the item is `studyItemId`
// (per-item IRT key). Calibration now lives in the mutable CalibrationVerdict store.
// ---------------------------------------------------------------------------

export type SignalType = "graded";
export type JudgedOutcome = "correct" | "partial" | "incorrect";
export type ResponseSource = "synthetic" | "human";

export type ResponseLogRow = {
  responseId: string;
  learnerStateRef: string;
  studyItemId: string;
  derivedNodeId: string;
  signalType: SignalType;
  judgedOutcome: JudgedOutcome | null;
  gradedScore: number | null;
  responseSource: ResponseSource;
  graderIdentity: string | null;
  // Reserved for grouping a batch of appends; unused now the sweep is gone (kept
  // nullable for IRT/BKT replay grouping later).
  batchId: string | null;
  // Monotonic per learner_state_ref — the ordered sequence BKT/IRT consume (R6).
  // Store-assigned on append (see NewResponseLogRow); populated on read.
  attemptSeq: number;
  submittedAnswer: string | null;
  // Set by the store (DB default) on append; populated on read.
  createdAt?: string;
};

// Append shape: a row before the store stamps the values it owns. The store assigns
// BOTH `createdAt` (DB default) and `attemptSeq` — the monotonic per-learner sequence
// is allocated atomically inside the persistence boundary, so a caller never computes
// (and never races on) it. There is deliberately no update/delete shape — corrections
// APPEND (R5).
export type NewResponseLogRow = Omit<ResponseLogRow, "createdAt" | "attemptSeq">;

// Canonical pipeline LLM-stage identity (KTD4, R2). Each production LLM request
// carries exactly one of these as its LiteLLM spend tag, so cost and wall-clock
// JOIN on the same key (`/spend/tags` ⋈ operation_run_stages.stage, R5). Owned
// here in domain-core — the innermost shared layer — so both the application
// reporter seam and the infrastructure LiteLLM adapters reference ONE source of
// truth (rule 18); the application never inverts dependency direction to reach an
// infrastructure constant (rule 2). The application only LABELS requests with
// these strings; it never computes or stores a cost figure itself (R6).
//
// Tag-name STABILITY is a correctness property: a typo silently mis-buckets a
// stage's spend. Treat these as a closed, append-only vocabulary — add a new
// constant when a new stage appears; never rename an existing one without
// re-baselining attribution.
export const STAGE_TAGS = {
  // Extraction-over-sources (executeExtractionRun).
  conceptDiscovery: "concept-discovery",
  admission: "admission",
  // Synthetic topic generation (runSyntheticGeneration). The source-less front half:
  // concept-set synthesis and the K-sampled knowledge-boundary probe each attribute
  // separately so the synthesis vs probe cost is individually visible in spend.
  conceptSetSynthesis: "concept-set-synthesis",
  knowledgeBoundaryProbe: "knowledge-boundary-probe",
  admissionLabelJudge: "admission-label-judge",
  cepExtraction: "cep-extraction",
  definitionPassageQuality: "definition-passage-quality",
  assertionEntailment: "assertion-entailment",
  // Graph Enrichment (runGraphEnrichment). ONE whole-set ordering call per Declared
  // Domain: the prior per-pair `enrichment-judge` + cross-family
  // `generated-enrichment-judge` tags collapse into this single attribution bucket.
  prerequisiteOrdering: "prerequisite-ordering",
  rescueDurability: "rescue-durability",
  rescuedNodeLabeling: "rescued-node-labeling",
  rescueDefinitionQuality: "rescue-definition-quality",
  mintingDurability: "minting-durability",
  missingPrerequisiteProposal: "missing-prerequisite-proposal",
  groundingGeneration: "grounding-generation",
  intrinsicDifficulty: "intrinsic-difficulty",
  declaredDomainInference: "declared-domain-inference",
  // Derived-node semantic deduplication. The embedding PROPOSE signal and the
  // cross-family merge-adjudication DECISION attribute separately so the recall vs
  // precision halves of the pass are individually visible in spend (AGENTS rule 20).
  nodeEmbedding: "node-embedding",
  nodeMergeAdjudication: "node-merge-adjudication",
  // Learner Study Loop. Lesson generation is a stage WITHIN the `study_items`
  // operation (KTD1) — no new operation type — but carries its own spend tag so its
  // cost ⋈ wall-clock join stays separable from option-select generation (R-cost).
  conceptLessonGeneration: "concept-lesson-generation",
  lessonRedundancyJudgment: "lesson-redundancy-judgment",
  studyItemBlueprint: "study-item-blueprint",
  studyItemGeneration: "study-item-generation",
  matchingGeneration: "matching-generation",
  // Impostor generation is a third stage WITHIN the `study_items` operation (KTD4) — no
  // new operation type — but carries its own spend tag so its cost ⋈ wall-clock join stays
  // separable from option-select and lesson generation (R7, ADR-0029).
  impostorGeneration: "impostor-generation",
  impostorLieValidityJudgment: "impostor-lie-validity-judgment"
} as const;

export type StageTag = (typeof STAGE_TAGS)[keyof typeof STAGE_TAGS];

// Membership test over the closed LLM-stage vocabulary. The reporter seam uses it
// to guarantee every LLM stage it brackets aligns with a STAGE_TAGS value, so the
// R5 cost ⋈ wall-clock join key holds at the type boundary.
const STAGE_TAG_VALUES: ReadonlySet<string> = new Set(Object.values(STAGE_TAGS));

export function isStageTag(stage: string): stage is StageTag {
  return STAGE_TAG_VALUES.has(stage);
}
