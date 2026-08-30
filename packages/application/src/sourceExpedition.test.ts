import assert from "node:assert/strict";
import test from "node:test";
import type {
  ConceptLesson,
  ImpostorItem,
  MatchingItem,
  OptionSelectItem,
  StudyItem
} from "@lrnki/domain-core";
import type {
  DerivedGraphDetail,
  LearnerExpedition,
  PublishSourceExpeditionCatalogEntry,
  SourceEvidenceRecord,
  SourceExpeditionAssetExpectation,
  SourceExpeditionCatalogEntry
} from "@lrnki/ports";
import { CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY } from "./learnerKnowledgeAvailability";
import {
  createSourceExpeditionModule,
  qualifiedSourceExpeditionAssetConfigHash
} from "./sourceExpedition";
import { sourceOptionExactReferenceQuestion } from "./sourceOptionExactReference";

const BASE_CONFIG = "study-item-bank-test";
const QUALIFIED_CONFIG = qualifiedSourceExpeditionAssetConfigHash(BASE_CONFIG);
const GRAPH_VERSION_ID = "graph-version-1";
const ENRICHMENT_ID = "enrichment-1";

function detail(overrides: {
  firstOrigin?: "document_anchored" | "source_mentioned" | "llm_grounded";
  firstVerbatimDisposition?: string;
  firstPassages?: number;
  status?: string;
  graphVersionId?: string | null;
} = {}): DerivedGraphDetail {
  const firstOrigin = overrides.firstOrigin ?? "document_anchored";
  const grounding = firstOrigin === "document_anchored"
    ? null
    : {
        generatingModel: firstOrigin === "llm_grounded" ? "test-model" : null,
        rationale: "Required by the source-backed summit.",
        passages: Array.from({ length: overrides.firstPassages ?? 1 }, () => ({
          passageType: "definition" as const,
          text: "The source defines the prerequisite.",
          groundingOrigin: firstOrigin
        })),
        verbatimDisposition: overrides.firstVerbatimDisposition ?? "verified"
      };
  return {
    summary: {
      enrichmentId: ENRICHMENT_ID,
      graphVersionId: overrides.graphVersionId === undefined
        ? GRAPH_VERSION_ID
        : overrides.graphVersionId,
      enrichmentConfigHash: "enrichment-config",
      judgeModel: "test-judge",
      difficultyMethod: "test",
      status: overrides.status ?? "succeeded",
      edgeCount: 3,
      certainEdgeCount: 3,
      uncertainEdgeCount: 0,
      conceptCount: 4,
      studyItemCount: 6,
      startedAt: "2026-08-25T00:00:00.000Z",
      completedAt: "2026-08-25T00:01:00.000Z"
    },
    nodes: [
      {
        derivedNodeId: "node-prerequisite",
        label: "Trusted prerequisite",
        aliases: ["Prerequisite alias"],
        declaredDomain: "authoritative-domain",
        difficulty: 2,
        difficultyRationale: null,
        difficultyBand: 2,
        difficultyContested: false,
        nodeKind: firstOrigin === "document_anchored" ? "anchor" : "enrichment",
        groundingOrigin: firstOrigin,
        role: "prerequisite",
        hasStudyItem: true,
        grounding
      },
      {
        derivedNodeId: "node-middle-a",
        label: "First source chapter",
        aliases: ["First chapter alias"],
        declaredDomain: "authoritative-domain",
        difficulty: 3,
        difficultyRationale: null,
        difficultyBand: 3,
        difficultyContested: false,
        nodeKind: "anchor",
        groundingOrigin: "document_anchored",
        role: "anchor",
        hasStudyItem: true,
        grounding: null
      },
      {
        derivedNodeId: "node-middle-b",
        label: "Second source chapter",
        aliases: ["Second chapter alias"],
        declaredDomain: "authoritative-domain",
        difficulty: 3,
        difficultyRationale: null,
        difficultyBand: 3,
        difficultyContested: false,
        nodeKind: "anchor",
        groundingOrigin: "document_anchored",
        role: "anchor",
        hasStudyItem: true,
        grounding: null
      },
      {
        derivedNodeId: "node-summit",
        label: "Authoritative summit",
        aliases: ["Summit alias"],
        declaredDomain: "authoritative-domain",
        difficulty: 4,
        difficultyRationale: null,
        difficultyBand: 4,
        difficultyContested: false,
        nodeKind: "anchor",
        groundingOrigin: "document_anchored",
        role: "anchor",
        hasStudyItem: true,
        grounding: null
      }
    ],
    edges: [
      ["node-prerequisite", "node-middle-a"],
      ["node-middle-a", "node-middle-b"],
      ["node-middle-b", "node-summit"]
    ].map(([prerequisiteDerivedNodeId, dependentDerivedNodeId]) => ({
      prerequisiteDerivedNodeId,
      dependentDerivedNodeId,
      confidence: 0.95,
      uncertain: false,
      judgeModel: "test-judge"
    })),
    originCounts: [],
    rescueDispositions: [],
    mintingDispositions: [],
    merges: []
  };
}

function partiallyAssetReadyDetail(): DerivedGraphDetail {
  const base = detail();
  const missingPrerequisite = {
    ...base.nodes[0]!,
    derivedNodeId: "node-missing-prerequisite",
    label: "Unready prerequisite",
    aliases: [],
    hasStudyItem: false
  };
  const blockedDependent = {
    ...base.nodes[1]!,
    derivedNodeId: "node-blocked-dependent",
    label: "Blocked dependent",
    aliases: []
  };
  return {
    ...base,
    summary: {
      ...base.summary,
      edgeCount: base.summary.edgeCount + 1,
      certainEdgeCount: base.summary.certainEdgeCount + 1,
      conceptCount: base.summary.conceptCount + 2,
      studyItemCount: base.summary.studyItemCount + 1
    },
    nodes: [...base.nodes, missingPrerequisite, blockedDependent],
    edges: [
      ...base.edges,
      {
        prerequisiteDerivedNodeId: missingPrerequisite.derivedNodeId,
        dependentDerivedNodeId: blockedDependent.derivedNodeId,
        confidence: 0.95,
        uncertain: false,
        judgeModel: "test-judge"
      }
    ]
  };
}

