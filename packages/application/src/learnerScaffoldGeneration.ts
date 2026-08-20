import { randomUUID } from "node:crypto";
import {
  normalizeConceptLabel,
  STAGE_TAGS,
  type GeneratedGroundingBundle,
  type GroundingAdmissionContext,
  type ScaffoldNodePayload,
  type ScaffoldStep
} from "@lrnki/domain-core";
import type {
  AnswerKeyVerificationPort,
  ClaimFactualityJudgmentPort,
  ClaimVerificationAnsweringPort,
  ClaimVerificationQuestionPlanningPort,
  DerivedGraphNode,
  RunProgressReporterPort,
  ScaffoldContentCongruencePort,
  ScaffoldContentDraft,
  ScaffoldContentPort,
  ScaffoldDetourStorePort,
  ScaffoldOutlinePort,
  ScaffoldOutlineStep
} from "@lrnki/ports";
import { scaffoldMicroLessonText } from "./auditScaffoldContent";
import { bestEffort } from "./bestEffort";
import { createClaimAdmission, type ClaimAdmission } from "./claimAdmission";
import { isTransientGenerationError } from "./generationFailureClassification";
import { GenerationClaimLostError } from "./generationClaimLost";
import { normalizeOptionText } from "./optionSelectGuard";
import { runInstrumentedOperation, type StageBracket } from "./runProgressReporter";
import {
  projectScaffoldPositiveClaims,
  SCAFFOLD_POSITIVE_CLAIM_PROJECTION,
  type ScaffoldPositiveClaimProjection
} from "./scaffoldPositiveClaims";
import {
  DEFAULT_SOURCE_LESS_GROUNDING_ADMISSION_POLICY,
  type GroundingAdmissionCandidate,
  type SourceLessGroundingAdmission,
  type SourceLessGroundingAdmissionPolicy
} from "./sourceLessGroundingAdmission";
import type { StudySession } from "./studySessionProjection";
import { verifyOptionSelectAnswerKeyOnce } from "./verifyStudyItemKeys";

// The operation-level behavior knobs of Scaffold Generation (plan 2026-07-16-004 KTD7). This is
// the application half of the operation's config identity: the infrastructure
// `scaffoldGenerationConfigHash(config)` folds these knobs together with every runtime forced-tool
// descriptor and the embedding model, so a knob change changes the persisted operation identity.
// The retired parent-text sufficiency threshold is deliberately NOT a knob — no character count
// may bypass the Knowledge-Boundary Probe (KTD5).
export type ScaffoldGenerationConfig = {
  // Upper bound on published Support Steps per detour (references + generated combined).
  maxSupportSteps: number;
  // Total outline proposals per attempt: the initial outline plus bounded `retryFeedback`
  // re-outlines after an unusable collision/duplicate (KTD5). After the final proposal a
  // still-colliding label is dropped rather than re-outlined.
  outlineAttempts: number;
  // Complete content attempts per admitted generated label. Each fresh draft runs structural
  // validation, congruence re-pick, positive-claim admission, and Answer-Key Verification.
  contentDraftAttempts: number;
  // Versioned projection of learner-visible positive fields into factual targets. Questions and
  // keyed answers are one QA-pair claim; interrogatives never enter claim admission alone.
  positiveClaimProjection: ScaffoldPositiveClaimProjection;
  // The one canonical Source-less Grounding Admission policy shared by all three consumers.
  sourceLessGroundingAdmission: SourceLessGroundingAdmissionPolicy;
};

export const DEFAULT_SCAFFOLD_GENERATION_CONFIG: ScaffoldGenerationConfig = {
  maxSupportSteps: 3,
  outlineAttempts: 2,
  contentDraftAttempts: 2,
  positiveClaimProjection: SCAFFOLD_POSITIVE_CLAIM_PROJECTION,
  sourceLessGroundingAdmission: DEFAULT_SOURCE_LESS_GROUNDING_ADMISSION_POLICY
};

