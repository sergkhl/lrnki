import type {
  ScaffoldDetour,
  ScaffoldStep,
  ScaffoldNodePayload,
  AdmissionLabelJudgment,
  AdmissionProposal,
  ArtifactEnvelope,
  AssertionEntailmentJudgment,
  BlockEvidence,
  CalibrationVerdict,
  ConceptIdentityResolutionOutcome,
  ConceptLesson,
  ConceptLessonDraft,
  ConceptLessonRedundancyJudgment,
  ConceptLessonSectionKind,
  LessonAbsentNode,
  MatchingItemDraft,
  StudyItem,
  OptionSelectItemDraft,
  ImpostorItemDraft,
  ImpostorLieValidityJudgment,
  StudyItemBlueprint,
  StudyItemGroundingProvenance,
  StudyItemType,
  ConceptDifficulty,
  DefinitionPassageQualityJudgment,
  NewResponseLogRow,
  ResponseLogRow,
  DifficultyBandEntry,
  DifficultyNodeContext,
  DerivedGraphLayer,
  DiscoveredCandidate,
  DiscoveryCoverageMiss,
  ScaffoldContentCongruenceVerdict,
  EnrichmentRunTrace,
  ExtractedEvidenceProfile,
  ExtractionQualityIssue,
  ExtractionRunResult,
  GeneratedGroundingBundle,
  SynthesizedConcept,
  KnowledgeBoundaryProbeAnswer,
  WholeSetOrdering,
  GraphSnapshot,
  NonCoreRescueCandidate,
  MissingPrerequisiteProposal,
  MintingDurabilityJudgment,
  NodeMergeAdjudication,
  PrerequisiteConceptContext,
  PublishedConceptIdentity,
  RefinementDecisionRecord,
  RejectedStudyItem,
  RescueDurabilityJudgment,
  RescuedNodeLabeling,
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

// One admitted concept as the discovery-coverage audit presents it to the judge
// (plan 2026-07-10-004 R1): the proposed canonical label plus a short evidence gist
// so the judge sees what the admitted set already covers without re-reading CEPs.
export interface DiscoveryCoverageAuditConcept {
  label: string;
  gist: string;
}

// Discovery-coverage audit judgment (plan 2026-07-10-004, KTD1/KTD2): ONE sample of
// the cross-family judge over the source's teachable blocks plus the run's admitted
// (core + optional) set. Returns the standalone learning objectives the admitted set
// fails to preserve (empty = full coverage). K-sample orchestration and recurrence
// aggregation live in the application use-case, not this transport.
export interface DiscoveryCoverageAuditPort {
  model: string;
  audit(input: {
    declaredDomain: string;
    blocks: { blockType: string; headingPath: string[]; text: string }[];
    admittedConcepts: DiscoveryCoverageAuditConcept[];
  }): Promise<DiscoveryCoverageMiss[]>;
}

// Scaffold-content congruence judge (plan 2026-07-16-001, KTD3). ONE sample of the cross-family
// independent judge over ONE generated Support Step: it sees the Declared Domain, the detour term,
// the parent concept label, the step label, and the step's content (correct answer NOT flagged),
// and answers whether the content teaches the named step label and whether it is a genuinely
// simpler prerequisite of the term. K-sample orchestration and per-step recurrence aggregation
// live in the application audit module, not this transport (mirrors DiscoveryCoverageAuditPort).
export interface ScaffoldContentCongruencePort {
  model: string;
  judge(input: {
    declaredDomain: string;
    term: string;
    parentLabel: string;
    stepLabel: string;
    microLesson: string;
    question: string;
    explanation: string;
    // Every option text, correct answer NOT distinguished — the judge grades the teaching, not
    // the answer key.
    options: string[];
  }): Promise<ScaffoldContentCongruenceVerdict>;
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

// Dedicated measured Rescued-Node Canonical Labeling step (TODO #1), run on the independent
// cross-family alias (`kg-independent-judge`) so the DeepSeek generator never names rescue
// nodes. It replaces the rescue durability judge's under-attended optional `canonicalLabelProposal`
// field: a rescued node's label is the source sentence it was mentioned in and reads as a
// proposition, so this step re-names it to a concept-shaped noun phrase. ONE whole-set call per
// Declared Domain over that domain's DURABLE rescued nodes; each node is shown with a 1-based
// number and the judge returns one concept-shaped label per number, which MAY equal the current
// label when it already reads as a concept name (unconditional — no self-gate). It never creates
// or drops a node; the application maps number → node by position fail-OPEN, and minting owns
// adoption (collision guard against the domain's taken labels, original demoted to an alias).
export interface RescuedNodeLabelingPort {
  readonly model: string;
  label(input: {
    declaredDomain: string;
    nodes: { canonicalLabel: string; aliases: string[]; mentionQuotes: string[] }[];
    // The domain's already-claimed labels (anchors + peer rescued nodes) so the judge avoids
    // proposing a name that would fail the deterministic collision guard (mirrors the minting
    // proposer's `existingNodeLabels`). Evidence-only; the model never re-uses one of them.
    takenLabels: string[];
  }): Promise<RescuedNodeLabeling>;
}

// A grounding passage handed to a generator or judge: source-cited passages carry source ids
// and require a verbatim source quote; generated passages carry no source ids. One shape
// shared by every study-item/lesson port below (rule 18) instead of a repeated inline literal.
export type StudyItemGroundingPassage =
  | { passageId: string; kind: "definition" | "mention"; text: string; sourceResourceId: string; sourceBlockId: string }
  | { passageId: string; kind: "definition" | "mention"; text: string; derivedNodeId: string };

// Impostor lie-validity judge (ADR-0026 refinement). A bounded cross-family judgment over
// a deterministic-guarded impostor lie. It answers whether the keyed lie is actually false
// for the target node. Unlike other semantic judges that fail open/pass-through, the
// application uses this one fail-closed with an operator-visible rejected-row reason because
// a true "lie" teaches a falsehood and no-impostor is the designed safe state.
export interface ImpostorLieValidityJudgmentPort {
  readonly model: string;
  judge(input: {
    declaredDomain: string;
    node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
    lie: { text: string; reveal: string };
    groundingPassages: StudyItemGroundingPassage[];
    siblings: { label: string; snippet: string }[];
  }): Promise<ImpostorLieValidityJudgment>;
}

export interface ConceptLessonRedundancyJudgmentPort {
  readonly model: string;
  judge(input: {
    declaredDomain: string;
    node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
    sections: { kind: ConceptLessonSectionKind; text: string; items?: string[] }[];
  }): Promise<ConceptLessonRedundancyJudgment[]>;
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
// evidence; each edge cites endpoints by the listed 1-based Concept number, which the
// application maps by position to derivedNodeIds fail-closed (KTD3, R9). The judge proposes
// directed edges only; the boundary derives consensus confidence, routes
// direction-contested pairs and aggregate cycles to `uncertain` (D3/D6, rules 16/19), and
// runs symbolic disposal over the consensus certain edges. There is no corrective re-prompt
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
    // Topic context for the anchor-less synthetic case (KTD3, R3). When
    // `scaffoldedAnchors` is empty (synthetic generation), the bundle is grounded on
    // the originating topic instead of scaffolded anchors; absent/empty for the
    // enrichment-minting path, which keeps scaffolding on its anchors unchanged.
    topic?: string;
  }): Promise<GeneratedGroundingBundle>;
}

