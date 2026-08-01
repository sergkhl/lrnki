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
      { sectionIndex: 0, milestoneDerivedNodeId: "c2", milestoneLabel: "First Ridge", stepDerivedNodeIds: ["c1", "ck", "c2"], meanDifficulty: 0.25, hasStudyItems: true },
      { sectionIndex: 1, milestoneDerivedNodeId: "c4", milestoneLabel: "Summit Ridge", stepDerivedNodeIds: ["c3", "c4"], meanDifficulty: 0.45, hasStudyItems: true }
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

// Production-shaped four-state Vista fixture: one bound Leg, one Guardian-ready Leg,
// one collecting Leg, and one future Leg. It also contains a trusted cross-Leg edge so
// the real scene proves the formation renders NO graph edges (plan 2026-07-16-002 U4).
// `readyLegScope` selects the honest Guardian-ready substate for Ready Ridge (U6):
// an available scope, an engaged (active) fight, or the zero-eligible unavailable case.
export function formationVistaExpedition(
  readyLegScope: "available" | "active" | "unavailable" = "available"
) {
  const base = formationExpedition("collected");
  const concepts: ConceptSpec[] = [
    { id: "v0a", label: "Waypoint Bound Alpha", sectionIndex: 0, sectionPositionIndex: 0, state: "mastered", milestoneId: "v0m", milestoneLabel: "Bound Ridge" },
    { id: "v0k", label: "Waypoint Bound Known", sectionIndex: 0, sectionPositionIndex: 1, state: "mastered", known: true, milestoneId: "v0m", milestoneLabel: "Bound Ridge" },
    { id: "v0m", label: "Waypoint Bound Marker", sectionIndex: 0, sectionPositionIndex: 2, state: "mastered", isMilestone: true, milestoneId: "v0m", milestoneLabel: "Bound Ridge" },
    { id: "v1a", label: "Waypoint Ready Alpha", sectionIndex: 1, sectionPositionIndex: 0, state: "mastered", milestoneId: "v1m", milestoneLabel: "Ready Ridge" },
    { id: "v1m", label: "Waypoint Ready Marker", sectionIndex: 1, sectionPositionIndex: 1, state: "mastered", isMilestone: true, milestoneId: "v1m", milestoneLabel: "Ready Ridge" },
    { id: "v2a", label: "Waypoint Growing Alpha", sectionIndex: 2, sectionPositionIndex: 0, state: "mastered", milestoneId: "v2m", milestoneLabel: "Growing Ridge" },
    { id: "v2m", label: "Waypoint Growing Marker", sectionIndex: 2, sectionPositionIndex: 1, state: "frontier", isMilestone: true, milestoneId: "v2m", milestoneLabel: "Growing Ridge" },
    { id: "v3a", label: "Waypoint Future Alpha", sectionIndex: 3, sectionPositionIndex: 0, state: "locked", milestoneId: "v3m", milestoneLabel: "Summit Ridge" },
    { id: "v3m", label: "Waypoint Future Marker", sectionIndex: 3, sectionPositionIndex: 1, state: "locked", isMilestone: true, isSummit: true, milestoneId: "v3m", milestoneLabel: "Summit Ridge" }
  ];
  const edges = [
    ["v0a", "v0m"],
    ["v1a", "v1m"],
    ["v2a", "v2m"],
    ["v0m", "v1a"]
  ].map(([source, target]) => ({
    prerequisiteDerivedNodeId: source,
    dependentDerivedNodeId: target,
    confidence: 1,
    uncertain: false,
    judgeModel: "e2e"
  }));
  return {
    session: {
      ...base.session,
      target: { derivedNodeId: "v3m", label: "Waypoint Future Marker" },
      studyItemCount: 0,
      detail: {
        ...base.session.detail,
        summary: {
          ...base.session.detail.summary,
          edgeCount: edges.length,
          certainEdgeCount: edges.length,
          conceptCount: concepts.length,
          studyItemCount: 0
        },
        nodes: concepts.map((concept) => ({
          derivedNodeId: concept.id,
          label: concept.label,
          aliases: [],
          declaredDomain: "orientation",
          difficulty: 0.15 + concept.sectionIndex * 0.16 + concept.sectionPositionIndex * 0.04,
          difficultyRationale: null,
          nodeKind: "enrichment",
          groundingOrigin: "llm_grounded",
          role: "prerequisite",
          hasStudyItem: false,
          grounding: null
        })),
        edges
      },
      classification: {
        stateByNode: Object.fromEntries(concepts.map((concept) => [concept.id, concept.state])),
        selectedFrontierTarget: "v2m"
      },
      expeditionPath: concepts.map((concept, position) => ({
        position,
        derivedNodeId: concept.id,
        difficulty: 0.15 + concept.sectionIndex * 0.16 + concept.sectionPositionIndex * 0.04,
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
        { sectionIndex: 0, milestoneDerivedNodeId: "v0m", milestoneLabel: "Bound Ridge", stepDerivedNodeIds: ["v0a", "v0k", "v0m"], meanDifficulty: 0.2, hasStudyItems: true },
        { sectionIndex: 1, milestoneDerivedNodeId: "v1m", milestoneLabel: "Ready Ridge", stepDerivedNodeIds: ["v1a", "v1m"], meanDifficulty: 0.35, hasStudyItems: true },
        { sectionIndex: 2, milestoneDerivedNodeId: "v2m", milestoneLabel: "Growing Ridge", stepDerivedNodeIds: ["v2a", "v2m"], meanDifficulty: 0.5, hasStudyItems: true },
        { sectionIndex: 3, milestoneDerivedNodeId: "v3m", milestoneLabel: "Summit Ridge", stepDerivedNodeIds: ["v3a", "v3m"], meanDifficulty: 0.7, hasStudyItems: true }
      ],
      verdictByNode: { v0k: "known" },
      latestOutcomeByStudyItemId: {},
      studySegmentsByNode: {},
      lessonByNode: {
        v0a: {
          derivedNodeId: "v0a",
          canonicalLabel: "Waypoint Bound Alpha",
          sections: [{ kind: "gist", text: "The first waypoint anchors the ascent.", groundingProvenance: "generated", isSourceCited: false }],
          explorableTerms: []
        }
      },
      lessonAbsent: concepts.filter((concept) => concept.id !== "v0a").map((concept) => concept.id),
      recallScopes: [
        { scopeKind: "section", anchorDerivedNodeId: "v0m", anchorLabel: "Bound Ridge", sectionIndex: 0, eligibleItemCount: 3, state: "won", wonChallengeId: "guardian-first" },
        readyLegScope === "active"
          ? { scopeKind: "section", anchorDerivedNodeId: "v1m", anchorLabel: "Ready Ridge", sectionIndex: 1, eligibleItemCount: 2, state: "active", activeChallengeId: "guardian-engaged" }
          : readyLegScope === "unavailable"
            ? { scopeKind: "section", anchorDerivedNodeId: "v1m", anchorLabel: "Ready Ridge", sectionIndex: 1, eligibleItemCount: 0, state: "unavailable", reason: "no_eligible_items" }
            : { scopeKind: "section", anchorDerivedNodeId: "v1m", anchorLabel: "Ready Ridge", sectionIndex: 1, eligibleItemCount: 2, state: "available" }
      ]
    },
    expedition: null
  };
}

export const GUARDIAN_LEG_ANCHOR = "v1m";
export const GUARDIAN_SUMMIT_ANCHOR = "v3m";
export const GUARDIAN_CORRECT_OPTION = "guardian-correct";
export const GUARDIAN_WRONG_OPTION = "guardian-wrong";

// A real lineup carries one to five Leg wards or one to seven Expedition wards behind the
// three-segment shield (`SECTION_LINEUP_MAX` / `ENRICHMENT_LINEUP_MAX` / `RECALL_MISS_BUFFER`
// in `packages/application/src/recallChallenge.ts`). The one-ward, one-shield DEFAULT below is
// the smallest view the reward-handoff scenarios need — a fixture minimum, never a game rule
// (plan 2026-07-31-002 KTD2).
export type GuardianWards = Readonly<{
  state: "active" | "recovery";
  wardTotal: number;
  unresolvedItemCount: number;
  remainingMissBuffer: number;
  missBufferTotal: number;
  // Which lineup ward is in front of the learner. A miss rotates the real queue head behind the
  // other unresolved wards, so the current ITEM can differ from the resolved count while the
  // obelisk's current SEGMENT — a positional slot — stays exactly where it was (KTD8).
  currentWardIndex: number;
}>;

export function guardianChallenge(
  challengeId: string,
  scopeKind: "section" | "enrichment" = "section",
  wards: Partial<GuardianWards> = {}
) {
  const anchorDerivedNodeId = scopeKind === "enrichment" ? GUARDIAN_SUMMIT_ANCHOR : GUARDIAN_LEG_ANCHOR;
  const wardTotal = wards.wardTotal ?? 1;
  const unresolvedItemCount = wards.unresolvedItemCount ?? wardTotal;
  const missBufferTotal = wards.missBufferTotal ?? 1;
  const currentWardIndex = wards.currentWardIndex ?? wardTotal - unresolvedItemCount;
  return {
    state: wards.state ?? ("active" as const),
    challengeId,
    enrichmentId: FORMATION_ENRICHMENT_ID,
    scopeKind,
    anchorDerivedNodeId,
    wardTotal,
    unresolvedItemCount,
    resolvedItemCount: wardTotal - unresolvedItemCount,
    remainingMissBuffer: wards.remainingMissBuffer ?? missBufferTotal,
    missBufferTotal,
    retreated: false,
    matchingProgress: null,
    currentItem: {
      kind: "option_select" as const,
      item: {
        // Ward identity is the LINEUP item, not the obelisk slot: naming it here is what makes
        // a queue rotation visible to a scenario.
        studyItemId: `guardian-ward-${currentWardIndex}`,
        derivedNodeId: anchorDerivedNodeId,
        question: `Which marker completes ward ${currentWardIndex + 1}?`,
        explanation: "The keyed marker completes the route and preserves the learned relationship.",
        groundingProvenance: "generated" as const,
        options: [
          { optionId: GUARDIAN_CORRECT_OPTION, text: "The keyed route marker", provenance: "generated" as const },
          { optionId: GUARDIAN_WRONG_OPTION, text: "An unrelated marker", provenance: "generated" as const }
        ],
        explorableTerms: []
      }
    }
  };
}

export function guardianWonChallenge(
  challengeId: string,
  scopeKind: "section" | "enrichment" = "section",
  wardTotal = 1
) {
  return {
    state: "won" as const,
    challengeId,
    enrichmentId: FORMATION_ENRICHMENT_ID,
    scopeKind,
    anchorDerivedNodeId: scopeKind === "enrichment" ? GUARDIAN_SUMMIT_ANCHOR : GUARDIAN_LEG_ANCHOR,
    wardTotal
  };
}

// A whole multi-ward fight held as fixture state, so a scenario can PLAY a Guardian instead of
// replaying canned views: the read serves the current view and every answer commits and returns
// the next one, exactly as `/challenge/answer` does.
//
// It projects views only. The authoritative combat fold lives in
// `packages/application/src/recallChallenge.ts` and is not duplicated here — this models the
// three view-visible rules the obelisk gate depends on: a correct answer resolves the head ward,
// a miss spends one shield segment and rotates the head behind the remaining wards, and the
// correct answer that leaves Last Stand restores exactly one segment.
export function guardianFight({
  challengeId,
  scopeKind = "section",
  wardTotal,
  missBufferTotal = 3
}: Readonly<{ challengeId: string; scopeKind?: "section" | "enrichment"; wardTotal: number; missBufferTotal?: number }>) {
  let queue = Array.from({ length: wardTotal }, (_, index) => index);
  let shield = missBufferTotal;

  const view = () =>
    queue.length === 0
      ? guardianWonChallenge(challengeId, scopeKind, wardTotal)
      : guardianChallenge(challengeId, scopeKind, {
          state: shield === 0 ? "recovery" : "active",
          wardTotal,
          unresolvedItemCount: queue.length,
          remainingMissBuffer: shield,
          missBufferTotal,
          currentWardIndex: queue[0]
        });

  return {
    view,
    answer(postData: unknown) {
      const chosenId = String((postData as { chosenId?: string }).chosenId);
      const correct = chosenId === GUARDIAN_CORRECT_OPTION;
      if (correct) {
        queue = queue.slice(1);
        if (shield === 0) shield = 1;
      } else {
        shield = Math.max(0, shield - 1);
        if (queue.length > 1) queue = [...queue.slice(1), queue[0]];
      }
      return {
        answered: true,
        replayed: false,
        feedback: { kind: "selection" as const, correct, chosenId, keyedCorrectId: GUARDIAN_CORRECT_OPTION },
        view: view()
      };
    }
  };
}

export function guardianLegRewardExpedition(firstWonChallengeId: string) {
  const base = formationVistaExpedition();
  return {
    ...base,
    session: {
      ...base.session,
      recallScopes: [
        ...base.session.recallScopes.filter((scope) => scope.anchorDerivedNodeId !== GUARDIAN_LEG_ANCHOR),
        {
          scopeKind: "section" as const,
          anchorDerivedNodeId: GUARDIAN_LEG_ANCHOR,
          anchorLabel: "Ready Ridge",
          sectionIndex: 1,
          eligibleItemCount: 2,
          state: "won" as const,
          wonChallengeId: firstWonChallengeId
        }
      ]
    }
  };
}

export function guardianSummitRewardExpedition(firstWonChallengeId: string) {
  const base = formationVistaExpedition();
  const stateByNode = Object.fromEntries(Object.keys(base.session.classification.stateByNode).map((id) => [id, "mastered"]));
  return {
    ...base,
    session: {
      ...base.session,
      classification: { stateByNode, selectedFrontierTarget: null },
      expeditionPath: base.session.expeditionPath.map((step) => ({ ...step, state: "mastered" as const })),
      recallScopes: [
        ...base.session.sections.map((section) => ({
          scopeKind: "section" as const,
          anchorDerivedNodeId: section.milestoneDerivedNodeId,
          anchorLabel: section.milestoneLabel,
          sectionIndex: section.sectionIndex,
          eligibleItemCount: 2,
          state: "won" as const,
          wonChallengeId: `leg-first-${section.sectionIndex}`
        })),
        {
          scopeKind: "enrichment" as const,
          anchorDerivedNodeId: GUARDIAN_SUMMIT_ANCHOR,
          anchorLabel: "Waypoint Future Marker",
          sectionIndex: null,
          eligibleItemCount: 2,
          state: "won" as const,
          wonChallengeId: firstWonChallengeId
        }
      ]
    }
  };
}

export function guardianAnswerReply(challengeId: string, scopeKind: "section" | "enrichment" = "section") {
  return {
    answered: true,
    replayed: false,
    feedback: {
      kind: "selection" as const,
      correct: true,
      chosenId: GUARDIAN_CORRECT_OPTION,
      keyedCorrectId: GUARDIAN_CORRECT_OPTION
    },
    view: guardianWonChallenge(challengeId, scopeKind)
  };
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