function partiallySourceReadyDetail(): DerivedGraphDetail {
  const base = partiallyAssetReadyDetail();
  const llmGrounded = detail({ firstOrigin: "llm_grounded" }).nodes[0]!;
  return {
    ...base,
    nodes: base.nodes.map((node) =>
      node.derivedNodeId === "node-missing-prerequisite"
        ? {
            ...llmGrounded,
            derivedNodeId: node.derivedNodeId,
            label: node.label,
            aliases: node.aliases,
            hasStudyItem: true
          }
        : node
    )
  };
}

function diamondDetail(): DerivedGraphDetail {
  const base = detail();
  const edges = [
    ["node-prerequisite", "node-middle-a"],
    ["node-prerequisite", "node-middle-b"],
    ["node-middle-a", "node-summit"],
    ["node-middle-b", "node-summit"]
  ].map(([prerequisiteDerivedNodeId, dependentDerivedNodeId]) => ({
    prerequisiteDerivedNodeId,
    dependentDerivedNodeId,
    confidence: 0.95,
    uncertain: false,
    judgeModel: "test-judge"
  }));
  return {
    ...base,
    summary: {
      ...base.summary,
      edgeCount: edges.length,
      certainEdgeCount: edges.length
    },
    edges
  };
}

const sourceCitation = {
  provenance: "source" as const,
  sourceResourceId: "source-resource",
  sourceBlockId: "source-block",
  evidenceQuote: "The source defines this material claim.",
  matchKind: "exact" as const
};

const sourceEvidence: SourceEvidenceRecord = {
  sourceResourceId: sourceCitation.sourceResourceId,
  sourceTitle: "Authoritative source",
  sourceDocumentId: "source-document",
  sourceBlockId: sourceCitation.sourceBlockId,
  blockId: "block-1",
  blockType: "paragraph",
  headingPath: ["Authoritative source", "Chapter"],
  locator: { characterStart: 0, characterEnd: 46 },
  text: sourceCitation.evidenceQuote
};

const conceptLabels = new Map<string, string>([
  ["node-prerequisite", "Trusted prerequisite"],
  ["node-middle-a", "First source chapter"],
  ["node-middle-b", "Second source chapter"],
  ["node-summit", "Authoritative summit"],
  ["node-missing-prerequisite", "Unready prerequisite"],
  ["node-blocked-dependent", "Blocked dependent"]
]);

function conceptLabel(derivedNodeId: string): string {
  return conceptLabels.get(derivedNodeId) ?? derivedNodeId;
}

function lesson(derivedNodeId: string, configHash = QUALIFIED_CONFIG): ConceptLesson {
  return {
    conceptLessonId: `lesson-${derivedNodeId}`,
    derivedNodeId,
    graphVersionId: GRAPH_VERSION_ID,
    enrichmentId: ENRICHMENT_ID,
    generatingModel: "test-model",
    configHash,
    canonicalLabel: conceptLabel(derivedNodeId),
    sections: [{
      kind: "definition",
      text: "The source defines this material claim.",
      groundingProvenance: "source_cep",
      citation: sourceCitation
    }],
    explorableTerms: []
  };
}

function routeCuedLesson(derivedNodeId: string, routeSourceBlockId: string): ConceptLesson {
  const base = lesson(derivedNodeId);
  const routeText = routeCueText(derivedNodeId);
  return {
    ...base,
    sections: [
      ...base.sections,
      {
        kind: "examples",
        text: routeText,
        groundingProvenance: "source_cep",
        citation: {
          ...sourceCitation,
          sourceBlockId: routeSourceBlockId,
          evidenceQuote: routeText
        }
      }
    ]
  };
}

function routeCueText(derivedNodeId: string): string {
  return `Route cue for ${conceptLabel(derivedNodeId)}.`;
}

function routeEvidence(
  sourceBlockId: string,
  characterStart: number,
  text: string
): SourceEvidenceRecord {
  return {
    ...sourceEvidence,
    sourceBlockId,
    blockId: sourceBlockId,
    locator: { characterStart, characterEnd: characterStart + text.length },
    text
  };
}

function option(derivedNodeId: string, configHash = QUALIFIED_CONFIG): OptionSelectItem {
  const referenceText = "The source defines this material claim.";
  return {
    studyItemId: `option-${derivedNodeId}`,
    derivedNodeId,
    graphVersionId: GRAPH_VERSION_ID,
    enrichmentId: ENRICHMENT_ID,
    groundingProvenance: "source_cep",
    generatingModel: "test-model",
    configHash,
    explorableTerms: [],
    itemType: "option_select",
    question: sourceOptionExactReferenceQuestion(conceptLabel(derivedNodeId)),
    explanation: referenceText,
    options: [
      {
        optionId: `correct-${derivedNodeId}`,
        text: referenceText,
        isCorrect: true,
        provenance: "source",
        citation: sourceCitation
      },
      {
        optionId: `wrong-a-${derivedNodeId}`,
        text: "An unsupported alternative.",
        isCorrect: false,
        provenance: "generated"
      },
      {
        optionId: `wrong-b-${derivedNodeId}`,
        text: "A second unsupported alternative.",
        isCorrect: false,
        provenance: "generated"
      },
      {
        optionId: `wrong-c-${derivedNodeId}`,
        text: "A third unsupported alternative.",
        isCorrect: false,
        provenance: "generated"
      }
    ]
  };
}

