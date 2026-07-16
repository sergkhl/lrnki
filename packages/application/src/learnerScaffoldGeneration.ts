import { randomUUID } from "node:crypto";
import { normalizeConceptLabel, type ScaffoldNodePayload, type ScaffoldStep } from "@lrnki/domain-core";
import type { ScaffoldContentDraft, ScaffoldContentPort, ScaffoldContentCongruencePort, ScaffoldDetourStorePort, ScaffoldOutlinePort } from "@lrnki/ports";
import { scaffoldMicroLessonText } from "./auditScaffoldContent";
import { normalizeOptionText } from "./optionSelectGuard";

// Learner-Scoped Scaffold generation (plan 2026-07-12-002 U3, KTD6/KTD9). A deep application
// module: a claimed pending detour becomes one to three safe existing references or generated
// scaffold nodes, or fails without a partial visible branch. Exact reuse, the minimal outline,
// grounding (probe + generation are injected as `groundConcept`), compact content generation,
// option-shape validation, and the atomic fenced publish are bound here. The neutral Study Item
// Bank and Derived Graph Layer are NEVER written — no such port is reachable from the deps.

// A candidate node in the parent's own layer + Declared Domain that a term could reuse (KTD3).
export type ScaffoldReuseCandidate = {
  derivedNodeId: string;
  canonicalLabel: string;
  aliases: string[];
  declaredDomain: string;
  hasLesson: boolean;
  hasOptionSelect: boolean;
  // A locked/included node in the active trail cannot be referenced as support (R10).
  isLocked: boolean;
};

export type ScaffoldParentContext = {
  declaredDomain: string;
  parentLabel: string;
  parentDerivedNodeId: string;
  // Exact-reuse is scoped to the parent's OWN layer + Declared Domain (KTD3); cross-layer reuse
  // is out of scope. Candidates are pre-filtered to the parent node's Declared Domain.
  reuseCandidates: ScaffoldReuseCandidate[];
  // Verified parent/layer grounding text reused when sufficient (R21); may be null.
  parentGroundingText: string | null;
};

// Encapsulates the Knowledge-Boundary Probe + grounding-generation SHARED_STAGES (KTD7): reuse
// verified grounding when sufficient, otherwise probe before synthesizing a source-less concept.
// Returns grounded text, or a boundary verdict that DROPS the step (R21/R22).
export type ScaffoldGroundResult =
  | { kind: "grounded"; groundingText: string }
  | { kind: "boundary" };

export type ScaffoldGenerationDeps = {
  scaffoldStore: ScaffoldDetourStorePort;
  loadParentContext: (input: { enrichmentId: string; parentDerivedNodeId: string }) => Promise<ScaffoldParentContext>;
  outline: ScaffoldOutlinePort;
  content: ScaffoldContentPort;
  // Generation-time label↔content congruence re-pick (plan 2026-07-16-001 U5, KTD4b). The SAME
  // cross-family independent judge the audit uses, called K=1 per drafted step: the scaffold
  // generator never grades its own output. A quality re-pick, not a provable gate — it fails OPEN
  // on judge infra error (rule 16) so a flaky judge call never drops otherwise-valid support.
  congruence: ScaffoldContentCongruencePort;
  groundConcept: (input: { label: string; declaredDomain: string; parentGroundingText: string | null }) => Promise<ScaffoldGroundResult>;
  newId?: () => string;
};

type ExactMatch =
  | { kind: "reference"; derivedNodeId: string }
  | { kind: "none" }
  | { kind: "unusable" };

// Resolve ONE unambiguous, usable exact match within the parent's layer (KTD3, R8/R10). PURE.
// A unique non-parent, non-locked match with a lesson + option-select becomes a reference; an
// ambiguous or unusable collision is `unusable` (never cloned, never a reference); no match is
// `none`.
export function resolveExactMatch(term: string, candidates: readonly ScaffoldReuseCandidate[], parentDerivedNodeId: string): ExactMatch {
  const normalized = normalizeConceptLabel(term);
  if (normalized.length === 0) return { kind: "none" };
  const matches = candidates.filter((candidate) =>
    normalizeConceptLabel(candidate.canonicalLabel) === normalized ||
    candidate.aliases.some((alias) => normalizeConceptLabel(alias) === normalized));
  if (matches.length === 0) return { kind: "none" };
  if (matches.length > 1) return { kind: "unusable" };
  const match = matches[0];
  if (match.derivedNodeId === parentDerivedNodeId) return { kind: "unusable" };
  if (match.isLocked) return { kind: "unusable" };
  if (!match.hasLesson || !match.hasOptionSelect) return { kind: "unusable" };
  return { kind: "reference", derivedNodeId: match.derivedNodeId };
}

