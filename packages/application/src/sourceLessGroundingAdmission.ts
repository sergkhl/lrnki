import { normalizeConceptLabel, type GeneratedGroundingBundle, type GroundingAdmissionContext } from "@lrnki/domain-core";
import type {
  ClaimFactualityJudgmentPort,
  ClaimVerificationAnsweringPort,
  ClaimVerificationQuestionPlanningPort,
  GroundingGenerationPort,
  GroundingIdentityContext,
  KnowledgeBoundaryProbePort,
  NodeEmbeddingPort
} from "@lrnki/ports";
import {
  createClaimAdmission,
  type ClaimJudgment,
  type PositiveClaimTarget
} from "./claimAdmission";
import {
  DEFAULT_KNOWLEDGE_BOUNDARY_PROBE_CONFIG,
  probeKnowledgeBoundary,
  validateKnowledgeBoundaryProbeConfig,
  type KnowledgeBoundaryProbeConfig,
  type KnowledgeBoundaryVerdict
} from "./knowledgeBoundaryProbe";
import { mapWithConcurrency } from "./mapWithConcurrency";
import type { StageBracket } from "./runProgressReporter";
import { SOURCE_LESS_GROUNDING_ADMISSION_STAGE_GROUP } from "./topicExpeditionStageProfile";

export type GroundingAdmissionCandidate = Readonly<{
  candidateKey: string;
  canonicalLabel: string;
  aliases: readonly string[];
  declaredDomain: string;
  context: GroundingAdmissionContext;
}>;

export type CoreProbeSummary = Readonly<{
  disposition: "core_knowledge";
  agreementScore: number;
  rationale: string;
}>;

export type BoundaryProbeSummary = Readonly<{
  disposition: "boundary";
  agreementScore: number;
  rationale: string;
}>;

export type GroundingAdmissionOutcome =
  | Readonly<{
      candidateKey: string;
      disposition: "admitted";
      probe: CoreProbeSummary;
      bundle: GeneratedGroundingBundle;
    }>
  | Readonly<{
      candidateKey: string;
      disposition: "held_out";
      reason: "knowledge_boundary";
      probe: BoundaryProbeSummary;
    }>
  | Readonly<{
      candidateKey: string;
      disposition: "rejected";
      reason: "grounding_verification_exhausted";
      probe: CoreProbeSummary;
      rationale: string;
    }>;

export interface SourceLessGroundingAdmission {
  forOperation(stage: StageBracket): {
    admitBatch(candidates: readonly GroundingAdmissionCandidate[]): Promise<readonly GroundingAdmissionOutcome[]>;
  };
}

export type SourceLessGroundingAdmissionPolicy = Readonly<{
  probe: KnowledgeBoundaryProbeConfig;
  verificationSampleCount: number;
  verificationDecision: "same_model_replicated_rejection";
  verificationRejectionSampleQuorum: number;
  groundingClaimProjection: "sentence_and_semicolon";
  judgmentTargetBatchSize: 1;
  candidateConcurrency: number;
  verificationExecution: Readonly<{
    questionPlanningConcurrency: number;
    answeringConcurrency: number;
    factualityJudgmentConcurrency: number;
  }>;
}>;

export const DEFAULT_SOURCE_LESS_GROUNDING_ADMISSION_POLICY: SourceLessGroundingAdmissionPolicy = {
  probe: DEFAULT_KNOWLEDGE_BOUNDARY_PROBE_CONFIG,
  verificationSampleCount: 3,
  verificationDecision: "same_model_replicated_rejection",
  verificationRejectionSampleQuorum: 2,
  groundingClaimProjection: "sentence_and_semicolon",
  judgmentTargetBatchSize: 1,
  candidateConcurrency: 8,
  verificationExecution: {
    questionPlanningConcurrency: 4,
    answeringConcurrency: 4,
    factualityJudgmentConcurrency: 4
  }
};

