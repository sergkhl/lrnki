import {
  evidenceQuoteMatches,
  type AdmissionOracleScore,
  type AlignedAdmissionOracleScore,
  type FrozenAdmissionOracle,
  type FrozenOracleLabel,
  type FrozenOracleLabelAlignment,
  type OracleLabelAlignmentPair,
  type OracleTierMetrics,
  type ProductionAdmittedConcept,
  type SourceBlock
} from "@lrnki/domain-core";
import type { OracleAdmissionAuditPort, OracleAdmissionReferencePort, OracleLabelAlignmentPort } from "@lrnki/ports";

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

// Core of both scorers: compare the trusted reference against production tiers,
// where a production concept's identity is its EFFECTIVE normalized label. Exact
// scoring uses the concept's own normalized label; aligned scoring remaps surface
// variants onto the reference concept they name (see `effectiveNorm`).
function scoreTiers(
  trusted: FrozenOracleLabel[],
  production: ProductionAdmittedConcept[],
  effectiveNorm: (concept: ProductionAdmittedConcept) => string
): { core: OracleTierMetrics; admit: OracleTierMetrics; missedCore: string[]; extraCore: string[] } {
  const trustedCore = trusted.filter((label) => label.expectedTier === "core");
  const trustedCoreNorms = new Set(trustedCore.map((label) => label.normalizedLabel));
  const trustedAdmitNorms = new Set(trusted.map((label) => label.normalizedLabel));

  const prodCore = production.filter((concept) => concept.tier === "core");
  const prodCoreNorms = new Set(prodCore.map(effectiveNorm));
  const prodAdmitNorms = new Set(
    production.filter((concept) => concept.tier === "core" || concept.tier === "optional").map(effectiveNorm)
  );

  const missedCore = trustedCore.filter((label) => !prodCoreNorms.has(label.normalizedLabel)).map((label) => label.label);
  // Report each extra core concept once, keyed by its effective norm so two surface
  // variants of one production concept are not double-reported.
  const extraByNorm = new Map<string, string>();
  for (const concept of prodCore) {
    const norm = effectiveNorm(concept);
    if (!trustedCoreNorms.has(norm) && !extraByNorm.has(norm)) extraByNorm.set(norm, concept.canonicalLabel);
  }

  return {
    core: tierMetrics(trustedCoreNorms, prodCoreNorms),
    admit: tierMetrics(trustedAdmitNorms, prodAdmitNorms),
    missedCore,
    extraCore: [...extraByNorm.values()]
  };
}

// Pure scorer: production DeepSeek admission tiers vs the TRUSTED (agreed) oracle
// reference. Quarantined reference labels are excluded entirely (rule 11). Matching
// is by normalized label, the same identity key publication uses (ADR-0015).
export function scoreAdmissionOracle(input: {
  sourceResourceId: string;
  runId: string;
  production: ProductionAdmittedConcept[];
  oracle: FrozenAdmissionOracle;
}): AdmissionOracleScore {
  const trusted = input.oracle.labels.filter((label) => label.secondJudgeStatus === "agreed");
  const tiers = scoreTiers(trusted, input.production, (concept) => concept.normalizedLabel);
  return {
    sourceResourceId: input.sourceResourceId,
    runId: input.runId,
    quarantinedReferenceLabels: input.oracle.labels.length - trusted.length,
    ...tiers
  };
}

// Build the SCORING identity map from a frozen alignment: production normalized
// label -> the reference normalized label it is a surface variant of. Used only to
// remap production identity; reference labels stay distinct (an alignment edge only
// points production -> reference, never reference -> reference), so genuinely
// distinct reference concepts ("Operator" vs "Operator set") never merge.
function alignmentMap(alignment: FrozenOracleLabelAlignment): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of alignment.pairs) {
    if (pair.productionNormalizedLabel === pair.referenceNormalizedLabel) continue; // exact already matches
    if (!map.has(pair.productionNormalizedLabel)) map.set(pair.productionNormalizedLabel, pair.referenceNormalizedLabel);
  }
  return map;
}

