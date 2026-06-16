import {
  slugifyConceptLabel,
  type ArtifactEnvelope,
  type BuildEvidencePassage,
  type Concept,
  type GraphSnapshot,
  type PublishedConceptEvidenceProfile,
  type PublishedEvidencePassage,
  type PublishedTypedAssertion,
  type RefinementDecisionRecord,
  type TrustTier
} from "@lrnki/domain-core";
import type { GraphVersionStorePort, ExtractionRunStorePort } from "@lrnki/ports";

const PRODUCER = "@lrnki/application";
const PRODUCER_VERSION = "0.6.0";
const REFINEMENT_CONFIG_HASH = "cep-union-build-v1";
const GRAPH_SNAPSHOT_ARTIFACT_TYPE = "graph_snapshot.v2";
const GRAPH_SNAPSHOT_SCHEMA_VERSION = "2";

type IdentityKey = string; // `${declaredDomain}::${normalizedLabel}`
const identityKey = (declaredDomain: string, normalizedLabel: string): IdentityKey => `${declaredDomain}::${normalizedLabel}`;

// Deterministic, LLM-free Graph-Version Build (ADR-0017, ADR-0007 reset): an
// explicit base version plus explicitly selected runs -> domain-scoped identity
// resolution (ADR-0015) -> IRI minting at first publication -> append-only CEP
// evidence union -> atomic publication (ADR-0010). A pure function of (base
// version + selected runs); replayable without model calls. Publication UNIONS the
// base version's CEP evidence with the newly selected runs' source evidence and
// exact-deduplicates, so a later version never replaces previously published
// evidence (R3, AE2). The published snapshot exposes Concepts plus one CEP each and
// ZERO asserted edges (R5).
export async function buildGraphVersion(input: {
  graphVersionId: string;
  baseGraphVersionId: string | null;
  runIds: string[];
  runStore: ExtractionRunStorePort;
  graphStore: GraphVersionStorePort;
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

  // Every selected run's admitted-core Concept must carry a complete CEP (R1). A
  // core candidate with a missing or incomplete profile fails the build before any
  // publication so a Concept with no source-grounded meaning never enters the graph
  // (test scenario U4.3).
  for (const run of runs) {
    const profilesByKey = new Map(run.evidenceProfiles.map((profile) => [profile.candidateKey, profile] as const));
    for (const candidate of run.coreCandidates) {
      const profile = profilesByKey.get(candidate.candidateKey);
      if (!profile || !profile.complete || profile.definitions.length === 0) {
        throw new Error(`Refusing to build: run ${run.runId} core concept ${candidate.candidateKey} (${candidate.canonicalLabel}) has no complete Concept Evidence Profile.`);
      }
    }
  }

  // The base version this build extends (ADR-0007 reset R3). Its published CEP
  // evidence is carried forward and unioned with the new runs; `null` only for the
  // initial build.
  const base = input.baseGraphVersionId
    ? await input.graphStore.getPublishedSnapshot(input.baseGraphVersionId)
    : undefined;
  if (input.baseGraphVersionId && !base) {
    throw new Error(`Base graph version ${input.baseGraphVersionId} is not published; cannot extend it.`);
  }

  const existingIdentities = await input.graphStore.existingConceptIdentities();
  const refinementDecisions: RefinementDecisionRecord[] = [];

  // --- Identity resolution (ADR-0015) --------------------------------------
  // Concept identity is (declaredDomain, normalizedLabel). Base concepts are
  // carried forward; new core candidates merge into the same identity across runs
  // and into the base. The same normalizedLabel across different domains is a
  // cross-domain homograph: identities stay separate and are flagged, not merged.
  type Cluster = {
    declaredDomain: string;
    normalizedLabel: string;
    canonicalLabel: string;
    aliases: Set<string>;
    fromBase: boolean;
    baseConceptId?: string;
    baseIri?: string;
  };
  const clusters = new Map<IdentityKey, Cluster>();

  // Seed clusters from the base version so its Concepts are carried forward.
  for (const concept of base?.concepts ?? []) {
    const key = identityKey(concept.declaredDomain, concept.normalizedLabel);
    clusters.set(key, {
      declaredDomain: concept.declaredDomain,
      normalizedLabel: concept.normalizedLabel,
      canonicalLabel: concept.canonicalLabel,
      aliases: new Set([concept.canonicalLabel, ...concept.aliases]),
      fromBase: true,
      baseConceptId: concept.conceptId,
      baseIri: concept.iri
    });
  }

  // Map (runId, candidateKey) -> identity key, to resolve CEP profiles and
  // prerequisite-hint targets to published Concepts later.
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
        refinementDecisions.push({
          decisionType: "domain_scoped_merge",
          subject: { declaredDomain: run.declaredDomain, normalizedLabel: candidate.normalizedLabel, label: candidate.canonicalLabel },
          outcome: existing.fromBase ? "merged_into_base" : "merged",
          rationale: "Same normalized label within the same Declared Domain (ADR-0015).",
          provenance: { runId: run.runId, candidateKey: candidate.candidateKey }
        });
      } else {
        clusters.set(key, {
          declaredDomain: run.declaredDomain,
          normalizedLabel: candidate.normalizedLabel,
          canonicalLabel: candidate.canonicalLabel,
          aliases: new Set([candidate.canonicalLabel, ...candidate.aliases]),
          fromBase: false
        });
      }
    }
  }

  // Homograph detection over the full concept set: same normalized label across
  // distinct Declared Domains. Declared Domain keeps these identities separate, so
  // this is an inspection flag rather than a quarantine or publication blocker.
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
    if (isHomograph && !cluster.fromBase) {
      refinementDecisions.push({
        decisionType: "cross_domain_homograph_flag",
        subject: { normalizedLabel: cluster.normalizedLabel, declaredDomain: cluster.declaredDomain },
        outcome: "flagged",
        rationale: "Same normalized label appears in more than one Declared Domain; identities remain separate (ADR-0015).",
        provenance: { domains: [...(domainsByLabel.get(cluster.normalizedLabel) ?? [])] }
      });
    }
    const existing = existingByIdentity.get(key);
    const iri = cluster.baseIri ?? existing?.iri ?? mintIri(cluster.normalizedLabel, usedSlugs);
    const conceptId = cluster.baseConceptId ?? existing?.conceptId ?? crypto.randomUUID();
    const concept: Concept = {
      conceptId,
      iri,
      canonicalLabel: cluster.canonicalLabel,
      normalizedLabel: cluster.normalizedLabel,
      declaredDomain: cluster.declaredDomain,
      aliases: [...cluster.aliases].filter((alias) => alias !== cluster.canonicalLabel),
      // Set provisionally; finalized after the CEP union reveals the true source span.
      trustTier: "curated_source_grounded",
      homograph: isHomograph,
      groundingOrigin: "document_anchored",
      role: "anchor",
      layer: "asserted"
    };
    conceptByIdentity.set(key, concept);
    concepts.push(concept);
  }

  // --- CEP evidence union (R3, AE2): base evidence + new runs, deduped ------
  // Accumulator per published Concept. Definition and mention passages are
  // deduplicated by (source, block, quote); typed assertions are keyed by
  // (type, target) and their evidence merged. A prerequisite hint whose target is
  // not a published Concept in this version is omitted (R9, test U4.9).
  type AssertionAcc = {
    type: PublishedTypedAssertion["type"];
    literalValue?: string;
    objectConceptId?: string;
    evidence: Map<string, PublishedEvidencePassage>;
  };
  type ProfileAcc = {
    definitions: Map<string, PublishedEvidencePassage>;
    mentions: Map<string, PublishedEvidencePassage>;
    assertions: Map<string, AssertionAcc>;
    sources: Set<string>;
  };
  const passageKey = (passage: PublishedEvidencePassage) => `${passage.sourceResourceId}|${passage.sourceBlockId}|${passage.evidenceQuote}`;
  const accByConcept = new Map<string, ProfileAcc>();
  const accFor = (conceptId: string): ProfileAcc => {
    let acc = accByConcept.get(conceptId);
    if (!acc) {
      acc = { definitions: new Map(), mentions: new Map(), assertions: new Map(), sources: new Set() };
      accByConcept.set(conceptId, acc);
    }
    return acc;
  };
  const addPassage = (target: Map<string, PublishedEvidencePassage>, sources: Set<string>, passage: PublishedEvidencePassage) => {
    target.set(passageKey(passage), passage);
    sources.add(passage.sourceResourceId);
  };
  const addAssertionEvidence = (acc: AssertionAcc, sources: Set<string>, passage: PublishedEvidencePassage) => {
    acc.evidence.set(passageKey(passage), passage);
    sources.add(passage.sourceResourceId);
  };

  // 1) Carry forward the base version's published evidence verbatim.
  for (const profile of base?.evidenceProfiles ?? []) {
    if (!conceptByIdentity.size) break;
    const acc = accFor(profile.conceptId);
    for (const definition of profile.definitions) addPassage(acc.definitions, acc.sources, definition);
    for (const mention of profile.mentions) addPassage(acc.mentions, acc.sources, mention);
    for (const assertion of profile.assertions) {
      const assertionKey = assertion.type === "defines" ? `defines|${assertion.literalValue}` : `hint|${assertion.objectConceptId}`;
      const existing = acc.assertions.get(assertionKey) ?? (assertion.type === "defines"
        ? { type: "defines" as const, literalValue: assertion.literalValue, evidence: new Map() }
        : { type: "explicit-prerequisite-hint" as const, objectConceptId: assertion.objectConceptId, evidence: new Map() });
      for (const passage of assertion.evidence) addAssertionEvidence(existing, acc.sources, passage);
      acc.assertions.set(assertionKey, existing);
    }
  }

  // 2) Union the newly selected runs' CEP evidence onto the published identities.
  const toPublishedPassage = (sourceResourceId: string, passage: BuildEvidencePassage): PublishedEvidencePassage => ({
    sourceResourceId,
    sourceBlockId: passage.sourceBlockId,
    evidenceQuote: passage.evidenceQuote,
    headingPath: passage.headingPath,
    locator: passage.locator
  });
  for (const run of runs) {
    for (const profile of run.evidenceProfiles) {
      const identity = candidateIdentity.get(runCandidateKey(run.runId, profile.candidateKey));
      const concept = identity ? conceptByIdentity.get(identity) : undefined;
      if (!concept) continue; // profile for a non-core candidate: not published
      const acc = accFor(concept.conceptId);
      for (const definition of profile.definitions) addPassage(acc.definitions, acc.sources, toPublishedPassage(run.sourceResourceId, definition));
      for (const mention of profile.mentions) addPassage(acc.mentions, acc.sources, toPublishedPassage(run.sourceResourceId, mention));
      for (const assertion of profile.assertions) {
        if (assertion.type === "defines") {
          const assertionKey = `defines|${assertion.literalValue}`;
          const existing = acc.assertions.get(assertionKey) ?? { type: "defines" as const, literalValue: assertion.literalValue, evidence: new Map() };
          for (const passage of assertion.evidence) addAssertionEvidence(existing, acc.sources, toPublishedPassage(run.sourceResourceId, passage));
          acc.assertions.set(assertionKey, existing);
        } else {
          const targetIdentity = candidateIdentity.get(runCandidateKey(run.runId, assertion.objectCandidateKey));
          const targetConcept = targetIdentity ? conceptByIdentity.get(targetIdentity) : undefined;
          if (!targetConcept) {
            refinementDecisions.push({
              decisionType: "omitted_prerequisite_hint",
              subject: { subjectConceptId: concept.conceptId, objectCandidateKey: assertion.objectCandidateKey },
              outcome: "omitted",
              rationale: "Prerequisite-hint target is not a published Concept in this graph version (R9).",
              provenance: { runId: run.runId, candidateKey: profile.candidateKey }
            });
            continue;
          }
          const assertionKey = `hint|${targetConcept.conceptId}`;
          const existing = acc.assertions.get(assertionKey) ?? { type: "explicit-prerequisite-hint" as const, objectConceptId: targetConcept.conceptId, evidence: new Map() };
          for (const passage of assertion.evidence) addAssertionEvidence(existing, acc.sources, toPublishedPassage(run.sourceResourceId, passage));
          acc.assertions.set(assertionKey, existing);
        }
      }
    }
  }

  // Finalize trust tier from the unioned evidence span (cross-source when a
  // Concept's CEP draws on more than one curated source).
  for (const concept of concepts) {
    const sources = accByConcept.get(concept.conceptId)?.sources ?? new Set<string>();
    const tier: TrustTier = sources.size > 1 ? "cross_source_synthesized" : "curated_source_grounded";
    concept.trustTier = tier;
  }

  const evidenceProfiles: PublishedConceptEvidenceProfile[] = concepts.map((concept) => {
    const acc = accByConcept.get(concept.conceptId);
    const assertions: PublishedTypedAssertion[] = [...(acc?.assertions.values() ?? [])].map((assertion) =>
      assertion.type === "defines"
        ? { type: "defines", literalValue: assertion.literalValue!, evidence: [...assertion.evidence.values()] }
        : { type: "explicit-prerequisite-hint", objectConceptId: assertion.objectConceptId!, evidence: [...assertion.evidence.values()] }
    );
    return {
      conceptId: concept.conceptId,
      definitions: [...(acc?.definitions.values() ?? [])],
      mentions: [...(acc?.mentions.values() ?? [])],
      assertions
    };
  });

  // --- Quality gates (ADR-0010): fail closed before publishing -------------
  for (const concept of concepts) {
    if (!concept.iri) throw new Error(`Concept ${concept.conceptId} has no IRI.`);
  }
  for (const profile of evidenceProfiles) {
    if (profile.definitions.length === 0) {
      throw new Error(`Published concept ${profile.conceptId} has no definition passage; refusing to publish an edge-free Concept with no meaning.`);
    }
  }

  const snapshot: GraphSnapshot = {
    graphVersionId: input.graphVersionId,
    baseGraphVersionId: input.baseGraphVersionId,
    concepts,
    evidenceProfiles
  };
  const artifact: ArtifactEnvelope<GraphSnapshot> = {
    artifactId: `${input.graphVersionId}:snapshot`,
    artifactType: GRAPH_SNAPSHOT_ARTIFACT_TYPE,
    schemaVersion: GRAPH_SNAPSHOT_SCHEMA_VERSION,
    graphVersionId: input.graphVersionId,
    producer: PRODUCER,
    producerVersion: PRODUCER_VERSION,
    configHash: REFINEMENT_CONFIG_HASH,
    createdAt: new Date().toISOString(),
    payload: snapshot
  };
  // Atomic publication: graph-version rows, unioned CEP evidence, and the immutable
  // artifact envelope are written in one transaction (R: no authoritative
  // relational state without its artifact).
  await input.graphStore.publish({
    snapshot,
    refinementConfigHash: REFINEMENT_CONFIG_HASH,
    runMemberships: runs.map((run) => ({ runId: run.runId, sourceResourceId: run.sourceResourceId })),
    refinementDecisions,
    artifact
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