function matching(
  derivedNodeId: string,
  overrides: { studyItemId?: string; configHash?: string } = {}
): MatchingItem {
  return {
    studyItemId: overrides.studyItemId ?? `matching-${derivedNodeId}`,
    derivedNodeId,
    graphVersionId: GRAPH_VERSION_ID,
    enrichmentId: ENRICHMENT_ID,
    groundingProvenance: "source_cep",
    generatingModel: "test-model",
    configHash: overrides.configHash ?? QUALIFIED_CONFIG,
    explorableTerms: [],
    itemType: "matching",
    question: "Match the source-backed pair.",
    pairs: [
      ["Deadline", "Ends authority at 17:00 UTC"],
      ["Renewal", "Extends the valid interval"],
      ["Expiry", "Leaves later checks unauthorized"]
    ].map(([promptText, matchText], index) => ({
      pairId: `pair-${derivedNodeId}-${index}`,
      matchId: `match-${derivedNodeId}-${index}`,
      promptText,
      matchText,
      citation: sourceCitation
    }))
  };
}

function impostor(
  derivedNodeId: string,
  overrides: { studyItemId?: string; configHash?: string } = {}
): ImpostorItem {
  return {
    studyItemId: overrides.studyItemId ?? `impostor-${derivedNodeId}`,
    derivedNodeId,
    graphVersionId: GRAPH_VERSION_ID,
    enrichmentId: ENRICHMENT_ID,
    groundingProvenance: "source_cep",
    generatingModel: "test-model",
    configHash: overrides.configHash ?? QUALIFIED_CONFIG,
    explorableTerms: [],
    itemType: "impostor",
    question: "Which statement is false?",
    statements: [
      ...["First supported truth", "Second supported truth", "Third supported truth"].map(
        (text, ordinal) => ({
          statementId: `truth-${derivedNodeId}-${ordinal}`,
          ordinal,
          text,
          isImpostor: false as const,
          provenance: "source" as const,
          citation: sourceCitation
        })
      ),
      {
        statementId: `lie-${derivedNodeId}`,
        ordinal: 3,
        text: "The source makes the opposite claim.",
        isImpostor: true,
        provenance: "generated",
        reveal: "The source defines this material claim.",
        lieSource: "generated"
      }
    ]
  };
}

function qualifiedItemsFor(graph: DerivedGraphDetail): StudyItem[] {
  const options = graph.nodes.map((node) => option(node.derivedNodeId));
  const middleA = graph.nodes.find((node) => node.derivedNodeId === "node-middle-a")
    ?.derivedNodeId ?? graph.nodes[0]?.derivedNodeId;
  const middleB = graph.nodes.find((node) => node.derivedNodeId === "node-middle-b")
    ?.derivedNodeId ?? graph.nodes[1]?.derivedNodeId;
  return [
    ...options,
    ...(middleA ? [matching(middleA)] : []),
    ...(middleB ? [impostor(middleB)] : [])
  ];
}

function expedition(overrides: Partial<LearnerExpedition> = {}): LearnerExpedition {
  return {
    learnerExpeditionId: "learner-expedition-1",
    learnerStateRef: "learner-1",
    kind: "source",
    title: "stored title is not authoritative",
    declaredDomain: "stored-domain",
    status: "ready",
    currentOperationId: null,
    currentOperationType: null,
    enrichmentId: ENRICHMENT_ID,
    assetSetIdentity: "stale-assets",
    active: true,
    failureMessage: null,
    generationAttempts: 0,
    claimedAt: null,
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
    ...overrides
  };
}

function catalogEntry(overrides: Partial<SourceExpeditionCatalogEntry> = {}): SourceExpeditionCatalogEntry {
  return {
    catalogKey: "critical-thinking",
    enrichmentId: ENRICHMENT_ID,
    title: "Critical Thinking",
    teaser: "Build stronger arguments and weigh evidence.",
    catalogRole: "broad_reasoning_topic",
    audience: "curious_general_adult_high_school_reading",
    sortOrder: 1,
    sourceProvenance: {
      authorship: "lrnki_model_authored_project_source",
      knowledgeBasis: "general_model_knowledge_only",
      externalClaimVerificationRequired: false,
      acceptanceScope: "local_shared_learner_playtest"
    },
    acceptedAssetSetIdentity: "resolved-by-harness",
    acceptedAssetConfigHash: QUALIFIED_CONFIG,
    sourceCredits: [{
      sourceResourceId: "source-resource",
      title: "Critical Thinking",
      sourceUri: "lrnki model-authored project source",
      license: "lrnki project-owned playtest fixture"
    }],
    createdAt: "2026-08-27T00:00:00.000Z",
    ...overrides
  };
}

const acceptedPublication = {
  enrichmentId: ENRICHMENT_ID,
  catalogKey: "critical-thinking",
  title: "Critical Thinking",
  teaser: "Build stronger arguments and weigh evidence.",
  catalogRole: "broad_reasoning_topic",
  audience: "curious_general_adult_high_school_reading",
  sortOrder: 1,
  sourceProvenance: {
    authorship: "lrnki_model_authored_project_source",
    knowledgeBasis: "general_model_knowledge_only",
    externalClaimVerificationRequired: false,
    acceptanceScope: "local_shared_learner_playtest"
  }
} as const;

type HarnessOptions = {
  graph?: DerivedGraphDetail;
  lessons?: ConceptLesson[];
  items?: StudyItem[];
  owned?: LearnerExpedition[];
  refuseSnapshot?: boolean;
  cataloged?: boolean;
  acceptedAssetSetIdentity?: string;
  acceptedAssetConfigHash?: string;
  refuseCatalogSnapshot?: boolean;
  evidence?: SourceEvidenceRecord[];
};

