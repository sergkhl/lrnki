import { z } from "zod";

const contentKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, "use a lowercase kebab-case authored key");

const nonEmptyTextSchema = z.string().trim().min(1);

export const sourceAnchorSchema = z
  .object({
    heading: nonEmptyTextSchema,
    quote: nonEmptyTextSchema
  })
  .strict();

export const sourceCreditSchema = z
  .object({
    title: nonEmptyTextSchema,
    author: nonEmptyTextSchema.optional(),
    license: nonEmptyTextSchema,
    note: nonEmptyTextSchema.optional()
  })
  .strict();

export const explorableTermSchema = z
  .object({
    term: nonEmptyTextSchema,
    supportPathKey: contentKeySchema
  })
  .strict();

export const lessonSectionSchema = z
  .object({
    key: contentKeySchema,
    title: nonEmptyTextSchema,
    body: nonEmptyTextSchema,
    sourceAnchor: sourceAnchorSchema,
    explorableTerms: z.array(explorableTermSchema)
  })
  .strict();

export const activityExplanationSchema = z
  .object({
    text: nonEmptyTextSchema,
    sourceAnchor: sourceAnchorSchema
  })
  .strict();

const optionSchema = z
  .object({
    key: contentKeySchema,
    text: nonEmptyTextSchema
  })
  .strict();

export const authoredOptionSelectSchema = z
  .object({
    family: z.literal("option_select"),
    key: contentKeySchema,
    prompt: nonEmptyTextSchema,
    options: z.array(optionSchema).min(2).max(6),
    answerKey: contentKeySchema,
    explanation: activityExplanationSchema
  })
  .strict();

const matchingPairSchema = z
  .object({
    key: contentKeySchema,
    left: nonEmptyTextSchema,
    right: nonEmptyTextSchema
  })
  .strict();

export const authoredMatchingSchema = z
  .object({
    family: z.literal("matching"),
    key: contentKeySchema,
    prompt: nonEmptyTextSchema,
    pairs: z.array(matchingPairSchema).min(2).max(6),
    explanation: activityExplanationSchema
  })
  .strict();

const impostorStatementSchema = z
  .object({
    key: contentKeySchema,
    text: nonEmptyTextSchema,
    kind: z.enum(["truth", "impostor"])
  })
  .strict();

export const authoredImpostorSchema = z
  .object({
    family: z.literal("impostor"),
    key: contentKeySchema,
    prompt: nonEmptyTextSchema,
    statements: z.array(impostorStatementSchema).min(3).max(6),
    explanation: activityExplanationSchema
  })
  .strict();

export const authoredActivitySchema = z.discriminatedUnion("family", [
  authoredOptionSelectSchema,
  authoredMatchingSchema,
  authoredImpostorSchema
]);

export const authoredSupportPathSchema = z
  .object({
    key: contentKeySchema,
    term: nonEmptyTextSchema,
    sectionKey: contentKeySchema,
    steps: z
      .array(
        z
          .object({
            stopKey: contentKeySchema,
            activityKey: contentKeySchema
          })
          .strict()
      )
      .min(1)
  })
  .strict();

export const authoredStopSchema = z
  .object({
    key: contentKeySchema,
    label: nonEmptyTextSchema,
    requires: z.array(contentKeySchema),
    difficultyBand: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5)
    ]),
    lesson: z
      .object({
        sections: z.array(lessonSectionSchema).min(1)
      })
      .strict(),
    activities: z.array(authoredActivitySchema).min(1),
    supportPaths: z.array(authoredSupportPathSchema)
  })
  .strict();

export const authoredLegSchema = z
  .object({
    key: contentKeySchema,
    title: nonEmptyTextSchema,
    stops: z.array(authoredStopSchema).min(3).max(5),
    guardianActivityKeys: z.array(contentKeySchema).min(1)
  })
  .strict();

export const authoredExpeditionSchema = z
  .object({
    schemaVersion: z.literal(1),
    key: contentKeySchema,
    title: nonEmptyTextSchema,
    teaser: nonEmptyTextSchema,
    declaredDomain: nonEmptyTextSchema,
    audience: nonEmptyTextSchema,
    sourceCredits: z.array(sourceCreditSchema).min(1),
    legs: z.array(authoredLegSchema).min(1),
    expeditionGuardianActivityKeys: z.array(contentKeySchema).min(1)
  })
  .strict();

export const authoredCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    expeditionKeys: z.array(contentKeySchema).min(1)
  })
  .strict();

export type AuthoredCatalog = z.infer<typeof authoredCatalogSchema>;
export type AuthoredExpedition = z.infer<typeof authoredExpeditionSchema>;
export type AuthoredLeg = z.infer<typeof authoredLegSchema>;
export type AuthoredStop = z.infer<typeof authoredStopSchema>;
export type AuthoredActivity = z.infer<typeof authoredActivitySchema>;
export type AuthoredOptionSelect = z.infer<typeof authoredOptionSelectSchema>;
export type AuthoredMatching = z.infer<typeof authoredMatchingSchema>;
export type AuthoredImpostor = z.infer<typeof authoredImpostorSchema>;
export type AuthoredSupportPath = z.infer<typeof authoredSupportPathSchema>;
export type LessonSection = z.infer<typeof lessonSectionSchema>;
export type SourceCredit = z.infer<typeof sourceCreditSchema>;