// Learner-Scoped Scaffold Generation — the deep process-lived module (plan 2026-07-16-004
// KTD1/KTD5/KTD6). Constructed ONCE per process with lifecycle-shaped adapters and invoked with
// only one claimed detour's identity: the operation id IS the attempt identity and fencing value.
// The callable owns the complete post-claim lifecycle — claim verification, ONE opening Study
// Session read, exact reuse, bounded feedback re-outline, shared Source-less Grounding Admission,
// content generation, congruence re-pick, validation, failure classification, stage
// ordering, and the fenced terminal write. It resolves only after a fenced `ready` publish;
// every other outcome rejects after the correct fenced action. The neutral Study Item Bank and
// Derived Graph Layer are NEVER written — no such port is reachable from the construction.

// The opening Study Session facts generation reads (KTD2). Production passes the finished
// `getStudySession` projection straight through — this is a structural subset, never an
// app-assembled context DTO: parent/aliases/same-layer membership from `detail`, included-node
// state from `classification.stateByNode`, confidently floored membership from `flooredNodeIds`,
// and current reusable neutral lesson/item identities from `neutralReferenceAssetsByNode`.
export type ScaffoldOpeningStudySession = Pick<
  StudySession,
  "detail" | "classification" | "neutralReferenceAssetsByNode" | "flooredNodeIds"
>;

export type ScaffoldGenerationRequest = { detourId: string; operationId: string };

export type ScaffoldGeneration = (request: ScaffoldGenerationRequest) => Promise<void>;

export type ScaffoldGenerationConstruction = {
  // The lifecycle-shaped store subset (KTD1): claimed-read plus the three fenced terminal
  // capabilities. Tests never implement unrelated request/hide/audit/grading/supervisor methods.
  detours: Pick<ScaffoldDetourStorePort, "getById" | "publishReady" | "releaseClaim" | "markFailed">;
  // The construction-bound Study Session reader (KTD2). ONE call per attempt: the opening
  // projection is retained for the whole attempt even if learner state changes during neural
  // work; publication never recomputes eligibility.
  readStudySession: (input: { enrichmentId: string; learnerStateRef: string }) => Promise<ScaffoldOpeningStudySession | undefined>;
  outline: ScaffoldOutlinePort;
  content: ScaffoldContentPort;
  // Generation-time label↔content congruence re-pick (plan 2026-07-16-001 U5, KTD4b). The SAME
  // cross-family independent judge the audit uses, called K=1 per drafted step: the scaffold
  // generator never grades its own output. A quality re-pick, not a provable gate — it fails
  // OPEN on judge infra error (rule 16) so a flaky judge call never drops otherwise-valid support.
  congruence: ScaffoldContentCongruencePort;
  // Every generated label crosses the finished deep admission interface in one settled-outline
  // batch. Reference steps bypass it. No raw probe or Grounding Generation port is reachable.
  sourceLessGroundingAdmission: SourceLessGroundingAdmission;
  // The same package-internal claim implementation settles all positive fields of each fresh
  // Support Step draft. These ports are construction-only and never reach caller policy.
  claimVerificationQuestionPlanning: ClaimVerificationQuestionPlanningPort;
  claimVerificationAnswering: ClaimVerificationAnsweringPort;
  claimFactualityJudgments: readonly [ClaimFactualityJudgmentPort, ClaimFactualityJudgmentPort];
  // One-shot option-select classification/veto. Its required failures escape the content envelope.
  answerKeyVerification: AnswerKeyVerificationPort;
  reporter: RunProgressReporterPort;
  config: ScaffoldGenerationConfig;
  // The complete operation config identity (KTD7), computed by the composition's infrastructure
  // half and persisted with the operation begin — even when direct reuse opens no neural stage.
  configHash: string;
  newId?: () => string;
};

// Thrown when the claimed attempt is missing/mismatched or a fenced write affects no row:
// another attempt owns the detour, so this run writes NOTHING further (KTD6). Internal — the
// supervisor only needs the rejection.
// Deterministic "no safe Support Step survived" — records `failed` under the fence (KTD6).
class ScaffoldNoSafeStepError extends Error {
  constructor(term: string) {
    super(`No safe Support Step survived for term "${term}".`);
    this.name = "ScaffoldNoSafeStepError";
  }
}

