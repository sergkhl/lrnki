import { STAGE_TAGS } from "@lrnki/domain-core";
import { NON_LLM_STAGES } from "@lrnki/application";

const STAGE_COPY: Record<string, string> = {
  [STAGE_TAGS.conceptDiscovery]: "Scouting the trailheads",
  [STAGE_TAGS.admission]: "Choosing sturdy landmarks",
  [STAGE_TAGS.conceptSetSynthesis]: "Sketching the route",
  [STAGE_TAGS.knowledgeBoundaryProbe]: "Checking the horizon",
  [STAGE_TAGS.admissionLabelJudge]: "Sorting field notes",
  [STAGE_TAGS.cepExtraction]: "Packing the guidebook",
  [STAGE_TAGS.definitionPassageQuality]: "Polishing the clues",
  [STAGE_TAGS.assertionEntailment]: "Testing each marker",
  [STAGE_TAGS.prerequisiteOrdering]: "Laying stepping stones",
  [STAGE_TAGS.rescueDurability]: "Searching side paths",
  [STAGE_TAGS.rescueDefinitionQuality]: "Marking clearer signs",
  [STAGE_TAGS.mintingDurability]: "Raising new cairns",
  [STAGE_TAGS.missingPrerequisiteProposal]: "Finding missing footholds",
  [STAGE_TAGS.groundingGeneration]: "Writing field notes",
  [STAGE_TAGS.intrinsicDifficulty]: "Reading the terrain",
  [STAGE_TAGS.declaredDomainInference]: "Naming the country",
  [STAGE_TAGS.nodeEmbedding]: "Comparing landmarks",
  [STAGE_TAGS.nodeMergeAdjudication]: "Merging twin paths",
  [STAGE_TAGS.conceptLessonGeneration]: "Preparing camp notes",
  [STAGE_TAGS.studyItemGeneration]: "Setting survey stops",
  [STAGE_TAGS.impostorGeneration]: "Hiding false trails",
  [STAGE_TAGS.impostorLieValidityJudgment]: "Checking the decoys",
  [STAGE_TAGS.answerGrading]: "Reading the finding",
  [STAGE_TAGS.learnerSimulation]: "Walking a practice loop",
  [NON_LLM_STAGES.documentLoad]: "Opening the satchel",
  [NON_LLM_STAGES.persist]: "Binding the journal",
  [NON_LLM_STAGES.load]: "Unrolling the map",
  [NON_LLM_STAGES.refine]: "Clearing the path",
  [NON_LLM_STAGES.symbolicDisposal]: "Sweeping loose stones"
};

export function stageCopy(stage: string): string {
  return STAGE_COPY[stage] ?? "Charting the trail";
}
