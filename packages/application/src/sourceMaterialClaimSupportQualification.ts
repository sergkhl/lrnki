import type { SourceMaterialClaimSupportVerificationPort } from "@lrnki/ports";

export const SOURCE_MATERIAL_CLAIM_SUPPORT_QUALIFICATION_SCHEMA_VERSION =
  "lrnki.source-material-claim-support-qualification.v1" as const;

export type SourceMaterialClaimSupportQualificationSource = {
  path: string;
  contentType: string;
  sourceClass: "project_diagnostic" | "held_out_real_source";
  declaredDomain: string;
  subject: { canonicalLabel: string; aliases: string[] };
};

export type SourceMaterialClaimSupportQualificationCase = {
  id: string;
  source: string;
  harmClass: string;
  expected: "supported" | "unsupported";
  evidenceQuotes: string[];
  claim: string;
};

export type SourceMaterialClaimSupportQualificationMatrix = {
  schemaVersion: typeof SOURCE_MATERIAL_CLAIM_SUPPORT_QUALIFICATION_SCHEMA_VERSION;
  drawsPerCase: number;
  maximumFalseAcceptances: number;
  maximumFalseRejectionRate: number;
  sources: SourceMaterialClaimSupportQualificationSource[];
  cases: SourceMaterialClaimSupportQualificationCase[];
};

export type SourceMaterialClaimSupportQualificationObservation = {
  caseId: string;
  draw: number;
  sourceClass: SourceMaterialClaimSupportQualificationSource["sourceClass"];
  harmClass: string;
  expected: SourceMaterialClaimSupportQualificationCase["expected"];
  disposition: "supported" | "unsupported" | "unclear" | "unavailable";
  reason: string;
  elapsedMs: number;
  correct: boolean;
  materialFalseAcceptance: boolean;
};

export type SourceMaterialClaimSupportQualificationReport = {
  schemaVersion: "lrnki.source-material-claim-support-qualification-report.v1";
  startedAt: string;
  completedAt: string;
  verifierModel: string;
  thresholds: {
    drawsPerCase: number;
    maximumFalseAcceptances: number;
    maximumFalseRejectionRate: number;
  };
  summary: {
    declaredCases: number;
    declaredDraws: number;
    completedCases: number;
    completedDraws: number;
    supportedControlDraws: number;
    unsupportedControlDraws: number;
    falseAcceptances: number;
    falseAcceptanceCaseIds: string[];
    falseRejections: number;
    falseRejectionCaseIds: string[];
    falseRejectionRate: number | null;
    unavailableDraws: number;
    stoppedEarly: boolean;
    complete: boolean;
    passed: boolean;
  };
  caseAgreement: Array<{
    caseId: string;
    completedDraws: number;
    supported: number;
    unsupported: number;
    unclear: number;
    unavailable: number;
    unanimous: boolean;
  }>;
  observations: SourceMaterialClaimSupportQualificationObservation[];
};

