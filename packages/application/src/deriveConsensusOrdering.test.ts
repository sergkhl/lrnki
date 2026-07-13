import assert from "node:assert/strict";
import { test } from "node:test";
import type { InferredPrerequisiteEdge, PrerequisiteConceptContext, WholeSetOrdering } from "@lrnki/domain-core";
import type { PrerequisiteOrderingPort } from "@lrnki/ports";
import { DEFAULT_DERIVED_GRAPH_COMPLETION_CONFIG } from "./completeDerivedGraphLayer";
import { deriveConsensusOrdering } from "./deriveConsensusOrdering";

type OrderInput = { declaredDomain: string; nodes: PrerequisiteConceptContext[] };
type Responder = (input: OrderInput, drawIndex: number) => WholeSetOrdering;
type LabelEdge = { prerequisiteLabel: string; dependentLabel: string; confidence: number; rationale: string };

const K = DEFAULT_DERIVED_GRAPH_COMPLETION_CONFIG.orderingSampleCount;

function context(derivedNodeId: string, canonicalLabel: string): PrerequisiteConceptContext {
  return {
    derivedNodeId,
    canonicalLabel,
    aliases: [],
    definitions: [`${canonicalLabel} definition`],
    mentions: [],
    assertions: []
  };
}

function edgeOf(prerequisiteLabel: string, dependentLabel: string, confidence = 0.9, rationale = "mock"): LabelEdge {
  return { prerequisiteLabel, dependentLabel, confidence, rationale };
}

function presentEdges(input: OrderInput, edges: LabelEdge[]): WholeSetOrdering {
  const numberOf = (label: string): number => input.nodes.findIndex((node) => node.canonicalLabel === label) + 1;
  return {
    edges: edges
      .map((edge) => ({
        prerequisiteNumber: numberOf(edge.prerequisiteLabel),
        dependentNumber: numberOf(edge.dependentLabel),
        confidence: edge.confidence,
        rationale: edge.rationale
      }))
      .filter((edge) => edge.prerequisiteNumber > 0 && edge.dependentNumber > 0)
  };
}

function drawsOf(k: number, segments: Array<[LabelEdge[], number]>): LabelEdge[][] {
  const out: LabelEdge[][] = [];
  for (const [edges, repeat] of segments) {
    for (let i = 0; i < repeat; i++) out.push(edges);
  }
  while (out.length < k) out.push([]);
  return out.slice(0, k);
}

function scriptResponder(perDomain: Record<string, LabelEdge[][]>): Responder {
  return (input, drawIndex) => presentEdges(input, perDomain[input.declaredDomain]?.[drawIndex] ?? []);
}

function buildOrdering(responder: Responder) {
  const calls: OrderInput[] = [];
  const drawCounts = new Map<string, number>();
  const prerequisiteOrdering: PrerequisiteOrderingPort = {
    model: "mock-ordering",
    async order(input) {
      const drawIndex = drawCounts.get(input.declaredDomain) ?? 0;
      drawCounts.set(input.declaredDomain, drawIndex + 1);
      calls.push(input);
      return responder(input, drawIndex);
    }
  };
  return {
    calls,
    prerequisiteOrdering,
    callsForDomain: (domain: string) => calls.filter((call) => call.declaredDomain === domain).length
  };
}

function run(input: {
  domains: { declaredDomain: string; nodes: PrerequisiteConceptContext[] }[];
  responder?: Responder;
  config?: Partial<Parameters<typeof deriveConsensusOrdering>[0]>;
}) {
  const ordering = buildOrdering(input.responder ?? (() => ({ edges: [] })));
  return {
    ordering,
    result: deriveConsensusOrdering({
      domains: input.domains,
      prerequisiteOrdering: ordering.prerequisiteOrdering,
      orderingSampleCount: K,
      directionContestMinorityFraction: DEFAULT_DERIVED_GRAPH_COMPLETION_CONFIG.directionContestMinorityFraction,
      minEdgeConfidence: DEFAULT_DERIVED_GRAPH_COMPLETION_CONFIG.minEdgeConfidence,
      maxDomainPromptChars: DEFAULT_DERIVED_GRAPH_COMPLETION_CONFIG.maxDomainPromptChars,
      ...input.config
    })
  };
}

