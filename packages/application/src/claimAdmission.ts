import type { GroundingAdmissionContext } from "@lrnki/domain-core";
import type {
  ClaimFactualityJudgmentPort,
  ClaimVerificationAnsweringPort,
  ClaimVerificationQuestionPlanningPort,
  StageErrorDetail
} from "@lrnki/ports";
import type { StageBracket } from "./runProgressReporter";
import { SOURCE_LESS_GROUNDING_ADMISSION_STAGE_GROUP } from "./topicExpeditionStageProfile";

// This is an application-internal seam. Source-less Grounding Admission and, in U3, generated
// Support Step assurance reuse it without exposing neural planning, answer correlation, or
// judgment mechanics through either module's external interface.
export type PositiveClaimTarget = Readonly<{
  targetKey: string;
  targetPurpose: "definition" | "support";
  text: string;
}>;

export type ClaimJudgment = Readonly<{
  targetKey: string;
  disposition: "accepted" | "rejected";
  rationale: string;
}>;

export type PositiveClaimSet = Readonly<{
  candidateKey: string;
  canonicalLabel: string;
  declaredDomain: string;
  context: GroundingAdmissionContext;
  targets: readonly PositiveClaimTarget[];
}>;

export type ClaimAdmission = {
  forOperation(stage: StageBracket): {
    admitBatch(claimSets: readonly PositiveClaimSet[]): Promise<readonly {
      candidateKey: string;
      judgments: readonly ClaimJudgment[];
    }[]>;
  };
};

type ClaimAdmissionConstruction = Readonly<{
  questionPlanning: ClaimVerificationQuestionPlanningPort;
  answering: ClaimVerificationAnsweringPort;
  factualityJudgments: readonly [ClaimFactualityJudgmentPort, ClaimFactualityJudgmentPort];
  verificationSampleCount: number;
  verificationDecision: "same_model_replicated_rejection";
  verificationRejectionSampleQuorum: number;
  judgmentTargetBatchSize: 1;
  verificationExecution: Readonly<{
    questionPlanningConcurrency: number;
    answeringConcurrency: number;
    factualityJudgmentConcurrency: number;
  }>;
}>;

type VerificationRequest = Readonly<{
  claimSet: PositiveClaimSet;
  sampleIndex: number;
  targetIndexes: readonly number[];
}>;

type SampledJudgment = Readonly<{
  candidateKey: string;
  targetIndex: number;
  verdictIndex: number;
  judgment: ClaimJudgment;
}>;

