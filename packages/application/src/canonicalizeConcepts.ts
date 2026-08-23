import {
  CONCEPT_CANONICALIZATION_ARTIFACT_TYPE,
  type ArtifactEnvelope,
  type ConceptCanonicalizationArtifact,
  type ConceptCanonicalizationUnavailable,
  type ConceptIdentityDecision,
  type GraphSnapshot,
  type PublishedConceptIdentity,
  type RunForBuild
} from "@lrnki/domain-core";
import type {
  ConceptCanonicalizationStorePort,
  ExtractionRunStorePort,
  GraphVersionStorePort,
  NodeEmbeddingPort,
  NodeMergeAdjudicationPort,
  RunProgressReporterPort
} from "@lrnki/ports";
import {
  DEFAULT_IDENTITY_RESOLUTION_CONFIG,
  resolveConceptIdentity,
  type ConceptIdentityCandidate,
  type ConceptIdentityResolutionConfig
} from "./resolveConceptIdentity";
import {
  NON_LLM_STAGES,
  noopRunProgressReporter,
  runInstrumentedOperation
} from "./runProgressReporter";

const PRODUCER = "@lrnki/application";
const PRODUCER_VERSION = "0.7.0";
const UNAVAILABLE_REASON_CAP = 500;
const UNAVAILABLE_RECORD_CAP = 10_000;

export type ConceptCanonicalizationMode = ConceptCanonicalizationArtifact["mode"];
export type ConceptCanonicalizationConfig = ConceptIdentityResolutionConfig;
export const DEFAULT_CONCEPT_CANONICALIZATION_CONFIG = DEFAULT_IDENTITY_RESOLUTION_CONFIG;

export type ConceptCanonicalizationSummary = {
  artifactId: string;
  mode: ConceptCanonicalizationMode;
  runCount: number;
  mergeCount: number;
  distinctCount: number;
  quarantineCount: number;
  unavailableCount: number;
};

// The single deep Concept Canonicalization use-case. Callers select immutable inputs and a mode;
// candidate reduction, semantic resolution, artifact validation, timeline attribution, and
// persistence remain behind this interface.
export async function canonicalizeConcepts(input: {
  artifactId: string;
  baseGraphVersionId: string | null;
  runIds: readonly string[];
  mode: ConceptCanonicalizationMode;
  configHash: string;
  runStore: ExtractionRunStorePort;
  graphStore: GraphVersionStorePort;
  canonicalizationStore: ConceptCanonicalizationStorePort;
  embedding?: NodeEmbeddingPort;
  adjudicator?: NodeMergeAdjudicationPort;
  config?: ConceptIdentityResolutionConfig;
  reporter?: RunProgressReporterPort;
}): Promise<ArtifactEnvelope<ConceptCanonicalizationArtifact>> {
  assertSelection(input.artifactId, input.runIds, input.configHash);
  if (input.mode === "semantic" && (!input.embedding || !input.adjudicator)) {
    throw new Error("Semantic Concept Canonicalization requires both embedding and adjudication ports.");
  }

  const reporter = input.reporter ?? noopRunProgressReporter;
  return runInstrumentedOperation(
    reporter,
    "canonicalization",
    input.artifactId,
    async (runStage) => {
      const { runs, base, publishedConceptIdentities } = await runStage(
        NON_LLM_STAGES.load,
        async () => {
          const runs = await input.runStore.runsForBuildByIds([...input.runIds]);
          assertResolvedRunOrder(input.runIds, runs);
          const base = input.baseGraphVersionId
            ? await input.graphStore.getPublishedSnapshot(input.baseGraphVersionId)
            : undefined;
          if (input.baseGraphVersionId && !base) {
            throw new Error(
              `Base graph version ${input.baseGraphVersionId} is not published; cannot canonicalize it.`
            );
          }
          const publishedConceptIdentities = stablePublishedIdentities(
            await input.graphStore.existingConceptIdentities()
          );
          return { runs, base, publishedConceptIdentities };
        }
      );

      let decisions: ConceptIdentityDecision[] = [];
      let unavailable: ConceptCanonicalizationUnavailable[] = [];
      if (input.mode === "semantic") {
        const result = await resolveConceptIdentity({
          candidates: identityCandidatesFromInputs({ runs, base, publishedConceptIdentities }),
          embedding: input.embedding,
          adjudicator: input.adjudicator,
          config: input.config ?? DEFAULT_IDENTITY_RESOLUTION_CONFIG,
          runStage
        });
        decisions = result.decisions;
        unavailable = result.unavailable;
      }

      const artifact = await runStage(NON_LLM_STAGES.refine, async () =>
        validateConceptCanonicalizationArtifact({
          artifactId: input.artifactId,
          artifactType: CONCEPT_CANONICALIZATION_ARTIFACT_TYPE,
          producer: PRODUCER,
          producerVersion: PRODUCER_VERSION,
          configHash: input.configHash,
          createdAt: new Date().toISOString(),
          payload: {
            mode: input.mode,
            baseGraphVersionId: input.baseGraphVersionId,
            runIds: [...input.runIds],
            publishedConceptIdentities,
            decisions,
            unavailable
          }
        })
      );

      await runStage(NON_LLM_STAGES.persist, () => input.canonicalizationStore.persist(artifact));
      return artifact;
    },
    input.configHash
  );
}