export function createScaffoldGeneration(construction: ScaffoldGenerationConstruction): ScaffoldGeneration {
  const newId = construction.newId ?? randomUUID;
  const admissionPolicy = construction.config.sourceLessGroundingAdmission;
  const contentClaimAdmission = createClaimAdmission({
    questionPlanning: construction.claimVerificationQuestionPlanning,
    answering: construction.claimVerificationAnswering,
    factualityJudgments: construction.claimFactualityJudgments,
    verificationSampleCount: admissionPolicy.verificationSampleCount,
    verificationDecision: admissionPolicy.verificationDecision,
    verificationRejectionSampleQuorum: admissionPolicy.verificationRejectionSampleQuorum,
    judgmentTargetBatchSize: admissionPolicy.judgmentTargetBatchSize,
    verificationConcurrency: admissionPolicy.verificationConcurrency
  });
  return async (request) => {
    await runInstrumentedOperation(construction.reporter, "scaffold", request.operationId, async (runStage) => {
      // Claim verification before any neural spend (KTD1/KTD6): the store's claim installed the
      // operation id as the fencing token, so a generating detour whose claim token is this
      // request's operation id is the one active attempt this call owns.
      const detour = await construction.detours.getById(request.detourId);
      if (!detour || detour.status !== "generating" || detour.claimToken !== request.operationId) {
        throw new GenerationClaimLostError(`Scaffold generation claim lost for detour ${request.detourId}.`);
      }
      const fence = { detourId: request.detourId, claimToken: request.operationId };
      try {
        const session = await construction.readStudySession({
          enrichmentId: detour.enrichmentId,
          learnerStateRef: detour.learnerStateRef
        });
        if (!session) throw new Error(`Scaffold generation: enrichment ${detour.enrichmentId} has no Study Session.`);
        const parent = session.detail.nodes.find((node) => node.derivedNodeId === detour.parentDerivedNodeId);
        if (!parent) throw new Error(`Scaffold generation: parent node ${detour.parentDerivedNodeId} not in enrichment.`);

        const steps = await generateSteps({
          construction,
          contentClaimAdmission,
          session,
          parent,
          detour: { term: detour.term },
          runStage,
          newId
        });
        if (steps.length === 0) throw new ScaffoldNoSafeStepError(detour.term);
        const published = await construction.detours.publishReady({ ...fence, steps });
        if (!published) throw new GenerationClaimLostError(`Scaffold generation claim lost for detour ${request.detourId}.`);
      } catch (error) {
        // Both terminal writes below are best-effort under the fence (KTD6): a store rejection is
        // swallowed and a 0-row `false` return ignored, because either means this attempt no longer
        // owns the detour — the caught generation error stays the meaningful rejection.
        // Lost claim: another attempt owns the detour — write nothing (KTD6).
        if (error instanceof GenerationClaimLostError) throw error;
        if (isTransientGenerationError(error)) {
          // Infrastructure-transient exhaustion: release under the fence so the supervisor's
          // bounded attempt budget governs the retry; the detour stays `generating`.
          await bestEffort(() => construction.detours.releaseClaim(fence));
          throw error;
        }
        // Deterministic model/schema/content failure or no-safe-step: record `failed` under the
        // fence, then reject so the operation timeline is honestly failed.
        await bestEffort(() => construction.detours.markFailed(fence));
        throw error;
      }
    }, construction.configHash);
  };
}

type ReferencePin = { derivedNodeId: string; conceptLessonId: string; studyItemId: string };

type ExactMatch =
  | { kind: "reference"; pin: ReferencePin }
  | { kind: "none" }
  | { kind: "collision" };

