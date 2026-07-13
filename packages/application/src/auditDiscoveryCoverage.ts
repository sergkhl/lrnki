import { EXTRACTABLE_BLOCK_TYPES, type DiscoveryCoverageMiss } from "@lrnki/domain-core";
import type {
  DiscoveryCoverageAuditConcept,
  DiscoveryCoverageAuditPort,
  RunInspectionReadPort,
  SourceInspectionReadPort
} from "@lrnki/ports";
import { mapWithConcurrency } from "./mapWithConcurrency";

// Discovery-coverage audit (plan 2026-07-10-004 U1, KTD1). Answers the question the
// MiMo cutover left open: does the run's ADMITTED (core + optional) set preserve the
// source's principal learning structure? Raw candidate counts are the wrong recall
// metric in a precision-first pipeline — recall damage only materializes as concepts
// absent from the admitted set, so that is the layer this audits. The cross-family
// judge proposes misses; recurrence across K samples plus human inspection against
// the source (ADR-0013) decide — the audit never auto-verdicts.

// A miss recurs when at least this many of the K samples report it (R2). At the
// default K=3 a majority-of-samples signal separates stable judgments from one-off
// judge noise without demanding unanimity from a non-deterministic method (ADR-0028).
export const DISCOVERY_COVERAGE_RECURRENCE_THRESHOLD = 2;

const GIST_MAX_LENGTH = 240;

export type DiscoveryCoverageSample = {
  sampleIndex: number;
  misses: DiscoveryCoverageMiss[];
};

// One objective aggregated across samples, keyed by normalized label (R2). The
// instances keep each sample's exact wording and grounding for human inspection.
export type DiscoveryCoverageAggregatedMiss = {
  normalizedObjective: string;
  occurrences: number;
  recurring: boolean;
  instances: DiscoveryCoverageMiss[];
};

export type DiscoveryCoverageAuditReport = {
  runId: string;
  sourceResourceId: string;
  sourceTitle: string;
  declaredDomain: string;
  judgeModel: string;
  k: number;
  generatedAt: string;
  admittedConcepts: (DiscoveryCoverageAuditConcept & { tier: string })[];
  samples: DiscoveryCoverageSample[];
  aggregated: DiscoveryCoverageAggregatedMiss[];
  recurringCount: number;
};

export async function auditDiscoveryCoverage(input: {
  runId: string;
  runInspectionRead: RunInspectionReadPort;
  sourceInspectionRead: SourceInspectionReadPort;
  audit: DiscoveryCoverageAuditPort;
  k?: number;
  sampleConcurrency?: number;
  now?: Date;
  onSample?: (sample: DiscoveryCoverageSample) => void;
}): Promise<DiscoveryCoverageAuditReport> {
  const k = input.k ?? 3;
  if (!Number.isInteger(k) || k < 1) {
    throw new Error(`discovery-coverage audit requires a positive integer K, got ${k}.`);
  }
  const inspection = await input.runInspectionRead.getRunInspection(input.runId);
  if (!inspection) throw new Error(`extraction run not found: ${input.runId}`);
  const source = await input.sourceInspectionRead.getSourceInspection(inspection.run.sourceResourceId);
  if (!source) throw new Error(`source not found for run ${input.runId}: ${inspection.run.sourceResourceId}`);

  // Same visibility contract as discovery itself: the judge sees only the teachable
  // body (EXTRACTABLE_BLOCK_TYPES), so it cannot flag bibliography or appendix noise
  // the extractor was never shown.
  const blocks = source.blocks
    .filter((block) => (EXTRACTABLE_BLOCK_TYPES as string[]).includes(block.blockType))
    .map((block) => ({ blockType: block.blockType, headingPath: block.headingPath, text: block.text }));
  if (blocks.length === 0) throw new Error(`source ${inspection.run.sourceResourceId} has no teachable blocks.`);

  const admittedConcepts = admittedConceptsWithGists(inspection);
  const samples = await mapWithConcurrency(
    Array.from({ length: k }, (_, sampleIndex) => sampleIndex),
    input.sampleConcurrency ?? k,
    async (sampleIndex) => {
      const misses = await input.audit.audit({
        declaredDomain: inspection.run.declaredDomain,
        blocks,
        admittedConcepts: admittedConcepts.map(({ label, gist }) => ({ label, gist }))
      });
      const sample: DiscoveryCoverageSample = { sampleIndex, misses };
      input.onSample?.(sample);
      return sample;
    }
  );

  const aggregated = aggregateDiscoveryCoverageMisses(samples);
  return {
    runId: input.runId,
    sourceResourceId: inspection.run.sourceResourceId,
    sourceTitle: inspection.run.sourceTitle,
    declaredDomain: inspection.run.declaredDomain,
    judgeModel: input.audit.model,
    k,
    generatedAt: (input.now ?? new Date()).toISOString(),
    admittedConcepts,
    samples,
    aggregated,
    recurringCount: aggregated.filter((miss) => miss.recurring).length
  };
}

