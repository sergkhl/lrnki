import { drizzle } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";
import * as authSchema from "./schema/auth.js";

// The ONE Drizzle handle in this package, and the only reason Drizzle exists at runtime rather
// than as a schema-authoring tool (ADR-0039 keeps every store on raw `postgres` queries). Better
// Auth's Drizzle adapter needs a Drizzle instance to reach `user` / `session` / `account` /
// `verification`. `authSchema` is generated output; nothing else may be added to it.
//
// **The client passed here must belong to Better Auth alone.** `drizzle()` takes ownership of the
// client it is given and rewrites its type codecs in place — including
// `options.serializers["114"|"3802"]`, the json/jsonb serializers — so that Drizzle can handle
// JSON itself. Hand it the process's shared pool and every OTHER store on that pool silently
// loses `sql.json()`: the value reaches `Buffer.byteLength` unserialized and the write throws
// `ERR_INVALID_ARG_TYPE`. That is not a test artifact — it would take out study-item persistence,
// `learner_awards.context`, and scaffold payloads in production. Better Auth's own four tables
// hold no JSON at all, so the mutation buys nothing here and costs everything shared.
export function createAuthDatabase(authOwnedSql: Sql) {
  return drizzle(authOwnedSql, { schema: authSchema });
}