const edgeKey = (edge: Pick<InferredPrerequisiteEdge, "prerequisiteDerivedNodeId" | "dependentDerivedNodeId">) =>
  `${edge.prerequisiteDerivedNodeId}->${edge.dependentDerivedNodeId}`;

test("issues K draws per multi-node domain and zero draws for singleton domains", async () => {
  const { ordering, result } = run({
    domains: [
      { declaredDomain: "x", nodes: [context("x1", "X One"), context("x2", "X Two")] },
      { declaredDomain: "z", nodes: [context("z1", "Solo")] }
    ]
  });

  const output = await result;
  assert.equal(ordering.callsForDomain("x"), K);
  assert.equal(ordering.callsForDomain("z"), 0);
  assert.deepEqual(output.orderings.find((trace) => trace.declaredDomain === "z"), {
    declaredDomain: "z",
    judgeModel: "mock-ordering",
    nodeCount: 1,
    k: 0,
    pairVotes: [],
    cycleRoutedEdges: []
  });
});

test("sorts domains and same-domain nodes into stable ordering inputs", async () => {
  const { ordering, result } = run({
    domains: [
      { declaredDomain: "z", nodes: [context("z2", "Z Two"), context("z1", "Z One")] },
      { declaredDomain: "x", nodes: [context("x2", "X Two"), context("x1", "X One")] }
    ]
  });
  await result;

  assert.equal(ordering.calls[0].declaredDomain, "x");
  assert.deepEqual(ordering.calls[0].nodes.map((node) => node.derivedNodeId), ["x1", "x2"]);
  assert.equal(ordering.calls[K].declaredDomain, "z");
  assert.deepEqual(ordering.calls[K].nodes.map((node) => node.derivedNodeId), ["z1", "z2"]);
});

test("computes consensus confidence as max(forward, reverse) / K", async () => {
  const { result } = run({
    domains: [{ declaredDomain: "x", nodes: [context("x1", "X One"), context("x2", "X Two")] }],
    responder: scriptResponder({ x: drawsOf(K, [[[edgeOf("X Two", "X One", 0.2)], 6]]) })
  });

  const output = await result;
  assert.equal(output.certainEdges.length, 1);
  assert.equal(output.certainEdges[0].confidence, 6 / K);
  assert.match(output.certainEdges[0].provenance.judgmentRationale, /consensus 6\/8 forward, 0\/8 reverse/);
  assert.deepEqual(output.orderings[0].pairVotes[0], {
    prerequisiteDerivedNodeId: "x2",
    dependentDerivedNodeId: "x1",
    forward: 6,
    reverse: 0,
    k: K,
    consensusConfidence: 6 / K,
    classification: "consensus"
  });
});

test("routes direction-contested pairs to uncertain", async () => {
  const { result } = run({
    domains: [{ declaredDomain: "x", nodes: [context("x1", "X One"), context("x2", "X Two")] }],
    responder: scriptResponder({
      x: drawsOf(K, [[[edgeOf("X Two", "X One")], 5], [[edgeOf("X One", "X Two")], 3]])
    })
  });

  const output = await result;
  assert.equal(output.certainEdges.length, 0);
  assert.equal(output.uncertainEdges.length, 1);
  assert.equal(output.uncertainEdges[0].uncertain, true);
  assert.equal(edgeKey(output.uncertainEdges[0]), "x2->x1");
  assert.equal(output.orderings[0].pairVotes[0].classification, "direction_contested");
});

test("cuts sub-quorum weak edges while keeping strong consensus edges", async () => {
  const { result } = run({
    domains: [{ declaredDomain: "x", nodes: [context("x1", "X One"), context("x2", "X Two"), context("x3", "X Three")] }],
    responder: scriptResponder({
      x: drawsOf(K, [
        [[edgeOf("X Two", "X One"), edgeOf("X One", "X Three")], 1],
        [[edgeOf("X Two", "X One")], 6]
      ])
    })
  });

  const output = await result;
  assert.deepEqual(output.certainEdges.map(edgeKey), ["x2->x1"]);
  assert.deepEqual(output.weakEdges.map(edgeKey), ["x1->x3"]);
  assert.equal(output.orderings[0].pairVotes.find((vote) => vote.dependentDerivedNodeId === "x3")?.forward, 1);
});