// Resolve ONE unambiguous, eligible exact match against the opening Study Session (KTD2/KTD5).
// A unique same-domain, non-parent match that is frontier, mastered, or confidently floored AND
// carries current lesson + option-select identities pins a reference. Any parent, locked,
// ambiguous, cross-domain, or payload-incomplete collision is unusable: never referenced, never
// cloned as a generated node. No match at all is `none` (safe to generate).
function resolveExactMatch(term: string, session: ScaffoldOpeningStudySession, parent: DerivedGraphNode): ExactMatch {
  const normalized = normalizeConceptLabel(term);
  if (normalized.length === 0) return { kind: "none" };
  const matches = session.detail.nodes.filter((node) =>
    normalizeConceptLabel(node.label) === normalized ||
    node.aliases.some((alias) => normalizeConceptLabel(alias) === normalized));
  if (matches.length === 0) return { kind: "none" };
  if (matches.length > 1) return { kind: "collision" };
  const match = matches[0];
  if (match.derivedNodeId === parent.derivedNodeId) return { kind: "collision" };
  if (match.declaredDomain !== parent.declaredDomain) return { kind: "collision" };
  const assets = session.neutralReferenceAssetsByNode[match.derivedNodeId];
  if (!assets) return { kind: "collision" };
  const state = session.classification.stateByNode[match.derivedNodeId];
  if (state === "locked") return { kind: "collision" };
  const eligible = state === "frontier" || state === "mastered" || session.flooredNodeIds.includes(match.derivedNodeId);
  if (!eligible) return { kind: "collision" };
  return {
    kind: "reference",
    pin: { derivedNodeId: match.derivedNodeId, conceptLessonId: assets.conceptLessonId, studyItemId: assets.studyItemId }
  };
}

type PlannedStep =
  | { kind: "reference"; pin: ReferencePin }
  | { kind: "generate"; label: string };

// Partition one outline proposal into safe planned steps and rejected labels (KTD5). A usable
// exact match becomes a reference; a fresh label becomes a generation candidate; a collision or
// a duplicate of another proposed step is rejected — rejected labels feed the bounded feedback
// re-outline and are NEVER generated under the same normalized label.
function planOutline(
  proposals: readonly ScaffoldOutlineStep[],
  session: ScaffoldOpeningStudySession,
  parent: DerivedGraphNode,
  maxSupportSteps: number
): { planned: PlannedStep[]; rejected: string[] } {
  const planned: PlannedStep[] = [];
  const rejected: string[] = [];
  const seenLabels = new Set<string>();
  const usedNodeIds = new Set<string>();
  for (const proposed of proposals) {
    if (planned.length >= maxSupportSteps) break;
    const normalized = normalizeConceptLabel(proposed.label);
    if (normalized.length === 0) continue;
    if (seenLabels.has(normalized)) {
      rejected.push(proposed.label);
      continue;
    }
    seenLabels.add(normalized);
    const match = resolveExactMatch(proposed.label, session, parent);
    if (match.kind === "collision") {
      rejected.push(proposed.label);
      continue;
    }
    if (match.kind === "reference") {
      if (usedNodeIds.has(match.pin.derivedNodeId)) {
        rejected.push(proposed.label);
        continue;
      }
      usedNodeIds.add(match.pin.derivedNodeId);
      planned.push({ kind: "reference", pin: match.pin });
      continue;
    }
    planned.push({ kind: "generate", label: proposed.label });
  }
  return { planned, rejected };
}

