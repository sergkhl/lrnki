import { z } from "zod";

const contentKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, "use a lowercase kebab-case authored key");

const nonEmptyTextSchema = z.string().trim().min(1);

const sourceCreditKeysSchema = z.array(contentKeySchema).min(1);

const httpsUrlSchema = z
  .url()
  .refine((value) => new URL(value).protocol === "https:", "use a canonical HTTPS URL");

const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "use an ISO calendar date (YYYY-MM-DD)")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, "use a real calendar date");

export const sourceCreditSchema = z
  .object({
    key: contentKeySchema,
    title: nonEmptyTextSchema,
    url: httpsUrlSchema,
    author: nonEmptyTextSchema.optional(),
    publisher: nonEmptyTextSchema.optional(),
    publishedAt: nonEmptyTextSchema.optional(),
    version: nonEmptyTextSchema.optional(),
    accessedAt: calendarDateSchema,
    license: nonEmptyTextSchema.optional(),
    note: nonEmptyTextSchema.optional()
  })
  .strict()
  .refine((credit) => credit.author !== undefined || credit.publisher !== undefined, {
    message: "identify the source with author and/or publisher",
    path: ["author"]
  });

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
    sourceCreditKeys: sourceCreditKeysSchema,
    explorableTerms: z.array(explorableTermSchema)
  })
  .strict();

export const activityExplanationSchema = z
  .object({
    text: nonEmptyTextSchema,
    sourceCreditKeys: sourceCreditKeysSchema
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
    stops: z.array(authoredStopSchema).min(4).max(7),
    guardianActivityKeys: z.array(contentKeySchema).min(1)
  })
  .strict();

export const authoredExpeditionSchema = z
  .object({
    schemaVersion: z.literal(2),
    key: contentKeySchema,
    title: nonEmptyTextSchema,
    teaser: nonEmptyTextSchema,
    declaredDomain: nonEmptyTextSchema,
    audience: nonEmptyTextSchema,
    sourceCredits: z.array(sourceCreditSchema).min(1),
    legs: z.array(authoredLegSchema).length(3),
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
