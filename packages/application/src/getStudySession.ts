import type {
  CalibrationVerdictStorePort,
  EnrichmentLayerPurposeStorePort,
  LessonReadStorePort,
  RecallChallengeStorePort,
  ResponseLogStorePort,
  ScaffoldReferenceActivityReadPort,
  ScaffoldDetourStorePort
} from "@lrnki/ports";
import { deriveFlooredExpedition } from "./expeditionSections";
import {
  learnerKnowledgeCapabilityIsAvailable,
  type LearnerKnowledgeAvailability
} from "./learnerKnowledgeAvailability";
import { eligibleRecallItems, projectRecallScopeStatuses } from "./recallChallenge";
import type { SourceExpeditionModule } from "./sourceExpedition";
import { composeStudySession, type StudySession } from "./studySessionProjection";

// The reading use-case for the Study Session (ADR-0027, KTD1/KTD3). It loads through injected
// ports and composes the adaptation with the pure `composeStudySession`, so the Admin Lab and
// the forthcoming Learner App share ONE study orchestration — each app injects its own
// adapters. It CONSUMES the finished
// `DerivedGraphDetail` inspection read model as graph input (a projection may read a read model
// and add compute; ADR-0027 forbids only serving a projection THROUGH a read port), which proves
// existence in one read — no redundant `getLayer` (R4). No write port is imported, so it
// structurally cannot mutate a published graph or the Derived Graph Layer (R10).
export async function getStudySession(input: {
  enrichmentId: string;
  learnerStateRef: string;
  sourceExpeditions: Pick<SourceExpeditionModule, "openOwned">;
  lessonReadStore?: LessonReadStorePort;
  layerPurposeStore?: EnrichmentLayerPurposeStorePort;
  responseLog: ResponseLogStorePort;
  verdictStore: CalibrationVerdictStorePort;
  learnerKnowledgeAvailability: LearnerKnowledgeAvailability;
  // The learner-scoped Scaffold Detour store (plan 2026-07-12-002 U4). Optional so existing
  // callers compose a session with no detours unchanged; the learner API wires it so the finished
  // Study Session carries active detours and the `generatingDetours` polling flag.
  scaffoldStore?: ScaffoldDetourStorePort;
  // Learner-owned pinned neutral activities for reference Support Steps. Wired alongside the
  // scaffold store in production; optional callers with no detours remain unchanged.
  scaffoldReferenceRead?: ScaffoldReferenceActivityReadPort;
  // The Recall Challenge store (plan 2026-07-13-003 U4). Optional so existing callers compose
  // with empty `recallScopes` unchanged; the learner API wires it so the finished session
  // carries the server-owned Guardian scope views. Only the three cheap challenge reads are
  // added — eligibility reuses the items/rows this reader already loaded, through the same
  // pure functions the challenge routes use, so the two surfaces cannot drift.
  challengeStore?: RecallChallengeStorePort;
}): Promise<StudySession | undefined> {
  const opened = await input.sourceExpeditions.openOwned({
    learnerStateRef: input.learnerStateRef,
    enrichmentId: input.enrichmentId
  });
  if (opened.status !== "available") return undefined;
  const { detail, studyItems, lessons, lessonAbsent } = opened.assets;
  const challengeScope = { learnerStateRef: input.learnerStateRef, enrichmentId: input.enrichmentId };
  const qualifiedChallengeScope = {
    ...challengeScope,
    assetSetIdentity: opened.assets.expectedAssets.assetSetIdentity
  };
  const qualifiedConceptLessonIds = new Set(opened.assets.expectedAssets.currentConceptLessonIds);
  const qualifiedStudyItemIds = new Set(opened.assets.expectedAssets.currentStudyItemIds);

  const [lessonReads, rows, verdicts, layerPurpose, detours, referenceActivities, challenges, wonScopes, exposure] = await Promise.all([
    input.lessonReadStore ? input.lessonReadStore.listForLearner(input.learnerStateRef) : Promise.resolve([]),
    input.responseLog.listForLearner(input.learnerStateRef),
    input.verdictStore.listForLearner(input.learnerStateRef),
    input.layerPurposeStore ? input.layerPurposeStore.get(input.enrichmentId) : Promise.resolve(undefined),
    input.scaffoldStore
      ? input.scaffoldStore.listActiveForLearnerEnrichment(input.learnerStateRef, input.enrichmentId)
          .then((rows) => rows
            .map((detour) => learnerAvailableScaffoldDetour(
              detour,
              input.learnerKnowledgeAvailability,
              qualifiedConceptLessonIds,
              qualifiedStudyItemIds
            ))
            .filter((detour) => detour !== undefined))
      : Promise.resolve([]),
    input.scaffoldReferenceRead ? input.scaffoldReferenceRead.listForLearnerEnrichment(challengeScope) : Promise.resolve([]),
    input.challengeStore ? input.challengeStore.listForLearnerEnrichment(qualifiedChallengeScope) : Promise.resolve([]),
    input.challengeStore ? input.challengeStore.listWonScopes(qualifiedChallengeScope) : Promise.resolve([]),
    input.challengeStore ? input.challengeStore.priorExposure(qualifiedChallengeScope) : Promise.resolve({})
  ]);

  let recallScopes: StudySession["recallScopes"] = [];
  if (input.challengeStore) {
    const { summit, sections } = deriveFlooredExpedition(detail);
    const sectionOf = new Map<string, number>();
    for (const section of sections) {
      for (const nodeId of section.stepDerivedNodeIds) sectionOf.set(nodeId, section.sectionIndex);
    }
    recallScopes = projectRecallScopeStatuses({
      nodes: detail.nodes,
      sections,
      summit,
      eligible: eligibleRecallItems({ items: studyItems, rows, exposure, sectionIndexFor: (nodeId) => sectionOf.get(nodeId) }),
      challenges,
      wonScopes
    });
  }

  return composeStudySession({
    enrichmentId: input.enrichmentId,
    learnerStateRef: input.learnerStateRef,
    detail,
    studyItems,
    lessons,
    lessonAbsent,
    lessonReads: lessonReads.map((read) => read.derivedNodeId),
    rows,
    verdicts,
    layerPurpose: layerPurpose ?? null,
    detours,
    referenceActivities,
    recallScopes
  });
}

