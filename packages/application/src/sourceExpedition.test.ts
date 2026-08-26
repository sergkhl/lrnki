import assert from "node:assert/strict";
import test from "node:test";
import type {
  ConceptLesson,
  MatchingItem,
  OptionSelectItem,
  StudyItem
} from "@lrnki/domain-core";
import type {
  DerivedGraphDetail,
  LearnerExpedition,
  SourceExpeditionAssetExpectation
} from "@lrnki/ports";
import { CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY } from "./learnerKnowledgeAvailability";
import {
  createSourceExpeditionModule,
  qualifiedSourceExpeditionAssetConfigHash
} from "./sourceExpedition";

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
      edgeCount: 1,
      certainEdgeCount: 1,
      uncertainEdgeCount: 0,
      conceptCount: 2,
      studyItemCount: 2,
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
    edges: [{
      prerequisiteDerivedNodeId: "node-prerequisite",
      dependentDerivedNodeId: "node-summit",
      confidence: 0.95,
      uncertain: false,
      judgeModel: "test-judge"
    }],
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
      edgeCount: 2,
      certainEdgeCount: 2,
      conceptCount: 4,
      studyItemCount: 3
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

const sourceCitation = {
  provenance: "source" as const,
  sourceResourceId: "source-resource",
  sourceBlockId: "source-block",
  evidenceQuote: "The source defines this material claim.",
  matchKind: "exact" as const
};

function lesson(derivedNodeId: string, configHash = QUALIFIED_CONFIG): ConceptLesson {
  return {
    conceptLessonId: `lesson-${derivedNodeId}`,
    derivedNodeId,
    graphVersionId: GRAPH_VERSION_ID,
    enrichmentId: ENRICHMENT_ID,
    generatingModel: "test-model",
    configHash,
    canonicalLabel: derivedNodeId,
    sections: [{
      kind: "definition",
      text: "The source defines this material claim.",
      groundingProvenance: "source_cep",
      citation: sourceCitation
    }],
    explorableTerms: []
  };
}

function option(derivedNodeId: string, configHash = QUALIFIED_CONFIG): OptionSelectItem {
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
    question: "Which claim is supported?",
    explanation: "The cited source supports the keyed claim.",
    options: [
      {
        optionId: `correct-${derivedNodeId}`,
        text: "The source defines this material claim.",
        isCorrect: true,
        provenance: "source",
        citation: sourceCitation
      },
      {
        optionId: `wrong-${derivedNodeId}`,
        text: "An unsupported alternative.",
        isCorrect: false,
        provenance: "generated"
      }
    ]
  };
}

