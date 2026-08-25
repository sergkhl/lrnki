import {
  createScaffoldGeneration,
  createSourceLessGroundingAdmission,
  CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY,
  DEFAULT_SCAFFOLD_GENERATION_CONFIG,
  getStudySession,
  type ScaffoldGeneration
} from "@lrnki/application";
import {
  createAnswerKeyVerificationPort,
  createClaimFactualityChallengePort,
  createClaimFactualityJudgmentPort,
  createClaimVerificationAnsweringPort,
  createClaimVerificationQuestionPlanningPort,
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
  PostgresCalibrationVerdictStore,
  PostgresLearnerScaffoldStore,
  PostgresResponseLogStore,
  PostgresRunProgressReporter
} from "@lrnki/infrastructure-postgres";
import type { DatabaseClient } from "./db";
import { createLearnerSourceExpeditions } from "./sourceExpedition";

// Learner-Scoped Scaffold Generation, API composition (plan 2026-07-16-004 KTD8). Construction
// ONLY: neural clients, Postgres adapters, reporter, the complete config identity, and the
// Study Session reader are bound exactly once. Every policy — exact reuse, outline retry,
// probe/child grounding, content, congruence, stage ordering, failure classification, and the
// fenced terminal write — lives in the application factory. `sql` is the supervisor's shared
// pool; the composition borrows it and never closes it.
export function createLearnerScaffoldGeneration(sql: DatabaseClient): ScaffoldGeneration {
  const { deterministicClient, probeClient, embeddingClient } = createNeuralClients();
  const responseLog = new PostgresResponseLogStore(sql);
  const verdictStore = new PostgresCalibrationVerdictStore(sql);
  const sourceExpeditions = createLearnerSourceExpeditions(
    sql,
    CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY
  );
  const knowledgeBoundaryProbe = createKnowledgeBoundaryProbePort(probeClient);
  const nodeEmbedding = new LiteLlmNodeEmbeddingAdapter(embeddingClient);
  const groundingGeneration = createGroundingGenerationPort(deterministicClient);
  const claimVerificationQuestionPlanning = createClaimVerificationQuestionPlanningPort(deterministicClient);
  const claimVerificationAnswering = createClaimVerificationAnsweringPort(deterministicClient);
  const claimFactualityJudgments = [
    createClaimFactualityJudgmentPort(deterministicClient),
    createClaimFactualityChallengePort(deterministicClient)
  ] as const;
  const sourceLessGroundingAdmission = createSourceLessGroundingAdmission({
    knowledgeBoundaryProbe,
    embedding: nodeEmbedding,
    groundingGeneration,
    claimVerificationQuestionPlanning,
    claimVerificationAnswering,
    claimFactualityJudgments,
    policy: DEFAULT_SCAFFOLD_GENERATION_CONFIG.sourceLessGroundingAdmission
  });
  return createScaffoldGeneration({
    detours: new PostgresLearnerScaffoldStore(sql),
    // The opening Study Session IS the exact-reuse authority (KTD2): the same projection the
    // learner plays from decides included/locked state, confidently floored membership, and the
    // current pinnable neutral lesson/item identities.
    readStudySession: ({ enrichmentId, learnerStateRef }) =>
      getStudySession({
        enrichmentId,
        learnerStateRef,
        sourceExpeditions,
        responseLog,
        verdictStore,
        learnerKnowledgeAvailability: CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY
      }),
    learnerKnowledgeAvailability: CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY,
    outline: createScaffoldOutlinePort(deterministicClient),
    content: createScaffoldContentPort(deterministicClient),
    // The generation-time congruence re-pick shares the SAME cross-family independent judge on
    // the moderate-temperature client the audit uses — the scaffold generator never grades its
    // own output.
    congruence: createScaffoldContentCongruencePort(probeClient),
    sourceLessGroundingAdmission,
    claimVerificationQuestionPlanning,
    claimVerificationAnswering,
    claimFactualityJudgments,
    answerKeyVerification: createAnswerKeyVerificationPort(deterministicClient),
    reporter: new PostgresRunProgressReporter(sql),
    config: DEFAULT_SCAFFOLD_GENERATION_CONFIG,
    configHash: scaffoldGenerationConfigHash(DEFAULT_SCAFFOLD_GENERATION_CONFIG)
  });
}
