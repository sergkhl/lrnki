import type { Concept, GraphSnapshot, StructuredDocument } from "@lrnki/domain-core";
import type { ArtifactRepositoryPort, ConceptAdmissionPort, ConceptConditionedClaimExtractionPort, ConceptDiscoveryPort, GraphPublicationRepositoryPort } from "@lrnki/ports";
import { verifyEvidenceQuote } from "./verifyEvidenceQuote";

export async function buildCoreConceptGraph(input: {
  graphVersionId: string;
  document: StructuredDocument;
  discovery: ConceptDiscoveryPort;
  admission: ConceptAdmissionPort;
  claimExtraction: ConceptConditionedClaimExtractionPort;
  artifacts: ArtifactRepositoryPort;
  publication: GraphPublicationRepositoryPort;
}): Promise<GraphSnapshot> {
  const candidates = await input.discovery.discover({ document: input.document });
  const decisions = await input.admission.admit({ document: input.document, candidates });
  const accepted = decisions.filter((decision) => decision.tier === "core");
  const concepts: Concept[] = accepted.map((decision) => {
    const candidate = candidates.find((item) => item.candidateId === decision.candidateId);
    if (!candidate) throw new Error(`Missing candidate for admission decision: ${decision.candidateId}`);
    return {
      conceptId: candidate.candidateId,
      iri: `https://lrnki.local/concept/${encodeURIComponent(candidate.canonicalLabel.toLowerCase().replace(/\s+/g, "-"))}`,
      canonicalLabel: candidate.canonicalLabel,
      aliases: candidate.aliases,
      trustTier: "curated_source_grounded"
    };
  });

  const claims: GraphSnapshot["claims"] = [];
  for (const concept of concepts) {
    const neighborhood = input.document.blocks.filter((block) => block.text.toLowerCase().includes(concept.canonicalLabel.toLowerCase()));
    for (const claim of await input.claimExtraction.extract({ document: input.document, concept, evidenceNeighborhood: neighborhood })) {
      if (!claim.evidence.every((evidence) => verifyEvidenceQuote(input.document, evidence))) {
        throw new Error(`Claim ${claim.claimId} contains unsupported evidence.`);
      }
      claims.push(claim);
    }
  }

  const snapshot: GraphSnapshot = { graphVersionId: input.graphVersionId, concepts, claims };
  await input.artifacts.append({
    artifactId: `${input.graphVersionId}:snapshot`, artifactType: "graph_snapshot.v1", schemaVersion: "1", graphVersionId: input.graphVersionId,
    producer: "@lrnki/application", producerVersion: "0.1.0", configHash: "scaffold", createdAt: new Date().toISOString(), payload: snapshot
  });
  await input.publication.publish(snapshot);
  return snapshot;
}