function learnerAvailableScaffoldDetour(
  detour: Awaited<ReturnType<ScaffoldDetourStorePort["listActiveForLearnerEnrichment"]>>[number],
  availability: LearnerKnowledgeAvailability,
  qualifiedConceptLessonIds: ReadonlySet<string>,
  qualifiedStudyItemIds: ReadonlySet<string>
): Awaited<ReturnType<ScaffoldDetourStorePort["listActiveForLearnerEnrichment"]>>[number] | undefined {
  const generatedAvailable = learnerKnowledgeCapabilityIsAvailable(availability, "generatedSupportSteps");
  const referenceAvailable = learnerKnowledgeCapabilityIsAvailable(availability, "referenceSupportSteps");
  // Exact references now publish synchronously. A generating/failed aggregate therefore belongs
  // only to the held generated path and cannot appear merely because references are available.
  if (detour.status === "generating" || detour.status === "failed") {
    return generatedAvailable ? detour : undefined;
  }
  if (detour.status !== "ready" || detour.steps.length === 0) return undefined;

  // Preserve every historical row in the store while projecting only step kinds enabled now.
  // Reference pins additionally must belong to this just-opened qualified Source Expedition
  // snapshot; superseded/changed pins remain auditable but cannot become learner-ready content.
  const steps = detour.steps.filter((step) => step.kind === "generated"
    ? generatedAvailable
    : referenceAvailable
      && qualifiedConceptLessonIds.has(step.referencedConceptLessonId)
      && qualifiedStudyItemIds.has(step.referencedStudyItemId));
  return steps.length > 0 ? { ...detour, steps } : undefined;
}