export function createClaimAdmission(construction: ClaimAdmissionConstruction): ClaimAdmission {
  if (!Number.isInteger(construction.verificationSampleCount) || construction.verificationSampleCount < 2) {
    throw new Error("Claim admission verificationSampleCount must be an integer of at least 2.");
  }
  for (const [name, value] of [
    ["questionPlanningConcurrency", construction.verificationExecution.questionPlanningConcurrency],
    ["answeringConcurrency", construction.verificationExecution.answeringConcurrency],
    ["factualityJudgmentConcurrency", construction.verificationExecution.factualityJudgmentConcurrency]
  ] as const) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`Claim admission verificationExecution.${name} must be a positive integer.`);
    }
  }
  if (construction.judgmentTargetBatchSize !== 1) {
    throw new Error("Claim admission judgmentTargetBatchSize must be exactly 1.");
  }
  if (construction.factualityJudgments.length !== 2) {
    throw new Error("Claim admission requires exactly two initial factuality judgment models.");
  }
  if (construction.verificationDecision !== "same_model_replicated_rejection") {
    throw new Error("Claim admission received an unknown verificationDecision.");
  }
  if (!Number.isInteger(construction.verificationRejectionSampleQuorum)
    || construction.verificationRejectionSampleQuorum < 2
    || construction.verificationRejectionSampleQuorum > construction.verificationSampleCount) {
    throw new Error(`Claim admission verificationRejectionSampleQuorum must be an integer from 2 through ${construction.verificationSampleCount}.`);
  }
  const judgmentModels = construction.factualityJudgments.map((judgment) => judgment.model.trim());
  if (judgmentModels.some((model) => model.length === 0) || new Set(judgmentModels).size !== judgmentModels.length) {
    throw new Error("Claim admission factuality judgment models must be non-empty and distinct.");
  }

  return {
    forOperation(stage) {
      return {
        async admitBatch(claimSets) {
          if (claimSets.length === 0) return [];
          validateClaimSets(claimSets);

          const samplesByCandidate = new Map<string, ClaimJudgment[][]>();
          const candidateOrder = new Map(claimSets.map((claimSet, index) => [claimSet.candidateKey, index] as const));

          const collectSampleWave = (verificationRequests: readonly VerificationRequest[]) =>
            collectVerificationSampleWave({
              construction,
              stage,
              verificationRequests,
              candidateOrder
            });

          const recordSamples = (sampledJudgments: Awaited<ReturnType<typeof collectSampleWave>>) => {
            for (const sample of sampledJudgments) {
              const existing = samplesByCandidate.get(sample.candidateKey) ?? [];
              const verdict = existing[sample.verdictIndex] ?? [];
              verdict[sample.targetIndex] = sample.judgment;
              existing[sample.verdictIndex] = verdict;
              samplesByCandidate.set(sample.candidateKey, existing);
            }
          };

          // Sample the complete verification chain, not only the terminal judge. A repeated judge
          // over one shared question/answer packet is still correlated: one framing error can make
          // every judgment agree. Start with the rejection quorum of independently planned,
          // draft-blind packets. A target with no objection or an already replicated objection is
          // settled; only an unresolved outlier receives the remaining bounded sample budget.
          const initialSampleCount = construction.verificationRejectionSampleQuorum;
          const initialRequests = claimSets.flatMap((claimSet) =>
            Array.from({ length: initialSampleCount }, (_, sampleIndex) => ({
              claimSet,
              sampleIndex,
              targetIndexes: claimSet.targets.map((_, targetIndex) => targetIndex)
            }))
          );
          recordSamples(await collectSampleWave(initialRequests));

          for (let sampleIndex = initialSampleCount; sampleIndex < construction.verificationSampleCount; sampleIndex += 1) {
            const disagreementRequests = claimSets.flatMap((claimSet): VerificationRequest[] => {
              const samples = samplesByCandidate.get(claimSet.candidateKey) ?? [];
              const targetIndexes = unresolvedTargetIndexes(
                claimSet,
                samples,
                sampleIndex,
                construction.factualityJudgments.length,
                construction.verificationRejectionSampleQuorum
              );
              if (targetIndexes.length === 0) return [];
              return [{
                claimSet: { ...claimSet, targets: targetIndexes.map((targetIndex) => claimSet.targets[targetIndex]!) },
                sampleIndex,
                targetIndexes
              }];
            });
            if (disagreementRequests.length === 0) break;
            recordSamples(await collectSampleWave(disagreementRequests));
          }

          return claimSets.map((claimSet) => {
            const samples = samplesByCandidate.get(claimSet.candidateKey) ?? [];
            return {
              candidateKey: claimSet.candidateKey,
              judgments: aggregateVerificationSamples(
                claimSet,
                samples,
                construction.verificationSampleCount,
                initialSampleCount,
                judgmentModels,
                construction.verificationRejectionSampleQuorum
              )
            };
          });
        }
      };
    }
  };
}

type VerificationPipelineRole = "question_planning" | "answering" | "factuality_judgment";

type VerificationPipelineFailure = Readonly<{
  role: VerificationPipelineRole;
  error: unknown;
}>;

type RoleLimiter = Readonly<{
  run<T>(task: () => Promise<T>): Promise<T>;
  abort(failure: VerificationPipelineFailure): void;
  whenSettled(): Promise<void>;
}>;

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
}>;

type PipelineJob = Readonly<{
  task: () => Promise<unknown>;
  resolve(value: unknown): void;
  reject(reason?: unknown): void;
}>;