export function createSourceLessGroundingAdmission(construction: {
  knowledgeBoundaryProbe: KnowledgeBoundaryProbePort;
  embedding: NodeEmbeddingPort;
  groundingGeneration: GroundingGenerationPort;
  claimVerificationQuestionPlanning: ClaimVerificationQuestionPlanningPort;
  claimVerificationAnswering: ClaimVerificationAnsweringPort;
  claimFactualityJudgments: readonly [ClaimFactualityJudgmentPort, ClaimFactualityJudgmentPort];
  policy?: SourceLessGroundingAdmissionPolicy;
}): SourceLessGroundingAdmission {
  const policy = construction.policy ?? DEFAULT_SOURCE_LESS_GROUNDING_ADMISSION_POLICY;
  validatePolicy(policy);
  const claimAdmission = createClaimAdmission({
    questionPlanning: construction.claimVerificationQuestionPlanning,
    answering: construction.claimVerificationAnswering,
    factualityJudgments: construction.claimFactualityJudgments,
    verificationSampleCount: policy.verificationSampleCount,
    verificationDecision: policy.verificationDecision,
    verificationRejectionSampleQuorum: policy.verificationRejectionSampleQuorum,
    judgmentTargetBatchSize: policy.judgmentTargetBatchSize,
    verificationExecution: policy.verificationExecution
  });

  return {
    forOperation(stage) {
      const operationClaims = claimAdmission.forOperation(stage);
      return {
        async admitBatch(candidates) {
          if (candidates.length === 0) return [];
          validateCandidates(candidates);

          const probed = await stage(SOURCE_LESS_GROUNDING_ADMISSION_STAGE_GROUP.knowledgeBoundaryProbe.stage, () =>
            mapWithConcurrency(candidates, policy.candidateConcurrency, async (candidate) => ({
              candidate,
              verdict: await probeKnowledgeBoundary({
                conceptLabel: candidate.canonicalLabel,
                declaredDomain: candidate.declaredDomain,
                probe: construction.knowledgeBoundaryProbe,
                embedding: construction.embedding,
                config: policy.probe
              })
            })), candidates.length
          );

          const outcomeByKey = new Map<string, GroundingAdmissionOutcome>();
          const core = probed.filter(isCoreProbe);
          for (const { candidate, verdict } of probed) {
            if (verdict.disposition === "boundary") {
              outcomeByKey.set(candidate.candidateKey, {
                candidateKey: candidate.candidateKey,
                disposition: "held_out",
                reason: "knowledge_boundary",
                probe: probeSummary(verdict)
              });
            }
          }

          const drafts = core.length === 0
            ? []
            : await stage(SOURCE_LESS_GROUNDING_ADMISSION_STAGE_GROUP.groundingGeneration.stage, () =>
                mapWithConcurrency(core, policy.candidateConcurrency, async ({ candidate, verdict }) => {
                  const bundle = await construction.groundingGeneration.generate({
                    declaredDomain: candidate.declaredDomain,
                    canonicalLabel: candidate.canonicalLabel,
                    context: candidate.context,
                    identityContext: groundingIdentityContext(candidate, candidates)
                  });
                  validateGeneratedBundle(candidate, bundle);
                  return { candidate, verdict, bundle };
                }), core.length
              );

          const claimResults = await operationClaims.admitBatch(drafts.map(({ candidate, bundle }) => ({
            candidateKey: candidate.candidateKey,
            canonicalLabel: candidate.canonicalLabel,
            declaredDomain: candidate.declaredDomain,
            context: candidate.context,
            targets: groundingTargets(bundle, policy.groundingClaimProjection)
          })));
          const claimResultByKey = new Map(claimResults.map((result) => [result.candidateKey, result] as const));

          for (const draft of drafts) {
            const claimResult = claimResultByKey.get(draft.candidate.candidateKey);
            if (!claimResult) {
              throw new Error(`Claim admission omitted candidateKey ${JSON.stringify(draft.candidate.candidateKey)}.`);
            }
            const settled = settleGroundingBundle(draft.bundle, claimResult.judgments);
            if (settled.disposition === "rejected") {
              outcomeByKey.set(draft.candidate.candidateKey, {
                candidateKey: draft.candidate.candidateKey,
                disposition: "rejected",
                reason: "grounding_verification_exhausted",
                probe: probeSummary(draft.verdict),
                rationale: settled.rationale
              });
              continue;
            }
            outcomeByKey.set(draft.candidate.candidateKey, {
              candidateKey: draft.candidate.candidateKey,
              disposition: "admitted",
              probe: probeSummary(draft.verdict),
              bundle: settled.bundle
            });
          }

          return candidates.map((candidate) => {
            const outcome = outcomeByKey.get(candidate.candidateKey);
            if (!outcome) {
              throw new Error(`Source-less Grounding Admission produced no outcome for ${JSON.stringify(candidate.candidateKey)}.`);
            }
            return outcome;
          });
        }
      };
    }
  };
}

