import assert from "node:assert/strict";
import test from "node:test";
import type { NodeEmbeddingPort, NodeMergeAdjudicationPort } from "@lrnki/ports";
import {
  resolveConceptIdentity,
  type ConceptIdentityCandidate
} from "./resolveConceptIdentity";

// A deterministic embedding fake: each text maps to a fixed vector by the GROUP token it
// contains, so "synonyms" share a vector (cosine 1.0) and distinct concepts are
// orthogonal. The real qwen3 scale is calibrated in U5; here we only exercise the
// propose/decide/classify envelope.
function groupEmbedding(groupOf: (text: string) => string, opts: { throwForDomainText?: string } = {}): NodeEmbeddingPort {
  const basis = new Map<string, number>();
  return {
    model: "fake-embedding",
    async embed(texts: string[]): Promise<number[][]> {
      if (opts.throwForDomainText && texts.some((text) => text.includes(opts.throwForDomainText!))) {
        throw new Error("embedding unavailable");
      }
      return texts.map((text) => {
        const group = groupOf(text);
        if (!basis.has(group)) basis.set(group, basis.size);
        const index = basis.get(group)!;
        const vector = new Array(Math.max(basis.size, 8)).fill(0);
        vector[index] = 1;
        return vector;
      });
    }
  };
}

// Adjudicator fake: merges when both labels share a normalized stem (first 4 chars),
// unless a label pair is explicitly forced distinct or to throw.
function stemAdjudicator(opts: { forceDistinct?: [string, string][]; throwOn?: [string, string] } = {}): NodeMergeAdjudicationPort {
  const matches = (set: [string, string][] | undefined, a: string, b: string) =>
    (set ?? []).some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  return {
    model: "fake-judge",
    async adjudicate(input) {
      const a = input.a.label;
      const b = input.b.label;
      if (matches(opts.throwOn ? [opts.throwOn] : undefined, a, b)) throw new Error("adjudicator unavailable");
      if (matches(opts.forceDistinct, a, b)) return { decision: "keep_distinct", rationale: "explicitly distinct" };
      const stem = (s: string) => s.toLowerCase().slice(0, 4);
      return stem(a) === stem(b)
        ? { decision: "merge", rationale: `${a} ≈ ${b}` }
        : { decision: "keep_distinct", rationale: `${a} ≠ ${b}` };
    }
  };
}

function candidate(overrides: Partial<ConceptIdentityCandidate> & Pick<ConceptIdentityCandidate, "canonicalLabel" | "normalizedLabel">): ConceptIdentityCandidate {
  return {
    declaredDomain: "economics",
    aliases: [],
    definitions: [`${overrides.canonicalLabel} is defined here.`],
    published: false,
    ...overrides
  };
}

test("AE1: a published 'ownership' and a new candidate 'owner' merge, survivor keeps the published key", async () => {
  const candidates: ConceptIdentityCandidate[] = [
    candidate({ canonicalLabel: "Ownership", normalizedLabel: "ownership", published: true }),
    candidate({ canonicalLabel: "Owner", normalizedLabel: "owner", published: false })
  ];
  const result = await resolveConceptIdentity({
    candidates,
    embedding: groupEmbedding(() => "owner-group"),
    adjudicator: stemAdjudicator()
  });
  const merges = result.decisions.filter((d) => d.outcome === "merge");
  assert.equal(merges.length, 1);
  assert.equal(merges[0].survivorNormalizedLabel, "ownership", "the published Concept survives (case A)");
  const absorbed = merges[0].members.filter((m) => m.normalizedLabel !== "ownership");
  assert.deepEqual(absorbed.map((m) => m.canonicalLabel), ["Owner"], "the new candidate's surface label is absorbed");
});

test("AE2: two new candidates 'barter' and 'bartering' merge, survivor is the deterministic pick", async () => {
  const candidates: ConceptIdentityCandidate[] = [
    candidate({ canonicalLabel: "Barter", normalizedLabel: "barter", definitions: ["Barter is exchange.", "Barter predates money."] }),
    candidate({ canonicalLabel: "Bartering", normalizedLabel: "bartering", definitions: ["Bartering is trade."] })
  ];
  const result = await resolveConceptIdentity({
    candidates,
    embedding: groupEmbedding(() => "barter-group"),
    adjudicator: stemAdjudicator()
  });
  const merges = result.decisions.filter((d) => d.outcome === "merge");
  assert.equal(merges.length, 1);
  // "barter" has more definitions → survivor by the most-definitions tiebreak (KTD8).
  assert.equal(merges[0].survivorNormalizedLabel, "barter");
  assert.equal(merges[0].members.length, 2);
});

