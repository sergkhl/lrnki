import assert from "node:assert/strict";
import { test } from "node:test";
import type { ConceptLesson, ScaffoldDetour, StudyItem } from "@lrnki/domain-core";
import { hideLearnerScaffold, requestLearnerScaffold, retryLearnerScaffold } from "./requestLearnerScaffold";

// Plan 2026-07-12-002 U5 test scenarios 1-3: an authenticated advertised term creates one durable
// pending detour; arbitrary / unadvertised / inactive requests are refused with no row; retry and
// hide are learner-scoped by the store.

const readyExpedition = { status: "ready" as const, active: true };

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

function makePorts(over: { expedition?: unknown; item?: StudyItem | undefined; lesson?: ConceptLesson | undefined; belongs?: boolean } = {}) {
  const upserted: { parentDerivedNodeId: string; term: string; normalizedTerm: string }[] = [];
  const ports = {
    expeditionStore: { getByEnrichment: async () => (over.expedition === undefined ? readyExpedition : over.expedition) } as never,
    studyItemStore: { getStudyItemById: async () => ("item" in over ? over.item : studyItem()) } as never,
    conceptLessonStore: { getLesson: async () => over.lesson } as never,
    enrichmentRead: { derivedNodeBelongsToEnrichment: async () => over.belongs ?? true } as never,
    scaffoldStore: {
      upsertPending: async (input: { parentDerivedNodeId: string; term: string; normalizedTerm: string }) => {
        upserted.push({ parentDerivedNodeId: input.parentDerivedNodeId, term: input.term, normalizedTerm: input.normalizedTerm });
        return { detourId: "d1", status: "generating" } as ScaffoldDetour;
      },
      restartGenerating: async (i: { detourId: string; learnerStateRef: string }) => (i.learnerStateRef === "owner" ? ({ detourId: i.detourId, status: "generating" } as ScaffoldDetour) : undefined),
      hide: async (i: { learnerStateRef: string }) => i.learnerStateRef === "owner"
    } as never
  };
  return { ports, upserted };
}

test("requestLearnerScaffold — an advertised study-item term creates one pending detour under the item's node", async () => {
  const { ports, upserted } = makePorts();
  const result = await requestLearnerScaffold(
    { learnerStateRef: "owner", enrichmentId: "e", source: { kind: "study_item", studyItemId: "i1" }, term: "affine type" },
    ports
  );
  assert.deepEqual(result, { created: true, detourId: "d1", status: "generating" });
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

test("retry and hide are learner-scoped — another learner cannot address the row", async () => {
  const { ports } = makePorts();
  assert.deepEqual(await retryLearnerScaffold({ learnerStateRef: "owner", detourId: "d1" }, ports), { retried: true });
  assert.deepEqual(await retryLearnerScaffold({ learnerStateRef: "intruder", detourId: "d1" }, ports), { retried: false });
  assert.deepEqual(await hideLearnerScaffold({ learnerStateRef: "owner", detourId: "d1" }, ports), { hidden: true });
  assert.deepEqual(await hideLearnerScaffold({ learnerStateRef: "intruder", detourId: "d1" }, ports), { hidden: false });
});
