import { randomUUID } from "node:crypto";
import { normalizeConceptLabel, STAGE_TAGS, type ScaffoldNodePayload, type ScaffoldStep } from "@lrnki/domain-core";
import type {
  DerivedGraphNode,
  GroundingGenerationPort,
  KnowledgeBoundaryProbePort,
  NodeEmbeddingPort,
  RunProgressReporterPort,
  ScaffoldContentCongruencePort,
  ScaffoldContentDraft,
  ScaffoldContentPort,
  ScaffoldDetourStorePort,
  ScaffoldOutlinePort,
  ScaffoldOutlineStep
} from "@lrnki/ports";
import { scaffoldMicroLessonText } from "./auditScaffoldContent";
import { isTransientGenerationError } from "./generationFailureClassification";
import { GenerationClaimLostError } from "./generationClaimLost";
import { DEFAULT_KNOWLEDGE_BOUNDARY_PROBE_CONFIG, probeKnowledgeBoundary, type KnowledgeBoundaryProbeConfig } from "./knowledgeBoundaryProbe";
import { normalizeOptionText } from "./optionSelectGuard";
import { runInstrumentedOperation, type StageBracket } from "./runProgressReporter";
import type { StudySession } from "./studySessionProjection";

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
  // Content drafts per outline step: each draft is shape-validated then judged by the
  // label↔content congruence re-pick; a NO drops the draft and retries within this bound.
  contentDraftAttempts: number;
  // The Knowledge-Boundary Probe every non-reference outline label must pass (KTD5).
  knowledgeBoundaryProbe: KnowledgeBoundaryProbeConfig;
};

export const DEFAULT_SCAFFOLD_GENERATION_CONFIG: ScaffoldGenerationConfig = {
  maxSupportSteps: 3,
  outlineAttempts: 2,
  contentDraftAttempts: 2,
  knowledgeBoundaryProbe: DEFAULT_KNOWLEDGE_BOUNDARY_PROBE_CONFIG
};

// Learner-Scoped Scaffold Generation — the deep process-lived module (plan 2026-07-16-004
// KTD1/KTD5/KTD6). Constructed ONCE per process with lifecycle-shaped adapters and invoked with
// only one claimed detour's identity: the operation id IS the attempt identity and fencing value.
// The callable owns the complete post-claim lifecycle — claim verification, ONE opening Study
// Session read, exact reuse, bounded feedback re-outline, Knowledge-Boundary Probe + child
// grounding, content generation, congruence re-pick, validation, failure classification, stage
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
  // Every generated label is probed then child-grounded (KTD5): no character threshold can
  // bypass the Knowledge-Boundary Probe, and parent definitions appear only as anchors.
  knowledgeBoundaryProbe: KnowledgeBoundaryProbePort;
  nodeEmbedding: NodeEmbeddingPort;
  groundingGeneration: GroundingGenerationPort;
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

        const steps = await generateSteps({ construction, session, parent, detour: { term: detour.term }, runStage, newId });
        if (steps.length === 0) throw new ScaffoldNoSafeStepError(detour.term);
        const published = await construction.detours.publishReady({ ...fence, steps });
        if (!published) throw new GenerationClaimLostError(`Scaffold generation claim lost for detour ${request.detourId}.`);
      } catch (error) {
        // Lost claim: another attempt owns the detour — write nothing (KTD6).
        if (error instanceof GenerationClaimLostError) throw error;
        if (isTransientGenerationError(error)) {
          // Infrastructure-transient exhaustion: release under the fence so the supervisor's
          // bounded attempt budget governs the retry; the detour stays `generating`.
          await bestEffortFencedWrite(() => construction.detours.releaseClaim(fence));
          throw error;
        }
        // Deterministic model/schema/content failure or no-safe-step: record `failed` under the
        // fence, then reject so the operation timeline is honestly failed.
        await bestEffortFencedWrite(() => construction.detours.markFailed(fence));
        throw error;
      }
    }, construction.configHash);
  };
}