function matching(derivedNodeId: string): MatchingItem {
  return {
    studyItemId: `matching-${derivedNodeId}`,
    derivedNodeId,
    graphVersionId: GRAPH_VERSION_ID,
    enrichmentId: ENRICHMENT_ID,
    groundingProvenance: "source_cep",
    generatingModel: "test-model",
    configHash: QUALIFIED_CONFIG,
    explorableTerms: [],
    itemType: "matching",
    question: "Match the source-backed pair.",
    pairs: [{
      pairId: "pair-1",
      matchId: "match-1",
      promptText: "Prompt",
      matchText: "Match",
      citation: sourceCitation
    }]
  };
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

type HarnessOptions = {
  graph?: DerivedGraphDetail;
  lessons?: ConceptLesson[];
  items?: StudyItem[];
  owned?: LearnerExpedition[];
  refuseSnapshot?: boolean;
};

function harness(options: HarnessOptions = {}) {
  const graph = options.graph ?? detail();
  const lessons = options.lessons ?? [lesson("node-prerequisite"), lesson("node-summit")];
  const items = options.items ?? [option("node-prerequisite"), option("node-summit")];
  let owned = [...(options.owned ?? [])];
  const adoptionCalls: Array<{
    title: string;
    declaredDomain: string;
    expectedAssets: SourceExpeditionAssetExpectation;
  }> = [];
  const activationCalls: SourceExpeditionAssetExpectation[] = [];
  const sourceExpedition = createSourceExpeditionModule({
    learnerKnowledgeAvailability: CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY,
    enrichmentRead: {
      async listEnrichmentSummaries() { return [graph.summary]; },
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
    qualifiedAssetConfigHash: QUALIFIED_CONFIG,
    newId: () => "new-source-expedition"
  });
  return {
    sourceExpedition,
    adoptionCalls,
    activationCalls,
    owned: () => owned
  };
}

test("qualification derives authoritative presentation and admits only qualified option-select activities", async () => {
  const extraMatching = matching("node-summit");
  const { sourceExpedition } = harness({
    items: [option("node-prerequisite"), option("node-summit"), extraMatching]
  });
  const result = await sourceExpedition.qualify(ENRICHMENT_ID);
  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  assert.deepEqual(result.candidate, {
    enrichmentId: ENRICHMENT_ID,
    title: "Authoritative summit",
    declaredDomain: "authoritative-domain",
    totalStopCount: 2,
    searchTerms: [
      "Trusted prerequisite",
      "Prerequisite alias",
      "Authoritative summit",
      "Summit alias"
    ]
  });
  assert.deepEqual(
    result.assets.studyItems.map((item) => item.studyItemId),
    ["option-node-prerequisite", "option-node-summit"]
  );
  assert.deepEqual(
    result.assets.expectedAssets.currentStudyItemIds,
    ["option-node-prerequisite", "option-node-summit"]
  );
});

test("qualification keeps the greatest asset-ready prerequisite-closed sublayer", async () => {
  const graph = partiallyAssetReadyDetail();
  const { sourceExpedition } = harness({
    graph,
    lessons: [
      lesson("node-prerequisite"),
      lesson("node-summit"),
      lesson("node-blocked-dependent")
    ],
    items: [
      option("node-prerequisite"),
      option("node-summit"),
      option("node-blocked-dependent")
    ]
  });

  const result = await sourceExpedition.qualify(ENRICHMENT_ID);
  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  assert.deepEqual(
    result.assets.detail.nodes.map((node) => node.derivedNodeId),
    ["node-prerequisite", "node-summit"]
  );
  assert.deepEqual(result.assets.detail.edges, graph.edges.slice(0, 1));
  assert.equal(result.assets.detail.summary.conceptCount, 2);
  assert.equal(result.assets.detail.summary.studyItemCount, 2);
  assert.deepEqual(
    result.assets.lessons.map((entry) => entry.derivedNodeId),
    ["node-prerequisite", "node-summit"]
  );
  assert.deepEqual(
    result.assets.studyItems.map((entry) => entry.derivedNodeId),
    ["node-prerequisite", "node-summit"]
  );
  assert.equal(result.candidate.totalStopCount, 2);
});

test("qualification excludes LLM-grounded branches without suppressing an independent source-ready trail", async () => {
  const graph = partiallySourceReadyDetail();
  const { sourceExpedition } = harness({
    graph,
    lessons: graph.nodes.map((node) => lesson(node.derivedNodeId)),
    items: graph.nodes.map((node) => option(node.derivedNodeId))
  });

  const result = await sourceExpedition.qualify(ENRICHMENT_ID);
  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  assert.deepEqual(
    result.assets.detail.nodes.map((node) => node.derivedNodeId),
    ["node-prerequisite", "node-summit"]
  );
  assert.deepEqual(result.assets.detail.edges, graph.edges.slice(0, 1));
});

test("adoption is authoritative, idempotent, and hides the exact owned snapshot from candidates", async () => {
  const state = harness();
  assert.equal((await state.sourceExpedition.listCandidates({ learnerStateRef: "learner-1" })).length, 1);
  const first = await state.sourceExpedition.adopt({ learnerStateRef: "learner-1", enrichmentId: ENRICHMENT_ID });
  assert.deepEqual(first, { adopted: true, learnerExpeditionId: "new-source-expedition" });
  assert.equal(state.adoptionCalls[0].title, "Authoritative summit");
  assert.equal(state.adoptionCalls[0].declaredDomain, "authoritative-domain");
  assert.equal(state.owned()[0].kind, "source");
  assert.equal(state.owned()[0].currentOperationId, null);
  assert.equal((await state.sourceExpedition.listCandidates({ learnerStateRef: "learner-1" })).length, 0);

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
    sections: [{
      kind: "definition" as const,
      text: "A materially equivalent paraphrase retained by source-support settlement.",
      groundingProvenance: "generated" as const
    }]
  };
  const state = harness({
    lessons: [supportedParaphrase, lesson("node-summit")]
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
    reason: "asset_set_changed"
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
  assert.deepEqual([...authorization.trailNodeIds].sort(), ["node-prerequisite", "node-summit"]);
  assert.deepEqual([...authorization.qualifiedConceptLessonIds].sort(), [
    "lesson-node-prerequisite",
    "lesson-node-summit"
  ]);
  assert.deepEqual([...authorization.qualifiedStudyItemIds].sort(), [
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
    refused: "asset_set_changed"
  });
  assert.deepEqual(await state.sourceExpedition.activate({
    learnerStateRef: "learner-1",
    learnerExpeditionId: prior.learnerExpeditionId
  }), {
    activated: false,
    refused: "asset_set_changed"
  });
  assert.deepEqual(state.owned(), [prior]);
  assert.equal(state.adoptionCalls.length, 1);
  assert.equal(state.activationCalls.length, 1);
});
