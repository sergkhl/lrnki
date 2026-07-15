// Domain-neutral Crystal Formation state builders (plan 2026-07-15-002 U3/U6). One
// deterministic Study-Session-shaped fixture drives the intercepted formation states:
// waypoint labels carry no content domain, and every state the scenario needs (mastered
// ground, known ground, a pending capstone concept, locked future Legs) is explicit
// input — the real bundle renders it exactly as a production projection.

export const FORMATION_ENRICHMENT_ID = "enr-formation";

type ConceptSpec = {
  id: string;
  label: string;
  sectionIndex: number;
  sectionPositionIndex: number;
  state: "mastered" | "frontier" | "locked";
  known?: boolean;
  isMilestone?: boolean;
  isSummit?: boolean;
  milestoneId: string;
  milestoneLabel: string;
  itemId?: string;
  itemPassed?: boolean;
};

const CONCEPTS = (phase: "collecting" | "collected"): ConceptSpec[] => [
  { id: "c1", label: "Waypoint Alpha", sectionIndex: 0, sectionPositionIndex: 0, state: "mastered", milestoneId: "c2", milestoneLabel: "First Ridge", itemId: "i-c1", itemPassed: true },
  { id: "ck", label: "Waypoint Known", sectionIndex: 0, sectionPositionIndex: 1, state: "mastered", known: true, milestoneId: "c2", milestoneLabel: "First Ridge" },
  {
    id: "c2",
    label: "Waypoint Beta",
    sectionIndex: 0,
    sectionPositionIndex: 2,
    state: phase === "collected" ? "mastered" : "frontier",
    isMilestone: true,
    milestoneId: "c2",
    milestoneLabel: "First Ridge",
    itemId: "i-c2",
    itemPassed: phase === "collected"
  },
  { id: "c3", label: "Waypoint Gamma", sectionIndex: 1, sectionPositionIndex: 0, state: "locked", milestoneId: "c4", milestoneLabel: "Summit Ridge" },
  { id: "c4", label: "Waypoint Delta", sectionIndex: 1, sectionPositionIndex: 1, state: "locked", isMilestone: true, isSummit: true, milestoneId: "c4", milestoneLabel: "Summit Ridge" }
];

// Study-Session-shaped payload for `GET /expedition/:id` (the same projection every
// learner surface reads). `phase` flips exactly one fact set: Waypoint Beta's pending
// item becomes passed and its node masters — the mastery-collection transition.
export function formationExpedition(phase: "collecting" | "collected") {
  const concepts = CONCEPTS(phase);
  const session = {
    enrichmentId: FORMATION_ENRICHMENT_ID,
    learnerStateRef: "gate-explorer",
    layerPurpose: null,
    target: { derivedNodeId: "c4", label: "Waypoint Delta" },
    studyItemCount: 2,
    flooredNodeIds: [],
    detail: {
      summary: {
        enrichmentId: FORMATION_ENRICHMENT_ID,
        graphVersionId: null,
        enrichmentConfigHash: "e2e",
        judgeModel: "e2e",
        difficultyMethod: "e2e",
        status: "succeeded",
        edgeCount: 2,
        certainEdgeCount: 2,
        uncertainEdgeCount: 0,
        conceptCount: concepts.length,
        studyItemCount: 2,
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:00.000Z"
      },
      nodes: concepts.map((concept) => ({
        derivedNodeId: concept.id,
        label: concept.label,
        aliases: [],
        declaredDomain: "orientation",
        difficulty: 0.2 + concept.sectionIndex * 0.2 + concept.sectionPositionIndex * 0.05,
        difficultyRationale: null,
        nodeKind: "enrichment",
        groundingOrigin: "llm_grounded",
        role: "prerequisite",
        hasStudyItem: Boolean(concept.itemId),
        grounding: null
      })),
      edges: [
        { prerequisiteDerivedNodeId: "c1", dependentDerivedNodeId: "c2", confidence: 1, uncertain: false, judgeModel: "e2e" },
        { prerequisiteDerivedNodeId: "c2", dependentDerivedNodeId: "c3", confidence: 1, uncertain: false, judgeModel: "e2e" }
      ],
      originCounts: [],
      rescueDispositions: [],
      mintingDispositions: [],
      merges: []
    },
    classification: {
      stateByNode: Object.fromEntries(concepts.map((concept) => [concept.id, concept.state])),
      selectedFrontierTarget: phase === "collecting" ? "c2" : null
    },
    adaptedHiddenNodeIds: [],
    responseSourceSummary: { human: 0, synthetic: 0, total: 0 },
    expeditionPath: concepts.map((concept, position) => ({
      position,
      derivedNodeId: concept.id,
      difficulty: 0.2 + concept.sectionIndex * 0.2 + concept.sectionPositionIndex * 0.05,
      topologicalDepth: position,
      state: concept.state,
      isSummit: Boolean(concept.isSummit),
      sectionIndex: concept.sectionIndex,
      sectionPositionIndex: concept.sectionPositionIndex,
      milestoneDerivedNodeId: concept.milestoneId,
      milestoneLabel: concept.milestoneLabel,
      isMilestone: Boolean(concept.isMilestone)
    })),
    sections: [
      { sectionIndex: 0, milestoneDerivedNodeId: "c2", milestoneLabel: "First Ridge", stepDerivedNodeIds: ["c1", "ck", "c2"], meanDifficulty: 0.25 },
      { sectionIndex: 1, milestoneDerivedNodeId: "c4", milestoneLabel: "Summit Ridge", stepDerivedNodeIds: ["c3", "c4"], meanDifficulty: 0.45 }
    ],
    coexistence: [],
    restorations: [],
    sheetByNode: {},
    verdictByNode: Object.fromEntries(concepts.filter((concept) => concept.known).map((concept) => [concept.id, "known"])),
    latestOutcomeByStudyItemId: Object.fromEntries(
      concepts.filter((concept) => concept.itemId && concept.itemPassed).map((concept) => [concept.itemId!, "correct"])
    ),
    studySegmentsByNode: Object.fromEntries(
      concepts
        .filter((concept) => concept.itemId)
        .map((concept) => [
          concept.id,
          [
            {
              kind: "option_select",
              item: {
                studyItemId: concept.itemId!,
                derivedNodeId: concept.id,
                question: `Which marker points to ${concept.label}?`,
                explanation: "The waypoint marker points the way.",
                groundingProvenance: "generated",
                options: [
                  { optionId: `${concept.itemId}-o1`, text: "The waypoint marker", provenance: "generated" },
                  { optionId: `${concept.itemId}-o2`, text: "The base camp flag", provenance: "generated" }
                ],
                explorableTerms: []
              }
            }
          ]
        ])
    ),
    lessonByNode: {},
    lessonReadByNode: {},
    lessonAbsent: concepts.map((concept) => concept.id),
    detours: [],
    generatingDetours: false,
    recallScopes: []
  };
  return { session, expedition: null };
}

// The grading reply the real client expects from `POST /study/option-select`.
export function gradedCorrect(chosenOptionId: string) {
  return {
    kind: "selection" as const,
    graded: true as const,
    correct: true as const,
    chosenId: chosenOptionId,
    keyedCorrectId: chosenOptionId
  };
}