// A terminal write after losing the fence must not overwrite the original error or the new
// owner's state (KTD6): a thrown store error is swallowed and a 0-row (false) result ignored —
// the caught generation error stays the meaningful rejection.
async function bestEffortFencedWrite(write: () => Promise<boolean>): Promise<void> {
  try {
    await write();
  } catch {
    // Swallowed: the original generation error is rethrown by the caller.
  }
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
// outline plan (with the bounded feedback re-outline), then probe → child grounding → content →
// congruence per generated label. Returns the ordered surviving steps; the caller owns the
// fenced terminal write.
async function generateSteps(input: {
  construction: ScaffoldGenerationConstruction;
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

  // 3. Execute the settled plan. Verified parent definition passages travel ONLY as grounding
  // anchors (KTD5) — every generated label is probed, then grounded with its OWN generated
  // definitions; boundary verdicts and empty generated definitions drop the step.
  const parentAnchors = scaffoldedAnchorsFor(parent);
  const steps: ScaffoldStep[] = [];
  for (const item of plan.planned) {
    if (item.kind === "reference") {
      steps.push(referenceStep(item.pin, steps.length, newId));
      continue;
    }
    const verdict = await runStage(STAGE_TAGS.knowledgeBoundaryProbe, () =>
      probeKnowledgeBoundary({
        conceptLabel: item.label,
        declaredDomain: parent.declaredDomain,
        probe: construction.knowledgeBoundaryProbe,
        embedding: construction.nodeEmbedding,
        config: config.knowledgeBoundaryProbe
      })
    );
    if (verdict.disposition === "boundary") continue;
    const bundle = await runStage(STAGE_TAGS.groundingGeneration, () =>
      construction.groundingGeneration.generate({
        derivedNodeId: newId(),
        declaredDomain: parent.declaredDomain,
        nodeLabel: item.label,
        scaffoldedAnchors: parentAnchors,
        topic: item.label
      })
    );
    const groundingText = bundle.definitions.map((passage) => passage.text).join("\n\n").trim();
    if (groundingText.length === 0) continue;
    const accepted = await generateCongruentStep({ construction, parent, term: input.detour.term, stepLabel: item.label, groundingText, runStage, newId });
    if (!accepted) continue;
    steps.push({ scaffoldStepId: newId(), ordinal: steps.length, kind: "generated", payload: accepted, lessonReadAt: null });
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
function scaffoldedAnchorsFor(parent: DerivedGraphNode): { conceptId: string; canonicalLabel: string; definitionQuotes: string[] }[] {
  const definitionQuotes = (parent.grounding?.passages ?? [])
    .filter((passage) => passage.passageType === "definition")
    .map((passage) => passage.text.trim())
    .filter((text) => text.length > 0);
  if (definitionQuotes.length === 0) return [];
  return [{ conceptId: parent.derivedNodeId, canonicalLabel: parent.label, definitionQuotes }];
}

// Draft one lower-level scaffold node for `stepLabel` and gate it with the congruence re-pick
// (KTD4b). Up to `contentDraftAttempts` content attempts: each builds a valid four-option
// payload, then the judge checks that the content teaches its own label AND is a simpler
// prerequisite of `term`. The FIRST accepted payload wins; a NO drops it and retries within the
// bound; all NO → null (step skipped). The judge grades the teaching not the answer key, so
// option order is normalized before it sees them. A judge infra error accepts the current draft
// (fail-open, rule 16); a content-generation error consumes the attempt and retries.
async function generateCongruentStep(input: {
  construction: ScaffoldGenerationConstruction;
  parent: DerivedGraphNode;
  term: string;
  stepLabel: string;
  groundingText: string;
  runStage: StageBracket;
  newId: () => string;
}): Promise<ScaffoldNodePayload | null> {
  const { construction, runStage } = input;
  for (let attempt = 0; attempt < construction.config.contentDraftAttempts; attempt++) {
    let draft: ScaffoldContentDraft;
    try {
      draft = await runStage(STAGE_TAGS.scaffoldContentGeneration, () =>
        construction.content.generate({ declaredDomain: input.parent.declaredDomain, label: input.stepLabel, groundingText: input.groundingText })
      );
    } catch {
      continue;
    }
    const payload = buildScaffoldNodePayload(input.stepLabel, draft, input.newId);
    if (!payload) continue;
    let verdict;
    try {
      verdict = await runStage(STAGE_TAGS.scaffoldContentCongruence, () =>
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
    } catch {
      // The judge is a quality re-pick, not a provable guarantee — infra failure never drops
      // otherwise-valid support (rule 16). Accept this draft.
      return payload;
    }
    if (verdict.teachesStepLabel && verdict.isSimplerPrerequisite) return payload;
  }
  return null;
}

// Validate a content draft's option shape and build a persistable scaffold node payload, or
// return null when the four-option one-correct-server-keyed invariant fails (KTD10). Citation-
// free and labeled generated end to end (the lesson section provenance is always "generated").
function buildScaffoldNodePayload(label: string, draft: ScaffoldContentDraft, newId: () => string): ScaffoldNodePayload | null {
  const optionTexts = [draft.correctAnswer, ...draft.distractors];
  if (optionTexts.length !== 4) return null;
  if (optionTexts.some((text) => text.trim().length === 0)) return null;
  const normalized = optionTexts.map(normalizeOptionText);
  if (new Set(normalized).size !== normalized.length) return null;
  if (draft.microLesson.trim().length === 0 || draft.question.trim().length === 0) return null;
  const options = optionTexts.map((text, index) => ({ optionId: newId(), text, isCorrect: index === 0 }));
  return {
    scaffoldNodeId: newId(),
    label,
    lesson: [{ kind: "definition", text: draft.microLesson, groundingProvenance: "generated" }],
    item: { scaffoldItemId: newId(), question: draft.question, explanation: draft.explanation, options }
  };
}