// ---------------------------------------------------------------------------
// Synthetic topic generation ports (ADR-0019 amended, plan 2026-06-30-001). The
// source-less front half of the second pipeline arm: concept-set synthesis is the
// source-less analog of Candidate Discovery, and the knowledge-boundary probe is a
// single-draw factual answer the application samples K times (U3). Both stay
// domain-neutral and untuned with expected topics (AGENTS rule 17).
// ---------------------------------------------------------------------------

// Concept-set synthesis (R1, R2, KTD7). ONE forced-tool call generates a bounded
// concept set from `topic + declaredDomain` alone — no source, no coverage/grain gate
// in this build. The generator stays DeepSeek-family (AGENTS rule 5); the probe below
// is a cross-family second opinion.
export interface ConceptSetSynthesisPort {
  readonly model: string;
  synthesize(input: { topic: string; declaredDomain: string }): Promise<SynthesizedConcept[]>;
}

// Knowledge-boundary probe (R6, R7, KTD4). ONE draw: a pointed factual answer about
// one concept, on a dedicated SMALL cross-family alias independent of the synthesizer,
// returned via a forced named tool. The K-draw loop, moderate temperature, and
// semantic-agreement aggregation live in the application (U3), mirroring how
// runGraphEnrichment owns `orderingSampleCount` rather than the ordering adapter.
export interface KnowledgeBoundaryProbePort {
  readonly model: string;
  probe(input: { conceptLabel: string; declaredDomain: string }): Promise<KnowledgeBoundaryProbeAnswer>;
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

// Intrinsic difficulty judge (ADR-0024 — comparative banded prior). Two forced-tool
// call kinds through the same independent judge alias:
// `bandDomainSet` bands EVERY concept of one Declared Domain 1–5 RELATIVE to that
// set in ONE call (numbered menu-pick; exact coverage validated fail-closed with one
// corrective re-prompt). The application K-samples this call (ADR-0028), takes the
// modal band as consensus, and treats dispersion as signal.
// `compareHarder` is the bounded pairwise calibration for CONTESTED bands: one
// "which is harder" judgment between the contested concept and an uncontested anchor.
// The adapter validates tool arguments fail-closed; consensus, contest detection, and
// the two-comparison bracket live in the application layer, never here.
export interface IntrinsicDifficultyJudgmentPort {
  readonly model: string;
  bandDomainSet(input: { declaredDomain: string; nodes: DifficultyNodeContext[] }): Promise<DifficultyBandEntry[]>;
  compareHarder(input: { declaredDomain: string; first: DifficultyNodeContext; second: DifficultyNodeContext }): Promise<{ harder: "first" | "second" }>;
}

// Declared-domain inference (Learner generation). ONE forced-tool call maps a
// learner's topic phrase to a short field-of-study label before the learner can
// confirm or edit it. The learner-facing workflow owns confirmation; this port
// only supplies the initial domain guess and fails closed on malformed output.
export interface DeclaredDomainInferencePort {
  readonly model: string;
  infer(input: { topic: string }): Promise<{ declaredDomain: string }>;
}

// Node difficulty (ADR-0019). The current production direction is the
// learner-neutral comparative banded prior (ADR-0024): a K-sampled in-set banding
// judgment with pairwise calibration for contested bands. Structural DAG terms are
// no longer fused in — depth/ancestors/fan-in re-encode the prerequisite structure
// that already gates the path — so the port reads node evidence contexts only.
// Learner-calibrated IRT/BT stays deferred until learner-response data exists.
export interface DifficultyPort {
  readonly method: string;
  // Scores DERIVED NODE ids — anchors AND enrichment nodes (R12) — not asserted
  // Concepts: the derived layer spans the union, so difficulty must too. Generated
  // nodes are never fabricated into `Concept` values to satisfy the port (handoff
  // constraint). Both the input contexts and the returned difficulties key on
  // `derivedNodeId` (the difficulty store keys on derived_node_id).
  score(input: { nodes: DifficultyNodeContext[] }): Promise<ConceptDifficulty[]>;
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
  // Rescue source for Graph Enrichment (KTD1/KTD5, R1/R7): the member Extraction Runs
  // of `graphVersionId` (resolved via graph_version_run_memberships) reduced to their
  // non-core admission proposals. `optional`-tier candidates carry their verbatim
  // Definition Passages alongside mentions so rescue reuses already-extracted grounded
  // evidence; `reject`-tier candidates carry mentions only (KTD3 precision guard). Each
  // passage carries the cited block's text so the verbatim floor (U3) re-verifies at
  // enrichment time. These become `source_mentioned`/`derived` nodes only and never
  // touch the asserted core.
  nonCoreRescueCandidates(graphVersionId: string): Promise<NonCoreRescueCandidate[]>;
}

// Learner Expedition persistence (Learner App v1). This is learner-owned mutable
// routing state only: it remembers which expedition rows belong to a learner and
// which generation operation is in flight. Study readiness, mastery, and rewards
// remain derived from existing learner-neutral projections.
export type LearnerExpeditionKind = "topic";
export type LearnerExpeditionStatus = "generating" | "ready" | "failed";

export interface LearnerExpedition {
  learnerExpeditionId: string;
  learnerStateRef: string;
  kind: LearnerExpeditionKind;
  title: string;
  declaredDomain: string | null;
  status: LearnerExpeditionStatus;
  currentOperationId: string | null;
  currentOperationType: OperationType | null;
  enrichmentId: string | null;
  active: boolean;
  failureMessage: string | null;
  generationAttempts: number;
  claimedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// A supervisor claim atomically installs the fresh enrichment operation id that also
// fences every write made by that attempt. Callers never receive a claimed expedition
// with the ambiguous pre-token `null` state.
export type ClaimedLearnerExpedition = Omit<LearnerExpedition, "currentOperationId" | "currentOperationType"> & {
  currentOperationId: string;
  currentOperationType: "enrichment";
};

export interface NewLearnerExpedition {
  learnerExpeditionId: string;
  learnerStateRef: string;
  kind: LearnerExpeditionKind;
  title: string;
  declaredDomain: string | null;
  status: LearnerExpeditionStatus;
  currentOperationId?: string | null;
  currentOperationType?: OperationType | null;
  enrichmentId?: string | null;
  active?: boolean;
  failureMessage?: string | null;
}

export interface LearnerExpeditionStorePort {
  upsert(expedition: NewLearnerExpedition): Promise<void>;
  listForLearner(learnerStateRef: string): Promise<LearnerExpedition[]>;
  getForLearner(input: { learnerStateRef: string; learnerExpeditionId: string }): Promise<LearnerExpedition | undefined>;
  getByEnrichment(input: { learnerStateRef: string; enrichmentId: string }): Promise<LearnerExpedition | undefined>;
  setActive(input: { learnerStateRef: string; learnerExpeditionId: string }): Promise<void>;
  claimNextGenerating(input: { staleBefore: Date; maxAttempts: number }): Promise<ClaimedLearnerExpedition | undefined>;
  failExhaustedGenerating(input: { staleBefore: Date; maxAttempts: number; failureMessage: string }): Promise<number>;
  resetGeneration(input: { learnerStateRef: string; learnerExpeditionId: string }): Promise<void>;
  // Fenced worker write (lease + fencing token): the claim atomically installs a fresh
  // enrichment operation id, and every generation write must state that id as the
  // operation it EXPECTS to own. A write whose
  // expectation no longer holds affects 0 rows — the returned count tells a stale
  // worker it lost the claim and must stop spending.
  updateProgress(input: {
    learnerExpeditionId: string;
    expectedOperationId: string | null;
    status?: LearnerExpeditionStatus;
    currentOperationId?: string | null;
    currentOperationType?: OperationType | null;
    enrichmentId?: string | null;
    declaredDomain?: string | null;
    failureMessage?: string | null;
  }): Promise<number>;
}

// ---------------------------------------------------------------------------
// Learner Registry + Awards ports (plan 2026-07-07-005, R1/R8). The registry is the
// identity table every learner-state FK keys against; awards are durable flair. Real
// humans only — simulated rivals (KTD1) never touch either store.
// ---------------------------------------------------------------------------

export interface Learner {
  learnerRef: string;
  displayName: string;
  pinHash: string;
  createdAt: string;
}

// The registry store (R1, R2). `create` enforces ref uniqueness at insert (the
// name-taken path is a conflict, surfaced as `created: false`); `get` and `list`
// feed the picker; `exists` is a cheap presence check. PIN verification lives in the
// `enterLearnerSession` use-case, which reads `pinHash` off `get` — the store never
// hashes or compares (KTD8).
export interface LearnerStorePort {
  create(input: { learnerRef: string; displayName: string; pinHash: string }): Promise<{ created: boolean }>;
  get(learnerRef: string): Promise<Learner | undefined>;
  list(): Promise<Learner[]>;
  // Refs of learners with ANY study evidence — at least one response, lesson read, or
  // calibration verdict (plan 2026-07-07-007, R4/KTD2). A cheap existence read over the
  // projection's own inputs: a learner with none cannot score or hold a lifetime crystal,
  // so the weekly-board pass skips the expensive per-enrichment projection for them. This is
  // NOT a mastery predicate — it prefilters inputs the projection would otherwise read.
  listRefsWithStudyEvidence(): Promise<string[]>;
}

export interface LearnerAward {
  awardId: string;
  learnerRef: string;
  awardType: "weekly_podium";
  dedupeKey: string;
  context: Record<string, unknown>;
  createdAt: string;
}

// Durable award store (R8). `record` is idempotent on (learner, type, dedupe_key):
// a repeat write is a no-op (`recorded: false`), so a re-entered week never
// duplicates a podium. `listForLearner` and `listForLearners` feed board flair.
export interface LearnerAwardsStorePort {
  record(input: {
    awardId: string;
    learnerRef: string;
    awardType: LearnerAward["awardType"];
    dedupeKey: string;
    context: Record<string, unknown>;
  }): Promise<{ recorded: boolean }>;
  listForLearner(learnerRef: string): Promise<LearnerAward[]>;
  listForLearners(learnerRefs: string[]): Promise<LearnerAward[]>;
}

// Opaque bearer sessions for the learner API (plan 2026-07-08-003, KTD3). The store
// only ever sees the SHA-256 of the token — the raw token exists client-side only.
// Revocation is deletion; `resolve` also bumps `last_seen_at`.
export interface LearnerSessionStorePort {
  create(input: { tokenHash: string; learnerRef: string }): Promise<void>;
  resolve(tokenHash: string): Promise<{ learnerRef: string } | undefined>;
  revoke(tokenHash: string): Promise<void>;
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
// extraction stores). Regeneration supersedes an enrichment's prior items rather than
// deleting them (the append-only Response Log may already reference one), and replaces
// its rejections (delete-then-insert — nothing else references those). All three read
// methods here return only the current, non-superseded generation. `supportedItemTypes`
// is a `SELECT DISTINCT item_type` query over that current scope — the supported set is
// the literal byproduct of which typed items grounded, never a stored map (KTD2, rule
// 18). Rejected nodes are persisted so the no-item frontier fallback reads the real
// rejection reason instead of guessing from grounding origin.
export interface StudyItemBankStorePort {
  persist(input: { graphVersionId: string | null; enrichmentId: string; configHash: string; studyItems: StudyItem[]; rejected: RejectedStudyItem[] }): Promise<void>;
  getStudyItem(derivedNodeId: string, itemType: StudyItemType): Promise<StudyItem | undefined>;
  // Current-generation lookup by primary key (`superseded_at IS NULL`), feeding the same
  // `hydrate` as the other reads. The server-side grading use-case resolves answer keys off
  // the returned domain item (option `isCorrect`, impostor `isImpostor`, matching pairs), so
  // one method serves all three item types and no per-type answer-key SQL survives (KTD2).
  getStudyItemById(studyItemId: string): Promise<StudyItem | undefined>;
  listStudyItemsForEnrichment(enrichmentId: string): Promise<StudyItem[]>;
  supportedItemTypes(derivedNodeId: string): Promise<StudyItemType[]>;
}

// Concept Lesson persistence (ADR-0031, R1/R3/R9). `persist` writes a whole enrichment's
// lessons, their ordered sections + per-section grounded citations, AND its lesson-absent
// nodes atomically, plus the immutable `concept_lesson_bank` artifact, in one transaction
// (no authoritative relational state without its artifact, matching the Study Item Bank
// store). Regeneration supersedes current lessons and replaces absences.
// `getLesson` returns a node's lesson (absences are NOT returned); `listLessonsForEnrichment`
// powers the Study Session ride-down and the operator visibility surface. A learner-NEUTRAL
// derived asset: this port imports no graph/enrichment write port (R9).
export interface ConceptLessonStorePort {
  persist(input: { graphVersionId: string | null; enrichmentId: string; configHash: string; lessons: ConceptLesson[]; absent: LessonAbsentNode[] }): Promise<void>;
  getLesson(derivedNodeId: string): Promise<ConceptLesson | undefined>;
  listLessonsForEnrichment(enrichmentId: string): Promise<ConceptLesson[]>;
  listAbsentForEnrichment(enrichmentId: string): Promise<LessonAbsentNode[]>;
}

export type ScaffoldReferenceActivity = {
  scaffoldStepId: string;
  detourId: string;
  referencedDerivedNodeId: string;
  lesson: ConceptLesson;
  item: Extract<StudyItem, { itemType: "option_select" }>;
};

// The only read seam for pinned neutral Support Path activities. It is learner-owned and
// detour-scoped, so callers cannot browse arbitrary superseded neutral assets.
export interface ScaffoldReferenceActivityReadPort {
  listForLearnerEnrichment(input: { learnerStateRef: string; enrichmentId: string }): Promise<ScaffoldReferenceActivity[]>;
  getForLearnerStep(input: { learnerStateRef: string; scaffoldStepId: string }): Promise<ScaffoldReferenceActivity | undefined>;
}

// Layer-purpose persistence (plan 2026-07-10-001 U1). One plain-register capability
// statement per enrichment; `persist` upserts (regeneration replaces), `get` returns
// undefined for an enrichment without a row (fail-open — surfaces render a template).
export interface EnrichmentLayerPurposeStorePort {
  persist(input: { enrichmentId: string; purpose: string }): Promise<void>;
  get(enrichmentId: string): Promise<string | undefined>;
}

// Layer-purpose generation (ADR-0034 Neural Stage Descriptor). One forced-tool call per
// enrichment producing a learner-neutral 1–2 sentence capability statement connecting the
// topic to its concepts. Keys only to the enrichment and concepts — never to Expedition
// Sections, which are read-time derivations. Domain-neutral prompt (AGENTS rule 17).
export interface LayerPurposeGenerationPort {
  readonly model: string;
  generate(input: {
    declaredDomain: string;
    conceptLabels: string[];
  }): Promise<string>;
}

export type LessonRead = {
  learnerStateRef: string;
  derivedNodeId: string;
  firstReadAt: string;
};

export interface LessonReadStorePort {
  markRead(input: { learnerStateRef: string; derivedNodeId: string }): Promise<void>;
  listForLearner(learnerStateRef: string): Promise<LessonRead[]>;
}

// Study Item generation (R9, R10). Forced named tool schemas routed through LiteLLM; the
// generator stays DeepSeek-family (AGENTS rule 5). `generateOptionSelect` returns a
// pre-verification OptionSelectItemDraft (a grounded correct answer + three
// sibling-conditioned distractors). The deterministic guard accepts or rejects —
// semantic acceptance is NOT done here.
export interface StudyItemGenerationPort {
  readonly model: string;
  generateOptionSelect(input: {
    declaredDomain: string;
    node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
    groundingProvenance: StudyItemGroundingProvenance;
    groundingPassages: StudyItemGroundingPassage[];
    // Same-domain neighbor descriptors that flavor the distractors (prompt-context only;
    // a sibling-poor node still generates, just with thinner flavor — KTD3).
    siblings: { label: string; snippet: string }[];
    facet?: string;
    retryFeedback?: string;
  }): Promise<OptionSelectItemDraft>;
  generateMatching(input: {
    declaredDomain: string;
    node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
    groundingProvenance: StudyItemGroundingProvenance;
    groundingPassages: StudyItemGroundingPassage[];
    siblings: { label: string; snippet: string }[];
    facet?: string;
    retryFeedback?: string;
  }): Promise<MatchingItemDraft>;
  // Impostor generation (R3/R5/R6/R7). Takes the same grounding + siblings as option-select
  // and returns a pre-verification ImpostorItemDraft: three grounded truths each citing a
  // passage and exactly one planted lie — preferentially a true fact about one provided
  // neighbor mis-attributed to this node, else a freshly minted misconception, labeled
  // generated with no citation — plus a reveal and the model's `lieSource` choice. The
  // deterministic guard (U4) re-derives provenance; this port never decides it.
  generateImpostor(input: {
    declaredDomain: string;
    node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
    groundingProvenance: StudyItemGroundingProvenance;
    groundingPassages: StudyItemGroundingPassage[];
    siblings: { label: string; snippet: string }[];
    facet?: string;
    retryFeedback?: string;
  }): Promise<ImpostorItemDraft>;
}

// Learner-Scoped Scaffold generation neural seams (plan 2026-07-12-002 U3). Two small forced
// named tools routed through the existing kg-claim-extraction alias (no config.yaml change).
// The outline proposes strictly-simpler prerequisite sub-concepts; the content generator
// produces a compact micro-lesson + one recall item for ONE approved sub-concept from provided
// grounding. Domain-neutral prompts; content is always labeled generated and citation-free.
export type ScaffoldOutlineStep = { label: string; rationale: string };
export type ScaffoldOutline = { steps: ScaffoldOutlineStep[] };
export type ScaffoldContentDraft = {
  microLesson: string;
  question: string;
  explanation: string;
  correctAnswer: string;
  distractors: string[];
};

export interface ScaffoldOutlinePort {
  readonly model: string;
  propose(input: {
    declaredDomain: string;
    parentLabel: string;
    term: string;
    // Existing usable node labels in the parent's own layer, so the outline can avoid
    // re-proposing a concept that already has a reusable node.
    existingLabels: string[];
    retryFeedback?: string;
  }): Promise<ScaffoldOutline>;
}

export interface ScaffoldContentPort {
  readonly model: string;
  generate(input: {
    declaredDomain: string;
    label: string;
    // Approved grounding text (verified parent/layer grounding or generated grounding that
    // cleared the Knowledge-Boundary Probe). The generator writes only from this.
    groundingText: string;
  }): Promise<ScaffoldContentDraft>;
}

export interface StudyItemBlueprintPort {
  readonly model: string;
  plan(input: {
    declaredDomain: string;
    node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
    lesson: ConceptLesson;
    siblings: { label: string; snippet: string }[];
    supportedItemTypes: StudyItemType[];
  }): Promise<StudyItemBlueprint>;
}

// Concept Lesson generation (ADR-0031, R2/R4/R6/R7/R11/R14). Forced named tool schema
// routed through LiteLLM; the generator stays DeepSeek-family (AGENTS rule 5). `generate`
// returns a pre-verification ConceptLessonDraft — an ordered set of sections each citing a
// grounding passage by id when source-supported. Provenance honesty is re-derived
// authoritatively by the pure assembler (U6); this port never decides what is source-cited.
// Synthesized sections are generated only when the current lesson grounding supports
// them; source-less concept synthesis gating is owned by ADR-0030.
export interface ConceptLessonGenerationPort {
  readonly model: string;
  generate(input: {
    declaredDomain: string;
    node: { derivedNodeId: string; canonicalLabel: string; aliases: string[] };
    groundingProvenance: StudyItemGroundingProvenance;
    groundingPassages: StudyItemGroundingPassage[];
    // Directional graph neighbors for the graph-aware applications section (R5). Each is a
    // label + grounding snippet; a neighbor-poor node still produces a lesson (prompt-context
    // only). Structurally compatible with the application's LessonNeighborhood.
    neighbors: {
      parents: { label: string; snippet: string }[];
      children: { label: string; snippet: string }[];
      siblings: { label: string; snippet: string }[];
    };
    retryFeedback?: string;
  }): Promise<ConceptLessonDraft>;
}

// Response Log persistence (R4–R6). The port surface is deliberately APPEND + READ
// only — there is no update or delete — so the append-only guarantee (R5) is
// structural, not a convention. A per-learner reset (R16) bypasses this port with a
// direct operator delete, so the structural guarantee is never weakened here.
// `append` OWNS monotonic per-learner `attempt_seq` assignment: it allocates each
// appended row's sequence atomically inside the persistence boundary, so concurrent
// same-learner submissions can never collide on the `(learner_state_ref, attempt_seq)`
// uniqueness. Callers therefore pass `NewResponseLogRow` without a sequence.
export interface ResponseLogStorePort {
  append(rows: NewResponseLogRow[]): Promise<void>;
  listForLearner(learnerStateRef: string): Promise<ResponseLogRow[]>;
  listForLearnerNode(learnerStateRef: string, derivedNodeId: string): Promise<ResponseLogRow[]>;
}

// Learner-Scoped Scaffold Detour persistence (plan 2026-07-12-002 U2, KTD2, ADR-0037). The
// aggregate store owns request identity, lifecycle, claim/fence data, and the ordered steps.
// Content lives ON the step (payload-on-step); a reference step points at a neutral node. All
// writes are scoped to the owning learner. The generation module (U3) drives claim/publish/
// fail; the API (U5) drives create/hide/restore/lesson-read; the projection (U4) reads the
// active detours.
export interface ScaffoldDetourStorePort {
  // Idempotent create-or-restore for (learner, enrichment, parent, normalizedTerm) (R5/R13).
  // Creates a fresh `generating` aggregate when none exists; restores a hidden detour to
  // `ready` when it has published content or `generating` otherwise; returns the existing
  // detour unchanged when one is already active. Always returns the durable aggregate.
  upsertPending(input: {
    learnerStateRef: string;
    enrichmentId: string;
    parentDerivedNodeId: string;
    term: string;
    normalizedTerm: string;
  }): Promise<ScaffoldDetour>;
  getById(detourId: string): Promise<ScaffoldDetour | undefined>;
  // Active (non-hidden) detours for one learner's expedition — the U4 projection input.
  listActiveForLearnerEnrichment(learnerStateRef: string, enrichmentId: string): Promise<ScaffoldDetour[]>;
  // Process-level supervisor claim (KTD7): atomically select ONE stale-or-unclaimed `generating`
  // detour under the attempt budget and claim it, minting a fresh operation id that also acts as
  // the fencing token (KTD7). Returns the claimed aggregate (its `latestOperationId` ==
  // `claimToken`) or undefined when the queue is empty. `SKIP LOCKED` keeps competing processes
  // single-winner per row.
  claimNextGenerating(input: { staleBefore: Date; maxAttempts: number }): Promise<ScaffoldDetour | undefined>;
  // Fail a stale `generating` detour whose attempts are exhausted (R16/AE5). Returns the count
  // failed. Shares the staleness predicate with `claimNextGenerating`.
  failExhaustedGenerating(input: { staleBefore: Date; maxAttempts: number }): Promise<number>;
  // Atomic publish (R16, KTD9): write the ordered steps + generated payloads and transition to
  // `ready`, guarded by the claim token. A stale token is rejected and nothing is written.
  publishReady(input: { detourId: string; claimToken: string; steps: ScaffoldStep[] }): Promise<boolean>;
  // Release an infrastructure-transient attempt under the same fence. The aggregate remains
  // generating and becomes eligible for the supervisor's bounded retry budget.
  releaseClaim(input: { detourId: string; claimToken: string }): Promise<boolean>;
  markFailed(input: { detourId: string; claimToken: string }): Promise<boolean>;
  // Retry: clear the failed pointer and return the detour to `generating` for a fresh claim.
  restartGenerating(input: { detourId: string; learnerStateRef: string }): Promise<ScaffoldDetour | undefined>;
  // Hide a ready detour or dismiss a failed one; preserves content + evidence (R18).
  hide(input: { detourId: string; learnerStateRef: string }): Promise<boolean>;
  // Fetch one step for grading / lesson-read resolution (U5). Scoped to the owning learner.
  getStep(input: { scaffoldStepId: string; learnerStateRef: string }): Promise<{ step: ScaffoldStep; detourId: string } | undefined>;
  // Mark a generated step's micro-lesson read (R12). No-op for a reference step.
  markLessonRead(input: { scaffoldStepId: string; learnerStateRef: string; readAt: string }): Promise<void>;
  // Scaffold-content audit read seam (plan 2026-07-16-001 U1, KTD1). Every GENERATED step with
  // the context the audit judges it against: the detour's advertised term, the parent derived
  // node's canonical label, and the Declared Domain. Read-only and measurement-only — the
  // command reads persisted learner output exactly as it shipped, never regenerating (rule 18).
  // Scoped to one enrichment when given, else every generated step. Reference steps are excluded
  // (they carry no generated content — their neutral node was already quality-gated).
  listGeneratedStepsForAudit(enrichmentId?: string): Promise<GeneratedScaffoldStepForAudit[]>;
}

// One persisted generated Support Step presented for content audit (plan 2026-07-16-001 U1). The
// whole `payload` (micro-lesson + item) travels so both classifiers see exactly what the learner
// saw; `term`/`parentLabel`/`declaredDomain` are the contract the content is judged against.
export interface GeneratedScaffoldStepForAudit {
  detourId: string;
  scaffoldStepId: string;
  enrichmentId: string;
  declaredDomain: string;
  term: string;
  parentLabel: string;
  payload: ScaffoldNodePayload;
}

// The generated payloads a publish attempt commits, alongside their step ordering. Reference
// steps carry only the referenced neutral node id (no payload).
export type ScaffoldGeneratedPayload = ScaffoldNodePayload;

// ---------------------------------------------------------------------------
// Recall Challenge persistence (plan 2026-07-13-003, KTD2). One challenge row per attempt,
// an IMMUTABLE ordered lineup of neutral Study Item references, and append-only idempotent
// events. Status is materialized on the challenge row for indexed queries, but the lineup +
// ordered events are the replayable authority for the miss buffer, unresolved queue, recovery
// mode, and resume state — the application fold re-derives combat state on every read.
// Challenge answers NEVER touch `response_log` (KTD4): this store is the only write surface.
// ---------------------------------------------------------------------------

export type RecallChallengeScopeKind = "section" | "enrichment";
export type RecallChallengeStatus = "active" | "won" | "abandoned";

export type RecallChallenge = {
  challengeId: string;
  learnerStateRef: string;
  enrichmentId: string;
  scopeKind: RecallChallengeScopeKind;
  // Stable scope identity: the section milestone node or the enrichment summit node — never a
  // mutable section ordinal (KTD2).
  scopeAnchorDerivedNodeId: string;
  status: RecallChallengeStatus;
  createdAt: string;
  updatedAt: string;
};

export type RecallChallengeLineupEntry = {
  lineupIndex: number;
  studyItemId: string;
  derivedNodeId: string;
};

// One graded answer event: a selection answer (option-select / impostor) or a single Matching
// pair attempt. `correct` is resolved server-side at append time; `recoveryPhase` records the
// phase the challenge was in when answered (observability — the fold re-derives it).
// `responseDurationMs` is bounded, client-observed, untrusted evidence (KTD8).
export type RecallChallengeAnswerEvent = {
  seq: number;
  kind: "selection_answer" | "matching_pair";
  attemptRef: string;
  studyItemId: string;
  // Matching pair attempts key promptId → chosenId (the chosen matchId); selection answers
  // carry the chosen option/statement id with `promptId` null.
  promptId: string | null;
  chosenId: string;
  correct: boolean;
  recoveryPhase: boolean;
  responseDurationMs: number | null;
};

export type RecallChallengeLifecycleEvent = {
  seq: number;
  kind: "retreat" | "resume" | "abandon";
  operationRef: string;
};

export type RecallChallengeEvent = RecallChallengeAnswerEvent | RecallChallengeLifecycleEvent;

export type NewRecallChallengeEvent =
  | Omit<RecallChallengeAnswerEvent, "seq">
  | Omit<RecallChallengeLifecycleEvent, "seq">;

export type RecallChallengeRecord = {
  challenge: RecallChallenge;
  lineup: RecallChallengeLineupEntry[];
  events: RecallChallengeEvent[];
};

export type AppendRecallEventResult = "appended" | "duplicate" | "stale" | "conflict";

export interface RecallChallengeStorePort {
  // Create the challenge row + immutable lineup atomically. `created: false` means an active
  // challenge already exists for this learner/scope (the partial-unique conflict) — the caller
  // resumes that one instead.
  create(input: {
    challengeId: string;
    learnerStateRef: string;
    enrichmentId: string;
    scopeKind: RecallChallengeScopeKind;
    scopeAnchorDerivedNodeId: string;
    lineup: { studyItemId: string; derivedNodeId: string }[];
  }): Promise<{ created: boolean }>;
  // Owner-scoped full record load (challenge + ordered lineup + seq-ordered events).
  getForLearner(input: { challengeId: string; learnerStateRef: string }): Promise<RecallChallengeRecord | undefined>;
  getActiveForScope(input: {
    learnerStateRef: string;
    enrichmentId: string;
    scopeKind: RecallChallengeScopeKind;
    scopeAnchorDerivedNodeId: string;
  }): Promise<RecallChallengeRecord | undefined>;
  // Thin challenge rows for scope-status projection (active + won per enrichment).
  listForLearnerEnrichment(input: { learnerStateRef: string; enrichmentId: string }): Promise<RecallChallenge[]>;
  // Serialized event append (KTD2): lock the challenge row, verify ownership + `active` status
  // and that `expectedSeq` is exactly the next sequence, insert the event, and materialize an
  // optional terminal status in the SAME transaction. `duplicate` = this attemptRef/operationRef
  // already committed (the caller replays the committed view); `stale` = the sequence moved on
  // (caller reloads and re-validates the turn); `conflict` = not owned or not active.
  appendEvent(input: {
    challengeId: string;
    learnerStateRef: string;
    expectedSeq: number;
    event: NewRecallChallengeEvent;
    materializeStatus?: "won" | "abandoned";
  }): Promise<AppendRecallEventResult>;
  // Prior lineup-membership count per study item across ALL of this learner's challenges for
  // the enrichment — the KTD5 least-exposure selection rank input.
  priorExposure(input: { learnerStateRef: string; enrichmentId: string }): Promise<Record<string, number>>;
  // First-victory scope facts for reward projection (KTD3): the won challenge IS the formation
  // record; projection collapses any repeat win to the one permanent formation.
  listWonScopes(input: { learnerStateRef: string; enrichmentId: string }): Promise<{
    scopeKind: RecallChallengeScopeKind;
    scopeAnchorDerivedNodeId: string;
    challengeId: string;
  }[]>;
  // Hydrate the lineup's referenced Study Items INCLUDING superseded generations (KTD4): a
  // durable lineup stays resumable across bank regeneration because the FK identity survives.
  // Restricted to items this challenge's lineup references — normal session projections still
  // select only current bank items.
  hydrateLineupItems(input: { challengeId: string }): Promise<StudyItem[]>;
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
  sourceResourceId: string;
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
  // This source's extraction runs, newest first — the door to the run detail view.
  runs: { runId: string; status: string; degraded: boolean; latencyMs: number | null; startedAt: string }[];
}

// Run inspection read surface: one run's full inspection (the run list lives on its
// source's SourceInspection). Returns `undefined` only for not-found; real DB errors
// propagate (ADR-0027 decision 5).
export interface RunInspectionReadPort {
  getRunInspection(runId: string): Promise<RunInspection | undefined>;
}

// Source Explorer read surface: list source summaries + one source's blocks.
export interface SourceInspectionReadPort {
  listSourceSummaries(): Promise<SourceSummary[]>;
  getSourceInspection(sourceResourceId: string): Promise<SourceInspection | undefined>;
}

// One recorded published-Concept identity decision, flattened for the Admin Lab (plan
// 2026-06-26-002 U4, R10). Mirrors the derived-layer NodeMergeView shape. `survivorLabel`
// is the surviving Concept's canonical label for a `merge` (null for `distinct` /
// `quarantine`, which change no identity); `absorbedLabels` are the other members'
// labels — the folded-in surface forms for a `merge`, both sides for a `distinct`, the
// colliding published Concepts for a `quarantine`.
export interface ConceptIdentityDecisionView {
  outcome: ConceptIdentityResolutionOutcome;
  declaredDomain: string;
  survivorLabel: string | null;
  absorbedLabels: string[];
  proposingScore: number;
  rationale: string;
  decidingModel: string;
}

// Graph-version inspection read surface (ADR-0027): the identity decisions persisted with
// a published version. Pure read over refinement_decisions filtered to the identity
// decision type; the storage adapter owns the query and row-stitch, no SQL in the UI.
export interface GraphVersionInspectionReadPort {
  getConceptIdentityDecisions(graphVersionId: string): Promise<ConceptIdentityDecisionView[]>;
}

export type DerivedNodeKind = "anchor" | "enrichment";
export type DerivedGroundingOrigin = "document_anchored" | "source_mentioned" | "llm_grounded";

export interface GroundingPassageView {
  passageType: "definition" | "mention";
  text: string;
  groundingOrigin: DerivedGroundingOrigin;
}

export interface NodeGroundingView {
  generatingModel: string | null;
  rationale: string | null;
  passages: GroundingPassageView[];
  verbatimDisposition: string;
}

export interface DerivedGraphNode {
  derivedNodeId: string;
  label: string;
  aliases: string[];
  declaredDomain: string;
  difficulty: number | null;
  difficultyRationale: string | null;
  // The comparative banded prior's confidence interface (ADR-0024), read off the same
  // concept_difficulties row as `difficulty`: the consensus band (1-5) and whether it
  // was contested across the K draws. Optional-nullable: absent/null for a node without
  // a difficulty row or a pre-banding layer. The trail-inclusion floor gates only on a
  // CONFIDENT signal (band present AND uncontested), so nulls fail open.
  difficultyBand?: number | null;
  difficultyContested?: boolean | null;
  nodeKind: DerivedNodeKind;
  groundingOrigin: DerivedGroundingOrigin;
  // `synthetic_primary` is a first-class topic concept from the synthetic arm (ADR-0019
  // amended); it renders like any other derived node in the inspection surface.
  role: "anchor" | "prerequisite" | "synthetic_primary";
  hasStudyItem: boolean;
  grounding: NodeGroundingView | null;
}

export interface DerivedGraphEdge {
  prerequisiteDerivedNodeId: string;
  dependentDerivedNodeId: string;
  confidence: number;
  uncertain: boolean;
  judgeModel: string;
}

export interface DomainOriginCounts {
  domain: string;
  anchor: number;
  sourceMentioned: number;
  llmGrounded: number;
}

export interface RescueDispositionView {
  derivedNodeId: string;
  canonicalLabel: string;
  declaredDomain: string;
  disposition: "accepted" | "dropped" | "kept_judge_unavailable";
  rationale: string;
  groundingSpan: string;
}

export interface MintingDispositionView {
  derivedNodeId: string;
  proposedLabel: string;
  declaredDomain: string;
  anchorConceptId: string;
  disposition: "accepted" | "dropped" | "kept_judge_unavailable";
  rationale: string;
}

export interface NodeMergeView {
  declaredDomain: string;
  canonicalDerivedNodeId: string;
  canonicalLabel: string;
  absorbedLabel: string;
  absorbedAliases: string[];
  proposingSignal: string;
  proposingScore: number;
  rationale: string;
  canonicalSelectionReason: string;
}

export interface EnrichmentSummary {
  enrichmentId: string;
  // NULL for a synthetic (source-less) layer; non-null for source-derived enrichment.
  graphVersionId: string | null;
  enrichmentConfigHash: string;
  judgeModel: string;
  difficultyMethod: string;
  status: string;
  edgeCount: number;
  certainEdgeCount: number;
  uncertainEdgeCount: number;
  conceptCount: number;
  // Study items generated for this enrichment's derived nodes. 0 means the study
  // surfaces have nothing to offer yet (generate-study-items has not run), so the UI
  // can flag a dead-end before a learner reaches an empty session (R6, U5).
  studyItemCount: number;
  startedAt: string;
  completedAt: string | null;
}

export interface DerivedGraphDetail {
  summary: EnrichmentSummary;
  nodes: DerivedGraphNode[];
  edges: DerivedGraphEdge[];
  originCounts: DomainOriginCounts[];
  rescueDispositions: RescueDispositionView[];
  mintingDispositions: MintingDispositionView[];
  merges: NodeMergeView[];
}

// Enrichment Run inspection read surface: list summaries + one finished Derived
// Graph Layer inspection model. This is pure inspection under ADR-0027: the
// storage adapter owns SQL, artifact row stitching, grounding dispositions, and
// per-domain origin counts. Admin Lab renders the finished read model and does
// not query persistence directly.
export interface EnrichmentInspectionReadPort {
  listEnrichmentSummaries(): Promise<EnrichmentSummary[]>;
  getDerivedGraphDetail(enrichmentId: string): Promise<DerivedGraphDetail | undefined>;
  // Finished boolean membership read over the Derived Graph Layer: does this node belong to
  // this enrichment? The learner-grading use-case runs it alongside the active-expedition
  // guard for verdict and lesson-read writes, which key on (learner, node) globally — the
  // check keeps a client from marking a node in a non-active expedition (R4). A yes/no answer
  // is a finished read (ADR-0027); loading the whole Derived Graph Detail for it would be waste.
  derivedNodeBelongsToEnrichment(enrichmentId: string, derivedNodeId: string): Promise<boolean>;
}

// Learner Loop inspection read surface (ADR-0027, KTD7). The learner-loop history reads are
// pure inspection: the storage adapter owns the all-learner response/verdict reads and the
// per-learner joined history. The application's learner-loop projection use-cases add the
// conflict/mastery/summary folds over these rows. Row shapes are read-model types: the
// response rows carry the joined node label + question alongside the full append-only
// Response Log row so a use-case can both render and re-fold from one read.
export type LearnerLoopResponseRow = ResponseLogRow & { createdAt: string };
export type LearnerLoopResponseDetailRow = LearnerLoopResponseRow & { nodeLabel: string; question: string; enrichmentId: string };

export interface LearnerLoopReadPort {
  listAllResponses(): Promise<LearnerLoopResponseRow[]>;
  listAllVerdicts(): Promise<CalibrationVerdict[]>;
  listResponsesForLearner(learnerStateRef: string): Promise<LearnerLoopResponseDetailRow[]>;
  listVerdictsForLearner(learnerStateRef: string): Promise<CalibrationVerdict[]>;
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
export type OperationType = "extraction" | "minting" | "enrichment" | "study_items" | "scaffold";

// ---------------------------------------------------------------------------
// Forced-tool failure detail (ADR-0006 fail-closed, made INSPECTABLE). When a
// forced-tool call exhausts its retries and fails its stage, the litellm transport
// captures WHY — already safely redacted at the model-output boundary — so the
// operator timeline can render the reason instead of a bare "failed". This NEVER
// changes the fail-closed decision; it only describes a failure that already happened.
// The shapes live in `ports` (shared contract) so the application persists them
// without importing infrastructure: the litellm error carries `stageErrorDetail`
// and `bracketStage` duck-types it (mirroring the structural `LiteLlmHttpError` check).
// ---------------------------------------------------------------------------

// One forced-tool attempt's redacted failure. `kind` classifies the deviation; the
// optional fields are populated only when meaningful (`status` for HTTP failures,
// `schemaIssuePaths` for schema-invalid arguments — PATHS only, never the offending
// values, which can be large or source-derived). `redactedSnippet` is the offending
// arguments text bounded, control-char-stripped, and truncated.
export type ForcedToolFailureKind =
  | "http"
  | "network"
  | "timeout"
  | "no_tool_call"
  | "no_arguments"
  | "invalid_json"
  | "schema_invalid"
  | "other";

export interface ForcedToolFailureAttempt {
  attempt: number;
  kind: ForcedToolFailureKind;
  status?: number;
  code?: string;
  schemaIssuePaths?: string[];
  redactedSnippet?: string;
}

// The serializable, persisted failure detail for a failed stage. `forced_tool_exhaustion`
// carries the per-attempt trail (which deviations, how many retries); `other` is any
// non-forced-tool throw reduced to a redacted message.
export interface StageErrorDetail {
  kind: "forced_tool_exhaustion" | "other";
  message: string;
  toolName?: string;
  model?: string;
  attempts?: ForcedToolFailureAttempt[];
}

// Marker an error implements so the application can persist its detail without a typed
// import of the infrastructure error class. Duck-typed by `bracketStage`.
export interface StageErrorReporting {
  readonly stageErrorDetail: StageErrorDetail;
}

export interface RunProgressReporterPort {
  // Insert the parent `running` row at operation entry — the fix for "no row
  // until done": a polling client sees `running` immediately, not no row.
  // `configHash` is the operation-level neural/config identity written at start
  // (KTD7); REQUIRED for `scaffold` (DB CHECK) whose attempts have no other
  // artifact row to carry provenance, optional elsewhere.
  beginOperation(input: { operationType: OperationType; operationId: string; configHash?: string }): Promise<void>;
  // Open a stage: insert a child row, set the parent's current_stage. `total` is
  // the item count for a stage that iterates, enabling an N-of-M heartbeat.
  // `operationType` is REQUIRED to scope the parent: `operation_id` is not unique
  // on its own — `study_items` reuses the enrichmentId — so the parent must be
  // found by the full `(operation_type, operation_id)` natural key.
  enterStage(input: { operationType: OperationType; operationId: string; stage: string; total?: number }): Promise<void>;
  // Bump the heartbeat as items complete inside a long stage, so liveness is
  // visible without waiting for a stage boundary. `done` is the cumulative count.
  recordProgress(input: { operationType: OperationType; operationId: string; stage: string; done: number }): Promise<void>;
  // Close a stage: set its ended_at + ok. A thrown stage reports ok:false first.
  // `errorDetail` is the optional redacted reason a failed stage carries (ADR-0006
  // fail-closed, made inspectable); it is persisted only on the failing close.
  completeStage(input: { operationType: OperationType; operationId: string; stage: string; ok: boolean; errorDetail?: StageErrorDetail }): Promise<void>;
  // Set the parent's terminal status + completed_at.
  completeOperation(input: { operationType: OperationType; operationId: string; status: "succeeded" | "failed" }): Promise<void>;
  // Liveness heartbeat: bump only last_progress_at on the open parent row. Driven on
  // an interval by the operation lifecycle wrapper so a healthy run inside one long
  // LLM call is never mistaken for a dead one by the stale-claim predicate.
  touch(input: { operationType: OperationType; operationId: string }): Promise<void>;
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
  // The redacted failure reason for a failed stage (ADR-0006 fail-closed, inspectable);
  // null for ok or still-open stages, and for failed stages predating this detail.
  errorDetail: StageErrorDetail | null;
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
  // The operation config identity persisted at start (KTD7); non-null for every scaffold
  // attempt, null for operation types whose identity lives on their artifact rows.
  configHash: string | null;
}

export interface OperationTimelineDetail {
  summary: OperationTimelineSummary;
  stages: OperationTimelineStage[];
}

export interface OperationTimelineReadPort {
  listOperationTimelines(): Promise<OperationTimelineSummary[]>;
  getOperationTimeline(operationId: string, operationType?: OperationType): Promise<OperationTimelineDetail | undefined>;
}

// Per-(operation, stage) spend read live from LiteLLM's request log. The application
// never computes or stores cost; it surfaces LiteLLM's persisted spend and token totals.
export interface OperationStageSpend {
  operationId: string;
  stage: string;
  logCount: number;
  // Raw provider-billed spend as LiteLLM recorded it. OpenRouter BYOK rows report
  // response cost 0.0 (provider-account billing), so this alone under-attributes
  // BYOK stages (plan 2026-07-10-004 U4/KTD6).
  totalSpend: number;
  // Usage-derived estimate for the zero-spend BYOK rows only: retained token/cache
  // usage priced by the versioned deployment prices in `litellm/config.yaml`. Kept
  // DISTINGUISHABLE from `totalSpend` so an estimated figure is never misrepresented
  // as provider-billed spend; a stage's display cost is the sum of both.
  estimatedSpend: number;
  totalTokens: number;
}

export interface OperationStageSpendReadPort {
  readOperationStageSpend(operationIds: string[]): Promise<OperationStageSpend[]>;
}

export interface JourneyLineage {
  enrichmentId: string;
  graphVersionId: string | null;
  extractionRunIds: string[];
}

export interface JourneyDisplay {
  enrichmentId: string;
  kind: "synthetic" | "document";
  title: string | null;
}

export interface JourneyLineageReadPort {
  resolveJourney(enrichmentId: string): Promise<JourneyLineage | undefined>;
  resolveJourneyDisplay(enrichmentIds: string[]): Promise<JourneyDisplay[]>;
}