// The whole step pipeline for one claimed attempt: direct selected-term reuse, the settled
// outline plan (with bounded feedback re-outline), one generated-label admission batch, then the
// complete content assurance envelope per admitted label. The caller owns the fenced write.
async function generateSteps(input: {
  construction: ScaffoldGenerationConstruction;
  contentClaimAdmission: ClaimAdmission;
  session: ScaffoldOpeningStudySession;
  parent: DerivedGraphNode;
  detour: { term: string };
  runStage: StageBracket;
  newId: () => string;
}): Promise<ScaffoldStep[]> {
  const { construction, session, parent, runStage, newId } = input;
  const { config } = construction;

  // 1. Direct selected-term reuse: a unique eligible exact match publishes one pinned reference
  // and makes ZERO neural calls (frontier, mastered, and confidently floored alike).
  const direct = resolveExactMatch(input.detour.term, session, parent);
  if (direct.kind === "reference") {
    return [referenceStep(direct.pin, 0, newId)];
  }

  // 2. Settle the outline plan. The initial proposal plus bounded feedback re-outlines when a
  // proposal collides unusably or duplicates another proposed step (KTD5); after the final
  // proposal, colliding labels are dropped.
  const existingLabels = session.detail.nodes
    .filter((node) => node.declaredDomain === parent.declaredDomain)
    .map((node) => node.label);
  const proposeInput = {
    declaredDomain: parent.declaredDomain,
    parentLabel: parent.label,
    term: input.detour.term,
    existingLabels
  };
  let outline = await runStage(STAGE_TAGS.scaffoldOutlineGeneration, () => construction.outline.propose(proposeInput));
  let plan = planOutline(outline.steps, session, parent, config.maxSupportSteps);
  for (let attempt = 1; attempt < config.outlineAttempts && plan.rejected.length > 0; attempt++) {
    const retryFeedback =
      `These proposed labels were rejected: ${plan.rejected.map((label) => `"${label}"`).join(", ")}. ` +
      `Each one collides with an existing concept in this layer or duplicates another proposed step. ` +
      `Propose distinct, strictly simpler prerequisites of "${input.detour.term}" with different labels.`;
    outline = await runStage(STAGE_TAGS.scaffoldOutlineGeneration, () => construction.outline.propose({ ...proposeInput, retryFeedback }));
    plan = planOutline(outline.steps, session, parent, config.maxSupportSteps);
  }

  // 3. Admit every generated label in ONE settled-outline batch. Reference steps bypass the
  // module. Verified parent definitions travel only as grounding anchors; an admitted bundle is
  // the generated step's immutable evidence and the only generated label allowed into content.
  const parentAnchor = scaffoldedAnchorFor(parent);
  const generatedCandidates = plan.planned.flatMap((item, planIndex) => {
    if (item.kind === "reference") return [];
    const context: GroundingAdmissionContext = parentAnchor
      ? { kind: "scaffolded_anchor", anchor: parentAnchor }
      : { kind: "originating_topic", topic: item.label };
    const candidate: GroundingAdmissionCandidate = {
      candidateKey: `scaffold-candidate:${planIndex}`,
      canonicalLabel: item.label,
      declaredDomain: parent.declaredDomain,
      context
    };
    return [{ planIndex, item, candidate, context }];
  });
  const admission = construction.sourceLessGroundingAdmission.forOperation(runStage);
  const outcomes = generatedCandidates.length > 0
    ? await admission.admitBatch(generatedCandidates.map((entry) => entry.candidate))
    : [];
  if (outcomes.length !== generatedCandidates.length) {
    throw new Error("Source-less Grounding Admission returned a result-count mismatch for generated Support Steps.");
  }
  const admittedByPlanIndex = new Map<number, {
    bundle: GeneratedGroundingBundle;
    context: GroundingAdmissionContext;
  }>();
  outcomes.forEach((outcome, index) => {
    const expected = generatedCandidates[index];
    if (!expected || outcome.candidateKey !== expected.candidate.candidateKey) {
      throw new Error("Source-less Grounding Admission returned out-of-order generated Support Step outcomes.");
    }
    if (outcome.disposition === "admitted") {
      admittedByPlanIndex.set(expected.planIndex, { bundle: outcome.bundle, context: expected.context });
    }
  });

  const steps: ScaffoldStep[] = [];
  const contentClaims = input.contentClaimAdmission.forOperation(runStage);
  for (const [planIndex, item] of plan.planned.entries()) {
    if (item.kind === "reference") {
      steps.push(referenceStep(item.pin, steps.length, newId));
      continue;
    }
    const admitted = admittedByPlanIndex.get(planIndex);
    if (!admitted) continue;
    const groundingText = admitted.bundle.definitions.map((passage) => passage.text).join("\n\n").trim();
    if (!groundingText) {
      throw new Error(`Admitted generated Support Step ${JSON.stringify(item.label)} carries no Definition Passage.`);
    }
    const accepted = await generateAssuredStep({
      construction,
      contentClaims,
      parent,
      term: input.detour.term,
      stepLabel: item.label,
      groundingText,
      groundingBundle: admitted.bundle,
      groundingContext: admitted.context,
      runStage,
      newId
    });
    if (!accepted) continue;
    steps.push({
      scaffoldStepId: newId(),
      ordinal: steps.length,
      kind: "generated",
      payload: accepted,
      groundingBundle: admitted.bundle,
      lessonReadAt: null
    });
  }
  return steps;
}

