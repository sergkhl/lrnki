import { defineConfig } from "drizzle-kit";
// `migrate` only: applies the hand-written SQL files under ./src/migrations, which
// are the single source of truth for the schema (no `generate` path — there is no
// Drizzle schema to generate from; see AGENTS rule 18).
export default defineConfig({ out: "./src/migrations", dialect: "postgresql", dbCredentials: { url: process.env.DATABASE_URL ?? "postgresql://lrnki:lrnki@localhost:5432/lrnki" } });