function harness(options: HarnessOptions = {}) {
  const graph = options.graph ?? detail();
  const lessons = options.lessons ?? graph.nodes.map((node) => lesson(node.derivedNodeId));
  const items = options.items ?? qualifiedItemsFor(graph);
  let owned = [...(options.owned ?? [])];
  const adoptionCalls: Array<{
    title: string;
    declaredDomain: string;
    expectedAssets: SourceExpeditionAssetExpectation;
  }> = [];
  const activationCalls: SourceExpeditionAssetExpectation[] = [];
  const publicationCalls: PublishSourceExpeditionCatalogEntry[] = [];
  const resolvedCatalogEntry = async (): Promise<SourceExpeditionCatalogEntry | undefined> => {
    if (options.cataloged === false) return undefined;
    const qualification = await sourceExpedition.qualify(ENRICHMENT_ID);
    return catalogEntry({
      acceptedAssetSetIdentity: options.acceptedAssetSetIdentity ??
        (qualification.status === "available"
          ? qualification.assets.expectedAssets.assetSetIdentity
          : "unavailable-fixture"),
      acceptedAssetConfigHash: options.acceptedAssetConfigHash ?? QUALIFIED_CONFIG
    });
  };
  const sourceExpedition = createSourceExpeditionModule({
    learnerKnowledgeAvailability: CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY,
    enrichmentRead: {
      async getDerivedGraphDetail(enrichmentId) {
        return enrichmentId === graph.summary.enrichmentId ? graph : undefined;
      }
    },
    conceptLessonStore: {
      async listLessonsForEnrichment() { return lessons; },
      async listAbsentForEnrichment() { return []; }
    },
    studyItemStore: {
      async listStudyItemsForEnrichment() { return items; }
    },
    sourceEvidenceRead: {
      async readSourceEvidence(references) {
        const available = options.evidence ?? [sourceEvidence];
        return references.flatMap((reference) => available.filter((record) =>
          record.sourceResourceId === reference.sourceResourceId &&
          record.sourceBlockId === reference.sourceBlockId
        ));
      }
    },
    expeditionStore: {
      async listForLearner() { return owned; },
      async getForLearner(input) {
        return owned.find((row) => row.learnerExpeditionId === input.learnerExpeditionId);
      },
      async getByEnrichment(input) {
        return owned.find((row) => row.enrichmentId === input.enrichmentId);
      },
      async adoptSourceExpedition(input) {
        adoptionCalls.push({
          title: input.title,
          declaredDomain: input.declaredDomain,
          expectedAssets: input.expectedAssets
        });
        if (options.refuseSnapshot) {
          return { adopted: false as const, refused: "asset_set_changed" as const };
        }
        const existing = owned.find((row) => row.enrichmentId === input.enrichmentId);
        const learnerExpeditionId = existing?.learnerExpeditionId ?? input.learnerExpeditionId;
        owned = [
          ...owned.filter((row) => row.enrichmentId !== input.enrichmentId),
          expedition({
            learnerExpeditionId,
            learnerStateRef: input.learnerStateRef,
            title: input.title,
            declaredDomain: input.declaredDomain,
            enrichmentId: input.enrichmentId,
            assetSetIdentity: input.expectedAssets.assetSetIdentity,
            active: true
          })
        ];
        return { adopted: true as const, learnerExpeditionId };
      },
      async activateSourceExpedition(input) {
        activationCalls.push(input.expectedAssets);
        if (options.refuseSnapshot) {
          return { activated: false as const, refused: "asset_set_changed" as const };
        }
        owned = owned.map((row) => ({
          ...row,
          active: row.learnerExpeditionId === input.learnerExpeditionId
        }));
        return { activated: true as const };
      }
    },
    catalog: {
      async listAccepted() {
        const entry = await resolvedCatalogEntry();
        return entry ? [entry] : [];
      },
      async getAcceptedByCatalogKey(catalogKey) {
        return catalogKey === "critical-thinking" ? resolvedCatalogEntry() : undefined;
      },
      async getAcceptedByEnrichment(enrichmentId) {
        return enrichmentId === ENRICHMENT_ID ? resolvedCatalogEntry() : undefined;
      },
      async publishAccepted(input) {
        publicationCalls.push(input);
        return options.refuseCatalogSnapshot
          ? { published: false as const, refused: "accepted_asset_set_changed" as const }
          : { published: true as const };
      }
    },
    qualifiedAssetConfigHash: QUALIFIED_CONFIG,
    newId: () => "new-source-expedition"
  });
  return {
    sourceExpedition,
    adoptionCalls,
    activationCalls,
    publicationCalls,
    owned: () => owned
  };
}

test("qualification binds one lowest-id option per Concept and the minimum mixed route", async () => {
  const graph = detail();
  const extraOption = {
    ...option("node-summit"),
    studyItemId: "option-z-node-summit",
    options: option("node-summit").options.map((entry) => ({
      ...entry,
      optionId: `z-${entry.optionId}`
    }))
  };
  const state = harness({
    graph,
    items: [
      ...qualifiedItemsFor(graph),
      extraOption,
      matching("node-summit", { studyItemId: "matching-z-node-summit" })
    ]
  });
  const result = await state.sourceExpedition.qualify(ENRICHMENT_ID);
  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  assert.deepEqual(result.candidate, {
    enrichmentId: ENRICHMENT_ID,
    title: "Authoritative summit",
    declaredDomain: "authoritative-domain",
    totalConceptCount: 4,
    searchTerms: [
      "Trusted prerequisite",
      "Prerequisite alias",
      "First source chapter",
      "First chapter alias",
      "Second source chapter",
      "Second chapter alias",
      "Authoritative summit",
      "Summit alias"
    ]
  });
  assert.deepEqual(
    result.assets.studyItems.map((item) => item.studyItemId),
    [
      "option-node-prerequisite",
      "option-node-middle-a",
      "matching-node-middle-a",
      "option-node-middle-b",
      "impostor-node-middle-b",
      "option-node-summit"
    ]
  );
  assert.deepEqual(result.assets.routePlan, {
    policyIdentity: "source-expedition-route-v1:min3-max5-target4:mixed",
    orderedDerivedNodeIds: [
      "node-prerequisite",
      "node-middle-a",
      "node-middle-b",
      "node-summit"
    ],
    legs: [{
      legIndex: 0,
      anchorDerivedNodeId: "node-summit",
      derivedNodeIds: [
        "node-prerequisite",
        "node-middle-a",
        "node-middle-b",
        "node-summit"
      ],
      selectedBonusStudyItemIds: [
        "matching-node-middle-a",
        "impostor-node-middle-b"
      ]
    }],
    summitDerivedNodeId: "node-summit"
  });
  assert.deepEqual(
    result.assets.expectedAssets.currentStudyItemIds,
    [
      "impostor-node-middle-b",
      "matching-node-middle-a",
      "option-node-middle-a",
      "option-node-middle-b",
      "option-node-prerequisite",
      "option-node-summit"
    ]
  );
  const adoption = await state.sourceExpedition.adopt({
    learnerStateRef: "learner-1",
    enrichmentId: ENRICHMENT_ID
  });
  assert.equal(adoption.adopted, true);
  const authorization = await state.sourceExpedition.authorizeActive({
    learnerStateRef: "learner-1",
    enrichmentId: ENRICHMENT_ID
  });
  assert.equal(authorization.status, "available");
  if (authorization.status !== "available") return;
  assert.equal(authorization.qualifiedStudyItemIds.has("option-z-node-summit"), false);
  assert.equal(authorization.qualifiedStudyItemIds.has("matching-z-node-summit"), false);
});

