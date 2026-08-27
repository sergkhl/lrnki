import { z } from "zod";

const nonEmpty = z.string().trim().min(1);

export const sourceRegistrationFixtureSchema = z.object({
  path: nonEmpty,
  contentType: nonEmpty,
  declaredDomain: nonEmpty,
  title: nonEmpty,
  source: nonEmpty.optional(),
  license: nonEmpty.optional()
}).passthrough();

export const sourceRegistrationManifestSchema = z.object({
  fixtures: z.array(sourceRegistrationFixtureSchema).min(1)
}).passthrough();

const preferredStopCountSchema = z.object({
  minimum: z.number().int().positive(),
  maximum: z.number().int().positive()
}).strict().superRefine((range, context) => {
  if (range.minimum > range.maximum) {
    context.addIssue({
      code: "custom",
      message: "preferredStopCount.minimum must not exceed maximum"
    });
  }
});

export const acceptedPathFixtureSchema = sourceRegistrationFixtureSchema.extend({
  fixtureId: nonEmpty.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  catalogKey: nonEmpty.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  catalogRole: nonEmpty,
  catalogOrder: z.number().int().positive(),
  audience: nonEmpty,
  preferredStopCount: preferredStopCountSchema,
  path: z.string().regex(/^fixtures\/accepted-paths\/sources\/[a-z0-9-]+\.md$/),
  contentType: z.literal("text/markdown"),
  teaser: nonEmpty,
  source: nonEmpty,
  license: nonEmpty,
  curation: nonEmpty
}).strict();

export const acceptedPathManifestSchema = z.object({
  $comment: nonEmpty.optional(),
  sourcePolicy: z.object({
    authorship: nonEmpty,
    knowledgeBasis: nonEmpty,
    acceptanceScope: nonEmpty,
    externalClaimVerificationRequired: z.boolean(),
    revisionPolicy: nonEmpty
  }).strict(),
  fixtures: z.array(acceptedPathFixtureSchema).min(1)
}).strict().superRefine((manifest, context) => {
  for (const field of [
    "fixtureId",
    "catalogKey",
    "catalogOrder",
    "path",
    "title",
    "declaredDomain"
  ] as const) {
    const firstIndexByValue = new Map<string | number, number>();
    manifest.fixtures.forEach((fixture, index) => {
      const value = fixture[field];
      const firstIndex = firstIndexByValue.get(value);
      if (firstIndex !== undefined) {
        context.addIssue({
          code: "custom",
          path: ["fixtures", index, field],
          message: `${field} duplicates fixtures[${firstIndex}]`
        });
      } else {
        firstIndexByValue.set(value, index);
      }
    });
  }
});

export type SourceRegistrationManifest = z.infer<typeof sourceRegistrationManifestSchema>;
export type AcceptedPathFixture = z.infer<typeof acceptedPathFixtureSchema>;
export type AcceptedPathManifest = z.infer<typeof acceptedPathManifestSchema>;

export function parseSourceRegistrationManifest(value: unknown): SourceRegistrationManifest {
  return sourceRegistrationManifestSchema.parse(value);
}

export function parseAcceptedPathManifest(value: unknown): AcceptedPathManifest {
  return acceptedPathManifestSchema.parse(value);
}
