import assert from "node:assert/strict";
import test from "node:test";
import type { Card, CardDraft, GraphSnapshot, PublishedEvidencePassage } from "@lrnki/domain-core";
import type { CardBankStorePort, CardGenerationPort, GraphVersionStorePort } from "@lrnki/ports";
import { generateCardBank } from "./generateCardBank";

function passage(sourceBlockId: string, evidenceQuote: string): PublishedEvidencePassage {
  return { sourceResourceId: "res-1", sourceBlockId, evidenceQuote, headingPath: [], locator: {} };
}

function snapshotWith(profiles: { conceptId: string; label: string; definitions?: PublishedEvidencePassage[]; mentions?: PublishedEvidencePassage[] }[]): GraphSnapshot {
  return {
    graphVersionId: "gv-1",
    baseGraphVersionId: null,
    concepts: profiles.map((p) => ({
      conceptId: p.conceptId,
      iri: `urn:lrnki:concept:${p.conceptId}`,
      canonicalLabel: p.label,
      normalizedLabel: p.label.toLowerCase(),
      declaredDomain: "software engineering",
      aliases: [],
      trustTier: "curated_source_grounded",
      homograph: false,
      groundingOrigin: "document_anchored",
      role: "anchor",
      layer: "asserted"
    })),
    evidenceProfiles: profiles.map((p) => ({
      conceptId: p.conceptId,
      definitions: p.definitions ?? [],
      mentions: p.mentions ?? [],
      assertions: []
    }))
  };
}

function graphStoreReturning(snapshot: GraphSnapshot): GraphVersionStorePort {
  return {
    async getPublishedSnapshot() { return snapshot; },
    async getLatestPublishedSnapshot() { return snapshot; },
    async existingConceptIdentities() { return []; },
    async publish() { /* unused */ }
  } as unknown as GraphVersionStorePort;
}

function cardGenerationReturning(draftByConcept: Record<string, CardDraft>): CardGenerationPort {
  return {
    model: "mock-card-gen",
    async generate(input) {
      const draft = draftByConcept[input.concept.conceptId];
      if (!draft) throw new Error(`no canned draft for ${input.concept.conceptId}`);
      return draft;
    }
  };
}

function capturingStore(): { store: CardBankStorePort; persisted: Card[] } {
  const persisted: Card[] = [];
  const store: CardBankStorePort = {
    async persist(cards) { persisted.push(...cards); },
    async getCard() { return undefined; },
    async listCardsForVersion() { return persisted; }
  };
  return { store, persisted };
}

test("a card whose citation quote is a verbatim substring of the cited CEP passage persists with citations intact", async () => {
  const snapshot = snapshotWith([
    { conceptId: "c1", label: "Ownership", definitions: [passage("b1", "Ownership is a set of rules that govern memory in Rust.")] }
  ]);
  const { store, persisted } = capturingStore();
  const result = await generateCardBank({
    graphVersionId: "gv-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    cardGeneration: cardGenerationReturning({
      c1: { question: "What governs memory?", answerKey: "A set of rules.", selfReportPrompt: "Confident?", citations: [{ sourceBlockId: "b1", evidenceQuote: "rules that govern memory" }] }
    }),
    cardBankStore: store,
    newCardId: () => "card-1"
  });

  assert.equal(result.cards.length, 1);
  assert.equal(result.rejected.length, 0);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].citations.length, 1);
  assert.equal(persisted[0].citations[0].sourceResourceId, "res-1", "sourceResourceId resolved from the published passage");
  assert.equal(persisted[0].generatingModel, "mock-card-gen");
});

test("a card whose citation quote is not in any cited passage is rejected fail-closed and never persisted", async () => {
  const snapshot = snapshotWith([
    { conceptId: "c1", label: "Ownership", definitions: [passage("b1", "Ownership is a set of rules that govern memory.")] }
  ]);
  const { store, persisted } = capturingStore();
  const result = await generateCardBank({
    graphVersionId: "gv-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    cardGeneration: cardGenerationReturning({
      c1: { question: "Q?", answerKey: "A.", selfReportPrompt: "Confident?", citations: [{ sourceBlockId: "b1", evidenceQuote: "a fact never stated in the passage" }] }
    }),
    cardBankStore: store,
    newCardId: () => "card-1"
  });

  assert.equal(result.cards.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0].reason, /unverifiable/);
  assert.equal(persisted.length, 0, "the rejected card is not persisted");
});

test("a Concept with no definition passage still produces a card from a mention", async () => {
  const snapshot = snapshotWith([
    { conceptId: "c1", label: "Borrowing", mentions: [passage("b2", "Borrowing lets you reference a value without taking ownership.")] }
  ]);
  const { store, persisted } = capturingStore();
  const result = await generateCardBank({
    graphVersionId: "gv-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    cardGeneration: cardGenerationReturning({
      c1: { question: "What is borrowing?", answerKey: "Referencing without taking ownership.", selfReportPrompt: "Confident?", citations: [{ sourceBlockId: "b2", evidenceQuote: "reference a value without taking ownership" }] }
    }),
    cardBankStore: store,
    newCardId: () => "card-1"
  });

  assert.equal(result.cards.length, 1, "thin CEP (mentions only) still yields a card");
  assert.equal(persisted[0].citations[0].sourceBlockId, "b2");
});

test("a Concept with no citable CEP passages is rejected without calling the generator", async () => {
  const snapshot = snapshotWith([{ conceptId: "c1", label: "Empty" }]);
  const { store } = capturingStore();
  let generatorCalled = false;
  const result = await generateCardBank({
    graphVersionId: "gv-1",
    configHash: "cfg-1",
    graphStore: graphStoreReturning(snapshot),
    cardGeneration: {
      model: "mock",
      async generate() { generatorCalled = true; throw new Error("should not be called"); }
    },
    cardBankStore: store
  });
  assert.equal(result.cards.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.equal(generatorCalled, false);
});