test("qualification remains inspectable before publication while every learner entry point refuses it", async () => {
  const state = harness({ cataloged: false });
  const qualification = await state.sourceExpedition.qualify(ENRICHMENT_ID);
  assert.equal(qualification.status, "available");
  assert.deepEqual(
    await state.sourceExpedition.listCandidates({ learnerStateRef: "learner-1" }),
    []
  );
  assert.deepEqual(
    await state.sourceExpedition.adopt({ learnerStateRef: "learner-1", enrichmentId: ENRICHMENT_ID }),
    { adopted: false, refused: "accepted_catalog_entry_required" }
  );
  assert.equal(state.adoptionCalls.length, 0);
});

test("accepted catalog presentation and source credits are the finished learner projection", async () => {
  const { sourceExpedition } = harness();
  const catalog = await sourceExpedition.listCatalog({ learnerStateRef: "learner-1" });
  assert.deepEqual(catalog.candidates[0], {
    enrichmentId: ENRICHMENT_ID,
    catalogKey: "critical-thinking",
    title: "Critical Thinking",
    teaser: "Build stronger arguments and weigh evidence.",
    declaredDomain: "authoritative-domain",
    sortOrder: 1,
    totalConceptCount: 4,
    searchTerms: [
      "Trusted prerequisite",
      "Prerequisite alias",
      "First source chapter",
      "First chapter alias",
      "Second source chapter",
      "Second chapter alias",
      "Authoritative summit",
      "Summit alias"
    ]
  });
  assert.deepEqual(catalog.sources, [{
    catalogKey: "critical-thinking",
    title: "Critical Thinking",
    sourceProvenance: acceptedPublication.sourceProvenance,
    sourceCredits: catalogEntry().sourceCredits
  }]);
});

test("a drifted accepted identity or config is held out by its exact refusal name", async () => {
  for (const options of [
    { acceptedAssetSetIdentity: "stale-assets" },
    { acceptedAssetConfigHash: "stale-config" }
  ]) {
    const state = harness(options);
    assert.deepEqual(
      await state.sourceExpedition.listCandidates({ learnerStateRef: "learner-1" }),
      []
    );
    assert.deepEqual(
      await state.sourceExpedition.adopt({ learnerStateRef: "learner-1", enrichmentId: ENRICHMENT_ID }),
      { adopted: false, refused: "accepted_asset_set_changed" }
    );
  }
});

test("route-only drift changes identity and is rejected at publication, adoption, open, and authorization", async () => {
  const graph = diamondDetail();
  const sourceBlockByNode = new Map(graph.nodes.map((node) => [
    node.derivedNodeId,
    `route-${node.derivedNodeId}`
  ] as const));
  const lessons = graph.nodes.map((node) => routeCuedLesson(
    node.derivedNodeId,
    sourceBlockByNode.get(node.derivedNodeId)!
  ));
  const routeEvidenceAt = (positions: Readonly<Record<string, number>>) => [
    {
      ...sourceEvidence,
      locator: { characterStart: 1_000, characterEnd: 1_046 }
    },
    ...graph.nodes.map((node) => routeEvidence(
      sourceBlockByNode.get(node.derivedNodeId)!,
      positions[node.derivedNodeId]!,
      routeCueText(node.derivedNodeId)
    ))
  ];
  const firstEvidence = routeEvidenceAt({
    "node-prerequisite": 0,
    "node-middle-a": 10,
    "node-middle-b": 20,
    "node-summit": 30
  });
  const changedEvidence = routeEvidenceAt({
    "node-prerequisite": 0,
    "node-middle-a": 20,
    "node-middle-b": 10,
    "node-summit": 30
  });
  const items = qualifiedItemsFor(graph);
  const first = await harness({
    graph,
    lessons,
    items,
    evidence: firstEvidence
  }).sourceExpedition.qualify(ENRICHMENT_ID);
  const changed = await harness({
    graph,
    lessons,
    items,
    evidence: changedEvidence
  }).sourceExpedition.qualify(ENRICHMENT_ID);
  assert.equal(first.status, "available");
  assert.equal(changed.status, "available");
  if (first.status !== "available" || changed.status !== "available") return;
  assert.deepEqual(first.assets.routePlan.orderedDerivedNodeIds, [
    "node-prerequisite",
    "node-middle-a",
    "node-middle-b",
    "node-summit"
  ]);
  assert.deepEqual(changed.assets.routePlan.orderedDerivedNodeIds, [
    "node-prerequisite",
    "node-middle-b",
    "node-middle-a",
    "node-summit"
  ]);
  assert.deepEqual(
    first.assets.studyItems.map((item) => item.studyItemId).sort(),
    changed.assets.studyItems.map((item) => item.studyItemId).sort()
  );
  assert.notEqual(
    first.assets.expectedAssets.assetSetIdentity,
    changed.assets.expectedAssets.assetSetIdentity
  );

  const staleAccepted = harness({
    graph,
    lessons,
    items,
    evidence: changedEvidence,
    acceptedAssetSetIdentity: first.assets.expectedAssets.assetSetIdentity
  });
  assert.deepEqual(await staleAccepted.sourceExpedition.adopt({
    learnerStateRef: "learner-1",
    enrichmentId: ENRICHMENT_ID
  }), {
    adopted: false,
    refused: "accepted_asset_set_changed"
  });
  assert.equal(staleAccepted.adoptionCalls.length, 0);

  const staleOwned = harness({
    graph,
    lessons,
    items,
    evidence: changedEvidence,
    owned: [expedition({
      assetSetIdentity: first.assets.expectedAssets.assetSetIdentity,
      active: true
    })]
  });
  assert.deepEqual(await staleOwned.sourceExpedition.openOwned({
    learnerStateRef: "learner-1",
    enrichmentId: ENRICHMENT_ID
  }), {
    status: "unavailable",
    reason: "accepted_asset_set_changed"
  });
  assert.deepEqual(await staleOwned.sourceExpedition.authorizeActive({
    learnerStateRef: "learner-1",
    enrichmentId: ENRICHMENT_ID
  }), {
    status: "unavailable",
    reason: "accepted_asset_set_changed"
  });

  const stalePublication = harness({
    graph,
    lessons,
    items,
    evidence: changedEvidence,
    refuseCatalogSnapshot: true
  });
  assert.deepEqual(
    await stalePublication.sourceExpedition.publishAccepted(acceptedPublication),
    { published: false, refused: "accepted_asset_set_changed" }
  );
  assert.equal(stalePublication.publicationCalls.length, 1);
});

