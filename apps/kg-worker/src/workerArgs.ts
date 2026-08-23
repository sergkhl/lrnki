export type GenerateStudyItemsArgs = {
  enrichmentId: string;
  concurrency?: number;
};

export type CanonicalizeConceptsArgs = {
  mode: "semantic" | "exact_label_only";
  baseGraphVersionId: string | null;
  runIds: string[];
};

export type BuildGraphVersionArgs = {
  canonicalizationArtifactId: string;
  baseGraphVersionId: string | null;
  runIds: string[];
};

export type InspectConceptCanonicalizationArgs = {
  artifactId: string;
  json: boolean;
};

export function parseCanonicalizeConceptsArgs(args: string[]): CanonicalizeConceptsArgs {
  let mode: CanonicalizeConceptsArgs["mode"] = "semantic";
  let baseGraphVersionId: string | null = null;
  let sawBase = false;
  const runIds: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--exact-label-only") {
      if (mode === "exact_label_only") throw new Error("--exact-label-only was provided more than once.");
      mode = "exact_label_only";
      continue;
    }
    if (value === "--base" || value.startsWith("--base=")) {
      if (sawBase) throw new Error("canonicalize-concepts base was provided more than once.");
      const base = value === "--base" ? args[++index] : value.slice("--base=".length);
      if (!base || base.startsWith("--")) throw new Error("canonicalize-concepts --base requires a graphVersionId.");
      baseGraphVersionId = base;
      sawBase = true;
      continue;
    }
    if (value.startsWith("--")) throw new Error(`unknown canonicalize-concepts flag: ${value}`);
    runIds.push(value);
  }
  assertUniqueRunIds(runIds, "canonicalize-concepts");
  return { mode, baseGraphVersionId, runIds };
}

export function parseBuildGraphVersionArgs(args: string[]): BuildGraphVersionArgs {
  let canonicalizationArtifactId: string | undefined;
  let baseGraphVersionId: string | null = null;
  let sawBase = false;
  const runIds: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--canonicalization" || value.startsWith("--canonicalization=")) {
      if (canonicalizationArtifactId !== undefined) {
        throw new Error("build-graph-version canonicalization was provided more than once.");
      }
      const artifactId = value === "--canonicalization"
        ? args[++index]
        : value.slice("--canonicalization=".length);
      if (!artifactId || artifactId.startsWith("--")) {
        throw new Error("build-graph-version --canonicalization requires an artifactId.");
      }
      canonicalizationArtifactId = artifactId;
      continue;
    }
    if (value === "--base" || value.startsWith("--base=")) {
      if (sawBase) throw new Error("build-graph-version base was provided more than once.");
      const base = value === "--base" ? args[++index] : value.slice("--base=".length);
      if (!base || base.startsWith("--")) throw new Error("build-graph-version --base requires a graphVersionId.");
      baseGraphVersionId = base;
      sawBase = true;
      continue;
    }
    if (value.startsWith("--")) throw new Error(`unknown build-graph-version flag: ${value}`);
    runIds.push(value);
  }
  if (!canonicalizationArtifactId) {
    throw new Error("build-graph-version requires --canonicalization <artifactId>.");
  }
  assertUniqueRunIds(runIds, "build-graph-version");
  return { canonicalizationArtifactId, baseGraphVersionId, runIds };
}

export function parseInspectConceptCanonicalizationArgs(
  args: string[]
): InspectConceptCanonicalizationArgs {
  let artifactId: string | undefined;
  let json = false;
  for (const value of args) {
    if (value === "--json") {
      if (json) throw new Error("--json was provided more than once.");
      json = true;
      continue;
    }
    if (value.startsWith("--")) {
      throw new Error(`unknown inspect-concept-canonicalization flag: ${value}`);
    }
    if (artifactId !== undefined) {
      throw new Error("inspect-concept-canonicalization accepts exactly one artifactId.");
    }
    artifactId = value;
  }
  if (!artifactId) throw new Error("inspect-concept-canonicalization requires <artifactId>.");
  return { artifactId, json };
}

export function parseGenerateStudyItemsArgs(
  enrichmentId: string | undefined,
  flags: string[]
): GenerateStudyItemsArgs {
  if (!enrichmentId) throw new Error("generate-study-items requires <enrichmentId>.");
  let concurrency: number | undefined;
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    let value: string | undefined;
    if (flag === "--concurrency") {
      index += 1;
      value = flags[index];
    } else if (flag.startsWith("--concurrency=")) {
      value = flag.slice("--concurrency=".length);
    } else {
      throw new Error(`unknown generate-study-items flag: ${flag}`);
    }
    if (concurrency !== undefined) throw new Error("generate-study-items concurrency was provided more than once.");
    concurrency = parsePositiveInteger(value, "generate-study-items concurrency");
  }
  return concurrency === undefined ? { enrichmentId } : { enrichmentId, concurrency };
}

function parsePositiveInteger(value: string | undefined, label: string): number {
  if (!value || !/^[1-9]\d*$/.test(value)) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return Number(value);
}

function assertUniqueRunIds(runIds: string[], command: string): void {
  if (runIds.length === 0) throw new Error(`${command} requires one or more explicit run IDs.`);
  if (new Set(runIds).size !== runIds.length) {
    throw new Error(`${command} requires unique ordered run IDs.`);
  }
}
