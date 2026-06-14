import {
  slugifyConceptLabel,
  type Concept,
  type EvidenceReference,
  type GraphSnapshot,
  type PublishedClaim,
  type RefinementDecisionRecord,
  type TrustTier
} from "@lrnki/domain-core";
import type { ArtifactRepositoryPort, ExtractionRunStorePort, GraphVersionStorePort } from "@lrnki/ports";

const PRODUCER = "@lrnki/application";
const PRODUCER_VERSION = "0.2.0";
const REFINEMENT_CONFIG_HASH = "gate1-conservative-refinement-v1";

type IdentityKey = string; // `${declaredDomain}::${normalizedLabel}`
const identityKey = (declaredDomain: string, normalizedLabel: string): IdentityKey => `${declaredDomain}::${normalizedLabel}`;

// Deterministic, LLM-free Graph-Version Build (ADR-0017): explicitly selected
// runs -> conservative Static Graph Refinement (ADR-0009, ADR-0015) -> IRI minting
// at first publication -> quality gates -> atomic publication (ADR-0010). A pure
// function of (selected runs + refinement rules); replayable without model calls.
// Runs are chosen by the operator, never auto-selected — multiple runs per source
// are allowed (cross-source establishment per CONTEXT.md).
export async function buildGraphVersion(input: {
  graphVersionId: string;
  runIds: string[];
  runStore: ExtractionRunStorePort;
  graphStore: GraphVersionStorePort;
  artifacts: ArtifactRepositoryPort;
}): Promise<GraphSnapshot> {
  if (input.runIds.length === 0) throw new Error("buildGraphVersion requires explicit run IDs to publish.");
  const runs = await input.runStore.runsForBuildByIds(input.runIds);
  if (runs.length === 0) throw new Error("No extraction runs resolved for the requested run IDs.");

  // Quarantine gate (CONTEXT.md Graph-Version Build): a quarantine decision in any
  // selected run blocks publication until its identity or meaning conflict is
  // resolved. Fail closed before any assembly and name the offenders, rather than
  // silently publishing around them (AGENTS rule 11).
  const quarantined = runs
    .flatMap((run) => run.quarantinedCandidates.map((candidate) => `${run.runId}:${candidate.canonicalLabel}`));
  if (quarantined.length) {
    throw new Error(`Refusing to build: selected run(s) contain unresolved quarantine decisions: ${quarantined.join(", ")}`);
  }

  const existingIdentities = await input.graphStore.existingConceptIdentities();
  const refinementDecisions: RefinementDecisionRecord[] = [];

  // --- Identity resolution: domain-scoped merge (ADR-0015) -----------------
  // Group every core candidate by (declaredDomain, normalizedLabel). Candidates
  // sharing a key across runs merge into one concept; the same normalizedLabel
  // across different domains is flagged as a cross-domain homograph and
  // published separately, not quarantined.
  type Cluster = {
    declaredDomain: string;
    normalizedLabel: string;
    canonicalLabel: string;
    aliases: Set<string>;
    contributingRuns: Set<string>;
  };
  const clusters = new Map<IdentityKey, Cluster>();
  // Map (runId, candidateKey) -> identity key, to resolve claim endpoints later.
  const candidateIdentity = new Map<string, IdentityKey>();
  const runCandidateKey = (runId: string, candidateKey: string) => `${runId}::${candidateKey}`;

  for (const run of runs) {
    for (const candidate of run.coreCandidates) {
      const key = identityKey(run.declaredDomain, candidate.normalizedLabel);
      candidateIdentity.set(runCandidateKey(run.runId, candidate.candidateKey), key);
      const existing = clusters.get(key);
      if (existing) {
        existing.aliases.add(candidate.canonicalLabel);
        candidate.aliases.forEach((alias) => existing.aliases.add(alias));
        existing.contributingRuns.add(run.runId);
        refinementDecisions.push({
          decisionType: "domain_scoped_merge",
          subject: { declaredDomain: run.declaredDomain, normalizedLabel: candidate.normalizedLabel, label: candidate.canonicalLabel },
          outcome: "merged",
          rationale: "Same normalized label within the same Declared Domain (ADR-0015).",
          provenance: { runId: run.runId, candidateKey: candidate.candidateKey }
        });
      } else {
        clusters.set(key, {
          declaredDomain: run.declaredDomain,
          normalizedLabel: candidate.normalizedLabel,
          canonicalLabel: candidate.canonicalLabel,
          aliases: new Set([candidate.canonicalLabel, ...candidate.aliases]),
          contributingRuns: new Set([run.runId])
        });
      }
    }
  }

  // Homograph detection: same normalized label across distinct domains. Declared
  // Domain keeps these identities separate, so this is an inspection flag rather
  // than a quarantine or publication blocker (ADR-0015).
  const domainsByLabel = new Map<string, Set<string>>();
  for (const cluster of clusters.values()) {
    const set = domainsByLabel.get(cluster.normalizedLabel) ?? new Set<string>();
    set.add(cluster.declaredDomain);
    domainsByLabel.set(cluster.normalizedLabel, set);
  }
  const homographLabels = new Set([...domainsByLabel.entries()].filter(([, domains]) => domains.size > 1).map(([label]) => label));

  // --- IRI minting (ADR-0015): reuse existing IRI, else mint a fresh slug ---
  const existingByIdentity = new Map(existingIdentities.map((identity) => [identityKey(identity.declaredDomain, identity.normalizedLabel), identity] as const));
  const usedSlugs = new Set(existingIdentities.map((identity) => iriSlug(identity.iri)));
  const conceptByIdentity = new Map<IdentityKey, Concept>();
  const concepts: Concept[] = [];

  for (const [key, cluster] of clusters) {
    const isHomograph = homographLabels.has(cluster.normalizedLabel);
    if (isHomograph) {
      refinementDecisions.push({
        decisionType: "cross_domain_homograph_flag",
        subject: { normalizedLabel: cluster.normalizedLabel, declaredDomain: cluster.declaredDomain },
        outcome: "flagged",
        rationale: "Same normalized label appears in more than one Declared Domain; identities remain separate (ADR-0015).",
        provenance: { domains: [...(domainsByLabel.get(cluster.normalizedLabel) ?? [])] }
      });
    }
    const existing = existingByIdentity.get(key);
    const iri = existing ? existing.iri : mintIri(cluster.normalizedLabel, usedSlugs);
    const conceptId = existing ? existing.conceptId : crypto.randomUUID();
    const trustTier: TrustTier = cluster.contributingRuns.size > 1 ? "cross_source_synthesized" : "curated_source_grounded";
    const concept: Concept = {
      conceptId,
      iri,
      canonicalLabel: cluster.canonicalLabel,
      normalizedLabel: cluster.normalizedLabel,
      declaredDomain: cluster.declaredDomain,
      aliases: [...cluster.aliases].filter((alias) => alias !== cluster.canonicalLabel),
      trustTier,
      homograph: isHomograph
    };
    conceptByIdentity.set(key, concept);
    concepts.push(concept);
  }

  // --- Claims: map run candidates to published concepts, dedupe ------------
  const claims: PublishedClaim[] = [];
  const seenClaims = new Set<string>();
  for (const run of runs) {
    for (const claim of run.verifiedClaims) {
      const subjectKey = candidateIdentity.get(runCandidateKey(run.runId, claim.subjectCandidateKey));
      if (!subjectKey) continue;
      const subject = conceptByIdentity.get(subjectKey);
      if (!subject) continue;

      let object: PublishedClaim["object"];
      if (claim.object.kind === "concept") {
        const objectKey = candidateIdentity.get(runCandidateKey(run.runId, claim.object.candidateKey));
        const objectConcept = objectKey ? conceptByIdentity.get(objectKey) : undefined;
        if (!objectConcept) continue; // object not a published concept; drop (fail closed)
        if (objectConcept.conceptId === subject.conceptId) continue; // no self-loops
        object = { kind: "concept", conceptId: objectConcept.conceptId };
      } else {
        object = { kind: "literal", value: claim.object.value };
      }

      const dedupeKey = `${subject.conceptId}|${claim.predicate}|${object.kind === "concept" ? object.conceptId : object.value}`;
      if (seenClaims.has(dedupeKey)) {
        refinementDecisions.push({
          decisionType: "duplicate_claim_collapse",
          subject: { dedupeKey },
          outcome: "collapsed",
          rationale: "Identical subject/predicate/object already published in this version (ADR-0009).",
          provenance: { runId: run.runId }
        });
        continue;
      }
      seenClaims.add(dedupeKey);

      claims.push({
        claimId: crypto.randomUUID(),
        subjectConceptId: subject.conceptId,
        predicate: claim.predicate,
        object,
        evidence: claim.evidence as EvidenceReference[],
        trustTier: subject.trustTier,
        modelConfidence: claim.modelConfidence,
        evidenceCount: claim.evidenceCount,
        contradictionState: "none"
      });
    }
  }

  // --- Quality gates (ADR-0010): fail closed before publishing -------------
  for (const concept of concepts) {
    if (!concept.iri) throw new Error(`Concept ${concept.conceptId} has no IRI.`);
  }
  for (const claim of claims) {
    if (claim.evidenceCount < 1 || claim.evidence.length < 1) throw new Error(`Published claim ${claim.claimId} has no evidence.`);
  }

  const snapshot: GraphSnapshot = { graphVersionId: input.graphVersionId, concepts, claims };
  await input.graphStore.publish({
    snapshot,
    refinementConfigHash: REFINEMENT_CONFIG_HASH,
    runMemberships: runs.map((run) => ({ runId: run.runId, sourceResourceId: run.sourceResourceId })),
    refinementDecisions
  });
  await input.artifacts.append({
    artifactId: `${input.graphVersionId}:snapshot`,
    artifactType: "graph_snapshot.v1",
    schemaVersion: "1",
    graphVersionId: input.graphVersionId,
    producer: PRODUCER,
    producerVersion: PRODUCER_VERSION,
    configHash: REFINEMENT_CONFIG_HASH,
    createdAt: new Date().toISOString(),
    payload: snapshot
  });
  return snapshot;
}

function iriSlug(iri: string): string {
  return iri.split("/").pop() ?? iri;
}

function mintIri(normalizedLabel: string, usedSlugs: Set<string>): string {
  const base = slugifyConceptLabel(normalizedLabel);
  let slug = base;
  let suffix = 2;
  while (usedSlugs.has(slug)) slug = `${base}-${suffix++}`;
  usedSlugs.add(slug);
  return `https://lrnki.local/concept/${slug}`;
}