// Pure aligned scorer (TODO #1, rule 16). Reports the deterministic exact baseline
// AND the aligned score side by side, so a wrong merge inflating the aligned number
// is visible against the floor. The frozen alignment carries the (auditable) merges.
export function scoreAdmissionOracleAligned(input: {
  sourceResourceId: string;
  runId: string;
  production: ProductionAdmittedConcept[];
  oracle: FrozenAdmissionOracle;
  alignment: FrozenOracleLabelAlignment;
}): AlignedAdmissionOracleScore {
  const trusted = input.oracle.labels.filter((label) => label.secondJudgeStatus === "agreed");
  const map = alignmentMap(input.alignment);
  const effectiveNorm = (concept: ProductionAdmittedConcept) => map.get(concept.normalizedLabel) ?? concept.normalizedLabel;

  const exact = scoreTiers(trusted, input.production, (concept) => concept.normalizedLabel);
  const aligned = scoreTiers(trusted, input.production, effectiveNorm);

  return {
    sourceResourceId: input.sourceResourceId,
    runId: input.runId,
    quarantinedReferenceLabels: input.oracle.labels.length - trusted.length,
    exact: { core: exact.core, admit: exact.admit },
    aligned: { core: aligned.core, admit: aligned.admit },
    surfaceVariantMatches: input.alignment.pairs.filter((pair) => pair.productionNormalizedLabel !== pair.referenceNormalizedLabel),
    missedCore: aligned.missedCore,
    extraCore: aligned.extraCore
  };
}

// Orchestrator: drive the injected aligner over the TRUSTED reference set and the
// production admitted labels, then freeze the surface-variant merges (rule 11). The
// aligner runs OFF the publication path and never relabels the graph. Membership and
// one-reference-per-production-label are re-checked here, fail closed, independent of
// the adapter, so the frozen alignment cannot reference an invented label.
export async function alignAdmissionLabels(input: {
  sourceResourceId: string;
  runId: string;
  declaredDomain: string;
  oracle: FrozenAdmissionOracle;
  production: ProductionAdmittedConcept[];
  alignmentPort: OracleLabelAlignmentPort;
  promptVersion: string;
}): Promise<FrozenOracleLabelAlignment> {
  const trusted = input.oracle.labels.filter((label) => label.secondJudgeStatus === "agreed");
  const referenceLabels = trusted.map((label) => ({ label: label.label, tier: label.expectedTier, rationale: label.rationale }));
  const referenceByLabel = new Set(referenceLabels.map((entry) => entry.label));
  const productionLabels = [
    ...new Set(
      input.production
        .filter((concept) => concept.tier === "core" || concept.tier === "optional")
        .map((concept) => concept.canonicalLabel)
    )
  ];
  const productionSet = new Set(productionLabels);

  const draft = await input.alignmentPort.align({
    declaredDomain: input.declaredDomain,
    referenceLabels,
    productionLabels
  });

  const claimed = new Set<string>();
  const pairs: OracleLabelAlignmentPair[] = [];
  for (const pair of draft.pairs) {
    if (!productionSet.has(pair.productionLabel) || !referenceByLabel.has(pair.referenceLabel)) continue;
    if (pair.productionNormalizedLabel === pair.referenceNormalizedLabel) continue; // exact already matches
    if (claimed.has(pair.productionLabel)) continue;
    claimed.add(pair.productionLabel);
    pairs.push(pair);
  }

  return {
    meta: {
      sourceResourceId: input.sourceResourceId,
      runId: input.runId,
      declaredDomain: input.declaredDomain,
      alignmentModel: input.alignmentPort.model,
      promptVersion: input.promptVersion,
      alignedAt: new Date().toISOString(),
      needsHumanReview: true
    },
    pairs
  };
}