async function collectVerificationSampleWave(input: Readonly<{
  construction: ClaimAdmissionConstruction;
  stage: StageBracket;
  verificationRequests: readonly VerificationRequest[];
  candidateOrder: ReadonlyMap<string, number>;
}>): Promise<readonly SampledJudgment[]> {
  if (input.verificationRequests.length === 0) return [];

  let firstFailure: VerificationPipelineFailure | undefined;
  const limiters: RoleLimiter[] = [];
  const fail = (role: VerificationPipelineRole, error: unknown) => {
    if (firstFailure) return;
    firstFailure = { role, error };
    for (const limiter of limiters) limiter.abort(firstFailure);
  };
  const getFailure = () => firstFailure;

  const questionPlanning = createRoleLimiter({
    role: "question_planning",
    concurrency: input.construction.verificationExecution.questionPlanningConcurrency,
    expectedTaskCount: input.verificationRequests.length,
    fail,
    getFailure
  });
  const answering = createRoleLimiter({
    role: "answering",
    concurrency: input.construction.verificationExecution.answeringConcurrency,
    expectedTaskCount: input.verificationRequests.length,
    fail,
    getFailure
  });
  const judgmentTaskCount = input.verificationRequests.reduce(
    (total, request) => total + request.claimSet.targets.length * input.construction.factualityJudgments.length,
    0
  );
  const factualityJudgment = createRoleLimiter({
    role: "factuality_judgment",
    concurrency: input.construction.verificationExecution.factualityJudgmentConcurrency,
    expectedTaskCount: judgmentTaskCount,
    fail,
    getFailure
  });
  limiters.push(questionPlanning, answering, factualityJudgment);

  // Open one aggregate bracket for every pipeline role before releasing the first request. The
  // brackets deliberately overlap, but a later disagreement wave cannot open the same stage until
  // all three brackets from this wave have drained and closed.
  const opened = deferred<void>();
  let openedCount = 0;
  const markOpened = () => {
    openedCount += 1;
    if (openedCount === 3) opened.resolve(undefined);
  };
  const startRoleBracket = (
    role: VerificationPipelineRole,
    stageTag: string,
    limiter: RoleLimiter,
    total: number
  ): Promise<void> => {
    let entered = false;
    const bracket = Promise.resolve().then(() => input.stage(stageTag, async () => {
      entered = true;
      markOpened();
      await limiter.whenSettled();
    }, total));
    return bracket.catch((error) => {
      if (!entered) markOpened();
      fail(role, error);
      throw error;
    });
  };
  const stagePromises = [
    startRoleBracket(
      "question_planning",
      SOURCE_LESS_GROUNDING_ADMISSION_STAGE_GROUP.verificationQuestionPlanning.stage,
      questionPlanning,
      input.verificationRequests.length
    ),
    startRoleBracket(
      "answering",
      SOURCE_LESS_GROUNDING_ADMISSION_STAGE_GROUP.verificationAnswering.stage,
      answering,
      input.verificationRequests.length
    ),
    startRoleBracket(
      "factuality_judgment",
      SOURCE_LESS_GROUNDING_ADMISSION_STAGE_GROUP.factualityJudgment.stage,
      factualityJudgment,
      judgmentTaskCount
    )
  ];

  await opened.promise;
  const packetPromises = firstFailure
    ? []
    : input.verificationRequests.map((request) =>
        questionPlanning.run(async () => {
          const questions = await input.construction.questionPlanning.plan({
            declaredDomain: request.claimSet.declaredDomain,
            canonicalLabel: request.claimSet.canonicalLabel,
            context: request.claimSet.context,
            targets: request.claimSet.targets
          });
          validateQuestionPlan(request.claimSet, questions);
          return questions.map((question, index) => ({
            ...question,
            questionKey: `${request.claimSet.candidateKey}:verification:${request.sampleIndex}:question:${index}`
          }));
        }).then((questions) => answering.run(async () => {
          // Answering is intentionally draft-blind: it receives independently planned questions,
          // never the positive targets or generated passages that those questions challenge.
          const answers = await input.construction.answering.answer({
            declaredDomain: request.claimSet.declaredDomain,
            canonicalLabel: request.claimSet.canonicalLabel,
            context: request.claimSet.context,
            questions: questions.map(({ questionKey, question }) => ({ questionKey, question }))
          });
          const answerByKey = validateAnswers(request.claimSet.candidateKey, questions, answers);
          return questions.map((question) => ({
            targetKey: question.targetKey,
            questionKey: question.questionKey,
            question: question.question,
            answer: answerByKey.get(question.questionKey)!
          }));
        })).then((verificationAnswers) =>
          // A judgment call owns exactly one positive target. Both judge families share this one
          // limiter, so their combined physical request fan-out can never exceed the configured cap.
          Promise.all(request.claimSet.targets.flatMap((target, localTargetIndex) =>
            input.construction.factualityJudgments.map((judgment, judgeIndex) =>
              factualityJudgment.run(async () => {
                const targetClaimSet: PositiveClaimSet = { ...request.claimSet, targets: [target] };
                const judgments = await judgment.judge({
                  declaredDomain: request.claimSet.declaredDomain,
                  canonicalLabel: request.claimSet.canonicalLabel,
                  context: request.claimSet.context,
                  targets: targetClaimSet.targets,
                  verificationAnswers: verificationAnswers.filter((answer) => answer.targetKey === target.targetKey)
                });
                return {
                  candidateIndex: input.candidateOrder.get(request.claimSet.candidateKey)!,
                  candidateKey: request.claimSet.candidateKey,
                  sampleIndex: request.sampleIndex,
                  targetIndex: request.targetIndexes[localTargetIndex]!,
                  judgeIndex,
                  verdictIndex: request.sampleIndex * input.construction.factualityJudgments.length + judgeIndex,
                  judgment: validateJudgments(targetClaimSet, judgments)[0]!
                };
              })
            )
          ))
        )
      );

  const [packetSettlements] = await Promise.all([
    Promise.allSettled(packetPromises),
    Promise.allSettled(stagePromises)
  ]);
  if (firstFailure) throw firstFailure.error;

  const unexpectedPacketFailure = packetSettlements.find((result) => result.status === "rejected");
  if (unexpectedPacketFailure?.status === "rejected") throw unexpectedPacketFailure.reason;
  return packetSettlements
    .flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .sort((left, right) =>
      left.candidateIndex - right.candidateIndex
      || left.sampleIndex - right.sampleIndex
      || left.targetIndex - right.targetIndex
      || left.judgeIndex - right.judgeIndex
    )
    .map(({ candidateKey, targetIndex, verdictIndex, judgment }) => ({
      candidateKey,
      targetIndex,
      verdictIndex,
      judgment
    }));
}