function isCoreProbe(entry: {
  candidate: GroundingAdmissionCandidate;
  verdict: KnowledgeBoundaryVerdict;
}): entry is { candidate: GroundingAdmissionCandidate; verdict: KnowledgeBoundaryVerdict & { disposition: "core_knowledge" } } {
  return entry.verdict.disposition === "core_knowledge";
}

function probeSummary(verdict: KnowledgeBoundaryVerdict & { disposition: "core_knowledge" }): CoreProbeSummary;
function probeSummary(verdict: KnowledgeBoundaryVerdict & { disposition: "boundary" }): BoundaryProbeSummary;
function probeSummary(verdict: KnowledgeBoundaryVerdict): CoreProbeSummary | BoundaryProbeSummary {
  return {
    disposition: verdict.disposition,
    agreementScore: verdict.agreementScore,
    rationale: verdict.rationale
  } as CoreProbeSummary | BoundaryProbeSummary;
}

function groundingTargets(
  bundle: GeneratedGroundingBundle,
  projection: SourceLessGroundingAdmissionPolicy["groundingClaimProjection"]
): readonly PositiveClaimTarget[] {
  if (projection !== "sentence_and_semicolon") {
    throw new Error("Source-less Grounding Admission received an unknown groundingClaimProjection.");
  }
  return [
    ...bundle.definitions.flatMap((passage, passageIndex) =>
      splitGroundingClaims(passage.text).map((text, claimIndex) => ({
        targetKey: `definition:${passageIndex}:claim:${claimIndex}`,
        // Grounding Generation is contracted to put the defining condition first. Requiring every
        // later sentence or semicolon clause to define the candidate would incorrectly reject true
        // consequences and examples that follow an already complete definition.
        targetPurpose: claimIndex === 0 ? "definition" as const : "support" as const,
        text
      }))
    ),
    ...bundle.mentions.flatMap((passage, passageIndex) =>
      splitGroundingClaims(passage.text).map((text, claimIndex) => ({
        targetKey: `mention:${passageIndex}:claim:${claimIndex}`,
        targetPurpose: "support" as const,
        text
      }))
    )
  ];
}

const sentenceSegmenter = new Intl.Segmenter("en", { granularity: "sentence" });

// Punctuation is projection structure, never a factuality gate. Sentence boundaries and explicit
// semicolons produce smaller claim targets so a true neighboring clause cannot mask a false one;
// the original passage remains the only learner text and is settled atomically below.
function splitGroundingClaims(text: string): string[] {
  const claims = [...sentenceSegmenter.segment(text)]
    .flatMap(({ segment }) => segment.split(";"))
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (claims.length === 0) {
    throw new Error("Source-less Grounding Admission could not project a generated passage into claims.");
  }
  return claims;
}

function settleGroundingBundle(
  draft: GeneratedGroundingBundle,
  judgments: readonly ClaimJudgment[]
): { disposition: "admitted"; bundle: GeneratedGroundingBundle } | { disposition: "rejected"; rationale: string } {
  const rejected = new Map(
    judgments
      .filter((judgment) => judgment.disposition === "rejected")
      .map((judgment) => [judgment.targetKey, judgment.rationale] as const)
  );
  const definitions = draft.definitions.filter((_, index) =>
    ![...rejected.keys()].some((targetKey) => targetKey.startsWith(`definition:${index}:claim:`))
  );
  if (definitions.length === 0) {
    return {
      disposition: "rejected",
      rationale: rejectionRationale(judgments)
    };
  }
  const mentions = draft.mentions.filter((_, index) =>
    ![...rejected.keys()].some((targetKey) => targetKey.startsWith(`mention:${index}:claim:`))
  );
  return {
    disposition: "admitted",
    // Settlement is monotonic: retain original passage objects in original order and change no
    // model/provenance/rationale metadata. The judgment port never receives authority to rewrite.
    bundle: { ...draft, definitions, mentions }
  };
}

function rejectionRationale(judgments: readonly ClaimJudgment[]): string {
  const reasons = judgments
    .filter((judgment) => judgment.disposition === "rejected")
    .map((judgment) => `${judgment.targetKey}: ${judgment.rationale}`)
    .join(" ");
  return (reasons || "Every generated Definition Passage was rejected.").slice(0, 2_000);
}