export async function loadConceptCanonicalizationArtifact(
  store: ConceptCanonicalizationStorePort,
  artifactId: string
): Promise<ArtifactEnvelope<ConceptCanonicalizationArtifact>> {
  const artifact = await store.getById(artifactId);
  if (!artifact) throw new Error(`Unknown Concept Canonicalization artifact: ${artifactId}.`);
  if ((artifact as ArtifactEnvelope<unknown>).artifactId !== artifactId) {
    throw new Error(
      `Concept Canonicalization store returned artifact ${(artifact as ArtifactEnvelope<unknown>).artifactId} for requested ${artifactId}.`
    );
  }
  return validateConceptCanonicalizationArtifact(artifact);
}

export function summarizeConceptCanonicalization(
  artifact: ArtifactEnvelope<ConceptCanonicalizationArtifact>
): ConceptCanonicalizationSummary {
  const count = (outcome: ConceptIdentityDecision["outcome"]) =>
    artifact.payload.decisions.filter((decision) => decision.outcome === outcome).length;
  return {
    artifactId: artifact.artifactId,
    mode: artifact.payload.mode,
    runCount: artifact.payload.runIds.length,
    mergeCount: count("merge"),
    distinctCount: count("distinct"),
    quarantineCount: count("quarantine"),
    unavailableCount: artifact.payload.unavailable.length
  };
}

// Runtime validation is deliberately applied on both generated and stored artifacts. PostgreSQL
// JSONB and test adapters are untyped at runtime; publication must not trust a cast at this seam.
export function validateConceptCanonicalizationArtifact(
  candidate: unknown
): ArtifactEnvelope<ConceptCanonicalizationArtifact> {
  const artifact = object(candidate, "Concept Canonicalization artifact");
  requiredString(artifact.artifactId, "artifactId");
  if (artifact.artifactType !== CONCEPT_CANONICALIZATION_ARTIFACT_TYPE) {
    throw new Error(
      `Wrong artifact type for Concept Canonicalization: ${String(artifact.artifactType)}.`
    );
  }
  requiredString(artifact.producer, "producer");
  requiredString(artifact.producerVersion, "producerVersion");
  requiredString(artifact.configHash, "configHash");
  const createdAt = requiredString(artifact.createdAt, "createdAt");
  if (Number.isNaN(Date.parse(createdAt))) {
    throw new Error("Malformed Concept Canonicalization artifact: createdAt is not an ISO timestamp.");
  }
  if (artifact.runId !== undefined || artifact.graphVersionId !== undefined) {
    throw new Error(
      "Malformed Concept Canonicalization artifact: multi-run canonicalization must not set envelope runId or graphVersionId."
    );
  }

  const payload = object(artifact.payload, "payload");
  if (payload.mode !== "semantic" && payload.mode !== "exact_label_only") {
    throw new Error("Malformed Concept Canonicalization artifact: unsupported mode.");
  }
  if (payload.baseGraphVersionId !== null) {
    requiredString(payload.baseGraphVersionId, "payload.baseGraphVersionId");
  }
  const runIds = stringArray(payload.runIds, "payload.runIds");
  if (runIds.length === 0 || new Set(runIds).size !== runIds.length) {
    throw new Error(
      "Malformed Concept Canonicalization artifact: runIds must be a non-empty ordered list without duplicates."
    );
  }

  if (!Array.isArray(payload.publishedConceptIdentities)) {
    throw new Error(
      "Malformed Concept Canonicalization artifact: publishedConceptIdentities must be an array."
    );
  }
  const publishedConceptIdentities = payload.publishedConceptIdentities.map((value, index) => {
    const identity = object(value, `publishedConceptIdentities[${index}]`);
    return {
      conceptId: requiredString(identity.conceptId, `publishedConceptIdentities[${index}].conceptId`),
      iri: requiredString(identity.iri, `publishedConceptIdentities[${index}].iri`),
      normalizedLabel: requiredString(
        identity.normalizedLabel,
        `publishedConceptIdentities[${index}].normalizedLabel`
      ),
      declaredDomain: requiredString(
        identity.declaredDomain,
        `publishedConceptIdentities[${index}].declaredDomain`
      )
    };
  });
  assertUniquePublishedIdentities(publishedConceptIdentities);
  const publishedByKey = new Map(
    publishedConceptIdentities.map((identity) => [identityKey(identity), identity] as const)
  );

  if (!Array.isArray(payload.decisions)) {
    throw new Error("Malformed Concept Canonicalization artifact: decisions must be an array.");
  }
  const decisions = payload.decisions.map((value, index) =>
    validateDecision(value, index, publishedByKey)
  );

  if (!Array.isArray(payload.unavailable)) {
    throw new Error("Malformed Concept Canonicalization artifact: unavailable must be an array.");
  }
  if (payload.unavailable.length > UNAVAILABLE_RECORD_CAP) {
    throw new Error(
      `Malformed Concept Canonicalization artifact: unavailable exceeds ${UNAVAILABLE_RECORD_CAP} records.`
    );
  }
  const unavailable = payload.unavailable.map((value, index) =>
    validateUnavailable(value, index)
  );

  if (payload.mode === "exact_label_only" && (decisions.length > 0 || unavailable.length > 0)) {
    throw new Error(
      "Malformed Concept Canonicalization artifact: exact_label_only mode cannot contain semantic decisions or unavailable neural results."
    );
  }
  assertUnavailableIsNotDistinct(decisions, unavailable);

  return {
    artifactId: artifact.artifactId as string,
    artifactType: CONCEPT_CANONICALIZATION_ARTIFACT_TYPE,
    producer: artifact.producer as string,
    producerVersion: artifact.producerVersion as string,
    configHash: artifact.configHash as string,
    createdAt,
    payload: {
      mode: payload.mode,
      baseGraphVersionId: payload.baseGraphVersionId as string | null,
      runIds,
      publishedConceptIdentities,
      decisions,
      unavailable
    }
  };
}

