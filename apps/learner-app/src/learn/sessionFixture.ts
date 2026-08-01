// Test-only Study Session fixture for component suites: one lit concept with a lesson,
// an option-select item, and an impostor item (mirrors the projection's trail composition
// inputs). Options and statements are populated so choice surfaces render tiles.
import type { StudySession } from "@lrnki/application/projection";

export function sessionFixture(overrides: Partial<StudySession> = {}): StudySession {
  const base: StudySession = {
    enrichmentId: "e1",
    learnerStateRef: "learner",
    layerPurpose: null,
    target: { derivedNodeId: "n1", label: "Ownership" },
    studyItemCount: 2,
    flooredNodeIds: [],
    neutralReferenceAssetsByNode: {},
    detail: {
      summary: {
        enrichmentId: "e1",
        graphVersionId: null,
        enrichmentConfigHash: "test",
        judgeModel: "test",
        difficultyMethod: "test",
        status: "succeeded",
        edgeCount: 0,
        certainEdgeCount: 0,
        uncertainEdgeCount: 0,
        conceptCount: 1,
        studyItemCount: 2,
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:00.000Z"
      },
      nodes: [
        {
          derivedNodeId: "n1",
          label: "Ownership",
          aliases: [],
          declaredDomain: "software engineering",
          difficulty: null,
          difficultyRationale: null,
          nodeKind: "enrichment",
          groundingOrigin: "llm_grounded",
          role: "prerequisite",
          hasStudyItem: true,
          grounding: null
        }
      ],
      edges: [],
      originCounts: [],
      rescueDispositions: [],
      mintingDispositions: [],
      merges: []
    },
    classification: { stateByNode: { n1: "frontier" }, selectedFrontierTarget: "n1" },
    adaptedHiddenNodeIds: [],
    responseSourceSummary: { human: 0, synthetic: 0, total: 0 },
    expeditionPath: [
      {
        position: 0,
        derivedNodeId: "n1",
        difficulty: 0,
        topologicalDepth: 0,
        state: "frontier",
        isSummit: true,
        sectionIndex: 0,
        sectionPositionIndex: 0,
        milestoneDerivedNodeId: "n1",
        milestoneLabel: "Ownership",
        isMilestone: true
      }
    ],
    sections: [
      {
        sectionIndex: 0,
        milestoneDerivedNodeId: "n1",
        milestoneLabel: "Ownership",
        stepDerivedNodeIds: ["n1"],
        meanDifficulty: 0,
        hasStudyItems: true
      }
    ],
    coexistence: [],
    restorations: [],
    sheetByNode: {},
    verdictByNode: {},
    latestOutcomeByStudyItemId: {},
    studySegmentsByNode: {
      n1: [
        {
          kind: "option_select",
          item: {
            studyItemId: "i1",
            derivedNodeId: "n1",
            question: "What moves ownership?",
            explanation: "Assignment moves ownership.",
            groundingProvenance: "generated",
            options: [
              { optionId: "o1", text: "Assignment", provenance: "generated" as const },
              { optionId: "o2", text: "Borrowing", provenance: "generated" as const }
            ],
            explorableTerms: [
              { term: "ownership", sectionKind: null, support: { kind: "available" as const } },
              { term: "move semantics", sectionKind: null, support: { kind: "available" as const } }
            ]
          }
        },
        {
          kind: "impostor",
          item: {
            studyItemId: "i2",
            derivedNodeId: "n1",
            question: "Which is false?",
            groundingProvenance: "generated",
            statements: [
              { statementId: "s1", text: "Values have one owner", provenance: "generated" as const },
              { statementId: "s2", text: "Borrowing moves ownership", provenance: "generated" as const }
            ],
            reveal: "Borrowing never moves ownership.",
            lieSource: "generated",
            explorableTerms: []
          }
        }
      ]
    },
    lessonByNode: { n1: { derivedNodeId: "n1", canonicalLabel: "Ownership", sections: [], explorableTerms: [] } },
    lessonReadByNode: {},
    lessonAbsent: [],
    detours: [],
    generatingDetours: false,
    recallScopes: []
  };
  return { ...base, ...overrides };
}
