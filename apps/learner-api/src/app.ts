import { Hono } from "hono";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import {
  createLearnerRuntime,
  type LearnerReadResult,
  type LearnerRuntime,
  type LearnerTransitionResult
} from "@lrnki/learner-runtime/runtime";
import type { QualifiedCatalog } from "@lrnki/learner-runtime/content-node";
import { PostgresLearnerStateStore } from "@lrnki/infrastructure-postgres";
import { z } from "zod";

import { createLearnerAuth, learnerWebOrigins, requireSession, type AuthEnv } from "./auth";
import type { DatabaseClient } from "./db";

type JsonTransport<T> =
  T extends bigint ? string
    : T extends ReadonlyArray<infer Item> ? ReadonlyArray<JsonTransport<Item>>
      : T extends object ? { readonly [Key in keyof T]: JsonTransport<T[Key]> }
        : T;

export type LearnerReadDto = JsonTransport<LearnerReadResult>;
export type LearnerTransitionDto = JsonTransport<LearnerTransitionResult>;

function transport<T>(value: T): JsonTransport<T> {
  return JSON.parse(
    JSON.stringify(value, (_key, nested: unknown) =>
      typeof nested === "bigint" ? nested.toString() : nested
    )
  ) as JsonTransport<T>;
}

const contentKey = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
const opaqueId = z.string().trim().min(1).max(200);
const requestId = z.string().trim().min(1).max(200);
const expeditionCommand = { expeditionKey: contentKey };
const acquisitionSource = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("trail") }).strict(),
  z.object({ kind: z.literal("support"), supportPathKey: contentKey }).strict()
]);
const guardianScope = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("leg"), legKey: contentKey }).strict(),
  z.object({ kind: z.literal("expedition") }).strict()
]);

export const learnerCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("adopt_expedition"), ...expeditionCommand }).strict(),
  z.object({ kind: z.literal("activate_expedition"), ...expeditionCommand }).strict(),
  z.object({
    kind: z.literal("record_lesson_read"),
    ...expeditionCommand,
    stopKey: contentKey
  }).strict(),
  z.object({
    kind: z.literal("set_calibration_known"),
    ...expeditionCommand,
    stopKey: contentKey
  }).strict(),
  z.object({
    kind: z.literal("clear_calibration_known"),
    ...expeditionCommand,
    stopKey: contentKey
  }).strict(),
  z.object({
    kind: z.literal("answer_option_select"),
    ...expeditionCommand,
    stopKey: contentKey,
    activityKey: contentKey,
    chosenOptionKey: contentKey,
    source: acquisitionSource
  }).strict(),
  z.object({
    kind: z.literal("answer_matching"),
    ...expeditionCommand,
    stopKey: contentKey,
    activityKey: contentKey,
    matches: z.array(z.object({ leftKey: opaqueId, rightKey: opaqueId }).strict()).min(1).max(12),
    source: acquisitionSource
  }).strict(),
  z.object({
    kind: z.literal("answer_impostor"),
    ...expeditionCommand,
    stopKey: contentKey,
    activityKey: contentKey,
    chosenStatementKey: contentKey,
    source: acquisitionSource
  }).strict(),
  z.object({
    kind: z.literal("open_support_path"),
    ...expeditionCommand,
    stopKey: contentKey,
    supportPathKey: contentKey
  }).strict(),
  z.object({
    kind: z.literal("hide_support_path"),
    ...expeditionCommand,
    supportPathKey: contentKey
  }).strict(),
  z.object({
    kind: z.literal("create_guardian"),
    ...expeditionCommand,
    scope: guardianScope
  }).strict(),
  z.object({
    kind: z.literal("answer_guardian_selection"),
    ...expeditionCommand,
    challengeId: opaqueId,
    activityKey: contentKey,
    chosenKey: contentKey
  }).strict(),
  z.object({
    kind: z.literal("answer_guardian_matching_pair"),
    ...expeditionCommand,
    challengeId: opaqueId,
    activityKey: contentKey,
    leftKey: opaqueId,
    rightKey: opaqueId
  }).strict(),
  z.object({
    kind: z.literal("retreat_guardian"),
    ...expeditionCommand,
    challengeId: opaqueId
  }).strict(),
  z.object({
    kind: z.literal("resume_guardian"),
    ...expeditionCommand,
    challengeId: opaqueId
  }).strict(),
  z.object({
    kind: z.literal("abandon_guardian"),
    ...expeditionCommand,
    challengeId: opaqueId
  }).strict()
]);

