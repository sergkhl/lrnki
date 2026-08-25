import assert from "node:assert/strict";
import { test } from "node:test";
import type { ConceptLesson, ScaffoldDetour, StudyItem } from "@lrnki/domain-core";
import { hideLearnerScaffold, requestLearnerScaffold, retryLearnerScaffold } from "./requestLearnerScaffold";
import {
  CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY,
  type LearnerKnowledgeAvailability
} from "./learnerKnowledgeAvailability";
import type { ScaffoldOpeningStudySession } from "./learnerScaffoldGeneration";

// Plan 2026-07-12-002 U5 test scenarios 1-3: an authenticated advertised term creates one durable
// pending detour; arbitrary / unadvertised / inactive requests are refused with no row; retry and
// hide are learner-scoped by the store.

const readyExpedition = { status: "ready" as const, active: true };
const ALL_LEARNER_KNOWLEDGE_AVAILABLE = {
  ...CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY,
  syntheticTopicGeneration: { status: "available" },
  llmGroundedPrerequisites: { status: "available" },
  generatedSupportSteps: { status: "available" }
} as const satisfies LearnerKnowledgeAvailability;

function studyItem(overrides: Partial<StudyItem> = {}): StudyItem {
  return {
    studyItemId: "i1", graphVersionId: "g", enrichmentId: "e", derivedNodeId: "parent",
    groundingProvenance: "generated", generatingModel: "m", configHash: "c",
    itemType: "option_select", question: "Q", explanation: "E",
    explorableTerms: ["affine type"],
    options: [
      { optionId: "o1", text: "one", isCorrect: true, provenance: "generated" },
      { optionId: "o2", text: "two", isCorrect: false, provenance: "generated" }
    ],
    ...overrides
  } as StudyItem;
}

function exactReferenceSession(): ScaffoldOpeningStudySession {
  const base = {
    aliases: [],
    declaredDomain: "software engineering",
    difficulty: null,
    difficultyRationale: null,
    nodeKind: "anchor" as const,
    groundingOrigin: "document_anchored" as const,
    role: "prerequisite" as const,
    hasStudyItem: true,
    grounding: null
  };
  return {
    detail: {
      summary: {} as never,
      nodes: [
        { ...base, derivedNodeId: "parent", label: "Ownership" },
        { ...base, derivedNodeId: "reference", label: "affine type" }
      ],
      edges: [],
      originCounts: [],
      rescueDispositions: [],
      mintingDispositions: [],
      merges: []
    },
    classification: {
      stateByNode: { parent: "frontier", reference: "frontier" },
      selectedFrontierTarget: "parent"
    },
    neutralReferenceAssetsByNode: {
      reference: { conceptLessonId: "lesson-reference", studyItemId: "item-reference" }
    },
    flooredNodeIds: []
  };
}