function createRoleLimiter(input: Readonly<{
  role: VerificationPipelineRole;
  concurrency: number;
  expectedTaskCount: number;
  fail(role: VerificationPipelineRole, error: unknown): void;
  getFailure(): VerificationPipelineFailure | undefined;
}>): RoleLimiter {
  const queue: PipelineJob[] = [];
  const settled = deferred<void>();
  // A reporter can fail before invoking its bracket body; keep this internal promise handled even
  // when no stage awaits it. Callers of whenSettled still observe the original rejection.
  void settled.promise.catch(() => {});
  let scheduled = 0;
  let completed = 0;
  let active = 0;
  let terminal = false;

  const abortError = (failure: VerificationPipelineFailure) =>
    failure.role === input.role
      ? failure.error
      : new VerificationPipelineUpstreamAbortError(input.role, failure.role);

  const settleIfReady = () => {
    if (terminal) return;
    const failure = input.getFailure();
    if (failure) {
      if (active !== 0) return;
      terminal = true;
      settled.reject(abortError(failure));
      return;
    }
    if (completed === input.expectedTaskCount) {
      terminal = true;
      settled.resolve(undefined);
    }
  };

  const abort = (failure: VerificationPipelineFailure) => {
    const error = abortError(failure);
    for (const job of queue.splice(0)) job.reject(error);
    settleIfReady();
  };

  const pump = () => {
    const failure = input.getFailure();
    if (failure) {
      abort(failure);
      return;
    }
    while (active < input.concurrency && queue.length > 0 && !input.getFailure()) {
      const job = queue.shift()!;
      active += 1;
      void Promise.resolve()
        .then(job.task)
        .then(job.resolve, (error) => {
          job.reject(error);
          input.fail(input.role, error);
        })
        .finally(() => {
          active -= 1;
          completed += 1;
          pump();
          settleIfReady();
        });
    }
    settleIfReady();
  };

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const failure = input.getFailure();
      if (failure) return Promise.reject(abortError(failure));
      scheduled += 1;
      if (scheduled > input.expectedTaskCount) {
        const error = new Error(`Claim admission scheduled too many ${input.role} tasks.`);
        input.fail(input.role, error);
        return Promise.reject(error);
      }
      return new Promise<T>((resolve, reject) => {
        queue.push({
          task,
          resolve: (value) => resolve(value as T),
          reject
        });
        pump();
      });
    },
    abort,
    whenSettled() {
      settleIfReady();
      return settled.promise;
    }
  };
}