// Recurrence keyed by normalized objective label OR shared source grounding (R2): the
// judge words the same miss differently across samples, but a miss grounded in the
// same source evidence is the same miss (measured on the first real audit: the same
// one-sentence rule recurred 3/3 under three labels with one identical quote).
// Union-find over both keys; a miss still counts once per sample, so a sample
// repeating itself cannot manufacture recurrence.
export function aggregateDiscoveryCoverageMisses(samples: DiscoveryCoverageSample[]): DiscoveryCoverageAggregatedMiss[] {
  type Group = { samples: Set<number>; instances: DiscoveryCoverageMiss[]; objectiveKeys: Set<string> };
  const groupByKey = new Map<string, Group>();
  const groups = new Set<Group>();
  for (const sample of samples) {
    for (const miss of sample.misses) {
      const objectiveKey = normalizeObjectiveLabel(miss.missedObjective);
      if (!objectiveKey) continue;
      const groundingKey = `grounding:${normalizeObjectiveLabel(miss.sourceGrounding)}`;
      const keys = [`objective:${objectiveKey}`, ...(miss.sourceGrounding.trim() ? [groundingKey] : [])];
      const touched = [...new Set(keys.map((key) => groupByKey.get(key)).filter((group): group is Group => !!group))];
      const target: Group = touched[0] ?? { samples: new Set(), instances: [], objectiveKeys: new Set() };
      groups.add(target);
      for (const other of touched.slice(1)) {
        for (const index of other.samples) target.samples.add(index);
        target.instances.push(...other.instances);
        for (const key of other.objectiveKeys) target.objectiveKeys.add(key);
        groups.delete(other);
        for (const [key, group] of groupByKey) if (group === other) groupByKey.set(key, target);
      }
      target.samples.add(sample.sampleIndex);
      target.instances.push(miss);
      target.objectiveKeys.add(objectiveKey);
      for (const key of keys) groupByKey.set(key, target);
    }
  }
  return [...groups]
    .map((group): DiscoveryCoverageAggregatedMiss => ({
      normalizedObjective: [...group.objectiveKeys].sort()[0] ?? "",
      occurrences: group.samples.size,
      recurring: group.samples.size >= DISCOVERY_COVERAGE_RECURRENCE_THRESHOLD,
      instances: group.instances
    }))
    .sort((a, b) => b.occurrences - a.occurrences || a.normalizedObjective.localeCompare(b.normalizedObjective));
}

export function normalizeObjectiveLabel(objective: string): string {
  return objective
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Admitted (core + optional) concepts with a short evidence gist each (R1): the first
// verified definition passage, else the top mention, else the admission criterion's
// cited evidence — enough for the judge to see what a label actually covers.
function admittedConceptsWithGists(inspection: {
  candidates: {
    candidateKey: string;
    tier: string;
    proposedCanonicalLabel: string;
    canonicalLabel: string;
    standaloneLearningObjective: { evidence: { evidenceQuote: string }[] };
  }[];
  profiles: {
    candidateKey: string;
    definitions: { evidenceQuote: string }[];
    mentions: { evidenceQuote: string }[];
  }[];
}): (DiscoveryCoverageAuditConcept & { tier: string })[] {
  const profileByKey = new Map(inspection.profiles.map((profile) => [profile.candidateKey, profile]));
  return inspection.candidates
    .filter((candidate) => candidate.tier === "core" || candidate.tier === "optional")
    .map((candidate) => {
      const profile = profileByKey.get(candidate.candidateKey);
      const gistSource =
        profile?.definitions[0]?.evidenceQuote ??
        profile?.mentions[0]?.evidenceQuote ??
        candidate.standaloneLearningObjective.evidence[0]?.evidenceQuote ??
        "";
      return {
        label: candidate.proposedCanonicalLabel || candidate.canonicalLabel,
        tier: candidate.tier,
        gist: truncateGist(gistSource)
      };
    });
}

function truncateGist(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length <= GIST_MAX_LENGTH ? collapsed : `${collapsed.slice(0, GIST_MAX_LENGTH - 1)}…`;
}
