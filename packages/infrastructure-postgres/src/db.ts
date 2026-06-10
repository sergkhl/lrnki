import postgres from "postgres";
export function createDatabaseClient(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  return postgres(databaseUrl, { max: 10 });
}