class VerificationPipelineUpstreamAbortError extends Error {
  readonly stageErrorDetail: StageErrorDetail;

  constructor(role: VerificationPipelineRole, origin: VerificationPipelineRole) {
    super(`Claim admission ${role} aborted after upstream ${origin} failure.`);
    this.name = "VerificationPipelineUpstreamAbortError";
    this.stageErrorDetail = {
      kind: "other",
      message: `Claim admission ${role} aborted after upstream ${origin} failure.`
    };
  }
}

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"];
  let reject!: Deferred<T>["reject"];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function validateClaimSets(claimSets: readonly PositiveClaimSet[]): void {
  const candidateKeys = new Set<string>();
  for (const claimSet of claimSets) {
    requireExactKeys(claimSet, ["candidateKey", "canonicalLabel", "declaredDomain", "context", "targets"], "claim set");
    requireNonEmptyString(claimSet.candidateKey, "claim-set candidateKey");
    if (candidateKeys.has(claimSet.candidateKey)) {
      throw new Error(`Claim admission received duplicate candidateKey ${JSON.stringify(claimSet.candidateKey)}.`);
    }
    candidateKeys.add(claimSet.candidateKey);
    requireNonEmptyString(claimSet.canonicalLabel, `claim-set canonicalLabel for ${claimSet.candidateKey}`);
    requireNonEmptyString(claimSet.declaredDomain, `claim-set declaredDomain for ${claimSet.candidateKey}`);
    if (!Array.isArray(claimSet.targets) || claimSet.targets.length === 0) {
      throw new Error(`Claim admission requires at least one positive target for ${claimSet.candidateKey}.`);
    }
    const targetKeys = new Set<string>();
    for (const target of claimSet.targets) {
      requireExactKeys(target, ["targetKey", "targetPurpose", "text"], `positive target for ${claimSet.candidateKey}`);
      requireNonEmptyString(target.targetKey, `targetKey for ${claimSet.candidateKey}`);
      if (target.targetPurpose !== "definition" && target.targetPurpose !== "support") {
        throw new Error(`Claim admission received invalid targetPurpose for ${target.targetKey} on ${claimSet.candidateKey}.`);
      }
      requireNonEmptyString(target.text, `target text ${target.targetKey} for ${claimSet.candidateKey}`);
      if (targetKeys.has(target.targetKey)) {
        throw new Error(`Claim admission received duplicate targetKey ${JSON.stringify(target.targetKey)} for ${claimSet.candidateKey}.`);
      }
      targetKeys.add(target.targetKey);
    }
  }
}

function validateQuestionPlan(
  claimSet: PositiveClaimSet,
  questions: readonly { targetKey: string; question: string }[]
): void {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error(`Claim verification planned no questions for ${claimSet.candidateKey}.`);
  }
  const knownTargets = new Set(claimSet.targets.map((target) => target.targetKey));
  const covered = new Set<string>();
  for (const question of questions) {
    requireExactKeys(question, ["targetKey", "question"], `planned question for ${claimSet.candidateKey}`);
    requireNonEmptyString(question.targetKey, `planned targetKey for ${claimSet.candidateKey}`);
    requireNonEmptyString(question.question, `planned question for ${claimSet.candidateKey}`);
    if (!knownTargets.has(question.targetKey)) {
      throw new Error(`Claim verification planned unknown targetKey ${JSON.stringify(question.targetKey)} for ${claimSet.candidateKey}.`);
    }
    covered.add(question.targetKey);
  }
  const missing = claimSet.targets.find((target) => !covered.has(target.targetKey));
  if (missing) {
    throw new Error(`Claim verification did not cover targetKey ${JSON.stringify(missing.targetKey)} for ${claimSet.candidateKey}.`);
  }
}

