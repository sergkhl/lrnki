import { z } from "zod";

const keySchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
const nonEmptySchema = z.string().trim().min(1);
const timestampSchema = z.string().datetime({ offset: true });

export const acquisitionAttemptSchema = z
  .object({
    requestId: nonEmptySchema,
    expeditionKey: keySchema,
    stopKey: keySchema,
    activityKey: keySchema,
    source: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("trail") }).strict(),
      z
        .object({
          kind: z.literal("support"),
          supportPathKey: keySchema
        })
        .strict()
    ]),
    correct: z.boolean(),
    answeredAt: timestampSchema
  })
  .strict();

export const latestActivityOutcomeSchema = z
  .object({
    requestId: nonEmptySchema,
    stopKey: keySchema,
    correct: z.boolean(),
    answeredAt: timestampSchema
  })
  .strict();

export const firstGradedStopCompletionSchema = z
  .object({
    completedAt: timestampSchema,
    difficultyBand: z.number().int().min(1).max(5),
    points: z.number().int().min(1).max(5)
  })
  .strict();

export const supportPathStateSchema = z
  .object({
    status: z.enum(["open", "hidden"]),
    firstOpenedAt: timestampSchema,
    updatedAt: timestampSchema
  })
  .strict();

export const guardianScopeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("leg"),
      legKey: keySchema
    })
    .strict(),
  z.object({ kind: z.literal("expedition") }).strict()
]);

export const guardianLineupEntrySchema = z
  .object({
    stopKey: keySchema,
    activityKey: keySchema,
    family: z.enum(["option_select", "matching", "impostor"])
  })
  .strict();

const guardianSelectionEventSchema = z
  .object({
    seq: z.number().int().positive(),
    kind: z.literal("selection_answer"),
    requestId: nonEmptySchema,
    activityKey: keySchema,
    chosenKey: keySchema,
    correct: z.boolean(),
    answeredAt: timestampSchema
  })
  .strict();

const guardianMatchingEventSchema = z
  .object({
    seq: z.number().int().positive(),
    kind: z.literal("matching_pair"),
    requestId: nonEmptySchema,
    activityKey: keySchema,
    leftKey: nonEmptySchema,
    rightKey: nonEmptySchema,
    correct: z.boolean(),
    answeredAt: timestampSchema
  })
  .strict();

const guardianLifecycleEventSchema = z
  .object({
    seq: z.number().int().positive(),
    kind: z.enum(["retreat", "resume", "abandon"]),
    requestId: nonEmptySchema,
    occurredAt: timestampSchema
  })
  .strict();

export const guardianEventSchema = z.discriminatedUnion("kind", [
  guardianSelectionEventSchema,
  guardianMatchingEventSchema,
  guardianLifecycleEventSchema
]);

export const guardianChallengeSchema = z
  .object({
    challengeId: nonEmptySchema,
    scope: guardianScopeSchema,
    lineup: z.array(guardianLineupEntrySchema).min(1).max(7),
    events: z.array(guardianEventSchema),
    status: z.enum(["active", "won", "abandoned"]),
    createdAt: timestampSchema,
    wonAt: timestampSchema.nullable()
  })
  .strict();

export const learnerAwardSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("leg_guardian_first_win"),
      dedupeKey: nonEmptySchema,
      expeditionKey: keySchema,
      legKey: keySchema,
      challengeId: nonEmptySchema,
      awardedAt: timestampSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("expedition_guardian_first_win"),
      dedupeKey: nonEmptySchema,
      expeditionKey: keySchema,
      challengeId: nonEmptySchema,
      awardedAt: timestampSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("weekly_podium"),
      dedupeKey: nonEmptySchema,
      weekKey: nonEmptySchema,
      rank: z.number().int().min(1).max(3),
      points: z.number().int().positive(),
      awardedAt: timestampSchema
    })
    .strict()
]);

