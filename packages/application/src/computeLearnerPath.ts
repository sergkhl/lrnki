import type { LearnerPath } from "@lrnki/domain-core";
import type {
  ArtifactRepositoryPort,
  DerivedGraphLayerStorePort,
  LearnerPathStorePort,
  LearnerStatePort
} from "@lrnki/ports";
import { projectLearnerPath } from "./learnerPathProjection";

const PRODUCER = "@lrnki/application";
const PRODUCER_VERSION = "0.5.0";

// Learner Path projection (ADR-0019, ADR-0011). Deterministic CLI operation: load
// the Derived Graph Layer for a published version, project the difficulty-ordered
// prerequisite chain for a target concept given a LearnerState (mock = "knows
// nothing"), and persist it. The Admin Lab Cytoscape view only renders the
// persisted artifact — it never computes (rule 12). Real IRT/KT swaps in by passing
// a different LearnerStatePort; nothing here changes.
export async function computeLearnerPath(input: {
  learnerPathId: string;
  graphVersionId: string;
  targetConceptId: string;
  layerStore: DerivedGraphLayerStorePort;
  learnerState: LearnerStatePort;
  pathStore: LearnerPathStorePort;
  artifacts: ArtifactRepositoryPort;
  masteryThreshold?: number;
}): Promise<LearnerPath> {
  const layer = await input.layerStore.getLatestLayer(input.graphVersionId);
  if (!layer) throw new Error(`computeLearnerPath: no enrichment layer for version ${input.graphVersionId}.`);
  if (!layer.difficulties.some((difficulty) => difficulty.conceptId === input.targetConceptId)) {
    throw new Error(`computeLearnerPath: target ${input.targetConceptId} is not in version ${input.graphVersionId}.`);
  }

  const steps = projectLearnerPath({
    targetConceptId: input.targetConceptId,
    prerequisiteEdges: layer.prerequisiteEdges,
    difficulties: layer.difficulties,
    learnerState: input.learnerState,
    masteryThreshold: input.masteryThreshold
  });

  const path: LearnerPath = {
    learnerPathId: input.learnerPathId,
    graphVersionId: input.graphVersionId,
    enrichmentId: layer.enrichmentId,
    targetConceptId: input.targetConceptId,
    learnerStateRef: input.learnerState.learnerStateRef,
    steps
  };

  await input.pathStore.persist(path);
  await input.artifacts.append({
    artifactId: `${input.learnerPathId}:learner-path`,
    artifactType: "learner_path.v1",
    schemaVersion: "1",
    graphVersionId: input.graphVersionId,
    producer: PRODUCER,
    producerVersion: PRODUCER_VERSION,
    configHash: layer.enrichmentConfigHash,
    createdAt: new Date().toISOString(),
    payload: path
  });
  return path;
}