function makePorts(over: {
  expedition?: unknown;
  item?: StudyItem | undefined;
  lesson?: ConceptLesson | undefined;
  belongs?: boolean;
  learnerKnowledgeAvailability?: LearnerKnowledgeAvailability;
  session?: ScaffoldOpeningStudySession;
  referencePublishAccepted?: boolean;
} = {}) {
  const upserted: { parentDerivedNodeId: string; term: string; normalizedTerm: string }[] = [];
  const publishedReferences: {
    expectedAssets: {
      assetSetIdentity: string;
      currentConceptLessonIds: string[];
      currentStudyItemIds: string[];
    };
    reference: {
      referencedDerivedNodeId: string;
      referencedConceptLessonId: string;
      referencedStudyItemId: string;
    };
  }[] = [];
  const state = { sessionReads: 0, restartCalls: 0 };
  const ports = {
    sourceExpeditions: {
      async authorizeActive() {
        const expedition = over.expedition === undefined ? readyExpedition : over.expedition;
        if (!expedition || (expedition as typeof readyExpedition).status !== "ready" ||
            !(expedition as typeof readyExpedition).active) {
          return { status: "unavailable" as const, reason: "expedition_inactive" as const };
        }
        return {
          status: "available" as const,
          enrichmentId: "e",
          assetSetIdentity: "qualified",
          trailNodeIds: new Set(over.belongs === false ? [] : ["parent", "reference"]),
          qualifiedConceptLessonIds: new Set([
            "lesson-reference",
            ...(over.lesson ? [over.lesson.conceptLessonId] : [])
          ]),
          qualifiedStudyItemIds: new Set(["i1", "item-reference"])
        };
      }
    },
    studyItemStore: { getStudyItemById: async () => ("item" in over ? over.item : studyItem()) } as never,
    conceptLessonStore: { getLesson: async () => over.lesson } as never,
    learnerKnowledgeAvailability: over.learnerKnowledgeAvailability ?? ALL_LEARNER_KNOWLEDGE_AVAILABLE,
    readStudySession: async () => { state.sessionReads += 1; return over.session; },
    scaffoldStore: {
      upsertPending: async (input: { parentDerivedNodeId: string; term: string; normalizedTerm: string }) => {
        upserted.push({ parentDerivedNodeId: input.parentDerivedNodeId, term: input.term, normalizedTerm: input.normalizedTerm });
        return { detourId: "d1", status: "generating" } as ScaffoldDetour;
      },
      upsertReadyReference: async (input: {
        expectedAssets: {
          assetSetIdentity: string;
          currentConceptLessonIds: string[];
          currentStudyItemIds: string[];
        };
        reference: {
          referencedDerivedNodeId: string;
          referencedConceptLessonId: string;
          referencedStudyItemId: string;
        };
      }) => {
        publishedReferences.push({
          expectedAssets: input.expectedAssets,
          reference: input.reference
        });
        return over.referencePublishAccepted === false
          ? undefined
          : { detourId: "d-reference", status: "ready" } as ScaffoldDetour;
      },
      restartGenerating: async (i: { detourId: string; learnerStateRef: string }) => {
        state.restartCalls += 1;
        return i.learnerStateRef === "owner" ? ({ detourId: i.detourId, status: "generating" } as ScaffoldDetour) : undefined;
      },
      hide: async (i: { learnerStateRef: string }) => i.learnerStateRef === "owner"
    } as never
  };
  return {
    ports,
    upserted,
    publishedReferences,
    get sessionReads() { return state.sessionReads; },
    get restartCalls() { return state.restartCalls; }
  };
}

test("requestLearnerScaffold — an advertised study-item term creates one pending detour under the item's node", async () => {
  const { ports, upserted } = makePorts();
  const result = await requestLearnerScaffold(
    { learnerStateRef: "owner", enrichmentId: "e", source: { kind: "study_item", studyItemId: "i1" }, term: "affine type" },
    ports
  );
  assert.deepEqual(result, {
    created: true,
    detourId: "d1",
    status: "generating",
    generationRequested: true
  });
  assert.equal(upserted.length, 1);
  assert.equal(upserted[0].parentDerivedNodeId, "parent");
  assert.equal(upserted[0].normalizedTerm, "affine type");
});

test("requestLearnerScaffold — a term the asset did not advertise is refused with no row", async () => {
  const { ports, upserted } = makePorts();
  const result = await requestLearnerScaffold(
    { learnerStateRef: "owner", enrichmentId: "e", source: { kind: "study_item", studyItemId: "i1" }, term: "not advertised" },
    ports
  );
  assert.deepEqual(result, { created: false, refused: "term_not_advertised" });
  assert.equal(upserted.length, 0);
});

test("requestLearnerScaffold — an inactive expedition is refused before any source read", async () => {
  const { ports, upserted } = makePorts({ expedition: { status: "generating", active: true } });
  const result = await requestLearnerScaffold(
    { learnerStateRef: "owner", enrichmentId: "e", source: { kind: "study_item", studyItemId: "i1" }, term: "affine type" },
    ports
  );
  assert.deepEqual(result, { created: false, refused: "expedition_inactive" });
  assert.equal(upserted.length, 0);
});

test("requestLearnerScaffold — a study item from another enrichment is source_not_found", async () => {
  const { ports } = makePorts({ item: studyItem({ enrichmentId: "other" }) });
  const result = await requestLearnerScaffold(
    { learnerStateRef: "owner", enrichmentId: "e", source: { kind: "study_item", studyItemId: "i1" }, term: "affine type" },
    ports
  );
  assert.deepEqual(result, { created: false, refused: "source_not_found" });
});

