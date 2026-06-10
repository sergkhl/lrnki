import { defineConfig } from "drizzle-kit";
export default defineConfig({ schema: "./src/schema.ts", out: "./src/migrations", dialect: "postgresql", dbCredentials: { url: process.env.DATABASE_URL ?? "postgresql://lrnki:lrnki@localhost:5432/lrnki" } });