function validateAnswers(
  candidateKey: string,
  questions: readonly { questionKey: string }[],
  answers: readonly { questionKey: string; answer: string }[]
): Map<string, string> {
  if (!Array.isArray(answers)) {
    throw new Error(`Claim verification answers were not an array for ${candidateKey}.`);
  }
  const knownQuestions = new Set(questions.map((question) => question.questionKey));
  const answerByKey = new Map<string, string>();
  for (const answer of answers) {
    requireExactKeys(answer, ["questionKey", "answer"], `verification answer for ${candidateKey}`);
    requireNonEmptyString(answer.questionKey, `answer questionKey for ${candidateKey}`);
    requireNonEmptyString(answer.answer, `answer text ${answer.questionKey} for ${candidateKey}`);
    if (!knownQuestions.has(answer.questionKey)) {
      throw new Error(`Claim verification returned unknown questionKey ${JSON.stringify(answer.questionKey)} for ${candidateKey}.`);
    }
    if (answerByKey.has(answer.questionKey)) {
      throw new Error(`Claim verification returned duplicate questionKey ${JSON.stringify(answer.questionKey)} for ${candidateKey}.`);
    }
    answerByKey.set(answer.questionKey, answer.answer);
  }
  const missing = questions.find((question) => !answerByKey.has(question.questionKey));
  if (missing) {
    throw new Error(`Claim verification omitted questionKey ${JSON.stringify(missing.questionKey)} for ${candidateKey}.`);
  }
  return answerByKey;
}

function validateJudgments(
  claimSet: PositiveClaimSet,
  judgments: readonly ClaimJudgment[]
): readonly ClaimJudgment[] {
  if (!Array.isArray(judgments)) {
    throw new Error(`Claim factuality judgments were not an array for ${claimSet.candidateKey}.`);
  }
  const knownTargets = new Set(claimSet.targets.map((target) => target.targetKey));
  const judgmentByTarget = new Map<string, ClaimJudgment>();
  for (const judgment of judgments) {
    requireExactKeys(judgment, ["targetKey", "disposition", "rationale"], `claim judgment for ${claimSet.candidateKey}`);
    requireNonEmptyString(judgment.targetKey, `judgment targetKey for ${claimSet.candidateKey}`);
    requireNonEmptyString(judgment.rationale, `judgment rationale ${judgment.targetKey} for ${claimSet.candidateKey}`);
    if (judgment.disposition !== "accepted" && judgment.disposition !== "rejected") {
      throw new Error(`Claim factuality judgment returned invalid disposition for ${judgment.targetKey} on ${claimSet.candidateKey}.`);
    }
    if (!knownTargets.has(judgment.targetKey)) {
      throw new Error(`Claim factuality judgment returned unknown targetKey ${JSON.stringify(judgment.targetKey)} for ${claimSet.candidateKey}.`);
    }
    if (judgmentByTarget.has(judgment.targetKey)) {
      throw new Error(`Claim factuality judgment returned duplicate targetKey ${JSON.stringify(judgment.targetKey)} for ${claimSet.candidateKey}.`);
    }
    judgmentByTarget.set(judgment.targetKey, judgment);
  }
  const missing = claimSet.targets.find((target) => !judgmentByTarget.has(target.targetKey));
  if (missing) {
    throw new Error(`Claim factuality judgment omitted targetKey ${JSON.stringify(missing.targetKey)} for ${claimSet.candidateKey}.`);
  }
  return claimSet.targets.map((target) => judgmentByTarget.get(target.targetKey)!);
}