test("an undersized source route fails qualification before the catalog write", async () => {
  const base = detail();
  const nodes = base.nodes.slice(0, 2);
  const graph: DerivedGraphDetail = {
    ...base,
    summary: {
      ...base.summary,
      conceptCount: nodes.length,
      edgeCount: 1,
      certainEdgeCount: 1,
      studyItemCount: nodes.length
    },
    nodes,
    edges: base.edges.slice(0, 1)
  };
  const state = harness({
    graph,
    lessons: nodes.map((node) => lesson(node.derivedNodeId)),
    items: nodes.map((node) => option(node.derivedNodeId))
  });
  assert.deepEqual(await state.sourceExpedition.publishAccepted(acceptedPublication), {
    published: false,
    refused: "concept_count_below_route_minimum"
  });
  assert.equal(state.publicationCalls.length, 0);
});

test("source-cue failure stays diagnostic and cannot reach a catalog or learner write", async () => {
  const state = harness({ evidence: [] });
  const qualification = await state.sourceExpedition.qualify(ENRICHMENT_ID);
  assert.deepEqual(qualification, {
    status: "unavailable",
    reason: "source_cue_unavailable",
    sourceCueDiagnostics: {
      missingDerivedNodeIds: [
        "node-middle-a",
        "node-middle-b",
        "node-prerequisite",
        "node-summit"
      ],
      unresolvedReferences: [{
        sourceResourceId: "source-resource",
        sourceBlockId: "source-block"
      }]
    }
  });
  assert.deepEqual(await state.sourceExpedition.publishAccepted(acceptedPublication), {
    published: false,
    refused: "source_cue_unavailable"
  });
  assert.deepEqual(await state.sourceExpedition.adopt({
    learnerStateRef: "learner-1",
    enrichmentId: ENRICHMENT_ID
  }), {
    adopted: false,
    refused: "source_cue_unavailable"
  });
  assert.equal(state.publicationCalls.length, 0);
  assert.equal(state.adoptionCalls.length, 0);
});

test("an impossible family mix returns coverage diagnostics before every learner mutation", async () => {
  const graph = detail();
  const state = harness({
    graph,
    items: [
      ...graph.nodes.map((node) => option(node.derivedNodeId)),
      matching("node-middle-a")
    ],
    owned: [expedition({ assetSetIdentity: "previous-route", active: false })]
  });
  const qualification = await state.sourceExpedition.qualify(ENRICHMENT_ID);
  assert.equal(qualification.status, "unavailable");
  if (qualification.status !== "unavailable") return;
  assert.equal(qualification.reason, "study_item_mix_unavailable");
  assert.deepEqual(qualification.routeDiagnostics, {
    conceptCount: 4,
    trustedEdgeCount: 3,
    orderedDerivedNodeIds: [
      "node-prerequisite",
      "node-middle-a",
      "node-middle-b",
      "node-summit"
    ],
    matchingCandidateCount: 1,
    impostorCandidateCount: 0,
    uncoveredBonusWindows: [
      {
        startPosition: 0,
        endPosition: 0,
        derivedNodeIds: ["node-prerequisite"]
      },
      {
        startPosition: 2,
        endPosition: 3,
        derivedNodeIds: ["node-middle-b", "node-summit"]
      }
    ],
    implicatedIds: []
  });
  assert.deepEqual(await state.sourceExpedition.publishAccepted(acceptedPublication), {
    published: false,
    refused: "study_item_mix_unavailable"
  });
  assert.deepEqual(await state.sourceExpedition.adopt({
    learnerStateRef: "learner-1",
    enrichmentId: ENRICHMENT_ID
  }), {
    adopted: false,
    refused: "study_item_mix_unavailable"
  });
  assert.deepEqual(await state.sourceExpedition.activate({
    learnerStateRef: "learner-1",
    learnerExpeditionId: "learner-expedition-1"
  }), {
    activated: false,
    refused: "study_item_mix_unavailable"
  });
  assert.equal(state.publicationCalls.length, 0);
  assert.equal(state.adoptionCalls.length, 0);
  assert.equal(state.activationCalls.length, 0);
});

