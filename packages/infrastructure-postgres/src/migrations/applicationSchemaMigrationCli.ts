import { fileURLToPath } from "node:url";
import {
  ensureApplicationSchemaCurrent,
  ResetRequiredError
} from "./applicationSchemaMigration";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exitCode = 1;
} else {
  const migrationsFolder = fileURLToPath(new URL("./", import.meta.url));
  try {
    const result = await ensureApplicationSchemaCurrent(databaseUrl, migrationsFolder);
    console.log(
      result.status === "applied"
        ? "Application schema migration applied."
        : "Application schema is current."
    );
  } catch (error) {
    if (error instanceof ResetRequiredError) {
      console.error(`Application schema is reset-required: ${error.reason}.`);
      console.error("Local/test: run pnpm db:reset.");
      console.error("Shared deployment: follow the targeted cutover runbook in the root README.");
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  }
}