test("runs weak-cut before aggregate cycle routing", async () => {
  const { result } = run({
    domains: [{ declaredDomain: "x", nodes: [context("a", "A"), context("b", "B"), context("c", "C")] }],
    responder: scriptResponder({
      x: drawsOf(K, [
        [[edgeOf("A", "B"), edgeOf("B", "C"), edgeOf("C", "A")], 3],
        [[edgeOf("A", "B"), edgeOf("B", "C")], 5]
      ])
    })
  });

  const output = await result;
  assert.deepEqual(output.certainEdges.map(edgeKey), ["a->b", "b->c"]);
  assert.deepEqual(output.weakEdges.map(edgeKey), ["c->a"]);
  assert.equal(output.uncertainEdges.length, 0);
  assert.deepEqual(output.orderings[0].cycleRoutedEdges, []);
});

test("routes aggregate cycles to uncertain", async () => {
  const { ordering, result } = run({
    domains: [{ declaredDomain: "x", nodes: [context("a", "A"), context("b", "B"), context("c", "C")] }],
    responder: (input) => presentEdges(input, [edgeOf("A", "B"), edgeOf("B", "C"), edgeOf("C", "A")])
  });

  const output = await result;
  assert.equal(ordering.callsForDomain("x"), K);
  assert.equal(output.certainEdges.length, 0);
  assert.deepEqual(output.uncertainEdges.map(edgeKey).sort(), ["a->b", "b->c", "c->a"]);
  assert.deepEqual(output.orderings[0].cycleRoutedEdges.map(edgeKey).sort(), ["a->b", "b->c", "c->a"]);
});

test("is replay deterministic for a fixed draw multiset", async () => {
  const domains = [{ declaredDomain: "x", nodes: [context("x1", "X One"), context("x2", "X Two")] }];
  const fwd = edgeOf("X Two", "X One");
  const rev = edgeOf("X One", "X Two");
  const orderA = await run({
    domains,
    responder: scriptResponder({ x: drawsOf(K, [[[fwd], 5], [[rev], 3]]) })
  }).result;
  const orderB = await run({
    domains,
    responder: scriptResponder({ x: [[rev], [fwd], [rev], [fwd], [rev], [fwd], [fwd], [fwd]] })
  }).result;

  assert.deepEqual(orderA.orderings[0].pairVotes, orderB.orderings[0].pairVotes);
  assert.deepEqual(orderA.certainEdges, orderB.certainEdges);
  assert.deepEqual(orderA.uncertainEdges, orderB.uncertainEdges);
  assert.deepEqual(orderA.weakEdges, orderB.weakEdges);
});

test("fails closed when a domain exceeds the prompt budget", async () => {
  const { result } = run({
    domains: [{ declaredDomain: "x", nodes: [context("x1", "X One"), context("x2", "X Two")] }],
    config: { maxDomainPromptChars: 5 }
  });

  await assert.rejects(() => result, /exceeds the budget/);
});

test("rejects an out-of-range ordinal endpoint fail-closed", async () => {
  const { result } = run({
    domains: [{ declaredDomain: "x", nodes: [context("x1", "X One"), context("x2", "X Two")] }],
    responder: () => ({ edges: [{ prerequisiteNumber: 1, dependentNumber: 99, confidence: 0.9, rationale: "mock" }] })
  });

  await assert.rejects(() => result, /outside the listed/);
});

test("rejects self-edges fail-closed", async () => {
  const { result } = run({
    domains: [{ declaredDomain: "x", nodes: [context("x1", "X One"), context("x2", "X Two")] }],
    responder: () => ({ edges: [{ prerequisiteNumber: 1, dependentNumber: 1, confidence: 0.9, rationale: "mock" }] })
  });

  await assert.rejects(() => result, /its own prerequisite/);
});
