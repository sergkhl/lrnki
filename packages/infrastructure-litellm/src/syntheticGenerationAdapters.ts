import type { KnowledgeBoundaryProbeAnswer, SynthesizedConcept } from "@lrnki/domain-core";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type { ConceptSetSynthesisPort, KnowledgeBoundaryProbePort } from "@lrnki/ports";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { executeForcedToolStage, type NeuralStageDescriptor } from "./forcedToolStage";
import { readPromptFile } from "./promptFile";
import {
  conceptSetSynthesisSchema,
  conceptSetSynthesisValidator,
  knowledgeBoundaryProbeSchema,
  knowledgeBoundaryProbeValidator
} from "./toolSchemas";

type ConceptSetSynthesisInput = { topic: string; declaredDomain: string };
type ConceptSetSynthesisArgs = { concepts: SynthesizedConcept[] };

export const conceptSetSynthesisDescriptor: NeuralStageDescriptor<
  ConceptSetSynthesisInput,
  ConceptSetSynthesisArgs,
  SynthesizedConcept[]
> = {
  promptPath: "concept-set-synthesis.prompt",
  stageTag: STAGE_TAGS.conceptSetSynthesis,
  schema: conceptSetSynthesisSchema,
  validator: conceptSetSynthesisValidator,
  sentinelInput: { topic: "sentinel topic", declaredDomain: "sentinel domain" },
  templateData: (input) => input,
  mapResult: (result) => result.concepts
};

export function createConceptSetSynthesisPort(client: LiteLlmForcedToolClient): ConceptSetSynthesisPort {
  return {
    model: readPromptFile(conceptSetSynthesisDescriptor.promptPath).model,
    synthesize: (input) => executeForcedToolStage(client, conceptSetSynthesisDescriptor, input)
  };
}

type KnowledgeBoundaryProbeInput = { conceptLabel: string; declaredDomain: string };
type KnowledgeBoundaryProbeArgs = { answer: string };

export const knowledgeBoundaryProbeDescriptor: NeuralStageDescriptor<
  KnowledgeBoundaryProbeInput,
  KnowledgeBoundaryProbeArgs,
  KnowledgeBoundaryProbeAnswer
> = {
  promptPath: "knowledge-boundary-probe.prompt",
  stageTag: STAGE_TAGS.knowledgeBoundaryProbe,
  schema: knowledgeBoundaryProbeSchema,
  validator: knowledgeBoundaryProbeValidator,
  sentinelInput: { conceptLabel: "Sentinel concept", declaredDomain: "sentinel domain" },
  templateData: (input) => input,
  mapResult: (result) => ({ answer: result.answer })
};

export function createKnowledgeBoundaryProbePort(client: LiteLlmForcedToolClient, modelOverride?: string): KnowledgeBoundaryProbePort {
  const descriptor = modelOverride
    ? { ...knowledgeBoundaryProbeDescriptor, modelOverride }
    : knowledgeBoundaryProbeDescriptor;
  return {
    model: modelOverride ?? readPromptFile(knowledgeBoundaryProbeDescriptor.promptPath).model,
    probe: (input) => executeForcedToolStage(client, descriptor, input)
  };
}