// Qualify the exact production port, not a parallel benchmark interface. Draws are sequential so
// a precision failure can stop before another model call; safe refusals remain measurable as
// availability loss, while any supported verdict for an unsupported control is a material false
// acceptance. The caller owns persistence of the returned report in gitignored tmp/.
export async function qualifySourceMaterialClaimSupport(input: {
  matrix: SourceMaterialClaimSupportQualificationMatrix;
  verifier: SourceMaterialClaimSupportVerificationPort;
  resolveEvidence: (
    testCase: SourceMaterialClaimSupportQualificationCase,
    source: SourceMaterialClaimSupportQualificationSource
  ) => Array<{ blockText: string; citedQuote: string }> | Promise<Array<{ blockText: string; citedQuote: string }>>;
  now?: () => Date;
  elapsedNow?: () => number;
  onObservation?: (observation: SourceMaterialClaimSupportQualificationObservation) => void | Promise<void>;
}): Promise<SourceMaterialClaimSupportQualificationReport> {
  const now = input.now ?? (() => new Date());
  const elapsedNow = input.elapsedNow ?? (() => Date.now());
  const startedAt = now().toISOString();
  const sourceByPath = new Map(input.matrix.sources.map((source) => [source.path, source] as const));
  const observations: SourceMaterialClaimSupportQualificationObservation[] = [];
  let stoppedEarly = false;

  outer: for (const testCase of input.matrix.cases) {
    const source = sourceByPath.get(testCase.source);
    if (!source) throw new Error(`Qualification case ${JSON.stringify(testCase.id)} references an unknown source.`);
    const evidence = await input.resolveEvidence(testCase, source);
    if (evidence.length === 0 || evidence.some((row) => !row.blockText.trim() || !row.citedQuote.trim())) {
      throw new Error(`Qualification case ${JSON.stringify(testCase.id)} resolved empty evidence.`);
    }
    for (let draw = 1; draw <= input.matrix.drawsPerCase; draw += 1) {
      const started = elapsedNow();
      let disposition: SourceMaterialClaimSupportQualificationObservation["disposition"];
      let reason: string;
      try {
        const verdict = await input.verifier.verify({
          declaredDomain: source.declaredDomain,
          subject: source.subject,
          claim: { claimKey: testCase.id, statement: testCase.claim },
          evidence: evidence.map((row, index) => ({
            evidenceKey: `${testCase.id}:evidence:${index}`,
            passageKind: "mention",
            blockText: row.blockText,
            citedQuote: row.citedQuote,
            direct: true
          }))
        });
        disposition = verdict.disposition;
        reason = verdict.reason.trim() || "The verifier returned an empty reason.";
      } catch (error) {
        disposition = "unavailable";
        reason = boundedError(error);
      }
      const materialFalseAcceptance = testCase.expected === "unsupported" && disposition === "supported";
      const correct = testCase.expected === "supported"
        ? disposition === "supported"
        : disposition !== "supported" && disposition !== "unavailable";
      const observation: SourceMaterialClaimSupportQualificationObservation = {
        caseId: testCase.id,
        draw,
        sourceClass: source.sourceClass,
        harmClass: testCase.harmClass,
        expected: testCase.expected,
        disposition,
        reason,
        elapsedMs: Math.max(0, elapsedNow() - started),
        correct,
        materialFalseAcceptance
      };
      observations.push(observation);
      await input.onObservation?.(observation);
      if (materialFalseAcceptance || disposition === "unavailable") {
        stoppedEarly = true;
        break outer;
      }
    }
  }

  const supported = observations.filter((row) => row.expected === "supported");
  const unsupported = observations.filter((row) => row.expected === "unsupported");
  const falseAcceptances = unsupported.filter((row) => row.disposition === "supported");
  const falseRejections = supported.filter((row) => row.disposition !== "supported");
  const unavailable = observations.filter((row) => row.disposition === "unavailable");
  const declaredDraws = input.matrix.cases.length * input.matrix.drawsPerCase;
  const complete = observations.length === declaredDraws;
  const falseRejectionRate = supported.length === 0 ? null : falseRejections.length / supported.length;
  const countsByCase = new Map<string, number>();
  for (const row of observations) countsByCase.set(row.caseId, (countsByCase.get(row.caseId) ?? 0) + 1);
  const completedCases = [...countsByCase.values()].filter((count) => count === input.matrix.drawsPerCase).length;
  const caseAgreement = input.matrix.cases.flatMap((testCase) => {
    const rows = observations.filter((row) => row.caseId === testCase.id);
    if (rows.length === 0) return [];
    const counts = {
      supported: rows.filter((row) => row.disposition === "supported").length,
      unsupported: rows.filter((row) => row.disposition === "unsupported").length,
      unclear: rows.filter((row) => row.disposition === "unclear").length,
      unavailable: rows.filter((row) => row.disposition === "unavailable").length
    };
    return [{
      caseId: testCase.id,
      completedDraws: rows.length,
      ...counts,
      unanimous: Object.values(counts).filter((count) => count > 0).length === 1
    }];
  });
  const summary = {
    declaredCases: input.matrix.cases.length,
    declaredDraws,
    completedCases,
    completedDraws: observations.length,
    supportedControlDraws: supported.length,
    unsupportedControlDraws: unsupported.length,
    falseAcceptances: falseAcceptances.length,
    falseAcceptanceCaseIds: unique(falseAcceptances.map((row) => row.caseId)),
    falseRejections: falseRejections.length,
    falseRejectionCaseIds: unique(falseRejections.map((row) => row.caseId)),
    falseRejectionRate,
    unavailableDraws: unavailable.length,
    stoppedEarly,
    complete,
    passed: complete
      && falseAcceptances.length <= input.matrix.maximumFalseAcceptances
      && unavailable.length === 0
      && falseRejectionRate !== null
      && falseRejectionRate <= input.matrix.maximumFalseRejectionRate
  };
  return {
    schemaVersion: "lrnki.source-material-claim-support-qualification-report.v1",
    startedAt,
    completedAt: now().toISOString(),
    verifierModel: input.verifier.model,
    thresholds: {
      drawsPerCase: input.matrix.drawsPerCase,
      maximumFalseAcceptances: input.matrix.maximumFalseAcceptances,
      maximumFalseRejectionRate: input.matrix.maximumFalseRejectionRate
    },
    summary,
    caseAgreement,
    observations
  };
}