export const commandEnvelopeSchema = z.object({
  requestId,
  expectedStateVersion: z.string().regex(/^\d+$/),
  command: learnerCommandSchema
}).strict();

export type LearnerCommandDto = z.infer<typeof learnerCommandSchema>;
export type LearnerCommandEnvelopeDto = z.infer<typeof commandEnvelopeSchema>;

export type LearnerAppOptions = Readonly<{
  catalog: QualifiedCatalog;
  runtime?: LearnerRuntime;
}>;

function readStatus(result: LearnerReadResult): 200 | 404 | 409 {
  if (result.status === "ok") return 200;
  if (result.status === "content_changed") return 409;
  return 404;
}

// Better Auth supplies learnerRef. Hono validates transport and delegates every learner-domain
// decision to the two-method runtime; it never loads content rows, grades, or coordinates stores.
export function createLearnerApp(
  sql: DatabaseClient,
  authSql: DatabaseClient,
  options: LearnerAppOptions
) {
  const learnerAuth = createLearnerAuth(authSql);
  const auth = requireSession(learnerAuth);
  const runtime = options.runtime ?? createLearnerRuntime({
    catalog: options.catalog,
    stateStore: new PostgresLearnerStateStore(sql)
  });

  return new Hono<AuthEnv>()
    .use("*", cors({
      origin: (origin) => (learnerWebOrigins().includes(origin) ? origin : null),
      allowHeaders: ["Content-Type"],
      credentials: true,
      maxAge: 86400
    }))
    .get("/health", (c) => c.json({ ok: true as const }))
    .on(["GET", "POST"], "/auth/*", (c) => learnerAuth.handler(c.req.raw))
    .get("/journal", auth, async (c) => {
      const result = await runtime.read(c.get("learnerStateRef"), { kind: "journal" });
      return c.json(transport(result), readStatus(result));
    })
    .get("/catalog", auth, async (c) => {
      const result = await runtime.read(c.get("learnerStateRef"), { kind: "catalog" });
      return c.json(transport(result), readStatus(result));
    })
    .get("/expedition/:expeditionKey", auth, async (c) => {
      const result = await runtime.read(c.get("learnerStateRef"), {
        kind: "expedition",
        expeditionKey: c.req.param("expeditionKey")
      });
      return c.json(transport(result), readStatus(result));
    })
    .get("/guardian/:expeditionKey/:challengeId", auth, async (c) => {
      const result = await runtime.read(c.get("learnerStateRef"), {
        kind: "guardian",
        expeditionKey: c.req.param("expeditionKey"),
        challengeId: c.req.param("challengeId")
      });
      return c.json(transport(result), readStatus(result));
    })
    .get("/leaderboard", auth, async (c) => {
      const result = await runtime.read(c.get("learnerStateRef"), { kind: "leaderboard" });
      return c.json(transport(result), readStatus(result));
    })
    .post("/game/commands", auth, zValidator("json", commandEnvelopeSchema), async (c) => {
      const input = c.req.valid("json");
      const result = await runtime.dispatch(c.get("learnerStateRef"), {
        requestId: input.requestId,
        expectedStateVersion: BigInt(input.expectedStateVersion),
        command: input.command
      });
      return c.json(transport(result));
    });
}

export type AppType = ReturnType<typeof createLearnerApp>;