function identityCandidatesFromInputs(input: {
  runs: RunForBuild[];
  base: GraphSnapshot | undefined;
  publishedConceptIdentities: PublishedConceptIdentity[];
}): ConceptIdentityCandidate[] {
  const publishedKeys = new Set(
    input.publishedConceptIdentities.map((identity) => identityKey(identity))
  );
  const candidates: ConceptIdentityCandidate[] = [];

  if (input.base) {
    const definitionsByConcept = new Map(
      input.base.evidenceProfiles.map((profile) => [
        profile.conceptId,
        profile.definitions.map((definition) => definition.evidenceQuote)
      ] as const)
    );
    for (const concept of input.base.concepts) {
      candidates.push({
        declaredDomain: concept.declaredDomain,
        normalizedLabel: concept.normalizedLabel,
        canonicalLabel: concept.canonicalLabel,
        aliases: [...concept.aliases],
        definitions: definitionsByConcept.get(concept.conceptId) ?? [],
        published: true
      });
    }
  }

  for (const run of input.runs) {
    const definitionsByCandidate = new Map(
      run.evidenceProfiles.map((profile) => [
        profile.candidateKey,
        profile.definitions.map((definition) => definition.evidenceQuote)
      ] as const)
    );
    for (const candidate of run.coreCandidates) {
      candidates.push({
        declaredDomain: run.declaredDomain,
        normalizedLabel: candidate.normalizedLabel,
        canonicalLabel: candidate.canonicalLabel,
        aliases: [...candidate.aliases],
        definitions: definitionsByCandidate.get(candidate.candidateKey) ?? [],
        published: publishedKeys.has(
          identityKey({
            declaredDomain: run.declaredDomain,
            normalizedLabel: candidate.normalizedLabel
          })
        )
      });
    }
  }
  return candidates;
}

