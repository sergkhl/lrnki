import type { Dirent } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  qualifyCatalog,
  type CatalogDiagnostic,
  type CatalogQualification,
  type QualifiedCatalog
} from "./contentQualifier";

function loadDiagnostic(path: string, message: string): CatalogDiagnostic {
  return {
    code: "content_file_unreadable",
    path,
    message
  };
}

async function readJson(
  filePath: string,
  diagnosticPath: string,
  diagnostics: CatalogDiagnostic[]
): Promise<unknown> {
  let source: string;
  try {
    source = await readFile(filePath, "utf8");
  } catch (error) {
    diagnostics.push(
      loadDiagnostic(
        diagnosticPath,
        error instanceof Error ? error.message : "failed to read JSON file"
      )
    );
    return undefined;
  }
  try {
    return JSON.parse(source) as unknown;
  } catch (error) {
    diagnostics.push({
      code: "content_json_invalid",
      path: diagnosticPath,
      message: error instanceof Error ? error.message : "invalid JSON"
    });
    return undefined;
  }
}

async function readSource(
  filePath: string,
  diagnosticPath: string,
  diagnostics: CatalogDiagnostic[]
): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    diagnostics.push(
      loadDiagnostic(
        diagnosticPath,
        error instanceof Error ? error.message : "failed to read source file"
      )
    );
    return undefined;
  }
}

export async function loadAndQualifyCatalog(contentRoot: string): Promise<CatalogQualification> {
  const diagnostics: CatalogDiagnostic[] = [];
  const catalog = await readJson(join(contentRoot, "catalog.json"), "catalog", diagnostics);
  const expeditions = new Map<string, unknown>();
  const sources = new Map<string, string>();
  const expeditionRoot = join(contentRoot, "expeditions");

  let entries: Dirent<string>[] = [];
  try {
    entries = await readdir(expeditionRoot, { encoding: "utf8", withFileTypes: true });
  } catch (error) {
    diagnostics.push(
      loadDiagnostic(
        "expeditions",
        error instanceof Error ? error.message : "failed to read Expeditions directory"
      )
    );
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const key = entry.name;
    const expedition = await readJson(
      join(expeditionRoot, key, "expedition.json"),
      `expeditions.${key}`,
      diagnostics
    );
    const source = await readSource(
      join(expeditionRoot, key, "source.md"),
      `sources.${key}`,
      diagnostics
    );
    if (expedition !== undefined) {
      expeditions.set(key, expedition);
    }
    if (source !== undefined) {
      sources.set(key, source);
    }
  }

  const qualification = qualifyCatalog({ catalog, expeditions, sources });
  if (diagnostics.length === 0) {
    return qualification;
  }
  if (qualification.ok) {
    return { ok: false, diagnostics };
  }
  return { ok: false, diagnostics: [...diagnostics, ...qualification.diagnostics] };
}

export class CatalogQualificationError extends Error {
  readonly diagnostics: ReadonlyArray<CatalogDiagnostic>;

  constructor(diagnostics: ReadonlyArray<CatalogDiagnostic>) {
    super(`authored catalog refused with ${diagnostics.length} diagnostic(s)`);
    this.name = "CatalogQualificationError";
    this.diagnostics = diagnostics;
  }
}

export async function loadQualifiedCatalogOrThrow(contentRoot: string): Promise<QualifiedCatalog> {
  const result = await loadAndQualifyCatalog(contentRoot);
  if (!result.ok) {
    throw new CatalogQualificationError(result.diagnostics);
  }
  return result.catalog;
}
