import { randomUUID } from "node:crypto";
import {
  DEFAULT_SCAFFOLD_GENERATION_CONFIG,
  probeKnowledgeBoundary,
  runInstrumentedOperation,
  runScaffoldGeneration,
  type ScaffoldGenerationDeps,
  type ScaffoldGroundResult,
  type ScaffoldParentContext,
  type StageBracket
} from "@lrnki/application";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type { DerivedGraphNode } from "@lrnki/ports";
import {
  createGroundingGenerationPort,
  createKnowledgeBoundaryProbePort,
  createNeuralClients,
  createScaffoldContentCongruencePort,
  createScaffoldContentPort,
  createScaffoldOutlinePort,
  LiteLlmNodeEmbeddingAdapter,
  scaffoldGenerationConfigHash
} from "@lrnki/infrastructure-litellm";
import {
  PostgresConceptLessonStore,
  PostgresEnrichmentInspectionRead,
  PostgresLearnerScaffoldStore,
  PostgresRunProgressReporter,
  PostgresStudyItemBankStore
} from "@lrnki/infrastructure-postgres";
import type { DatabaseClient } from "./db";

// Learner-Scoped Scaffold generation, API composition (plan 2026-07-12-002 U3, KTD6/KTD7). The
// deep pure module `runScaffoldGeneration` (application) owns the exact-reuse / outline /
// grounding / content / validation / atomic-publish policy; this file binds its injected seams to
// production adapters and wraps the whole attempt in the shared operation instrumentation so the
// two scaffold stages plus the SHARED knowledge-boundary-probe + grounding-generation stages
// attribute spend and wall-clock under this attempt's `scaffold` operation id. The operation id
// IS the fencing token (KTD7), minted by the store's claim.

// Parent grounding is "sufficient" to skip the probe when the parent node carries at least this
// much verified inline grounding text (R21). Below it, a generated sub-concept is probed before
// source-less synthesis.
const SUFFICIENT_PARENT_GROUNDING_CHARS = 200;

type ScaffoldContext = ReturnType<typeof buildScaffoldContext>;

function buildScaffoldContext(sql: DatabaseClient) {
  const { deterministicClient, probeClient, embeddingClient } = createNeuralClients();
  return {
    scaffoldStore: new PostgresLearnerScaffoldStore(sql),
    enrichmentRead: new PostgresEnrichmentInspectionRead(sql),
    studyItemStore: new PostgresStudyItemBankStore(sql),
    conceptLessonStore: new PostgresConceptLessonStore(sql),
    reporter: new PostgresRunProgressReporter(sql),
    outline: createScaffoldOutlinePort(deterministicClient),
    content: createScaffoldContentPort(deterministicClient),
    // The generation-time congruence re-pick shares the SAME cross-family independent judge on the
    // moderate-temperature client the audit uses (plan 2026-07-16-001 U5, KTD4b) — the scaffold
    // generator never grades its own output.
    congruence: createScaffoldContentCongruencePort(probeClient),
    knowledgeBoundaryProbe: createKnowledgeBoundaryProbePort(probeClient),
    nodeEmbedding: new LiteLlmNodeEmbeddingAdapter(embeddingClient),
    groundingGeneration: createGroundingGenerationPort(deterministicClient)
  };
}

// Verified inline grounding for a parent node, when the Derived Graph Detail carries any (R21).
// A node with no grounding view (e.g. a document-anchored node whose grounding is not stitched
// into the inspection model) routes its sub-concepts through the probe.
function parentGroundingText(node: DerivedGraphNode): string | null {
  if (!node.grounding) return null;
  const text = node.grounding.passages
    .filter((passage) => passage.passageType === "definition")
    .map((passage) => passage.text)
    .join("\n\n")
    .trim();
  return text.length > 0 ? text : null;
}