export const commandEffectSchema = z
  .object({
    kind: z.enum([
      "expedition_adopted",
      "expedition_activated",
      "lesson_recorded",
      "calibration_known_set",
      "calibration_known_cleared",
      "activity_answered",
      "support_opened",
      "support_hidden",
      "guardian_created",
      "guardian_answered",
      "guardian_retreated",
      "guardian_resumed",
      "guardian_abandoned"
    ]),
    expeditionKey: keySchema,
    legKey: keySchema.nullable(),
    stopKey: keySchema.nullable(),
    activityKey: keySchema.nullable(),
    supportPathKey: keySchema.nullable(),
    challengeId: nonEmptySchema.nullable(),
    correct: z.boolean().nullable(),
    revealKey: nonEmptySchema.nullable(),
    feedback: nonEmptySchema.nullable(),
    feedbackSourceCreditKeys: z.array(keySchema),
    newlyCompletedStop: z.boolean(),
    pointsAwarded: z.number().int().min(0).max(5),
    firstGuardianWin: z.boolean()
  })
  .strict();

export const commandReceiptSchema = z
  .object({
    requestId: nonEmptySchema,
    commandFingerprint: nonEmptySchema,
    committedStateVersion: z.string().regex(/^\d+$/),
    effect: commandEffectSchema
  })
  .strict();

export const expeditionJourneyStateSchema = z
  .object({
    contentRevision: nonEmptySchema,
    adoptedAt: timestampSchema,
    firstLessonReadAt: z.record(keySchema, timestampSchema),
    acquisitionAttempts: z.array(acquisitionAttemptSchema),
    latestActivityOutcomes: z.record(keySchema, latestActivityOutcomeSchema),
    firstGradedStopCompletions: z.record(keySchema, firstGradedStopCompletionSchema),
    calibrationKnownStopKeys: z.array(keySchema),
    supportPaths: z.record(keySchema, supportPathStateSchema),
    guardianChallenges: z.record(nonEmptySchema, guardianChallengeSchema),
    guardianExposure: z.record(keySchema, z.number().int().nonnegative()),
    firstGuardianWins: z.record(nonEmptySchema, nonEmptySchema)
  })
  .strict();

export const learnerStateV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    activeExpeditionKey: keySchema.nullable(),
    expeditions: z.record(keySchema, expeditionJourneyStateSchema),
    awards: z.array(learnerAwardSchema),
    commandReceipts: z.array(commandReceiptSchema)
  })
  .strict();

export type AcquisitionAttempt = z.infer<typeof acquisitionAttemptSchema>;
export type LatestActivityOutcome = z.infer<typeof latestActivityOutcomeSchema>;
export type FirstGradedStopCompletion = z.infer<typeof firstGradedStopCompletionSchema>;
export type SupportPathState = z.infer<typeof supportPathStateSchema>;
export type GuardianScope = z.infer<typeof guardianScopeSchema>;
export type GuardianLineupEntry = z.infer<typeof guardianLineupEntrySchema>;
export type GuardianEvent = z.infer<typeof guardianEventSchema>;
export type GuardianChallenge = z.infer<typeof guardianChallengeSchema>;
export type LearnerAward = z.infer<typeof learnerAwardSchema>;
export type CommandEffect = z.infer<typeof commandEffectSchema>;
export type CommandReceipt = z.infer<typeof commandReceiptSchema>;
export type ExpeditionJourneyState = z.infer<typeof expeditionJourneyStateSchema>;
export type LearnerStateV1 = z.infer<typeof learnerStateV1Schema>;

export function emptyLearnerStateV1(): LearnerStateV1 {
  return {
    schemaVersion: 1,
    activeExpeditionKey: null,
    expeditions: {},
    awards: [],
    commandReceipts: []
  };
}

export function parseLearnerStateV1(value: unknown): LearnerStateV1 {
  return learnerStateV1Schema.parse(value);
}