function validateDecision(
  value: unknown,
  index: number,
  publishedByKey: ReadonlyMap<string, PublishedConceptIdentity>
): ConceptIdentityDecision {
  const decision = object(value, `decisions[${index}]`);
  if (
    decision.outcome !== "merge" &&
    decision.outcome !== "distinct" &&
    decision.outcome !== "quarantine"
  ) {
    throw new Error(`Malformed Concept Canonicalization artifact: decisions[${index}] outcome.`);
  }
  const declaredDomain = requiredString(decision.declaredDomain, `decisions[${index}].declaredDomain`);
  if (!Array.isArray(decision.members) || decision.members.length < 2) {
    throw new Error(
      `Malformed Concept Canonicalization artifact: decisions[${index}] must have at least two members.`
    );
  }
  const members = decision.members.map((value, memberIndex) => {
    const member = object(value, `decisions[${index}].members[${memberIndex}]`);
    const memberDomain = requiredString(
      member.declaredDomain,
      `decisions[${index}].members[${memberIndex}].declaredDomain`
    );
    if (memberDomain !== declaredDomain) {
      throw new Error(
        `Malformed Concept Canonicalization artifact: decisions[${index}] crosses Declared Domains.`
      );
    }
    const normalizedLabel = requiredString(
      member.normalizedLabel,
      `decisions[${index}].members[${memberIndex}].normalizedLabel`
    );
    const published = boolean(member.published, `decisions[${index}].members[${memberIndex}].published`);
    const ref = {
      declaredDomain: memberDomain,
      normalizedLabel,
      canonicalLabel: requiredString(
        member.canonicalLabel,
        `decisions[${index}].members[${memberIndex}].canonicalLabel`
      ),
      aliases: stringArray(member.aliases, `decisions[${index}].members[${memberIndex}].aliases`),
      definitions: stringArray(
        member.definitions,
        `decisions[${index}].members[${memberIndex}].definitions`
      ),
      published
    };
    if (published && !publishedByKey.has(identityKey(ref))) {
      throw new Error(
        `Malformed Concept Canonicalization artifact: published member ${identityKey(ref)} is absent from the captured registry.`
      );
    }
    return ref;
  });
  if (new Set(members.map((member) => member.normalizedLabel)).size !== members.length) {
    throw new Error(
      `Malformed Concept Canonicalization artifact: decisions[${index}] repeats an identity member.`
    );
  }

  const publishedMembers = members.filter((member) => member.published);
  let survivorNormalizedLabel: string | null;
  if (decision.outcome === "merge") {
    survivorNormalizedLabel = requiredString(
      decision.survivorNormalizedLabel,
      `decisions[${index}].survivorNormalizedLabel`
    );
    const survivor = members.find(
      (member) => member.normalizedLabel === survivorNormalizedLabel
    );
    if (!survivor || publishedMembers.length > 1) {
      throw new Error(
        `Malformed Concept Canonicalization artifact: decisions[${index}] has an invalid merge survivor.`
      );
    }
    if (publishedMembers.length === 1 && !survivor.published) {
      throw new Error(
        `Malformed Concept Canonicalization artifact: decisions[${index}] must retain its published survivor.`
      );
    }
  } else {
    if (decision.survivorNormalizedLabel !== null) {
      throw new Error(
        `Malformed Concept Canonicalization artifact: decisions[${index}] ${decision.outcome} cannot name a survivor.`
      );
    }
    survivorNormalizedLabel = null;
    if (decision.outcome === "distinct" && members.length !== 2) {
      throw new Error(
        `Malformed Concept Canonicalization artifact: decisions[${index}] distinct must have two members.`
      );
    }
    if (decision.outcome === "quarantine" && publishedMembers.length < 2) {
      throw new Error(
        `Malformed Concept Canonicalization artifact: decisions[${index}] quarantine requires two published members.`
      );
    }
  }
  if (decision.proposingSignal !== "embedding_cosine") {
    throw new Error(
      `Malformed Concept Canonicalization artifact: decisions[${index}] proposingSignal.`
    );
  }
  const proposingScore = finiteNumber(
    decision.proposingScore,
    `decisions[${index}].proposingScore`
  );
  if (proposingScore < -1 || proposingScore > 1) {
    throw new Error(
      `Malformed Concept Canonicalization artifact: decisions[${index}] proposingScore is outside cosine bounds.`
    );
  }
  return {
    outcome: decision.outcome,
    declaredDomain,
    members,
    survivorNormalizedLabel,
    proposingSignal: "embedding_cosine",
    proposingScore,
    rationale: requiredString(decision.rationale, `decisions[${index}].rationale`),
    decidingModel: requiredString(decision.decidingModel, `decisions[${index}].decidingModel`)
  };
}

