import { STAGE_TAGS, type GroundingAdmissionContext } from "@lrnki/domain-core";
import type {
  ClaimFactualityJudgmentPort,
  ClaimVerificationAnsweringPort,
  ClaimVerificationQuestionPlanningPort,
  DraftBlindClaimEvidence
} from "@lrnki/ports";
import { mapWithConcurrency } from "./mapWithConcurrency";
import type { StageBracket } from "./runProgressReporter";

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
      verificationEvidence: readonly DraftBlindClaimEvidence[];
    }[]>;
  };
};

export function createClaimAdmission(construction: {
  questionPlanning: ClaimVerificationQuestionPlanningPort;
  answering: ClaimVerificationAnsweringPort;
  factualityJudgments: readonly [ClaimFactualityJudgmentPort, ClaimFactualityJudgmentPort];
  verificationSampleCount: number;
  verificationDecision: "same_model_replicated_rejection";
  verificationRejectionSampleQuorum: number;
  judgmentTargetBatchSize: 1;
  verificationConcurrency: number;
}): ClaimAdmission {
  if (!Number.isInteger(construction.verificationSampleCount) || construction.verificationSampleCount < 2) {
    throw new Error("Claim admission verificationSampleCount must be an integer of at least 2.");
  }
  if (!Number.isInteger(construction.verificationConcurrency) || construction.verificationConcurrency < 1) {
    throw new Error("Claim admission verificationConcurrency must be a positive integer.");
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
          const verificationEvidenceByCandidate = new Map<string, DraftBlindClaimEvidence[]>();
          type VerificationRequest = Readonly<{
            claimSet: PositiveClaimSet;
            sampleIndex: number;
            targetIndexes: readonly number[];
          }>;

          const collectSampleWave = async (verificationRequests: readonly VerificationRequest[]) => {
            const planned = await stage(STAGE_TAGS.groundingVerificationQuestionPlanning, () =>
              mapWithConcurrency(verificationRequests, construction.verificationConcurrency, async ({ claimSet, sampleIndex, targetIndexes }) => {
                const questions = await construction.questionPlanning.plan({
                  declaredDomain: claimSet.declaredDomain,
                  canonicalLabel: claimSet.canonicalLabel,
                  context: claimSet.context,
                  targets: claimSet.targets
                });
                validateQuestionPlan(claimSet, questions);
                return {
                  claimSet,
                  sampleIndex,
                  targetIndexes,
                  questions: questions.map((question, index) => ({
                    ...question,
                    questionKey: `${claimSet.candidateKey}:verification:${sampleIndex}:question:${index}`
                  }))
                };
              }), verificationRequests.length
            );

            const answered = await stage(STAGE_TAGS.groundingVerificationAnswering, () =>
              mapWithConcurrency(planned, construction.verificationConcurrency, async ({ claimSet, sampleIndex, targetIndexes, questions }) => {
                const answers = await construction.answering.answer({
                  declaredDomain: claimSet.declaredDomain,
                  canonicalLabel: claimSet.canonicalLabel,
                  context: claimSet.context,
                  questions: questions.map(({ questionKey, question }) => ({ questionKey, question }))
                });
                const answerByKey = validateAnswers(claimSet.candidateKey, questions, answers);
                return {
                  claimSet,
                  sampleIndex,
                  targetIndexes,
                  verificationAnswers: questions.map((question) => ({
                    targetKey: question.targetKey,
                    questionKey: question.questionKey,
                    question: question.question,
                    answer: answerByKey.get(question.questionKey)!
                  }))
                };
              }), planned.length
            );

            for (const { claimSet, sampleIndex, verificationAnswers } of answered) {
              const evidence = verificationEvidenceByCandidate.get(claimSet.candidateKey) ?? [];
              evidence.push(...verificationAnswers.map(({ targetKey, question, answer }) => ({
                targetKey,
                sampleIndex,
                question,
                answer
              })));
              verificationEvidenceByCandidate.set(claimSet.candidateKey, evidence);
            }

            // A judgment call owns exactly one positive target. Returning one verdict per target from
            // a multi-target call is not independent verification: a true neighboring passage can
            // distract the model into repairing or overlooking a false clause. Planning and answering
            // remain candidate-wide so the answer model stays draft-blind, but terminal judgment sees
            // only the target being settled and only that target's independently produced checks.
            const judgmentRequests = answered.flatMap(({ claimSet, verificationAnswers, sampleIndex, targetIndexes }) =>
              claimSet.targets.flatMap((target, localTargetIndex) =>
                construction.factualityJudgments.map((judgment, judgeIndex) => ({
                  claimSet,
                  target,
                  targetIndex: targetIndexes[localTargetIndex]!,
                  verificationAnswers: verificationAnswers.filter((answer) => answer.targetKey === target.targetKey),
                  sampleIndex,
                  judgeIndex,
                  judgment
                }))
              )
            );
            return stage(STAGE_TAGS.groundingFactualityRevision, () =>
              mapWithConcurrency(judgmentRequests, construction.verificationConcurrency, async ({ claimSet, target, targetIndex, verificationAnswers, sampleIndex, judgeIndex, judgment }) => {
                const targetClaimSet: PositiveClaimSet = { ...claimSet, targets: [target] };
                const judgments = await judgment.judge({
                  declaredDomain: claimSet.declaredDomain,
                  canonicalLabel: claimSet.canonicalLabel,
                  context: claimSet.context,
                  targets: targetClaimSet.targets,
                  verificationAnswers
                });
                return {
                  candidateKey: claimSet.candidateKey,
                  targetIndex,
                  verdictIndex: sampleIndex * construction.factualityJudgments.length + judgeIndex,
                  judgment: validateJudgments(targetClaimSet, judgments)[0]!
                };
              }), judgmentRequests.length
            );
          };

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
              ),
              verificationEvidence: verificationEvidenceByCandidate.get(claimSet.candidateKey) ?? []
            };
          });
        }
      };
    }
  };
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