export function parseSourceMaterialClaimSupportQualificationMatrix(
  value: unknown
): SourceMaterialClaimSupportQualificationMatrix {
  const root = record(value, "qualification matrix");
  if (root.schemaVersion !== SOURCE_MATERIAL_CLAIM_SUPPORT_QUALIFICATION_SCHEMA_VERSION) {
    throw new Error(`Unsupported source-support qualification schema ${JSON.stringify(root.schemaVersion)}.`);
  }
  const drawsPerCase = boundedInteger(root.drawsPerCase, "drawsPerCase", 1, 10);
  const maximumFalseAcceptances = boundedInteger(root.maximumFalseAcceptances, "maximumFalseAcceptances", 0, 0);
  const maximumFalseRejectionRate = boundedNumber(root.maximumFalseRejectionRate, "maximumFalseRejectionRate", 0, 1);
  const sources: SourceMaterialClaimSupportQualificationSource[] = array(root.sources, "sources").map((entry, index) => {
    const source = record(entry, `sources[${index}]`);
    const sourceClass = source.sourceClass;
    if (sourceClass !== "project_diagnostic" && sourceClass !== "held_out_real_source") {
      throw new Error(`sources[${index}].sourceClass is invalid.`);
    }
    const subject = record(source.subject, `sources[${index}].subject`);
    return {
      path: nonEmpty(source.path, `sources[${index}].path`),
      contentType: nonEmpty(source.contentType, `sources[${index}].contentType`),
      sourceClass,
      declaredDomain: nonEmpty(source.declaredDomain, `sources[${index}].declaredDomain`),
      subject: {
        canonicalLabel: nonEmpty(subject.canonicalLabel, `sources[${index}].subject.canonicalLabel`),
        aliases: array(subject.aliases, `sources[${index}].subject.aliases`).map((alias, aliasIndex) =>
          nonEmpty(alias, `sources[${index}].subject.aliases[${aliasIndex}]`)
        )
      }
    };
  });
  const sourcePaths = unique(sources.map((source) => source.path));
  if (sourcePaths.length !== sources.length) throw new Error("Qualification source paths must be unique.");
  const knownSources = new Set(sourcePaths);
  const cases: SourceMaterialClaimSupportQualificationCase[] = array(root.cases, "cases").map((entry, index) => {
    const testCase = record(entry, `cases[${index}]`);
    const expected = testCase.expected;
    if (expected !== "supported" && expected !== "unsupported") {
      throw new Error(`cases[${index}].expected is invalid.`);
    }
    const source = nonEmpty(testCase.source, `cases[${index}].source`);
    if (!knownSources.has(source)) throw new Error(`cases[${index}] references unknown source ${JSON.stringify(source)}.`);
    return {
      id: nonEmpty(testCase.id, `cases[${index}].id`),
      source,
      harmClass: nonEmpty(testCase.harmClass, `cases[${index}].harmClass`),
      expected,
      evidenceQuotes: array(testCase.evidenceQuotes, `cases[${index}].evidenceQuotes`).map((quote, quoteIndex) =>
        nonEmpty(quote, `cases[${index}].evidenceQuotes[${quoteIndex}]`)
      ),
      claim: nonEmpty(testCase.claim, `cases[${index}].claim`)
    };
  });
  if (cases.length === 0) throw new Error("Qualification matrix must contain cases.");
  if (cases.some((testCase) => testCase.evidenceQuotes.length === 0)) {
    throw new Error("Every qualification case requires at least one evidence quote.");
  }
  if (unique(cases.map((testCase) => testCase.id)).length !== cases.length) {
    throw new Error("Qualification case ids must be unique.");
  }
  if (!cases.some((testCase) => testCase.expected === "supported") || !cases.some((testCase) => testCase.expected === "unsupported")) {
    throw new Error("Qualification matrix requires both supported and unsupported controls.");
  }
  return {
    schemaVersion: SOURCE_MATERIAL_CLAIM_SUPPORT_QUALIFICATION_SCHEMA_VERSION,
    drawsPerCase,
    maximumFalseAcceptances,
    maximumFalseRejectionRate,
    sources,
    cases
  };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function boundedInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
  return value;
}

function boundedNumber(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be a number from ${minimum} through ${maximum}.`);
  }
  return value;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function boundedError(error: unknown): string {
  return (error instanceof Error ? `${error.name}: ${error.message}` : String(error))
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 800);
}
