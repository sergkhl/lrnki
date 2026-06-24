// Stable per-stage spend tags (KTD4, R2, AE3). Each production LLM request carries
// exactly one of these so LiteLLM attributes token/cost to a pipeline stage through
// `/spend/tags` (querying `LiteLLM_SpendLogs`). The application only LABELS requests
// with these strings; it never computes or stores a cost figure itself.
//
// Tag-name STABILITY is a correctness property: a typo silently mis-buckets a stage's
// spend. Treat these as a closed, append-only vocabulary — add a new constant when a
// new stage appears; never rename an existing one without re-baselining attribution.
export const STAGE_TAGS = {
  // Extraction-over-sources (executeExtractionRun).
  conceptDiscovery: "concept-discovery",
  admission: "admission",
  admissionLabelJudge: "admission-label-judge",
  cepExtraction: "cep-extraction",
  definitionPassageQuality: "definition-passage-quality",
  assertionEntailment: "assertion-entailment",
  // Graph Enrichment (runGraphEnrichment). ONE whole-set ordering call per Declared
  // Domain (plan U2/U5): the prior per-pair `enrichment-judge` + cross-family
  // `generated-enrichment-judge` tags collapse into this single attribution bucket.
  prerequisiteOrdering: "prerequisite-ordering",
  rescueDurability: "rescue-durability",
  mintingDurability: "minting-durability",
  missingPrerequisiteProposal: "missing-prerequisite-proposal",
  groundingGeneration: "grounding-generation",
  intrinsicDifficulty: "intrinsic-difficulty",
  // Derived-node semantic deduplication (plan U1/U2). The embedding PROPOSE signal and
  // the cross-family merge-adjudication DECISION attribute separately so the recall vs
  // precision halves of the pass are individually visible in spend (AGENTS rule 20).
  nodeEmbedding: "node-embedding",
  nodeMergeAdjudication: "node-merge-adjudication",
  // Learner Study Loop.
  studyItemGeneration: "study-item-generation",
  answerGrading: "answer-grading",
  learnerSimulation: "learner-simulation"
} as const;

export type StageTag = (typeof STAGE_TAGS)[keyof typeof STAGE_TAGS];