// Validate a content draft's option shape and build a persistable scaffold node payload, or
// return null when the four-option one-correct-server-keyed invariant fails (KTD10). Citation-
// free and labeled generated end to end (the lesson section provenance is always "generated").
export function buildScaffoldNodePayload(
  label: string,
  draft: ScaffoldContentDraft,
  newId: () => string
): ScaffoldNodePayload | null {
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

export type ScaffoldGenerationOutcome =
  | { kind: "published"; stepCount: number }
  | { kind: "failed"; reason: string };

// Run generation for ONE already-claimed detour under its fencing token. Publishes one to three
// surviving safe steps atomically or records failure; never leaves a partial visible branch.
export async function runScaffoldGeneration(
  input: { detourId: string; claimToken: string },
  deps: ScaffoldGenerationDeps
): Promise<ScaffoldGenerationOutcome> {
  const newId = deps.newId ?? randomUUID;
  const detour = await deps.scaffoldStore.getById(input.detourId);
  if (!detour) return { kind: "failed", reason: "detour not found" };
  const context = await deps.loadParentContext({ enrichmentId: detour.enrichmentId, parentDerivedNodeId: detour.parentDerivedNodeId });

  const usedNodeIds = new Set<string>();
  const steps: ScaffoldStep[] = [];
  const pushReference = (derivedNodeId: string): void => {
    if (usedNodeIds.has(derivedNodeId)) return;
    usedNodeIds.add(derivedNodeId);
    steps.push({ scaffoldStepId: newId(), ordinal: steps.length, kind: "reference", referencedDerivedNodeId: derivedNodeId });
  };

  // 1. Direct selected-term reuse: a unique usable exact match bypasses ALL new LLM calls (AE3).
  const direct = resolveExactMatch(detour.term, context.reuseCandidates, context.parentDerivedNodeId);
  if (direct.kind === "reference") {
    pushReference(direct.derivedNodeId);
    return publishSteps(deps, input, steps);
  }

  // 2. Otherwise request the minimal lower-level outline.
  let outline;
  try {
    outline = await deps.outline.propose({
      declaredDomain: context.declaredDomain,
      parentLabel: context.parentLabel,
      term: detour.term,
      existingLabels: context.reuseCandidates.map((candidate) => candidate.canonicalLabel)
    });
  } catch (error) {
    await deps.scaffoldStore.markFailed({ detourId: input.detourId, claimToken: input.claimToken });
    return { kind: "failed", reason: `outline generation failed: ${error instanceof Error ? error.message : String(error)}` };
  }

  for (const proposed of outline.steps.slice(0, 3)) {
    // 2a. Each outline label passes the same exact-match rule; a usable match becomes a
    // reference and is never cloned (AE4).
    const match = resolveExactMatch(proposed.label, context.reuseCandidates, context.parentDerivedNodeId);
    if (match.kind === "reference") {
      pushReference(match.derivedNodeId);
      continue;
    }
    // 2b. Generate a genuinely lower-level scaffold node. Boundary concepts are dropped (R22).
    const grounded = await deps.groundConcept({ label: proposed.label, declaredDomain: context.declaredDomain, parentGroundingText: context.parentGroundingText });
    if (grounded.kind === "boundary") continue;
    // Bounded congruence re-pick (KTD4b): a drafted step must TEACH its own label AND be a
    // genuinely SIMPLER prerequisite of the term. A congruence NO drops the draft and retries
    // once; a second NO skips the step (it falls into the "no safe step survived" path). A
    // content-generation error or judge infra error never blocks — the former retries, the latter
    // accepts the draft (fail-open, rule 16).
    const accepted = await generateCongruentStep(deps, context, detour.term, proposed.label, grounded.groundingText, newId);
    if (!accepted) continue;
    steps.push({ scaffoldStepId: newId(), ordinal: steps.length, kind: "generated", payload: accepted, lessonReadAt: null });
    if (steps.length >= 3) break;
  }

  return publishSteps(deps, input, steps);
}

// Draft one lower-level scaffold node for `stepLabel` and gate it with the congruence re-pick
// (KTD4b). Up to two content attempts: each builds a valid four-option payload, then the judge
// checks that the content teaches its own label AND is a simpler prerequisite of `term`. The
// FIRST accepted payload wins; a NO drops it and retries once; both NO -> null (step skipped).
// The judge grades the teaching not the answer key, so option order is normalized before it sees
// them. A judge infra error accepts the current draft (fail-open, rule 16). PURE except its deps.
async function generateCongruentStep(
  deps: ScaffoldGenerationDeps,
  context: ScaffoldParentContext,
  term: string,
  stepLabel: string,
  groundingText: string,
  newId: () => string
): Promise<ScaffoldNodePayload | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let draft: ScaffoldContentDraft;
    try {
      draft = await deps.content.generate({ declaredDomain: context.declaredDomain, label: stepLabel, groundingText });
    } catch {
      continue;
    }
    const payload = buildScaffoldNodePayload(stepLabel, draft, newId);
    if (!payload) continue;
    let verdict;
    try {
      verdict = await deps.congruence.judge({
        declaredDomain: context.declaredDomain,
        term,
        parentLabel: context.parentLabel,
        stepLabel,
        microLesson: scaffoldMicroLessonText(payload),
        question: payload.item.question,
        explanation: payload.item.explanation,
        options: payload.item.options.map((option) => option.text).sort((a, b) => a.localeCompare(b))
      });
    } catch {
      // The judge is a quality re-pick, not a provable guarantee — infra failure never drops
      // otherwise-valid support (rule 16). Accept this draft.
      return payload;
    }
    if (verdict.teachesStepLabel && verdict.isSimplerPrerequisite) return payload;
  }
  return null;
}

// Atomic terminal write: publish one to three surviving steps guarded by the claim token, or
// fail when none survive / the fence is lost (R16/R22, KTD9).
async function publishSteps(
  deps: ScaffoldGenerationDeps,
  input: { detourId: string; claimToken: string },
  steps: ScaffoldStep[]
): Promise<ScaffoldGenerationOutcome> {
  if (steps.length === 0) {
    await deps.scaffoldStore.markFailed({ detourId: input.detourId, claimToken: input.claimToken });
    return { kind: "failed", reason: "no safe support step survived" };
  }
  const published = await deps.scaffoldStore.publishReady({ detourId: input.detourId, claimToken: input.claimToken, steps });
  if (!published) return { kind: "failed", reason: "publish fence rejected (stale claim)" };
  return { kind: "published", stepCount: steps.length };
}
