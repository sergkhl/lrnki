#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const reportFailure = (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
};

process.on("uncaughtException", reportFailure);
process.on("unhandledRejection", reportFailure);

const migrationsDirectory = process.argv[2];

if (!migrationsDirectory) {
  console.error("Usage: assert-single-drizzle-baseline.mjs <migrations-directory>");
  process.exit(2);
}

const resolvedDirectory = path.resolve(migrationsDirectory);
const metaDirectory = path.join(resolvedDirectory, "meta");
const migrationFiles = await readdir(resolvedDirectory, { withFileTypes: true });
const sqlFiles = migrationFiles
  .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
  .map((entry) => entry.name)
  .sort();
const baselineSqlFiles = sqlFiles.filter((name) => /^0000_[^.]+\.sql$/.test(name));

if (sqlFiles.length !== 1 || baselineSqlFiles.length !== 1) {
  throw new Error(
    `Expected exactly one 0000_*.sql and no other SQL history in ${resolvedDirectory}; found: ${sqlFiles.join(", ") || "none"}`,
  );
}

const metaFiles = await readdir(metaDirectory, { withFileTypes: true });
const snapshotFiles = metaFiles
  .filter((entry) => entry.isFile() && /_snapshot\.json$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();

if (snapshotFiles.length !== 1 || snapshotFiles[0] !== "0000_snapshot.json") {
  throw new Error(
    `Expected exactly meta/0000_snapshot.json in ${resolvedDirectory}; found: ${snapshotFiles.join(", ") || "none"}`,
  );
}

const journalPath = path.join(metaDirectory, "_journal.json");
const journal = JSON.parse(await readFile(journalPath, "utf8"));

if (!Array.isArray(journal.entries) || journal.entries.length !== 1) {
  throw new Error(
    `Expected exactly one Drizzle journal entry in ${journalPath}; found ${Array.isArray(journal.entries) ? journal.entries.length : "an invalid journal"}`,
  );
}

const [entry] = journal.entries;
const expectedTag = path.basename(baselineSqlFiles[0], ".sql");

if (entry.idx !== 0 || entry.tag !== expectedTag) {
  throw new Error(
    `Expected journal entry idx=0 and tag=${expectedTag}; found idx=${String(entry.idx)} tag=${String(entry.tag)}`,
  );
}

console.log(`Verified single Drizzle baseline: ${expectedTag}.`);