test("AE4: a pair above the floor the adjudicator judges distinct yields a distinct decision, no merge", async () => {
  const candidates: ConceptIdentityCandidate[] = [
    candidate({ canonicalLabel: "Demand", normalizedLabel: "demand" }),
    candidate({ canonicalLabel: "Demography", normalizedLabel: "demography" })
  ];
  const result = await resolveConceptIdentity({
    candidates,
    // Both embed to the same group so the pair IS proposed; the adjudicator forces distinct.
    embedding: groupEmbedding(() => "shared"),
    adjudicator: stemAdjudicator({ forceDistinct: [["Demand", "Demography"]] })
  });
  assert.equal(result.decisions.filter((d) => d.outcome === "merge").length, 0);
  const distinct = result.decisions.filter((d) => d.outcome === "distinct");
  assert.equal(distinct.length, 1);
  assert.equal(distinct[0].members.length, 2);
});

test("AE5: an embedding failure in one domain yields no merge there, surfaces, and a second domain still resolves", async () => {
  const candidates: ConceptIdentityCandidate[] = [
    candidate({ declaredDomain: "biology", canonicalLabel: "Cell", normalizedLabel: "cell", definitions: ["BIOFAIL Cell is the unit of life."] }),
    candidate({ declaredDomain: "biology", canonicalLabel: "Cells", normalizedLabel: "cells", definitions: ["BIOFAIL Cells are units."] }),
    candidate({ declaredDomain: "economics", canonicalLabel: "Barter", normalizedLabel: "barter" }),
    candidate({ declaredDomain: "economics", canonicalLabel: "Bartering", normalizedLabel: "bartering" })
  ];
  const events: string[] = [];
  const result = await resolveConceptIdentity({
    candidates,
    embedding: groupEmbedding((text) => (text.includes("Barter") ? "barter" : "cell"), { throwForDomainText: "BIOFAIL" }),
    adjudicator: stemAdjudicator(),
    onUnavailable: (event) => events.push(event.kind === "embedding" ? `embed:${event.declaredDomain}` : `adj:${event.aKey}`)
  });
  assert.ok(events.includes("embed:biology"), "the biology embedding failure is surfaced");
  const merges = result.decisions.filter((d) => d.outcome === "merge");
  assert.equal(merges.length, 1, "only economics merges");
  assert.equal(merges[0].declaredDomain, "economics");
});

test("embedding text includes label, aliases, and the definition span (not the bare label)", async () => {
  const seen: string[] = [];
  const embedding: NodeEmbeddingPort = {
    model: "capture",
    async embed(texts) {
      seen.push(...texts);
      return texts.map((_t, i) => [i + 1, 0]);
    }
  };
  await resolveConceptIdentity({
    candidates: [candidate({ canonicalLabel: "Ownership", normalizedLabel: "ownership", aliases: ["owns"], definitions: ["Ownership governs memory."] })],
    embedding,
    adjudicator: stemAdjudicator()
  });
  assert.equal(seen.length, 1);
  assert.match(seen[0], /Ownership/);
  assert.match(seen[0], /owns/, "alias is in the embed text");
  assert.match(seen[0], /Ownership governs memory\./, "definition span is in the embed text");
});

test("a cross-domain same-label pair is never proposed", async () => {
  const candidates: ConceptIdentityCandidate[] = [
    candidate({ declaredDomain: "astronomy", canonicalLabel: "Mercury", normalizedLabel: "mercury" }),
    candidate({ declaredDomain: "chemistry", canonicalLabel: "Mercury", normalizedLabel: "mercury" })
  ];
  let adjudicated = 0;
  const adjudicator: NodeMergeAdjudicationPort = {
    model: "count",
    async adjudicate() {
      adjudicated++;
      return { decision: "merge", rationale: "" };
    }
  };
  const result = await resolveConceptIdentity({
    candidates,
    embedding: groupEmbedding(() => "mercury"),
    adjudicator
  });
  assert.equal(adjudicated, 0, "no cross-domain pair is ever sent to the adjudicator");
  assert.equal(result.decisions.length, 0);
});

test("exact-label duplicates within a domain are collapsed before proposal and never adjudicated (KTD5)", async () => {
  const candidates: ConceptIdentityCandidate[] = [
    candidate({ canonicalLabel: "Ownership", normalizedLabel: "ownership", published: true, definitions: ["Base def."] }),
    candidate({ canonicalLabel: "Ownership", normalizedLabel: "ownership", published: false, definitions: ["Run def."] })
  ];
  let adjudicated = 0;
  const adjudicator: NodeMergeAdjudicationPort = {
    model: "count",
    async adjudicate() {
      adjudicated++;
      return { decision: "merge", rationale: "" };
    }
  };
  const result = await resolveConceptIdentity({ candidates, embedding: groupEmbedding(() => "own"), adjudicator });
  assert.equal(adjudicated, 0, "the exact-label pair is collapsed, never adjudicated");
  assert.equal(result.decisions.length, 0);
});