function referenceStep(pin: ReferencePin, ordinal: number, newId: () => string): ScaffoldStep {
  return {
    scaffoldStepId: newId(),
    ordinal,
    kind: "reference",
    referencedDerivedNodeId: pin.derivedNodeId,
    referencedConceptLessonId: pin.conceptLessonId,
    referencedStudyItemId: pin.studyItemId
  };
}

// The parent's verified definition passages as grounding-generation anchors (KTD5). They steer
// the child bundle but are never returned directly as child grounding.
function scaffoldedAnchorFor(parent: DerivedGraphNode): {
  reference: string;
  canonicalLabel: string;
  definitionPassages: [string, ...string[]];
} | null {
  const definitionQuotes = (parent.grounding?.passages ?? [])
    .filter((passage) => passage.passageType === "definition")
    .map((passage) => passage.text.trim())
    .filter((text) => text.length > 0);
  const [firstDefinition, ...remainingDefinitions] = definitionQuotes;
  if (!firstDefinition) return null;
  return {
    reference: parent.derivedNodeId,
    canonicalLabel: parent.label,
    definitionPassages: [firstDefinition, ...remainingDefinitions]
  };
}

// One complete content-attempt envelope. Each attempt starts with a fresh complete draft and then
// runs, in order: structural validation → congruence re-pick → exhaustive positive-claim admission
// → one-shot Answer-Key Verification. Every resolved rejection supplies bounded feedback to the
// next fresh draft. Congruence unavailability skips only that quality veto. Required claim/key
// unavailability is not caught and therefore consumes no additional content attempt.
async function generateAssuredStep(input: {
  construction: ScaffoldGenerationConstruction;
  contentClaims: ReturnType<ClaimAdmission["forOperation"]>;
  parent: DerivedGraphNode;
  term: string;
  stepLabel: string;
  groundingText: string;
  groundingBundle: GeneratedGroundingBundle;
  groundingContext: GroundingAdmissionContext;
  runStage: StageBracket;
  newId: () => string;
}): Promise<ScaffoldNodePayload | null> {
  const { construction, runStage } = input;
  let retryFeedback: string | undefined;
  for (let attempt = 0; attempt < construction.config.contentDraftAttempts; attempt++) {
    let draft: ScaffoldContentDraft;
    try {
      draft = await runStage(STAGE_TAGS.scaffoldContentGeneration, () =>
        construction.content.generate({
          declaredDomain: input.parent.declaredDomain,
          label: input.stepLabel,
          groundingContext: input.groundingContext,
          groundingText: input.groundingText,
          ...(retryFeedback ? { retryFeedback } : {})
        })
      );
    } catch (error) {
      retryFeedback = boundedContentFeedback(`content generation failed: ${errorText(error)}`);
      continue;
    }
    const built = buildScaffoldNodePayload(input.stepLabel, draft, input.newId);
    if (!built.ok) {
      retryFeedback = boundedContentFeedback(built.reason);
      continue;
    }
    const payload = built.payload;

    try {
      const verdict = await runStage(STAGE_TAGS.scaffoldContentCongruence, () =>
        construction.congruence.judge({
          declaredDomain: input.parent.declaredDomain,
          term: input.term,
          parentLabel: input.parent.label,
          stepLabel: input.stepLabel,
          microLesson: scaffoldMicroLessonText(payload),
          question: payload.item.question,
          explanation: payload.item.explanation,
          options: payload.item.options.map((option) => option.text).sort((a, b) => a.localeCompare(b))
        })
      );
      if (!verdict.teachesStepLabel || !verdict.isSimplerPrerequisite) {
        retryFeedback = boundedContentFeedback(
          `content congruence rejected the draft: ${verdict.rationale || "the draft did not teach its label as a simpler prerequisite"}`
        );
        continue;
      }
    } catch {
      // Congruence is a fail-open quality re-pick, not an assurance gate. Continue to both
      // required checks; never admit early merely because this optional judge was unavailable.
    }

    const contentCandidateKey = `scaffold-content:${attempt}`;
    const claimResults = await input.contentClaims.admitBatch([{
      candidateKey: contentCandidateKey,
      canonicalLabel: input.stepLabel,
      declaredDomain: input.parent.declaredDomain,
      context: input.groundingContext,
      targets: projectScaffoldPositiveClaims(payload, construction.config.positiveClaimProjection)
    }]);
    const claimResult = claimResults[0];
    if (claimResults.length !== 1 || claimResult?.candidateKey !== contentCandidateKey) {
      throw new Error("Positive-claim admission returned a mismatched generated Support Step result.");
    }
    const rejectedClaims = claimResult.judgments.filter((judgment) => judgment.disposition === "rejected");
    if (rejectedClaims.length > 0) {
      retryFeedback = boundedContentFeedback(
        `positive-claim admission rejected the draft: ${rejectedClaims.map((judgment) => `${judgment.targetKey}: ${judgment.rationale}`).join("; ")}`
      );
      continue;
    }

    const keyOutcome = await runStage(STAGE_TAGS.optionSelectKeyVerification, () =>
      verifyOptionSelectAnswerKeyOnce({
        verifier: construction.answerKeyVerification,
        declaredDomain: input.parent.declaredDomain,
        subject: { canonicalLabel: input.stepLabel, aliases: [] },
        item: payload.item,
        groundingPassages: answerKeyGroundingPassages(input.groundingBundle),
        relatedConcepts: relatedConceptsFor(input.parent)
      })
    );
    if (!keyOutcome.admitted) {
      retryFeedback = boundedContentFeedback(keyOutcome.reason);
      continue;
    }

    return payload;
  }
  return null;
}

