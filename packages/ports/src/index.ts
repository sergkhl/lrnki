import type {
  AdmissionLabelJudgment,
  AdmissionProposal,
  ArtifactEnvelope,
  AssertionEntailmentJudgment,
  BlockEvidence,
  CalibrationVerdict,
  StudyItem,
  SelfAssessmentItemDraft,
  OptionSelectItemDraft,
  StudyItemGroundingProvenance,
  StudyItemType,
  ConceptDifficulty,
  DefinitionPassageQualityJudgment,
  JudgedOutcome,
  NewResponseLogRow,
  ResponseLogRow,
  DifficultyNodeContext,
  DerivedGraphLayer,
  DiscoveredCandidate,
  EnrichmentRunTrace,
  ExtractedEvidenceProfile,
  ExtractionQualityIssue,
  ExtractionRunResult,
  GeneratedGroundingBundle,
  WholeSetOrdering,
  GraphSnapshot,
  InferredPrerequisiteEdge,
  LearnerPath,
  MentionedNonCoreCandidate,
  MissingPrerequisiteProposal,
  MintingDurabilityJudgment,
  NodeMergeAdjudication,
  PrerequisiteConceptContext,
  PublishedConceptIdentity,
  RefinementDecisionRecord,
  RejectedStudyItem,
  RescueDurabilityJudgment,
  RunCandidate,
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
// salience-ordered set of mention passages, and zero or more `defines` assertions.
// Replaces broad claim extraction: there is no retry, no recall
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
    // The admission-verified definition-bearing passages for this subject (U2/KTD2).
    // A HINT only: the extractor still emits its own definition passages and the
    // application boundary still independently verbatim-verifies them. Carrying the
    // already-proven definition forward keeps the extractor from losing it under
    // fan-out, without bypassing the CEP port or relaxing the verbatim floor.
    // Empty for optional subjects (admission gates this criterion on core only).
    definitionBearingEvidence: BlockEvidence[];
  }): Promise<ExtractedEvidenceProfile>;
}

// Assertion-entailment judge (ADR-0007 reset). A bounded, forced-tool LLM judgment
// over ONE optional typed assertion whose evidence already verifies verbatim, run
// on an independent model family so the judge is not the extractor grading its own
// homework. It guards ONLY `defines` assertions; definition and mention passages
// face the deterministic verbatim floor alone. It can only
// REJECT: a rejected assertion's underlying passage is preserved as an untyped
// mention. `judgeDefinition` checks a `defines` literal (a model paraphrase no
// surface matcher can verify).
export interface AssertionEntailmentJudgmentPort {
  readonly model: string;
  judgeDefinition(input: {
    declaredDomain: string;
    subject: { canonicalLabel: string; aliases: string[] };
    definition: string;
    evidenceQuotes: string[]; // already verbatim-verified against cited blocks
  }): Promise<AssertionEntailmentJudgment>;
}

