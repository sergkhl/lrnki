import {
  evidenceQuoteMatches,
  type AdmissionOracleScore,
  type FrozenAdmissionOracle,
  type FrozenOracleLabel,
  type OracleTierMetrics,
  type ProductionAdmittedConcept,
  type SourceBlock
} from "@lrnki/domain-core";
import type { OracleAdmissionAuditPort, OracleAdmissionReferencePort } from "@lrnki/ports";

// Gate 2 oracle independence triangle (ADR-0013, AGENTS rule 11). This module is
// the durable composition: it drives the reference author + second judge through
// their ports and freezes the audited, quarantine-aware reference. It performs no
// LLM transport itself (ports are injected) and never touches publication.

export type AdmissionOracleSource = {
  sourceResourceId: string;
  declaredDomain: string;
  title: string;
  sourceContentHash: string;
  blocks: SourceBlock[];
};

// Verbatim-grounding floor (the same deterministic guarantee ADR-0007/0020 keep
// authoritative): an oracle reference may only cite text that exists in the
// source. Drop non-matching quotes; a label left with no grounded quote is
// quarantined fail-closed rather than trusted on text absent from the source.
function groundedQuotes(quotes: string[], blocks: SourceBlock[]): string[] {
  return quotes.filter((quote) => blocks.some((block) => evidenceQuoteMatches(block.text, quote)));
}

export async function buildAdmissionOracle(input: {
  source: AdmissionOracleSource;
  referencePort: OracleAdmissionReferencePort;
  auditPort: OracleAdmissionAuditPort;
  promptVersion: string;
  rubricVersion: string;
  // Optional delay before each second-judge audit call. Rate-limited audit
  // models (e.g. Mistral free tier) reject rapid sequential calls; this paces
  // them. Off by default — the client's own 429 backoff handles transient hits.
  auditPacingMs?: number;
  onLabel?: (label: FrozenOracleLabel) => void;
}): Promise<FrozenAdmissionOracle> {
  const { source, referencePort, auditPort } = input;
  const pace = () => (input.auditPacingMs ? new Promise<void>((resolve) => setTimeout(resolve, input.auditPacingMs)) : Promise.resolve());
  const draft = await referencePort.author({
    declaredDomain: source.declaredDomain,
    title: source.title,
    sourceBlocks: source.blocks
  });

  const labels: FrozenOracleLabel[] = [];
  for (const candidate of draft.labels) {
    const grounded = groundedQuotes(candidate.evidenceQuotes, source.blocks);
    if (grounded.length === 0) {
      // Fail closed: no verbatim evidence => cannot trust this reference label.
      const label: FrozenOracleLabel = {
        ...candidate,
        evidenceQuotes: candidate.evidenceQuotes,
        secondJudgeStatus: "quarantined",
        quarantineReason: "evidence_not_grounded",
        auditRationale: "No cited evidence quote matches the source verbatim."
      };
      labels.push(label);
      input.onLabel?.(label);
      continue;
    }

    await pace();
    const verdict = await auditPort.audit({
      declaredDomain: source.declaredDomain,
      label: candidate.label,
      expectedTier: candidate.expectedTier,
      evidenceQuotes: grounded,
      sourceBlocks: source.blocks
    });
    const label: FrozenOracleLabel = {
      ...candidate,
      evidenceQuotes: grounded,
      secondJudgeStatus: verdict.agrees ? "agreed" : "quarantined",
      ...(verdict.agrees ? {} : { quarantineReason: "audit_disagreement" as const }),
      auditRationale: verdict.rationale
    };
    labels.push(label);
    input.onLabel?.(label);
  }

  return {
    meta: {
      sourceResourceId: source.sourceResourceId,
      declaredDomain: source.declaredDomain,
      title: source.title,
      sourceContentHash: source.sourceContentHash,
      referenceModel: referencePort.model,
      auditModel: auditPort.model,
      promptVersion: input.promptVersion,
      rubricVersion: input.rubricVersion,
      authoredAt: new Date().toISOString(),
      authoredBy: "oracle-triangle",
      needsHumanReview: true
    },
    labels
  };
}

function ratio(matched: number, denominator: number): number {
  if (denominator === 0) return matched === 0 ? 1 : 0;
  return matched / denominator;
}

function tierMetrics(referenceNorms: Set<string>, productionNorms: Set<string>): OracleTierMetrics {
  let matched = 0;
  for (const norm of referenceNorms) if (productionNorms.has(norm)) matched += 1;
  const precision = ratio(matched, productionNorms.size);
  const recall = ratio(matched, referenceNorms.size);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { referenceCount: referenceNorms.size, productionCount: productionNorms.size, matched, precision, recall, f1 };
}

// Pure scorer: production DeepSeek admission tiers vs the TRUSTED (agreed) oracle
// reference. Quarantined reference labels are excluded entirely (rule 11). Matching
// is by normalized label, the same identity key publication uses.
export function scoreAdmissionOracle(input: {
  sourceResourceId: string;
  runId: string;
  production: ProductionAdmittedConcept[];
  oracle: FrozenAdmissionOracle;
}): AdmissionOracleScore {
  const trusted = input.oracle.labels.filter((label) => label.secondJudgeStatus === "agreed");
  const quarantined = input.oracle.labels.length - trusted.length;

  const trustedCore = trusted.filter((label) => label.expectedTier === "core");
  const trustedCoreNorms = new Set(trustedCore.map((label) => label.normalizedLabel));
  const trustedAdmitNorms = new Set(trusted.map((label) => label.normalizedLabel));

  const prodCore = input.production.filter((concept) => concept.tier === "core");
  const prodCoreNorms = new Set(prodCore.map((concept) => concept.normalizedLabel));
  const prodAdmitNorms = new Set(
    input.production.filter((concept) => concept.tier === "core" || concept.tier === "optional").map((concept) => concept.normalizedLabel)
  );

  const missedCore = trustedCore.filter((label) => !prodCoreNorms.has(label.normalizedLabel)).map((label) => label.label);
  const extraCore = prodCore.filter((concept) => !trustedCoreNorms.has(concept.normalizedLabel)).map((concept) => concept.canonicalLabel);

  return {
    sourceResourceId: input.sourceResourceId,
    runId: input.runId,
    quarantinedReferenceLabels: quarantined,
    core: tierMetrics(trustedCoreNorms, prodCoreNorms),
    admit: tierMetrics(trustedAdmitNorms, prodAdmitNorms),
    missedCore,
    extraCore
  };
}