function validatePolicy(policy: SourceLessGroundingAdmissionPolicy): void {
  requireExactKeys(policy, ["probe", "verificationSampleCount", "verificationDecision", "verificationRejectionSampleQuorum", "groundingClaimProjection", "judgmentTargetBatchSize", "candidateConcurrency", "verificationExecution"], "policy");
  requireExactKeys(
    policy.verificationExecution,
    ["questionPlanningConcurrency", "answeringConcurrency", "factualityJudgmentConcurrency"],
    "verificationExecution"
  );
  validateKnowledgeBoundaryProbeConfig(policy.probe);
  for (const [name, value] of [
    ["verificationSampleCount", policy.verificationSampleCount],
    ["verificationRejectionSampleQuorum", policy.verificationRejectionSampleQuorum],
    ["candidateConcurrency", policy.candidateConcurrency],
    ["verificationExecution.questionPlanningConcurrency", policy.verificationExecution.questionPlanningConcurrency],
    ["verificationExecution.answeringConcurrency", policy.verificationExecution.answeringConcurrency],
    ["verificationExecution.factualityJudgmentConcurrency", policy.verificationExecution.factualityJudgmentConcurrency]
  ] as const) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`Source-less Grounding Admission ${name} must be a positive integer.`);
    }
  }
  if (policy.verificationSampleCount < 2) {
    throw new Error("Source-less Grounding Admission verificationSampleCount must be an integer of at least 2.");
  }
  if (policy.verificationDecision !== "same_model_replicated_rejection") {
    throw new Error("Source-less Grounding Admission received an unknown verificationDecision.");
  }
  if (policy.verificationRejectionSampleQuorum < 2
    || policy.verificationRejectionSampleQuorum > policy.verificationSampleCount) {
    throw new Error(`Source-less Grounding Admission verificationRejectionSampleQuorum must be an integer from 2 through ${policy.verificationSampleCount}.`);
  }
  if (policy.judgmentTargetBatchSize !== 1) {
    throw new Error("Source-less Grounding Admission judgmentTargetBatchSize must be exactly 1.");
  }
  if (policy.groundingClaimProjection !== "sentence_and_semicolon") {
    throw new Error("Source-less Grounding Admission groundingClaimProjection must be sentence_and_semicolon.");
  }
}

function validateCandidates(candidates: readonly GroundingAdmissionCandidate[]): void {
  const keys = new Set<string>();
  for (const candidate of candidates) {
    requireExactKeys(candidate, ["candidateKey", "canonicalLabel", "aliases", "declaredDomain", "context"], "candidate");
    requireNonEmptyString(candidate.candidateKey, "candidateKey");
    requireNonEmptyString(candidate.canonicalLabel, `canonicalLabel for ${candidate.candidateKey}`);
    requireNonEmptyString(candidate.declaredDomain, `declaredDomain for ${candidate.candidateKey}`);
    if (!Array.isArray(candidate.aliases)) {
      throw new Error(`Source-less Grounding Admission received malformed aliases for ${candidate.candidateKey}.`);
    }
    for (const alias of candidate.aliases) {
      requireNonEmptyString(alias, `alias for ${candidate.candidateKey}`);
    }
    if (keys.has(candidate.candidateKey)) {
      throw new Error(`Source-less Grounding Admission received duplicate candidateKey ${JSON.stringify(candidate.candidateKey)}.`);
    }
    keys.add(candidate.candidateKey);
    validateContext(candidate.candidateKey, candidate.context);
  }
}

function groundingIdentityContext(
  candidate: GroundingAdmissionCandidate,
  candidates: readonly GroundingAdmissionCandidate[]
): GroundingIdentityContext {
  const aliases = uniqueIdentityAliases(candidate.canonicalLabel, candidate.aliases);
  const peerConcepts: Array<{ canonicalLabel: string; aliases: readonly string[] }> = [];
  const seenPeers = new Set<string>();
  for (const peer of candidates) {
    if (peer === candidate
      || peer.declaredDomain !== candidate.declaredDomain
      || !sameGroundingAdmissionContext(peer.context, candidate.context)) continue;
    const peerAliases = uniqueIdentityAliases(peer.canonicalLabel, peer.aliases);
    const peerKey = normalizedIdentityLabel(peer.canonicalLabel);
    if (seenPeers.has(peerKey)) continue;
    seenPeers.add(peerKey);
    peerConcepts.push(Object.freeze({
      canonicalLabel: peer.canonicalLabel,
      aliases: Object.freeze(peerAliases)
    }));
  }
  return Object.freeze({
    aliases: Object.freeze(aliases),
    peerConcepts: Object.freeze(peerConcepts)
  });
}