test("the current policy publishes an exact-reference detour ready with no generated fallback", async () => {
  const harness = makePorts({
    learnerKnowledgeAvailability: CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY,
    session: exactReferenceSession()
  });
  const result = await requestLearnerScaffold(
    { learnerStateRef: "owner", enrichmentId: "e", source: { kind: "study_item", studyItemId: "i1" }, term: "affine type" },
    harness.ports
  );
  assert.deepEqual(result, {
    created: true,
    detourId: "d-reference",
    status: "ready",
    generationRequested: false
  });
  assert.equal(harness.sessionReads, 1);
  assert.equal(harness.upserted.length, 0);
  assert.deepEqual(harness.publishedReferences, [{
    expectedAssets: {
      assetSetIdentity: "qualified",
      currentConceptLessonIds: ["lesson-reference"],
      currentStudyItemIds: ["i1", "item-reference"]
    },
    reference: {
      referencedDerivedNodeId: "reference",
      referencedConceptLessonId: "lesson-reference",
      referencedStudyItemId: "item-reference"
    }
  }]);
});

test("the current policy refuses a non-reference term before creating a detour", async () => {
  const harness = makePorts({
    learnerKnowledgeAvailability: CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY,
    session: {
      ...exactReferenceSession(),
      neutralReferenceAssetsByNode: {}
    }
  });
  const result = await requestLearnerScaffold(
    { learnerStateRef: "owner", enrichmentId: "e", source: { kind: "study_item", studyItemId: "i1" }, term: "affine type" },
    harness.ports
  );
  assert.deepEqual(result, { created: false, refused: "generated_support_step_unavailable" });
  assert.equal(harness.sessionReads, 1);
  assert.equal(harness.upserted.length, 0);
});

test("an ownership or qualified-asset race fails closed after exact resolution", async () => {
  const harness = makePorts({
    learnerKnowledgeAvailability: CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY,
    session: exactReferenceSession(),
    referencePublishAccepted: false
  });
  const result = await requestLearnerScaffold(
    { learnerStateRef: "owner", enrichmentId: "e", source: { kind: "study_item", studyItemId: "i1" }, term: "affine type" },
    harness.ports
  );
  assert.deepEqual(result, { created: false, refused: "expedition_inactive" });
  assert.equal(harness.upserted.length, 0);
  assert.equal(harness.publishedReferences.length, 1, "the atomic persistence recheck observed the race");
});

test("the current policy refuses failed generated-detour retry before touching the store", async () => {
  const harness = makePorts({ learnerKnowledgeAvailability: CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY });
  assert.deepEqual(
    await retryLearnerScaffold({ learnerStateRef: "owner", detourId: "d1" }, harness.ports),
    { retried: false, refused: "generated_support_step_unavailable" }
  );
  assert.equal(harness.restartCalls, 0);
});

test("retry and hide are learner-scoped — another learner cannot address the row", async () => {
  const { ports } = makePorts();
  assert.deepEqual(await retryLearnerScaffold({ learnerStateRef: "owner", detourId: "d1" }, ports), { retried: true });
  assert.deepEqual(await retryLearnerScaffold({ learnerStateRef: "intruder", detourId: "d1" }, ports), { retried: false });
  assert.deepEqual(await hideLearnerScaffold({ learnerStateRef: "owner", detourId: "d1" }, ports), { hidden: true });
  assert.deepEqual(await hideLearnerScaffold({ learnerStateRef: "intruder", detourId: "d1" }, ports), { hidden: false });
});

// Plan 2026-07-13-002 U2 regression (R4, AE4): the use-case is idempotent through the store's
// unique upsert — repeated/concurrent presses return ONE detour identity, and a restore of an
// existing (e.g. already-ready hidden) detour returns that detour's CURRENT status so the
// client can branch on it instead of assuming a fresh generating job.
test("requestLearnerScaffold — concurrent repeated requests return one identity with the durable row's current status", async () => {
  let upsertCalls = 0;
  const existing = { detourId: "d-durable", status: "ready" } as ScaffoldDetour;
  const { ports } = makePorts();
  (ports.scaffoldStore as { upsertPending: unknown }).upsertPending = async () => {
    upsertCalls += 1;
    return existing; // the store's unique (learner, enrichment, parent, normalized term) row
  };
  const request = () => requestLearnerScaffold(
    { learnerStateRef: "owner", enrichmentId: "e", source: { kind: "study_item", studyItemId: "i1" }, term: "affine type" },
    ports
  );
  const results = await Promise.all([request(), request(), request()]);
  for (const result of results) {
    assert.deepEqual(result, {
      created: true,
      detourId: "d-durable",
      status: "ready",
      generationRequested: false
    });
  }
  assert.equal(upsertCalls, 3, "every press reaches the store; the STORE guarantees one row");
});