// Definition-Passage quality judge (ADR-0007 extension). A bounded, forced-tool LLM
// judgment that re-reads a core Concept's already-verbatim-verified Definition
// Passages and decides, per passage, whether it ESTABLISHES the Concept's meaning or
// is a hollow passage (bare name repetition, heading/title, citation/bibliographic).
// Run on the independent cross-family alias (`kg-independent-judge`) so the DeepSeek
// extractor never grades its own definitions. BATCHED per Concept (KTD4): one call
// judges all of a Concept's definition passages, returning one judgment per passage,
// index-aligned to the input order. Drop-only: a veto removes the hollow passage; it
// never adds, promotes, or reorders. The adapter grounds each veto fail-closed (an
// ungrounded `judgedSpan` is coerced to a keep), so the application stage drops only
// on a confident, source-grounded hollow verdict and a transport blip never shrinks
// the published core (D3, AGENTS rule 16).
export interface DefinitionPassageQualityJudgmentPort {
  readonly model: string;
  judgeDefinitions(input: {
    declaredDomain: string;
    subject: { canonicalLabel: string; aliases: string[] };
    // Each passage already verbatim-verified against its cited block by the floor.
    // `blockType` / `headingPath` are passed as CONTEXT so the judge can recognize
    // heading/title/citation structure — never as a deterministic gate (KTD7, rule 16).
    passages: { sourceBlockId: string; evidenceQuote: string; blockType: string; headingPath: string[] }[];
  }): Promise<DefinitionPassageQualityJudgment[]>; // one per input passage, index-aligned
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

// Rescue durability judge (U3, ADR-0019 refinement). A bounded, forced-tool LLM
// judgment over ONE aggregated `source_mentioned` rescue candidate, run on the
// independent cross-family alias (`kg-independent-judge`) so the DeepSeek generator
// never grades rescue durability. It answers: against the same-domain anchors this
// node would scaffold, is the candidate a durable prerequisite or an incidental
// artifact? Used only to DROP a non-durable rescue candidate; it never creates a
// node. The application boundary grounds the veto fail-OPEN: a `not_durable` verdict
// whose `groundingSpan` is not in the candidate's own mention evidence keeps the node
// flagged rather than dropping it (KTD3, AGENTS rule 16).
export interface RescueDurabilityJudgmentPort {
  readonly model: string;
  judge(input: {
    declaredDomain: string;
    candidate: { canonicalLabel: string; aliases: string[]; mentionQuotes: string[] };
    anchors: { canonicalLabel: string; definitionQuotes: string[] }[];
  }): Promise<RescueDurabilityJudgment>;
}

// Minting durability judge. A bounded, forced-tool LLM judgment over ONE proposed
// assumed-prerequisite label before any generated grounding is created. Cross-family
// from the DeepSeek proposer/generator; used only to DROP a clearly non-durable
// proposal, never to create or reshape one. The application stage owns fail-open
// behavior on transport or schema failure because generated proposals have no
// candidate-owned verbatim source span to ground a veto against.
export interface MintingDurabilityJudgmentPort {
  readonly model: string;
  judge(input: {
    declaredDomain: string;
    proposal: { proposedLabel: string; rationale: string };
    anchor: { canonicalLabel: string; definitionQuotes: string[] };
  }): Promise<MintingDurabilityJudgment>;
}

// Derived-node embedding PROPOSE signal for semantic deduplication (plan U1, ADR-0012,
// AGENTS rule 20). Returns one vector per derived-node text so the dedup stage can
// compute within-domain cosine and surface candidate near-duplicate pairs. Embeddings
// PROPOSE only: this port never decides similarity, never merges, and is never used to
// derive a prerequisite. `embed` preserves input order (vectors[i] is texts[i]) and
// fails closed (throws) on any shape mismatch so the stage treats the signal as
// unavailable and skips dedup (R13).
export interface NodeEmbeddingPort {
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}

// Merge-adjudication DECISION for semantic deduplication (plan U2, AGENTS rule 20). A
// SEPARATE mechanism from the embedding proposer: it decides whether two proposed
// near-duplicate nodes are two surface forms of the SAME domain concept (`merge`) or
// genuinely distinct (`keep_distinct`). A measured cross-family LLM judge; raw cosine
// never decides. Decision-only (no scores). The adapter validates tool arguments and
// returns the typed decision; fail-closed semantics (transport/validation failure →
// the application stage treats the pair as keep-distinct) live in the dedup stage (U3),
// matching how applyRescueDurabilityJudge owns its fail-open grounding decision.
export interface NodeMergeAdjudicationPort {
  readonly model: string;
  adjudicate(input: {
    declaredDomain: string;
    a: { label: string; aliases: string[]; evidence: string[] };
    b: { label: string; aliases: string[]; evidence: string[] };
  }): Promise<NodeMergeAdjudication>;
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
// machinery disposes, over one published graph version. Difficulty is now
// learner-neutral intrinsic; learner-calibrated IRT/BT remains data-blocked.
// ---------------------------------------------------------------------------

// Whole-set prerequisite ordering over ALL evidenced nodes in one Declared Domain
// (ADR-0019, amended — K-sampled whole-set ordering, plan U2/U4, D1/D2). ONE forced-tool
// call returns a directed prerequisite edge list over the listed nodes — ONE draw from a
// non-deterministic distribution (ADR-0028). `order` is a thin single-call caller: the
// APPLICATION invokes it K times on the SAME input and tallies a per-pair directional vote
// (D1/D2), so this method neither knows K nor aggregates. Each node is listed with its CEP
// evidence; each edge cites its endpoints by EXACT canonical label, which the application
// maps → derivedNodeIds fail-closed (KTD3, R9). The judge proposes directed edges only; the
// boundary derives consensus confidence, routes direction-contested pairs and aggregate
// cycles to `uncertain` (D3/D6, rules 16/19), and runs the symbolic disposal (weak-cut →
// transitive reduction) over the consensus certain edges. There is no corrective re-prompt
// (KTD4, rule 18): acyclicity is enforced on the aggregate, not by re-prompting one draw.
export interface PrerequisiteOrderingPort {
  readonly model: string;
  order(input: {
    declaredDomain: string;
    nodes: PrerequisiteConceptContext[];
  }): Promise<WholeSetOrdering>;
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

// Intrinsic difficulty judge (ADR-0024). A bounded, forced-tool neural judgment
// over ONE derived node's evidence, run through an independent judge alias. It
// estimates learner-neutral intrinsic difficulty from generic signals such as
// abstraction level, technical density, and implied background load. The adapter
// validates tool arguments fail-closed; fusion with graph structure happens in
// the application layer.
export interface IntrinsicDifficultyJudgmentPort {
  readonly model: string;
  judge(input: DifficultyNodeContext): Promise<{ neuralScore: number; rationale: string }>;
}

// Node difficulty (ADR-0019). The current production direction is
// learner-neutral intrinsic difficulty: neural source-grounded judgment fused
// with deterministic graph/evidence components. Learner-calibrated IRT/BT stays
// deferred until learner-response data exists. Reads concepts + the inferred
// prereq DAG; one score each.
export interface DifficultyPort {
  readonly method: string;
  // Scores DERIVED NODE ids — anchors AND enrichment nodes (R12) — not asserted
  // Concepts: the inferred DAG spans the union, so difficulty must too. Generated
  // nodes are never fabricated into `Concept` values to satisfy the port (handoff
  // constraint). Both the input contexts and the returned difficulties key on
  // `derivedNodeId` (the difficulty store keys on derived_node_id).
  score(input: { nodes: DifficultyNodeContext[]; prerequisiteEdges: InferredPrerequisiteEdge[] }): Promise<ConceptDifficulty[]>;
}

// Learner mastery seam (ADR-0024 defers population learner modeling). MVP impl is a mock
// ("knows nothing"): mastery() === 0 for every derived node. Real IRT/KT later
// implements the SAME port, so the projection upstream never changes. Pure/sync:
// the projection is a deterministic CLI operation (ADR-0011). Mastery is keyed to the
// Derived Graph Layer node id (the learner-recall subject identity, ADR-0026).
export interface LearnerStatePort {
  readonly learnerStateRef: string;
  mastery(derivedNodeId: string): number; // [0,1]; >= masteryThreshold => pruned from the path
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
  getPath(input: { enrichmentId: string; targetDerivedNodeId: string; learnerStateRef: string }): Promise<LearnerPath | undefined>;
}

// ---------------------------------------------------------------------------
// Learner Study Loop ports (R7–R16, ADR-0026). Learner-neutral typed Study Item Bank
// plus the durable append-only Response Log. All learner structures are projection-only:
// nothing here mutates the asserted graph or the Derived Graph Layer (AGENTS rule 3).
// ---------------------------------------------------------------------------

// Study Item Bank persistence (R7, R12). `persist` writes a whole enrichment's typed
// study items, their options + grounded-answer citations, AND its rejected (no-item)
// nodes atomically, plus the immutable `study_item_bank` artifact, in one transaction
// (no authoritative relational state without its artifact, matching the enrichment/
// extraction stores). Regeneration replaces an enrichment's items and rejections
// (delete-then-insert). `supportedItemTypes` is a `SELECT DISTINCT item_type` query —
// the supported set is the literal byproduct of which typed items grounded, never a
// stored map (KTD2, rule 18). Rejected nodes are persisted so the no-item frontier
// fallback reads the real rejection reason instead of guessing from grounding origin.
export interface StudyItemBankStorePort {
  persist(input: { graphVersionId: string; enrichmentId: string; configHash: string; studyItems: StudyItem[]; rejected: RejectedStudyItem[] }): Promise<void>;
  getStudyItem(derivedNodeId: string, itemType: StudyItemType): Promise<StudyItem | undefined>;
  listStudyItemsForEnrichment(enrichmentId: string): Promise<StudyItem[]>;
  supportedItemTypes(derivedNodeId: string): Promise<StudyItemType[]>;
}

// Study Item generation (R9, R10). Forced named tool schemas routed through LiteLLM; the
// generator stays DeepSeek-family (AGENTS rule 5). `generate` returns a pre-verification
// SelfAssessmentItemDraft; `generateOptionSelect` returns a pre-verification
// OptionSelectItemDraft (a grounded correct answer + three sibling-conditioned
// distractors). The application boundary verifies the grounded answer verbatim, then the
// deterministic guard (U2) accepts or rejects — semantic acceptance is NOT done here.
export interface StudyItemGenerationPort {
  readonly model: string;
  generate(input: {
    declaredDomain: string;
    node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
    groundingProvenance: StudyItemGroundingProvenance;
    groundingPassages: (
      | { passageId: string; kind: "definition" | "mention"; text: string; sourceResourceId: string; sourceBlockId: string }
      | { passageId: string; kind: "definition" | "mention"; text: string; derivedNodeId: string }
    )[];
    definesLiteral: string | null;
  }): Promise<SelfAssessmentItemDraft>;
  generateOptionSelect(input: {
    declaredDomain: string;
    node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
    groundingProvenance: StudyItemGroundingProvenance;
    groundingPassages: (
      | { passageId: string; kind: "definition" | "mention"; text: string; sourceResourceId: string; sourceBlockId: string }
      | { passageId: string; kind: "definition" | "mention"; text: string; derivedNodeId: string }
    )[];
    // Same-domain neighbor descriptors that flavor the distractors (prompt-context only;
    // a sibling-poor node still generates, just with thinner flavor — KTD3).
    siblings: { label: string; snippet: string }[];
  }): Promise<OptionSelectItemDraft>;
}

// Response Log persistence (R4–R6). The port surface is deliberately APPEND + READ
// only — there is no update or delete — so the append-only guarantee (R5) is
// structural, not a convention. A per-learner reset (R16) bypasses this port with a
// direct operator delete, so the structural guarantee is never weakened here.
// `nextAttemptSeq` hands the caller the next monotonic sequence for a learner so
// graded measurement stamps ordered rows.
export interface ResponseLogStorePort {
  append(rows: NewResponseLogRow[]): Promise<void>;
  listForLearner(learnerStateRef: string): Promise<ResponseLogRow[]>;
  listForLearnerNode(learnerStateRef: string, derivedNodeId: string): Promise<ResponseLogRow[]>;
  nextAttemptSeq(learnerStateRef: string): Promise<number>;
}

// Calibration Verdict persistence (R10, KTD1). The MUTABLE counterpart to the
// append-only Response Log: `upsert` writes the current `known`/`learn` intent per
// (learner, node), overwriting any prior verdict for that node (one row, never two);
// `delete` reverses a single node's verdict (R7); `clearLearner` is the per-learner
// reset's verdict half (R16). The trusted-edge down-closure of the `known` set is
// derived at read time (calibrationClosure, U3), so this store holds only the direct
// verdicts — no seeded or materialized closure rows.
export interface CalibrationVerdictStorePort {
  upsert(verdict: { learnerStateRef: string; derivedNodeId: string; verdict: CalibrationVerdict["verdict"] }): Promise<void>;
  delete(input: { learnerStateRef: string; derivedNodeId: string }): Promise<void>;
  listForLearner(learnerStateRef: string): Promise<CalibrationVerdict[]>;
  clearLearner(learnerStateRef: string): Promise<void>;
}

// Learner answer simulator (R14, U7). Generates a learner's free-form written answer
// for a card at a given competence, so synthetic prefill exercises the REAL grading
// path (the answer is graded by AnswerGradingJudgePort, not stubbed). DeepSeek-family
// generator; EXPERIMENT_ONLY scaffolding, never asserted in tests (AGENTS rule 11).
export interface LearnerAnswerSimulatorPort {
  readonly model: string;
  simulateAnswer(input: {
    declaredDomain: string;
    question: string;
    // "strong" → a competent answer; "weak" → a partial or struggling answer.
    competence: "strong" | "weak";
  }): Promise<{ answer: string }>;
}

// Answer grading judge (R9, U5). Grades a free-form written answer against a card's
// answer-key, cross-family on `kg-independent-judge` so the DeepSeek card generator
// never grades its own answer-key (KTD, ADR-0023). Forced named tool schema; the
// adapter validates arguments fail-closed.
export interface AnswerGradingJudgePort {
  readonly model: string;
  grade(input: {
    declaredDomain: string;
    question: string;
    answerKey: string;
    submittedAnswer: string;
  }): Promise<{ outcome: JudgedOutcome; score: number; rationale: string }>;
}

// ---------------------------------------------------------------------------
// Inspection Read Model (ADR-0027). Admin Lab inspection reads — pure read, no
// adaptation compute — are served by read-only read-model ports that return a
// finished model; the storage adapter owns every query and verbatim row-stitch,
// and no UI embeds SQL. These admin-presentation shapes live in the ports
// contract by accepted exception (bounded to inspection): AGENTS rule 3 keeps
// them out of domain-core, and the application→ports→domain-core direction keeps
// them out of application. Learner-facing PROJECTION reads (read + adaptation
// compute) are served by application use-cases instead and are not modeled here.
// ---------------------------------------------------------------------------

export interface RunSummary {
  runId: string;
  sourceTitle: string;
  declaredDomain: string;
  status: string;
  degraded: boolean;
  latencyMs: number | null;
  startedAt: string;
  candidateCount: number;
  coreCount: number;
  // CEP completeness replaces the retired verified/rejected claim counts (R9).
  profileCount: number;
  completeProfileCount: number;
  definitionCount: number;
  mentionCount: number;
  assertionCount: number;
}

export interface ProfilePassage {
  kind: "definition" | "mention";
  sourceBlockId: string;
  headingPath: string[];
  evidenceQuote: string;
  salienceRank: number;
}

export interface ProfileAssertion {
  assertionType: string;
  // `defines` carries a literal.
  target: string;
  evidenceQuotes: string[];
}

export interface RunProfile {
  candidateKey: string;
  conceptLabel: string;
  tier: string;
  complete: boolean;
  definitions: ProfilePassage[];
  mentions: ProfilePassage[];
  assertions: ProfileAssertion[];
}

export interface RunInspection {
  run: RunSummary;
  pipelineConfigHash: string;
  candidates: {
    candidateKey: string;
    discoveredLabel: string;
    canonicalLabel: string;
    aliases: string[];
    mentionCount: number;
    modelTier: string;
    tier: string;
    proposedCanonicalLabel: string;
    standaloneLearningObjective: RunCandidate["admission"]["standaloneLearningObjective"];
    establishedDomainMeaning: RunCandidate["admission"]["establishedDomainMeaning"];
    definitionBearingTreatment: RunCandidate["admission"]["definitionBearingTreatment"];
    organizingPower: RunCandidate["admission"]["organizingPower"];
    coreSelected: boolean;
    selectionReasonCode: string;
    reasonCodes: string[];
    boundaryReasonCodes: string[];
    confidence: number;
  }[];
  qualityIssues: ExtractionQualityIssue[];
  profiles: RunProfile[];
}

export interface SourceSummary {
  sourceResourceId: string;
  title: string;
  declaredDomain: string;
  contentType: string;
  contentHash: string;
  blockCount: number;
  runCount: number;
}

export interface SourceInspection {
  source: SourceSummary;
  parserName: string;
  parserVersion: string;
  blocks: { blockId: string; blockType: string; headingPath: string[]; text: string }[];
}

// Run Inspector read surface: list summaries + one run's full inspection. Returns
// `undefined` only for not-found; real DB errors propagate (ADR-0027 decision 5).
export interface RunInspectionReadPort {
  listRunSummaries(): Promise<RunSummary[]>;
  getRunInspection(runId: string): Promise<RunInspection | undefined>;
}

// Source Explorer read surface: list source summaries + one source's blocks.
export interface SourceInspectionReadPort {
  listSourceSummaries(): Promise<SourceSummary[]>;
  getSourceInspection(sourceResourceId: string): Promise<SourceInspection | undefined>;
}

// ---------------------------------------------------------------------------
// Run-stage timeline reporting seam (ADR-0029). The externally driven seam every
// triggered operation reports progress through, so a future durable workflow
// engine (Temporal/Restate) can drive the substrate without changing operation
// logic. Operations call these at stage boundaries and inside item loops; the
// worker injects the Postgres adapter, tests inject a fake, and an absent
// reporter (the no-op default) keeps behavior unchanged. Side-effect-only and
// idempotent-tolerant — the reporter writes the timeline, it returns nothing.
// ---------------------------------------------------------------------------

// The four triggered operations whose timeline these tables describe.
// `study_items` is its own operation_type keyed by enrichmentId (ADR-0017 split
// is preserved — these describe operations, they do not unify them).
export type OperationType = "extraction" | "minting" | "enrichment" | "study_items";

export interface RunProgressReporterPort {
  // Insert the parent `running` row at operation entry — the fix for "no row
  // until done": a polling client sees `running` immediately, not no row.
  beginOperation(input: { operationType: OperationType; operationId: string }): Promise<void>;
  // Open a stage: insert a child row, set the parent's current_stage. `total` is
  // the item count for a stage that iterates, enabling an N-of-M heartbeat.
  enterStage(input: { operationId: string; stage: string; total?: number }): Promise<void>;
  // Bump the heartbeat as items complete inside a long stage, so liveness is
  // visible without waiting for a stage boundary. `done` is the cumulative count.
  recordProgress(input: { operationId: string; stage: string; done: number }): Promise<void>;
  // Close a stage: set its ended_at + ok. A thrown stage reports ok:false first.
  completeStage(input: { operationId: string; stage: string; ok: boolean }): Promise<void>;
  // Set the parent's terminal status + completed_at.
  completeOperation(input: { operationId: string; status: "succeeded" | "failed" }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Operation timeline read model (ADR-0027, ADR-0029). The live "where is this
// operation, is it moving" surface. Pure read over operation_runs +
// operation_run_stages; the adapter owns the query and row-stitch, no SQL in UI.
// Returns finished models or `undefined`-for-not-found; real DB errors propagate.
// ---------------------------------------------------------------------------

export interface OperationTimelineStage {
  stage: string;
  startedAt: string;
  endedAt: string | null;
  // null while the stage is open; ended_at - started_at once closed.
  durationMs: number | null;
  ok: boolean | null;
  progressDone: number | null;
  progressTotal: number | null;
}

export interface OperationTimelineSummary {
  operationRunId: string;
  operationType: OperationType;
  operationId: string;
  status: "running" | "succeeded" | "failed";
  currentStage: string | null;
  progressDone: number | null;
  progressTotal: number | null;
  lastProgressAt: string | null;
  startedAt: string;
  completedAt: string | null;
  // Wall-clock since start: completed_at - started_at, or now - started_at while running.
  // A long-stale lastProgressAt on a `running` row is the "hung run" signal.
  elapsedMs: number;
  stageCount: number;
}

export interface OperationTimelineDetail {
  summary: OperationTimelineSummary;
  stages: OperationTimelineStage[];
}

export interface OperationTimelineReadPort {
  listOperationTimelines(): Promise<OperationTimelineSummary[]>;
  getOperationTimeline(operationId: string): Promise<OperationTimelineDetail | undefined>;
}

// Per-stage LiteLLM spend (ADR-0029). Read live from LiteLLM `/spend/tags` at report
// time; the application NEVER computes or stores a cost figure — it surfaces
// LiteLLM's `total_spend` verbatim. The adapter projects the response onto the closed
// STAGE_TAGS vocabulary, excluding LiteLLM's auto-emitted User-Agent pseudo-tags and
// any stale tag, so only join-keyable LLM stages survive. Spend is GLOBAL per tag
// (LiteLLM has no per-operation scoping) — the standing per-stage cost picture.
export interface StageSpend {
  tag: string;
  logCount: number;
  totalSpend: number;
}

export interface StageSpendReadPort {
  readStageSpend(): Promise<StageSpend[]>;
}