async function loadParentContext(
  input: { enrichmentId: string; parentDerivedNodeId: string },
  ctx: ScaffoldContext
): Promise<ScaffoldParentContext> {
  const detail = await ctx.enrichmentRead.getDerivedGraphDetail(input.enrichmentId);
  if (!detail) throw new Error(`scaffold generation: enrichment ${input.enrichmentId} not found`);
  const parent = detail.nodes.find((node) => node.derivedNodeId === input.parentDerivedNodeId);
  if (!parent) throw new Error(`scaffold generation: parent node ${input.parentDerivedNodeId} not in enrichment`);

  const [studyItems, lessons] = await Promise.all([
    ctx.studyItemStore.listStudyItemsForEnrichment(input.enrichmentId),
    ctx.conceptLessonStore.listLessonsForEnrichment(input.enrichmentId)
  ]);
  const nodesWithLesson = new Set(lessons.map((lesson) => lesson.derivedNodeId));
  const nodesWithOptionSelect = new Set(
    studyItems.filter((item) => item.itemType === "option_select").map((item) => item.derivedNodeId)
  );
  const lessonByNode = new Map(lessons.map((lesson) => [lesson.derivedNodeId, lesson]));
  const optionSelectByNode = new Map(
    studyItems.filter((item) => item.itemType === "option_select").map((item) => [item.derivedNodeId, item])
  );

  // Reuse is scoped to the parent's OWN layer + Declared Domain (KTD3, R8). `isLocked` marks the
  // trail-included/locked case (R10); the finished Derived Graph Detail does not carry per-learner
  // trail inclusion, so a candidate is never treated as locked here — the pure resolver still
  // excludes the parent itself and requires a lesson + option-select, and frontier/mastered/floored
  // nodes are explicitly usable.
  const reuseCandidates = detail.nodes
    .filter((node) => node.declaredDomain === parent.declaredDomain)
    .map((node) => ({
      derivedNodeId: node.derivedNodeId,
      canonicalLabel: node.label,
      aliases: node.aliases,
      declaredDomain: node.declaredDomain,
      hasLesson: nodesWithLesson.has(node.derivedNodeId),
      hasOptionSelect: nodesWithOptionSelect.has(node.derivedNodeId),
      conceptLessonId: lessonByNode.get(node.derivedNodeId)?.conceptLessonId ?? null,
      studyItemId: optionSelectByNode.get(node.derivedNodeId)?.studyItemId ?? null,
      isLocked: false
    }));

  return {
    declaredDomain: parent.declaredDomain,
    parentLabel: parent.label,
    parentDerivedNodeId: parent.derivedNodeId,
    reuseCandidates,
    parentGroundingText: parentGroundingText(parent)
  };
}

// The SHARED_STAGES grounding seam (KTD7, R21/R22): reuse sufficient parent grounding, otherwise
// probe before synthesizing a source-less sub-concept; a boundary verdict DROPS the step.
function groundConcept(ctx: ScaffoldContext, runStage: StageBracket) {
  return async (input: { label: string; declaredDomain: string; parentGroundingText: string | null }): Promise<ScaffoldGroundResult> => {
    if (input.parentGroundingText && input.parentGroundingText.trim().length >= SUFFICIENT_PARENT_GROUNDING_CHARS) {
      return { kind: "grounded", groundingText: input.parentGroundingText.trim() };
    }
    const verdict = await runStage(STAGE_TAGS.knowledgeBoundaryProbe, () =>
      probeKnowledgeBoundary({
        conceptLabel: input.label,
        declaredDomain: input.declaredDomain,
        probe: ctx.knowledgeBoundaryProbe,
        embedding: ctx.nodeEmbedding,
        config: DEFAULT_SCAFFOLD_GENERATION_CONFIG.knowledgeBoundaryProbe
      })
    );
    if (verdict.disposition === "boundary") return { kind: "boundary" };
    const bundle = await runStage(STAGE_TAGS.groundingGeneration, () =>
      ctx.groundingGeneration.generate({
        derivedNodeId: randomUUID(),
        declaredDomain: input.declaredDomain,
        nodeLabel: input.label,
        scaffoldedAnchors: [],
        topic: input.label
      })
    );
    const groundingText = bundle.definitions.map((passage) => passage.text).join("\n\n").trim();
    if (groundingText.length === 0) return { kind: "boundary" };
    return { kind: "grounded", groundingText };
  };
}

// `sql` is the supervisor's shared pool — this run borrows it and never closes it. `operationId`
// is the claim's fresh operation/fencing UUID (KTD7); the store already installed it.
export async function runLearnerScaffoldGeneration(
  input: { detourId: string; operationId: string; claimToken: string },
  sql: DatabaseClient
): Promise<void> {
  const ctx = buildScaffoldContext(sql);
  // The complete operation config identity (KTD7): all five runtime descriptors + application
  // knobs + embedding model, persisted on the operation_runs row at begin — even when a direct
  // reference reuse opens no neural stage.
  const configHash = scaffoldGenerationConfigHash(DEFAULT_SCAFFOLD_GENERATION_CONFIG);
  await runInstrumentedOperation(ctx.reporter, "scaffold", input.operationId, async (runStage) => {
    const deps: ScaffoldGenerationDeps = {
      scaffoldStore: ctx.scaffoldStore,
      loadParentContext: (loadInput) => loadParentContext(loadInput, ctx),
      outline: {
        model: ctx.outline.model,
        propose: (proposeInput) => runStage(STAGE_TAGS.scaffoldOutlineGeneration, () => ctx.outline.propose(proposeInput))
      },
      content: {
        model: ctx.content.model,
        generate: (generateInput) => runStage(STAGE_TAGS.scaffoldContentGeneration, () => ctx.content.generate(generateInput))
      },
      congruence: {
        model: ctx.congruence.model,
        judge: (judgeInput) => runStage(STAGE_TAGS.scaffoldContentCongruence, () => ctx.congruence.judge(judgeInput))
      },
      groundConcept: groundConcept(ctx, runStage)
    };
    await runScaffoldGeneration({ detourId: input.detourId, claimToken: input.claimToken }, deps);
  }, configHash);
}