function aggregateVerificationSamples(
  claimSet: PositiveClaimSet,
  samples: readonly (readonly ClaimJudgment[])[],
  maximumEvidenceSampleCount: number,
  initialSampleCount: number,
  judgmentModels: readonly string[],
  rejectionSampleQuorum: number
): readonly ClaimJudgment[] {
  const judgeCount = judgmentModels.length;
  return claimSet.targets.map((target, targetIndex) => {
    const panelSamples = requireTargetPanelSamples(
      claimSet,
      samples,
      targetIndex,
      initialSampleCount,
      maximumEvidenceSampleCount,
      judgeCount
    );
    const evidenceSampleCount = panelSamples.length;
    const expectedVerdictCount = evidenceSampleCount * judgeCount;
    const targetSamples = panelSamples.flat();
    const accepted = targetSamples.filter((judgment) => judgment.disposition === "accepted");
    const rejectingModels = judgmentModels.flatMap((model, judgeIndex) => {
      const modelSamples = panelSamples.map((sample) => sample[judgeIndex]!);
      const rejections = modelSamples.filter((judgment) => judgment.disposition === "rejected");
      return rejections.length >= rejectionSampleQuorum
        ? [{ model, rejections }]
        : [];
    });
    if (rejectingModels.length === 0) {
      if (targetSamples.some((judgment) => judgment.disposition === "rejected")
        && evidenceSampleCount < maximumEvidenceSampleCount) {
        throw new Error(`Claim verification omitted a required disagreement sample for ${target.targetKey} on ${claimSet.candidateKey}.`);
      }
      const reasons = [...new Set(accepted.map((judgment) => judgment.rationale))].join(" ");
      return {
        targetKey: target.targetKey,
        disposition: "accepted" as const,
        rationale: `Accepted because none of ${judgeCount} judgment models replicated a rejection across ${rejectionSampleQuorum} of ${evidenceSampleCount} independently planned verification samples; ${accepted.length}/${expectedVerdictCount} panel verdicts accepted. ${reasons}`.slice(0, 2_000)
      };
    }
    const reasons = [...new Set(rejectingModels.flatMap(({ rejections }) =>
      rejections.map((judgment) => judgment.rationale)
    ))].join(" ");
    return {
      targetKey: target.targetKey,
      disposition: "rejected" as const,
      rationale: `Rejected because ${rejectingModels.map(({ model }) => model).join(", ")} replicated an objection across at least ${rejectionSampleQuorum} of ${evidenceSampleCount} independently planned verification samples. ${reasons}`.slice(0, 2_000)
    };
  });
}

function unresolvedTargetIndexes(
  claimSet: PositiveClaimSet,
  samples: readonly (readonly ClaimJudgment[])[],
  completedSampleCount: number,
  judgeCount: number,
  rejectionSampleQuorum: number
): number[] {
  return claimSet.targets.flatMap((_, targetIndex) => {
    const panelSamples = requireTargetPanelSamples(
      claimSet,
      samples,
      targetIndex,
      rejectionSampleQuorum,
      completedSampleCount,
      judgeCount
    );
    const hasReplicatedRejection = Array.from({ length: judgeCount }, (_, judgeIndex) =>
      panelSamples.filter((sample) => sample[judgeIndex]!.disposition === "rejected").length
    ).some((rejectionCount) => rejectionCount >= rejectionSampleQuorum);
    const hasAnyRejection = panelSamples.some((sample) =>
      sample.some((judgment) => judgment.disposition === "rejected")
    );
    return hasAnyRejection && !hasReplicatedRejection ? [targetIndex] : [];
  });
}

function requireTargetPanelSamples(
  claimSet: PositiveClaimSet,
  samples: readonly (readonly ClaimJudgment[])[],
  targetIndex: number,
  initialSampleCount: number,
  maximumEvidenceSampleCount: number,
  judgeCount: number
): readonly (readonly ClaimJudgment[])[] {
  const panelSamples: ClaimJudgment[][] = [];
  let foundGap = false;
  for (let sampleIndex = 0; sampleIndex < maximumEvidenceSampleCount; sampleIndex += 1) {
    const panel = Array.from({ length: judgeCount }, (_, judgeIndex) =>
      samples[sampleIndex * judgeCount + judgeIndex]?.[targetIndex]
    );
    const presentCount = panel.filter(Boolean).length;
    if (presentCount === 0) {
      if (sampleIndex < initialSampleCount) {
        throw new Error(`Claim verification omitted a required sample for ${claimSet.candidateKey}.`);
      }
      foundGap = true;
      continue;
    }
    if (foundGap || presentCount !== judgeCount) {
      throw new Error(`Claim verification returned an incomplete panel sample for ${claimSet.candidateKey}.`);
    }
    panelSamples.push(panel as ClaimJudgment[]);
  }
  return panelSamples;
}

function requireExactKeys(value: unknown, expected: readonly string[], label: string): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Claim admission received malformed ${label}.`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new Error(`Claim admission received malformed ${label}; expected fields ${required.join(", ")}.`);
  }
}

function requireNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Claim admission requires a non-empty ${label}.`);
  }
}