type ScaffoldPayloadBuild =
  | { ok: true; payload: ScaffoldNodePayload }
  | { ok: false; reason: string };

// Validate a content draft's complete structural shape and build a fresh persistable payload.
// Citation-free and labeled generated end to end; semantic checks happen only after this succeeds.
function buildScaffoldNodePayload(label: string, draft: ScaffoldContentDraft, newId: () => string): ScaffoldPayloadBuild {
  const optionTexts = [draft.correctAnswer, ...draft.distractors];
  if (optionTexts.length !== 4) {
    return { ok: false, reason: `generated Support Step requires exactly four options, got ${optionTexts.length}` };
  }
  if (optionTexts.some((text) => text.trim().length === 0)) {
    return { ok: false, reason: "generated Support Step contains an empty answer option" };
  }
  const normalized = optionTexts.map(normalizeOptionText);
  if (new Set(normalized).size !== normalized.length) {
    return { ok: false, reason: "generated Support Step has duplicate options after normalization" };
  }
  if (!draft.microLesson.trim() || !draft.question.trim() || !draft.explanation.trim()) {
    return { ok: false, reason: "generated Support Step requires non-empty lesson, question, and explanation text" };
  }
  const options = optionTexts.map((text, index) => ({ optionId: newId(), text, isCorrect: index === 0 }));
  return {
    ok: true,
    payload: {
      scaffoldNodeId: newId(),
      label,
      lesson: [{ kind: "definition", text: draft.microLesson, groundingProvenance: "generated" }],
      item: { scaffoldItemId: newId(), question: draft.question, explanation: draft.explanation, options }
    }
  };
}

function answerKeyGroundingPassages(bundle: GeneratedGroundingBundle): {
  passageId: string;
  kind: "definition" | "mention";
  text: string;
}[] {
  return [
    ...bundle.definitions.map((passage, index) => ({ passageId: `definition:${index}`, kind: "definition" as const, text: passage.text })),
    ...bundle.mentions.map((passage, index) => ({ passageId: `mention:${index}`, kind: "mention" as const, text: passage.text }))
  ];
}

function relatedConceptsFor(parent: DerivedGraphNode): { label: string; snippet: string }[] {
  const snippet = parent.grounding?.passages
    .find((passage) => passage.passageType === "definition")
    ?.text.trim() ?? "";
  return [{ label: parent.label, snippet }];
}

function boundedContentFeedback(feedback: string): string {
  return feedback.slice(0, 2_000);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
