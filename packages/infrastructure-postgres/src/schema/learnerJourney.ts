import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  jsonb,
  pgTable,
  text,
  timestamp
} from "drizzle-orm/pg-core";

import { user } from "./auth.js";

// Private clean-room learner aggregate introduced beside the legacy schema during U2.
// The Zod owner in @lrnki/learner-runtime validates every loaded and proposed JSON value;
// this Drizzle authority owns only the relation, column, FK, and SQL-check shape.
export const learnerJourneyState = pgTable(
  "learner_journey_state",
  {
    learnerRef: text("learner_ref").primaryKey().notNull(),
    state: jsonb("state").notNull(),
    stateVersion: bigint("state_version", { mode: "bigint" })
      .default(sql`0`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull()
  },
  (table) => [
    foreignKey({
      columns: [table.learnerRef],
      foreignColumns: [user.id],
      name: "learner_journey_state_learner_ref_fkey"
    }).onDelete("cascade"),
    check(
      "learner_journey_state_state_object_check",
      sql`jsonb_typeof(state) = 'object'`
    ),
    check(
      "learner_journey_state_state_version_check",
      sql`state_version >= 0`
    )
  ]
);