test("publication pins the exact qualified asset identity and current qualification config", async () => {
  const graph = detail();
  const state = harness({
    graph,
    lessons: graph.nodes.map((node) => lesson(node.derivedNodeId)),
    items: qualifiedItemsFor(graph)
  });
  assert.deepEqual(await state.sourceExpedition.publishAccepted(acceptedPublication), {
    published: true
  });
  assert.equal(state.publicationCalls.length, 1);
  assert.equal(state.publicationCalls[0].acceptedAssetConfigHash, QUALIFIED_CONFIG);
  assert.equal(
    state.publicationCalls[0].acceptedAssetSetIdentity,
    state.publicationCalls[0].expectedAssets.assetSetIdentity
  );
  assert.equal(state.publicationCalls[0].expectedAssets.currentConceptLessonIds.length, 4);
  assert.equal(state.publicationCalls[0].expectedAssets.currentStudyItemIds.length, 6);
});

test("qualification keeps the greatest asset-ready prerequisite-closed sublayer", async () => {
  const graph = partiallyAssetReadyDetail();
  const retainedNodeIds = [
    "node-prerequisite",
    "node-middle-a",
    "node-middle-b",
    "node-summit"
  ];
  const { sourceExpedition } = harness({
    graph,
    lessons: [
      ...retainedNodeIds.map((derivedNodeId) => lesson(derivedNodeId)),
      lesson("node-blocked-dependent")
    ],
    items: [
      ...retainedNodeIds.map((derivedNodeId) => option(derivedNodeId)),
      matching("node-middle-a"),
      impostor("node-middle-b"),
      option("node-blocked-dependent")
    ]
  });

  const result = await sourceExpedition.qualify(ENRICHMENT_ID);
  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  assert.deepEqual(
    result.assets.detail.nodes.map((node) => node.derivedNodeId),
    retainedNodeIds
  );
  assert.deepEqual(
    result.assets.detail.edges.map((edge) =>
      `${edge.prerequisiteDerivedNodeId}->${edge.dependentDerivedNodeId}`
    ).sort(),
    graph.edges.slice(0, 3).map((edge) =>
      `${edge.prerequisiteDerivedNodeId}->${edge.dependentDerivedNodeId}`
    ).sort()
  );
  assert.equal(result.assets.detail.summary.conceptCount, 4);
  assert.equal(result.assets.detail.summary.studyItemCount, 6);
  assert.deepEqual(
    result.assets.lessons.map((entry) => entry.derivedNodeId),
    retainedNodeIds
  );
  assert.deepEqual(
    result.assets.studyItems.map((entry) => entry.derivedNodeId),
    [
      "node-prerequisite",
      "node-middle-a",
      "node-middle-a",
      "node-middle-b",
      "node-middle-b",
      "node-summit"
    ]
  );
  assert.equal(result.candidate.totalConceptCount, 4);
});

test("qualification excludes LLM-grounded branches without suppressing an independent source-ready trail", async () => {
  const graph = partiallySourceReadyDetail();
  const { sourceExpedition } = harness({
    graph,
    lessons: graph.nodes.map((node) => lesson(node.derivedNodeId)),
    items: qualifiedItemsFor(graph)
  });

  const result = await sourceExpedition.qualify(ENRICHMENT_ID);
  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  assert.deepEqual(
    result.assets.detail.nodes.map((node) => node.derivedNodeId),
    ["node-prerequisite", "node-middle-a", "node-middle-b", "node-summit"]
  );
  assert.deepEqual(
    result.assets.detail.edges.map((edge) =>
      `${edge.prerequisiteDerivedNodeId}->${edge.dependentDerivedNodeId}`
    ).sort(),
    graph.edges.slice(0, 3).map((edge) =>
      `${edge.prerequisiteDerivedNodeId}->${edge.dependentDerivedNodeId}`
    ).sort()
  );
});

test("adoption is authoritative, idempotent, and hides the exact owned snapshot from candidates", async () => {
  const state = harness();
  const candidate = (await state.sourceExpedition.listCandidates({ learnerStateRef: "learner-1" }))[0];
  assert.equal(candidate.title, "Critical Thinking");
  const first = await state.sourceExpedition.adopt({ learnerStateRef: "learner-1", enrichmentId: ENRICHMENT_ID });
  assert.equal(first.adopted, true);
  if (!first.adopted) return;
  assert.equal(first.learnerExpeditionId, "new-source-expedition");
  assert.equal(first.routePlan.summitDerivedNodeId, "node-summit");
  assert.equal(state.adoptionCalls[0].title, "Critical Thinking");
  assert.equal(state.adoptionCalls[0].declaredDomain, "authoritative-domain");
  assert.equal(state.owned()[0].kind, "source");
  assert.equal(state.owned()[0].currentOperationId, null);
  assert.equal((await state.sourceExpedition.listCandidates({ learnerStateRef: "learner-1" })).length, 0);
  const opened = await state.sourceExpedition.openOwned({
    learnerStateRef: "learner-1",
    enrichmentId: ENRICHMENT_ID
  });
  assert.equal(opened.status, "available");
  if (opened.status !== "available") return;
  assert.equal(opened.candidate.title, candidate.title);
  assert.equal(opened.candidate.teaser, candidate.teaser);
  assert.equal(opened.expedition.title, candidate.title);

  const activated = await state.sourceExpedition.activate({
    learnerStateRef: "learner-1",
    learnerExpeditionId: first.learnerExpeditionId
  });
  assert.equal(activated.activated, true);
  if (activated.activated) assert.deepEqual(activated.routePlan, first.routePlan);

  const repeat = await state.sourceExpedition.adopt({ learnerStateRef: "learner-1", enrichmentId: ENRICHMENT_ID });
  assert.deepEqual(repeat, first);
  assert.equal(state.owned().length, 1);
});

