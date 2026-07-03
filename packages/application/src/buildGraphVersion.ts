import {
  CONCEPT_IDENTITY_DECISION_TYPE,
  slugifyConceptLabel,
  type ArtifactEnvelope,
  type BuildEvidencePassage,
  type Concept,
  type ConceptIdentityDecision,
  type GraphSnapshot,
  type PublishedConceptEvidenceProfile,
  type PublishedEvidencePassage,
  type PublishedTypedAssertion,
  type RefinementDecisionRecord,
  type TrustTier
} from "@lrnki/domain-core";
import type { GraphVersionStorePort, ExtractionRunStorePort, RunProgressReporterPort } from "@lrnki/ports";
import { NON_LLM_STAGES, noopRunProgressReporter, runInstrumentedOperation } from "./runProgressReporter";

const PRODUCER = "@lrnki/application";
const PRODUCER_VERSION = "0.6.0";
const REFINEMENT_CONFIG_HASH = "cep-union-build-v1";
const GRAPH_SNAPSHOT_ARTIFACT_TYPE = "graph_snapshot";

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
  // Recorded semantic identity-resolution decisions (plan 2026-06-26-002, KTD1/KTD3).
  // The build CONSUMES these — it makes no model call (R8). `merge` decisions remap an
  // absorbed identity key onto its survivor; a `quarantine` decision (case B) refuses
  // the build (R7). Absent/empty → exact-label-only identity, exactly as before.
  identityDecisions?: ConceptIdentityDecision[];
  // Run-progress reporter seam (ADR-0029). Minting is LLM-free, so all three stages are
  // non-LLM (wall-clock only, never in the cost half). Absent → no-op.
  reporter?: RunProgressReporterPort;
}): Promise<GraphSnapshot> {
  if (input.runIds.length === 0) throw new Error("buildGraphVersion requires explicit run IDs to publish.");
  const reporter = input.reporter ?? noopRunProgressReporter;
  const operationId = input.graphVersionId;
  return runInstrumentedOperation(reporter, "minting", operationId, async (buildStage) => {
    // Load — resolve the selected runs and the base version, failing closed on a
    // quarantine decision or an incomplete core CEP before any assembly.
    const { runs, base, existingIdentities } = await buildStage(NON_LLM_STAGES.load, async () => {
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

      // Identity-resolution case B (plan R7, KTD4): a cluster of two-or-more already-
      // published Concepts is a published-identity collision the build must refuse rather
      // than re-key — resolving it would retire a minted IRI (ADR-0010/ADR-0015). Fail
      // closed before any assembly and name the colliding published Concepts; quarantine
      // plus re-run is the v1 escape hatch (R10).
      const identityQuarantines = (input.identityDecisions ?? []).filter((decision) => decision.outcome === "quarantine");
      if (identityQuarantines.length) {
        const collisions = identityQuarantines.map((decision) => {
          const published = decision.members.filter((member) => member.published).map((member) => member.canonicalLabel);
          return `${decision.declaredDomain}: ${published.join(" ⇄ ")}`;
        });
        throw new Error(`Refusing to build: identity resolution quarantined ${identityQuarantines.length} two-already-published collision(s): ${collisions.join("; ")}`);
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
      return { runs, base, existingIdentities };
  });

  // Refine — deterministic identity resolution, IRI minting, and CEP evidence union.
  const { snapshot, refinementDecisions, artifact } = await buildStage(NON_LLM_STAGES.refine, async () => {
    const refinementDecisions: RefinementDecisionRecord[] = [];

    // --- Semantic identity remap (plan 2026-06-26-002, R6) -------------------
    // Apply the supplied `merge` decisions deterministically: an absorbed identity key
    // folds onto its survivor's key, so the absorbed surface label becomes an alias and
    // its CEP evidence unions onto the survivor (KTD3, KTD8). `quarantine` decisions
    // already failed the build in the load stage; `distinct` decisions change no identity
    // and are persisted for audit only (R4). No model call happens here (R8).
    const identityMerges = (input.identityDecisions ?? []).filter((decision) => decision.outcome === "merge");
    const keyRemap = new Map<IdentityKey, IdentityKey>(); // absorbed key -> survivor key
    const survivorIdentity = new Map<IdentityKey, { normalizedLabel: string; canonicalLabel: string }>();
    for (const decision of identityMerges) {
      const survivor = decision.members.find((member) => member.normalizedLabel === decision.survivorNormalizedLabel);
      if (!survivor) continue;
      const survivorKey = identityKey(survivor.declaredDomain, survivor.normalizedLabel);
      survivorIdentity.set(survivorKey, { normalizedLabel: survivor.normalizedLabel, canonicalLabel: survivor.canonicalLabel });
      for (const member of decision.members) {
        if (member.normalizedLabel === survivor.normalizedLabel) continue;
        keyRemap.set(identityKey(member.declaredDomain, member.normalizedLabel), survivorKey);
      }
    }
    // The survivor's authoritative key (and presentation when it first seeds a cluster):
    // an absorbed key resolves to its survivor; everything else is its own exact-label key.
    const effectiveKey = (declaredDomain: string, normalizedLabel: string): IdentityKey =>
      keyRemap.get(identityKey(declaredDomain, normalizedLabel)) ?? identityKey(declaredDomain, normalizedLabel);

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

    // Seed clusters from the base version so its Concepts are carried forward. A base
    // Concept is only ever a merge SURVIVOR (a case-B collision of two published
    // Concepts already failed the build), so its effective key is its own key; routing
    // through effectiveKey keeps the seam uniform.
    for (const concept of base?.concepts ?? []) {
      const key = effectiveKey(concept.declaredDomain, concept.normalizedLabel);
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
        // A semantic-merge absorbed candidate routes onto its survivor's key (R6); its
        // CEP evidence then unions onto the survivor below via candidateIdentity.
        const ownKey = identityKey(run.declaredDomain, candidate.normalizedLabel);
        const key = effectiveKey(run.declaredDomain, candidate.normalizedLabel);
        const absorbed = key !== ownKey;
        candidateIdentity.set(runCandidateKey(run.runId, candidate.candidateKey), key);
        const existing = clusters.get(key);
        if (existing) {
          existing.aliases.add(candidate.canonicalLabel);
          candidate.aliases.forEach((alias) => existing.aliases.add(alias));
          // An exact-label union within a domain is a `domain_scoped_merge`; a semantic
          // absorption is already recorded by its identity decision (R4), so don't
          // double-record it here with the (now false) "same normalized label" rationale.
          if (!absorbed) {
            refinementDecisions.push({
              decisionType: "domain_scoped_merge",
              subject: { declaredDomain: run.declaredDomain, normalizedLabel: candidate.normalizedLabel, label: candidate.canonicalLabel },
              outcome: existing.fromBase ? "merged_into_base" : "merged",
              rationale: "Same normalized label within the same Declared Domain (ADR-0015).",
              provenance: { runId: run.runId, candidateKey: candidate.candidateKey }
            });
          }
        } else {
          // First entry under this key seeds the cluster. For a case-C survivor the key is
          // the survivor's own; the cluster's presentation is the survivor's label, not an
          // absorbed member's, even if the absorbed member is processed first.
          const survivor = survivorIdentity.get(key);
          clusters.set(key, {
            declaredDomain: run.declaredDomain,
            normalizedLabel: survivor?.normalizedLabel ?? candidate.normalizedLabel,
            canonicalLabel: survivor?.canonicalLabel ?? candidate.canonicalLabel,
            aliases: new Set([survivor?.canonicalLabel ?? candidate.canonicalLabel, candidate.canonicalLabel, ...candidate.aliases]),
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
    // deduplicated by (source, block, quote); `defines` assertions are keyed by
    // literal value and their evidence merged.
    type AssertionAcc = {
      type: PublishedTypedAssertion["type"];
      literalValue?: string;
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
        const assertionKey = `defines|${assertion.literalValue}`;
        const existing = acc.assertions.get(assertionKey) ?? { type: "defines" as const, literalValue: assertion.literalValue, evidence: new Map() };
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
          const assertionKey = `defines|${assertion.literalValue}`;
          const existing = acc.assertions.get(assertionKey) ?? { type: "defines" as const, literalValue: assertion.literalValue, evidence: new Map() };
          for (const passage of assertion.evidence) addAssertionEvidence(existing, acc.sources, toPublishedPassage(run.sourceResourceId, passage));
          acc.assertions.set(assertionKey, existing);
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
      const assertions: PublishedTypedAssertion[] = [...(acc?.assertions.values() ?? [])].map((assertion) => ({
        type: "defines",
        literalValue: assertion.literalValue!,
        evidence: [...assertion.evidence.values()]
      }));
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

    // Persist the applied identity decisions alongside the exact-label decisions (KTD3,
    // R5). Quarantine decisions already failed the build, so only `merge`/`distinct`
    // reach publication; the absorbed surface labels they carry are inspectable (R10).
    for (const decision of (input.identityDecisions ?? []).filter((d) => d.outcome !== "quarantine")) {
      refinementDecisions.push({
        decisionType: CONCEPT_IDENTITY_DECISION_TYPE,
        subject: { declaredDomain: decision.declaredDomain, survivorNormalizedLabel: decision.survivorNormalizedLabel, members: decision.members },
        outcome: decision.outcome,
        rationale: decision.rationale,
        provenance: {
          proposingSignal: decision.proposingSignal,
          proposingScore: decision.proposingScore,
          decidingModel: decision.decidingModel,
          configHash: decision.configHash
        }
      });
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
      graphVersionId: input.graphVersionId,
      producer: PRODUCER,
      producerVersion: PRODUCER_VERSION,
      configHash: REFINEMENT_CONFIG_HASH,
      createdAt: new Date().toISOString(),
      payload: snapshot
    };
    return { snapshot, refinementDecisions, artifact };
  });

  // Atomic publication: graph-version rows, unioned CEP evidence, and the immutable
  // artifact envelope are written in one transaction (R: no authoritative
  // relational state without its artifact).
  await buildStage(NON_LLM_STAGES.persist, () =>
    input.graphStore.publish({
      snapshot,
      refinementConfigHash: REFINEMENT_CONFIG_HASH,
      runMemberships: runs.map((run) => ({ runId: run.runId, sourceResourceId: run.sourceResourceId })),
      refinementDecisions,
      artifact
    })
  );
  return snapshot;
  });
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