function validateUnavailable(value: unknown, index: number): ConceptCanonicalizationUnavailable {
  const unavailable = object(value, `unavailable[${index}]`);
  const reason = requiredString(unavailable.reason, `unavailable[${index}].reason`);
  if (reason.length > UNAVAILABLE_REASON_CAP) {
    throw new Error(
      `Malformed Concept Canonicalization artifact: unavailable[${index}].reason exceeds ${UNAVAILABLE_REASON_CAP} characters.`
    );
  }
  const declaredDomain = requiredString(
    unavailable.declaredDomain,
    `unavailable[${index}].declaredDomain`
  );
  if (unavailable.kind === "embedding") return { kind: "embedding", declaredDomain, reason };
  if (unavailable.kind !== "adjudication") {
    throw new Error(
      `Malformed Concept Canonicalization artifact: unavailable[${index}] kind.`
    );
  }
  const aKey = requiredString(unavailable.aKey, `unavailable[${index}].aKey`);
  const bKey = requiredString(unavailable.bKey, `unavailable[${index}].bKey`);
  if (aKey === bKey || !aKey.startsWith(`${declaredDomain}::`) || !bKey.startsWith(`${declaredDomain}::`)) {
    throw new Error(
      `Malformed Concept Canonicalization artifact: unavailable[${index}] adjudication pair.`
    );
  }
  return {
    kind: "adjudication",
    declaredDomain,
    aKey,
    bKey,
    proposingScore: finiteNumber(
      unavailable.proposingScore,
      `unavailable[${index}].proposingScore`
    ),
    reason
  };
}

function assertUnavailableIsNotDistinct(
  decisions: readonly ConceptIdentityDecision[],
  unavailable: readonly ConceptCanonicalizationUnavailable[]
): void {
  const distinctPairs = new Set(
    decisions
      .filter((decision) => decision.outcome === "distinct")
      .map((decision) => pairKey(
        identityKey(decision.members[0]),
        identityKey(decision.members[1])
      ))
  );
  for (const record of unavailable) {
    if (record.kind === "adjudication" && distinctPairs.has(pairKey(record.aKey, record.bKey))) {
      throw new Error(
        "Malformed Concept Canonicalization artifact: an unavailable adjudication cannot also be a semantic distinct decision."
      );
    }
  }
}

function stablePublishedIdentities(
  identities: readonly PublishedConceptIdentity[]
): PublishedConceptIdentity[] {
  const copy = identities.map((identity) => ({ ...identity }));
  assertUniquePublishedIdentities(copy);
  return copy.sort(
    (a, b) =>
      a.declaredDomain.localeCompare(b.declaredDomain) ||
      a.normalizedLabel.localeCompare(b.normalizedLabel) ||
      a.conceptId.localeCompare(b.conceptId)
  );
}

function assertUniquePublishedIdentities(identities: readonly PublishedConceptIdentity[]): void {
  const keys = new Set<string>();
  const ids = new Set<string>();
  const iris = new Set<string>();
  for (const identity of identities) {
    const key = identityKey(identity);
    if (keys.has(key) || ids.has(identity.conceptId) || iris.has(identity.iri)) {
      throw new Error(
        `Malformed Concept Canonicalization artifact: duplicate published Concept identity ${key}.`
      );
    }
    keys.add(key);
    ids.add(identity.conceptId);
    iris.add(identity.iri);
  }
}

function assertSelection(
  artifactId: string,
  runIds: readonly string[],
  configHash: string
): void {
  requiredString(artifactId, "artifactId");
  requiredString(configHash, "configHash");
  if (runIds.length === 0 || runIds.some((runId) => runId.trim().length === 0)) {
    throw new Error("Concept Canonicalization requires one or more explicit Extraction Run IDs.");
  }
  if (new Set(runIds).size !== runIds.length) {
    throw new Error("Concept Canonicalization requires unique ordered Extraction Run IDs.");
  }
}

function assertResolvedRunOrder(requested: readonly string[], runs: readonly RunForBuild[]): void {
  if (
    requested.length !== runs.length ||
    requested.some((runId, index) => runs[index]?.runId !== runId)
  ) {
    throw new Error(
      "Extraction Run store returned a different ordered selection during Concept Canonicalization."
    );
  }
}

function identityKey(identity: { declaredDomain: string; normalizedLabel: string }): string {
  return `${identity.declaredDomain}::${identity.normalizedLabel}`;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Malformed Concept Canonicalization artifact: ${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Malformed Concept Canonicalization artifact: ${path} must be a non-empty string.`);
  }
  return value;
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Malformed Concept Canonicalization artifact: ${path} must be a string array.`);
  }
  return [...value] as string[];
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Malformed Concept Canonicalization artifact: ${path} must be boolean.`);
  }
  return value;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Malformed Concept Canonicalization artifact: ${path} must be finite.`);
  }
  return value;
}