function uniqueIdentityAliases(canonicalLabel: string, aliases: readonly string[]): string[] {
  const seen = new Set([normalizedIdentityLabel(canonicalLabel)]);
  const unique: string[] = [];
  for (const alias of aliases) {
    const normalized = normalizedIdentityLabel(alias);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(alias);
  }
  return unique;
}

function normalizedIdentityLabel(label: string): string {
  return normalizeConceptLabel(label)
    || label.normalize("NFKC").toLowerCase().trim().replace(/\s+/gu, " ");
}

function sameGroundingAdmissionContext(a: GroundingAdmissionContext, b: GroundingAdmissionContext): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "originating_topic" && b.kind === "originating_topic") return a.topic === b.topic;
  if (a.kind === "scaffolded_anchor" && b.kind === "scaffolded_anchor") {
    return a.anchor.reference === b.anchor.reference
      && a.anchor.canonicalLabel === b.anchor.canonicalLabel
      && a.anchor.definitionPassages.length === b.anchor.definitionPassages.length
      && a.anchor.definitionPassages.every((passage, index) => passage === b.anchor.definitionPassages[index]);
  }
  return false;
}

function validateContext(candidateKey: string, context: GroundingAdmissionContext): void {
  if (typeof context !== "object" || context === null || Array.isArray(context)) {
    throw new Error(`Source-less Grounding Admission received malformed context for ${candidateKey}.`);
  }
  if (context.kind === "originating_topic") {
    requireExactKeys(context, ["kind", "topic"], `originating-topic context for ${candidateKey}`);
    requireNonEmptyString(context.topic, `originating topic for ${candidateKey}`);
    return;
  }
  if (context.kind === "scaffolded_anchor") {
    requireExactKeys(context, ["kind", "anchor"], `scaffolded-anchor context for ${candidateKey}`);
    requireExactKeys(context.anchor, ["reference", "canonicalLabel", "definitionPassages"], `anchor for ${candidateKey}`);
    requireNonEmptyString(context.anchor.reference, `anchor reference for ${candidateKey}`);
    requireNonEmptyString(context.anchor.canonicalLabel, `anchor canonicalLabel for ${candidateKey}`);
    if (!Array.isArray(context.anchor.definitionPassages) || context.anchor.definitionPassages.length === 0) {
      throw new Error(`Source-less Grounding Admission requires an anchor Definition Passage for ${candidateKey}.`);
    }
    for (const passage of context.anchor.definitionPassages) {
      requireNonEmptyString(passage, `anchor Definition Passage for ${candidateKey}`);
    }
    return;
  }
  throw new Error(`Source-less Grounding Admission received unknown context kind for ${candidateKey}.`);
}

function validateGeneratedBundle(candidate: GroundingAdmissionCandidate, bundle: GeneratedGroundingBundle): void {
  requireExactKeys(bundle, [
    "groundingOrigin",
    "definitions",
    "mentions",
    "groundingAnchorReferences",
    "generatingModel",
    "rationale"
  ], `Generated Grounding Bundle for ${candidate.candidateKey}`);
  if (bundle.groundingOrigin !== "llm_grounded") {
    throw new Error(`Grounding Generation returned a non-generated origin for ${candidate.candidateKey}.`);
  }
  if (!Array.isArray(bundle.definitions) || bundle.definitions.length === 0 || !Array.isArray(bundle.mentions)) {
    throw new Error(`Grounding Generation returned no Definition Passage for ${candidate.candidateKey}.`);
  }
  requireNonEmptyString(bundle.generatingModel, `generatingModel for ${candidate.candidateKey}`);
  requireNonEmptyString(bundle.rationale, `Grounding Bundle rationale for ${candidate.candidateKey}`);
  const expectedReferences = candidate.context.kind === "scaffolded_anchor" ? [candidate.context.anchor.reference] : [];
  if (!Array.isArray(bundle.groundingAnchorReferences)
    || bundle.groundingAnchorReferences.length !== expectedReferences.length
    || bundle.groundingAnchorReferences.some((reference, index) => reference !== expectedReferences[index])) {
    throw new Error(`Grounding Generation returned mismatched anchor references for ${candidate.candidateKey}.`);
  }
}

function requireExactKeys(value: unknown, expected: readonly string[], label: string): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Source-less Grounding Admission received malformed ${label}.`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new Error(`Source-less Grounding Admission received malformed ${label}; expected fields ${required.join(", ")}.`);
  }
}

function requireNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Source-less Grounding Admission requires a non-empty ${label}.`);
  }
}