test("a legacy asset contract fails closed before any adoption write", async () => {
  const state = harness({
    lessons: [lesson("node-prerequisite", BASE_CONFIG), lesson("node-summit", BASE_CONFIG)],
    items: [option("node-prerequisite", BASE_CONFIG), option("node-summit", BASE_CONFIG)]
  });
  assert.deepEqual(await state.sourceExpedition.adopt({ learnerStateRef: "learner-1", enrichmentId: ENRICHMENT_ID }), {
    adopted: false,
    refused: "lesson_unqualified"
  });
  assert.equal(state.adoptionCalls.length, 0);
});

test("a qualified supported paraphrase need not masquerade as a verbatim source citation", async () => {
  const supportedParaphrase = {
    ...lesson("node-prerequisite"),
    sections: [
      ...lesson("node-prerequisite").sections,
      {
        kind: "examples" as const,
        text: "A materially equivalent paraphrase retained by source-support settlement.",
        groundingProvenance: "generated" as const
      }
    ]
  };
  const state = harness({
    lessons: [
      supportedParaphrase,
      lesson("node-middle-a"),
      lesson("node-middle-b"),
      lesson("node-summit")
    ]
  });

  assert.equal((await state.sourceExpedition.qualify(ENRICHMENT_ID)).status, "available");
});

test("LLM-grounded and unverified source-mentioned prerequisites make a required two-stop trail unavailable", async () => {
  const llm = harness({ graph: detail({ firstOrigin: "llm_grounded" }) });
  assert.deepEqual(await llm.sourceExpedition.qualify(ENRICHMENT_ID), {
    status: "unavailable",
    reason: "llm_grounded_prerequisite",
    derivedNodeId: "node-prerequisite"
  });

  const unverified = harness({
    graph: detail({ firstOrigin: "source_mentioned", firstVerbatimDisposition: "unverified" })
  });
  assert.deepEqual(await unverified.sourceExpedition.qualify(ENRICHMENT_ID), {
    status: "unavailable",
    reason: "source_mentioned_prerequisite_unverified",
    derivedNodeId: "node-prerequisite"
  });

  const verified = harness({ graph: detail({ firstOrigin: "source_mentioned" }) });
  assert.equal((await verified.sourceExpedition.qualify(ENRICHMENT_ID)).status, "available");
});

test("missing or structurally unqualified per-stop assets fail closed with the exact node", async () => {
  const missingLesson = harness({ lessons: [lesson("node-summit")] });
  assert.deepEqual(await missingLesson.sourceExpedition.qualify(ENRICHMENT_ID), {
    status: "unavailable",
    reason: "lesson_missing",
    derivedNodeId: "node-prerequisite"
  });

  const missingOption = harness({ items: [option("node-summit")] });
  assert.deepEqual(await missingOption.sourceExpedition.qualify(ENRICHMENT_ID), {
    status: "unavailable",
    reason: "option_select_missing",
    derivedNodeId: "node-prerequisite"
  });
});

test("owned reads and learner authorization reject a changed snapshot and expose exact qualified ids", async () => {
  const qualified = await harness().sourceExpedition.qualify(ENRICHMENT_ID);
  assert.equal(qualified.status, "available");
  if (qualified.status !== "available") return;

  const stale = harness({ owned: [expedition({ assetSetIdentity: "old-snapshot" })] });
  assert.deepEqual(await stale.sourceExpedition.openOwned({ learnerStateRef: "learner-1", enrichmentId: ENRICHMENT_ID }), {
    status: "unavailable",
    reason: "accepted_asset_set_changed"
  });
  assert.equal((await stale.sourceExpedition.listCandidates({ learnerStateRef: "learner-1" })).length, 1);

  const current = harness({
    owned: [expedition({
      assetSetIdentity: qualified.assets.expectedAssets.assetSetIdentity,
      active: true
    })]
  });
  const authorization = await current.sourceExpedition.authorizeActive({
    learnerStateRef: "learner-1",
    enrichmentId: ENRICHMENT_ID
  });
  assert.equal(authorization.status, "available");
  if (authorization.status !== "available") return;
  assert.deepEqual([...authorization.trailNodeIds].sort(), [
    "node-middle-a",
    "node-middle-b",
    "node-prerequisite",
    "node-summit"
  ]);
  assert.deepEqual(authorization.routePlan, qualified.assets.routePlan);
  assert.deepEqual([...authorization.qualifiedConceptLessonIds].sort(), [
    "lesson-node-middle-a",
    "lesson-node-middle-b",
    "lesson-node-prerequisite",
    "lesson-node-summit"
  ]);
  assert.deepEqual([...authorization.qualifiedStudyItemIds].sort(), [
    "impostor-node-middle-b",
    "matching-node-middle-a",
    "option-node-middle-a",
    "option-node-middle-b",
    "option-node-prerequisite",
    "option-node-summit"
  ]);
});

test("atomic store refusal cannot leave a partial adopted or activated source expedition", async () => {
  const qualification = await harness().sourceExpedition.qualify(ENRICHMENT_ID);
  assert.equal(qualification.status, "available");
  if (qualification.status !== "available") return;
  const prior = expedition({
    assetSetIdentity: qualification.assets.expectedAssets.assetSetIdentity,
    active: false
  });
  const state = harness({ owned: [prior], refuseSnapshot: true });
  assert.deepEqual(await state.sourceExpedition.adopt({ learnerStateRef: "learner-1", enrichmentId: ENRICHMENT_ID }), {
    adopted: false,
    refused: "accepted_asset_set_changed"
  });
  assert.deepEqual(await state.sourceExpedition.activate({
    learnerStateRef: "learner-1",
    learnerExpeditionId: prior.learnerExpeditionId
  }), {
    activated: false,
    refused: "accepted_asset_set_changed"
  });
  assert.deepEqual(state.owned(), [prior]);
  assert.equal(state.adoptionCalls.length, 1);
  assert.equal(state.activationCalls.length, 1);
});
