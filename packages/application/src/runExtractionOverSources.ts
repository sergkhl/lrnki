import type { ExtractionRunResult, StructuredDocument } from "@lrnki/domain-core";
import type {
  AdmissionLabelJudgmentPort,
  AssertionEntailmentJudgmentPort,
  ConceptAdmissionPort,
  ConceptConditionedEvidenceProfileExtractionPort,
  ConceptDiscoveryPort,
  DefinitionPassageQualityJudgmentPort,
  ExtractionRunStorePort
} from "@lrnki/ports";
import { executeExtractionRun } from "./executeExtractionRun";
import { mapWithConcurrency } from "./mapWithConcurrency";

// Default degree for extraction-over-sources (plan U6/R11). Each source extraction is an
// independent unit, so this is the parallel-ready seam — defaulting to 1 keeps the run
// strictly sequential (unchanged behavior) while admitting future parallelism by raising
// the degree, with no architectural change. The CEP-extraction concurrency WITHIN one
// source is a separate bound owned by executeExtractionRun (KTD8, left untouched).
export const DEFAULT_EXTRACTION_OVER_SOURCES_CONCURRENCY = 1;

export type ExtractionSourceUnit = {
  runId: string;
  source: { sourceResourceId: string; sourceDocumentId: string; declaredDomain: string; document: StructuredDocument };
};

// Run one Extraction Run per source as an independent unit list driven through the shared
// bounded mapper (R11). Results are returned in input order regardless of completion order.
// The optional callbacks let an orchestrator log before/after each run without the
// application taking on console I/O; at degree 1 they fire in strict per-source order.
export async function runExtractionOverSources(input: {
  units: ExtractionSourceUnit[];
  pipelineConfigHash: string;
  discovery: ConceptDiscoveryPort;
  admission: ConceptAdmissionPort;
  evidenceProfileExtraction: ConceptConditionedEvidenceProfileExtractionPort;
  assertionEntailmentJudge: AssertionEntailmentJudgmentPort;
  admissionLabelJudge: AdmissionLabelJudgmentPort;
  definitionPassageQualityJudge: DefinitionPassageQualityJudgmentPort;
  store: ExtractionRunStorePort;
  concurrency?: number;
  onRunStart?: (unit: ExtractionSourceUnit) => void;
  onRunComplete?: (unit: ExtractionSourceUnit, result: ExtractionRunResult) => void;
}): Promise<ExtractionRunResult[]> {
  return mapWithConcurrency(
    input.units,
    input.concurrency ?? DEFAULT_EXTRACTION_OVER_SOURCES_CONCURRENCY,
    async (unit) => {
      input.onRunStart?.(unit);
      const result = await executeExtractionRun({
        runId: unit.runId,
        source: unit.source,
        pipelineConfigHash: input.pipelineConfigHash,
        discovery: input.discovery,
        admission: input.admission,
        evidenceProfileExtraction: input.evidenceProfileExtraction,
        assertionEntailmentJudge: input.assertionEntailmentJudge,
        admissionLabelJudge: input.admissionLabelJudge,
        definitionPassageQualityJudge: input.definitionPassageQualityJudge,
        store: input.store
      });
      input.onRunComplete?.(unit, result);
      return result;
    }
  );
}