test("a transitive cluster with two already-published members is quarantined, not merged (case B)", async () => {
  // pub1 ≈ newA ≈ pub2 transitively (all share the embedding group + stem), and the
  // cluster contains TWO published members → case B.
  const candidates: ConceptIdentityCandidate[] = [
    candidate({ canonicalLabel: "Tradeone", normalizedLabel: "tradeone", published: true }),
    candidate({ canonicalLabel: "Tradetwo", normalizedLabel: "tradetwo", published: false }),
    candidate({ canonicalLabel: "Tradethree", normalizedLabel: "tradethree", published: true })
  ];
  const result = await resolveConceptIdentity({
    candidates,
    embedding: groupEmbedding(() => "trade"),
    adjudicator: stemAdjudicator()
  });
  const quarantines = result.decisions.filter((d) => d.outcome === "quarantine");
  assert.equal(quarantines.length, 1, "the two-published collision is quarantined");
  assert.equal(quarantines[0].survivorNormalizedLabel, null);
  assert.equal(quarantines[0].members.filter((m) => m.published).length, 2);
  assert.equal(result.decisions.filter((d) => d.outcome === "merge").length, 0, "no merge for a case-B cluster");
});

test("an adjudicator throw on one pair degrades only that pair to distinct; other pairs are unaffected", async () => {
  const candidates: ConceptIdentityCandidate[] = [
    candidate({ canonicalLabel: "Barter", normalizedLabel: "barter" }),
    candidate({ canonicalLabel: "Bartering", normalizedLabel: "bartering" }),
    candidate({ canonicalLabel: "Tariff", normalizedLabel: "tariff" }),
    candidate({ canonicalLabel: "Tariffs", normalizedLabel: "tariffs" })
  ];
  const events: string[] = [];
  const result = await resolveConceptIdentity({
    candidates,
    // barter-group and tariff-group each share a vector so both pairs are proposed.
    embedding: groupEmbedding((text) => (text.includes("Barter") || text.includes("barter") ? "barter" : "tariff")),
    adjudicator: stemAdjudicator({ throwOn: ["Tariff", "Tariffs"] }),
    onUnavailable: (event) => events.push(event.kind)
  });
  assert.ok(events.includes("adjudication"), "the throwing pair is surfaced");
  const merges = result.decisions.filter((d) => d.outcome === "merge");
  assert.equal(merges.length, 1, "barter still merges");
  assert.equal(merges[0].survivorNormalizedLabel, "barter");
});

test("a merge decision records identities, labels, aliases, definitions, score, model and config (R4)", async () => {
  const candidates: ConceptIdentityCandidate[] = [
    candidate({ canonicalLabel: "Ownership", normalizedLabel: "ownership", published: true, aliases: ["owns"], definitions: ["Ownership governs memory."] }),
    candidate({ canonicalLabel: "Owner", normalizedLabel: "owner", aliases: ["holder"], definitions: ["An owner holds a resource."] })
  ];
  const result = await resolveConceptIdentity({
    candidates,
    embedding: groupEmbedding(() => "own"),
    adjudicator: stemAdjudicator()
  });
  const merge = result.decisions.find((d) => d.outcome === "merge")!;
  assert.equal(merge.decidingModel, "fake-judge");
  assert.match(merge.configHash, /identity-res-v1/);
  assert.equal(merge.proposingSignal, "embedding_cosine");
  assert.ok(merge.proposingScore > 0, "the proposing cosine score is recorded");
  assert.ok(merge.rationale.length > 0, "the adjudicator rationale is recorded");
  const survivor = merge.members.find((m) => m.normalizedLabel === "ownership")!;
  assert.deepEqual(survivor.definitions, ["Ownership governs memory."]);
  const absorbed = merge.members.find((m) => m.normalizedLabel === "owner")!;
  assert.deepEqual(absorbed.aliases, ["holder"]);
  assert.deepEqual(absorbed.definitions, ["An owner holds a resource."]);
});

test("the pass is a no-op without both ports (opt-in, KTD7)", async () => {
  const candidates = [candidate({ canonicalLabel: "Barter", normalizedLabel: "barter" })];
  const onlyEmbedding = await resolveConceptIdentity({ candidates, embedding: groupEmbedding(() => "x") });
  const neither = await resolveConceptIdentity({ candidates });
  assert.deepEqual(onlyEmbedding.decisions, []);
  assert.deepEqual(neither.decisions, []);
});
