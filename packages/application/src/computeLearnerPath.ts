import type { LearnerPath } from "@lrnki/domain-core";
import type {
  ArtifactRepositoryPort,
  EnrichmentRunStorePort,
  LearnerPathStorePort,
  LearnerStatePort
} from "@lrnki/ports";
import { projectLearnerPath } from "./learnerPathProjection";
import { projectAdaptivePath } from "./adaptivePathProjection";

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
  enrichmentId: string;
  targetDerivedNodeId: string;
  enrichmentStore: EnrichmentRunStorePort;
  learnerState: LearnerStatePort;
  pathStore: LearnerPathStorePort;
  artifacts: ArtifactRepositoryPort;
  masteryThreshold?: number;
  // Adaptive frontier advancement (U6, R13): re-select the target as the hardest
  // ready unmastered node before projecting. Default false keeps the mock path's
  // behavior (project to the given target) byte-for-byte unchanged.
  frontierAdvance?: boolean;
}): Promise<LearnerPath> {
  const layer = await input.enrichmentStore.getLayer(input.enrichmentId);
  if (!layer) throw new Error(`computeLearnerPath: enrichment ${input.enrichmentId} not found.`);
  // Learner-path persistence writes learner_paths (version-required). Synthetic (versionless)
  // layers are deferred to the follow-up projection work (TODO); reject them explicitly.
  if (layer.graphVersionId === null) {
    throw new Error(`computeLearnerPath: enrichment ${input.enrichmentId} is a synthetic versionless layer; learner-path persistence requires a published graph version (deferred).`);
  }
  const graphVersionId = layer.graphVersionId;
  if (!layer.difficulties.some((difficulty) => difficulty.derivedNodeId === input.targetDerivedNodeId)) {
    throw new Error(`computeLearnerPath: target ${input.targetDerivedNodeId} is not in enrichment ${input.enrichmentId}.`);
  }

  // The frontier wrapper re-selects the target; the non-adaptive path projects to the
  // given target. Either way the pure projection core is unchanged (R13).
  const projected = input.frontierAdvance
    ? projectAdaptivePath({
        targetNodeId: input.targetDerivedNodeId,
        prerequisiteEdges: layer.prerequisiteEdges,
        difficulties: layer.difficulties,
        learnerState: input.learnerState,
        masteryThreshold: input.masteryThreshold
      })
    : {
        targetNodeId: input.targetDerivedNodeId,
        steps: projectLearnerPath({
          targetDerivedNodeId: input.targetDerivedNodeId,
          prerequisiteEdges: layer.prerequisiteEdges,
          difficulties: layer.difficulties,
          learnerState: input.learnerState,
          masteryThreshold: input.masteryThreshold
        })
      };

  const path: LearnerPath = {
    learnerPathId: input.learnerPathId,
    graphVersionId,
    enrichmentId: layer.enrichmentId,
    targetDerivedNodeId: projected.targetNodeId,
    learnerStateRef: input.learnerState.learnerStateRef,
    steps: projected.steps
  };

  await input.pathStore.persist(path);
  await input.artifacts.append({
    artifactId: `${input.learnerPathId}:learner-path`,
    artifactType: "learner_path",
    graphVersionId,
    producer: PRODUCER,
    producerVersion: PRODUCER_VERSION,
    configHash: layer.enrichmentConfigHash,
    createdAt: new Date().toISOString(),
    payload: path
  });
  return path;
}
