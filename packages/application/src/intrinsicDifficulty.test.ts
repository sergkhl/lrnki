import assert from "node:assert/strict";
import { test } from "node:test";
import type { DifficultyNodeContext, InferredPrerequisiteEdge } from "@lrnki/domain-core";
import type { IntrinsicDifficultyJudgmentPort } from "@lrnki/ports";
import { createIntrinsicDifficultyPort } from "./intrinsicDifficulty";

function node(id: string, definitions: string[] = [`${id} definition`], mentions: string[] = []): DifficultyNodeContext {
  return {
    derivedNodeId: id,
    canonicalLabel: id.toUpperCase(),
    aliases: [],
    declaredDomain: "test",
    groundingOrigin: "document_anchored",
    definitions,
    mentions
  };
}

function llmGroundedNode(id: string): DifficultyNodeContext {
  return {
    ...node(id, [`${id} generated definition`], [`${id} generated mention`]),
    groundingOrigin: "llm_grounded"
  };
}

function edge(prereq: string, dependent: string): InferredPrerequisiteEdge {
  return {
    prerequisiteDerivedNodeId: prereq,
    dependentDerivedNodeId: dependent,
    predicate: "inferred-prerequisite-of",
    confidence: 0.9,
    uncertain: false,
    provenance: { judgmentRationale: "test" }
  };
}

function judge(scores: Record<string, number>): IntrinsicDifficultyJudgmentPort {
  return {
    model: "stub-judge",
    async judge(input) {
      return { neuralScore: scores[input.derivedNodeId] ?? 0, rationale: "stub" };
    }
  };
}

test("createIntrinsicDifficultyPort returns fused scores and interpretable components for every node", async () => {
  const port = createIntrinsicDifficultyPort(judge({ a: 0.1, b: 0.5, c: 0.9 }));
  const difficulties = await port.score({
    nodes: [node("a"), node("b", ["b definition"], ["b mention"]), node("c")],
    prerequisiteEdges: [edge("a", "b"), edge("b", "c")]
  });

  assert.equal(port.method, "intrinsic-fused-v1");
  assert.equal(difficulties.length, 3);
  assert.ok(difficulties.every((difficulty) => difficulty.method === "intrinsic-fused-v1"));
  const byId = new Map(difficulties.map((difficulty) => [difficulty.derivedNodeId, difficulty] as const));
  assert.equal(byId.get("a")?.components.neuralScore, 0.1);
  assert.equal(byId.get("b")?.components.topoDepth, 1);
  assert.equal(byId.get("c")?.components.transitiveAncestors, 2);
  assert.equal(byId.get("b")?.components.fanIn, 1);
  assert.equal(byId.get("b")?.components.evidenceDensity, 2);
  assert.ok((byId.get("c")?.score ?? -1) >= 0);
  assert.ok((byId.get("c")?.score ?? 2) <= 1);
});

test("same-depth nodes are differentiated by the neural subscore", async () => {
  const port = createIntrinsicDifficultyPort(judge({ a: 0.1, b: 0.8, root: 0.1 }));
  const difficulties = await port.score({
    nodes: [node("root"), node("a"), node("b")],
    prerequisiteEdges: [edge("root", "a"), edge("root", "b")]
  });
  const byId = new Map(difficulties.map((difficulty) => [difficulty.derivedNodeId, difficulty] as const));

  assert.equal(byId.get("a")?.components.topoDepth, byId.get("b")?.components.topoDepth);
  assert.ok((byId.get("b")?.score ?? 0) > (byId.get("a")?.score ?? 1));
});

test("structural components match hand-computed graph values", async () => {
  const port = createIntrinsicDifficultyPort(judge({ a: 0, b: 0, c: 0, d: 0 }));
  const difficulties = await port.score({
    nodes: [node("a"), node("b"), node("c"), node("d", ["d def"], ["d mention 1", "d mention 2"])],
    prerequisiteEdges: [edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")]
  });
  const d = difficulties.find((difficulty) => difficulty.derivedNodeId === "d");
  assert.ok(d);
  assert.equal(d.components.topoDepth, 2);
  assert.equal(d.components.transitiveAncestors, 3);
  assert.equal(d.components.fanIn, 2);
  assert.equal(d.components.evidenceDensity, 3);
  assert.equal(d.components.normalizedTopoDepth, 1);
  assert.equal(d.components.normalizedTransitiveAncestors, 1);
  assert.equal(d.components.normalizedFanIn, 1);
  assert.equal(d.components.normalizedEvidenceDensity, 1);
});

test("fused score remains bounded across neural score boundaries", async () => {
  const port = createIntrinsicDifficultyPort(judge({ a: 0, b: 1 }));
  const difficulties = await port.score({ nodes: [node("a"), node("b")], prerequisiteEdges: [edge("a", "b")] });
  for (const difficulty of difficulties) {
    assert.ok(difficulty.score >= 0);
    assert.ok(difficulty.score <= 1);
  }
});

test("judge failures and out-of-range neural scores fail closed", async () => {
  const throwing: IntrinsicDifficultyJudgmentPort = {
    model: "throwing",
    async judge() {
      throw new Error("judge unavailable");
    }
  };
  await assert.rejects(() => createIntrinsicDifficultyPort(throwing).score({ nodes: [node("a")], prerequisiteEdges: [] }), /judge unavailable/);

  await assert.rejects(
    () => createIntrinsicDifficultyPort(judge({ a: 1.1 })).score({ nodes: [node("a")], prerequisiteEdges: [] }),
    /out-of-range/
  );
});

test("the judge's rationale passes through to the ConceptDifficulty while the fused score is unchanged", async () => {
  // A judge returning a per-node rationale alongside its numeric subscore. The port
  // must carry the text through verbatim (R5) and must NOT let it perturb the score (R7).
  // This asserts the deterministic transform of the model's output, not the model's
  // judgment content (AGENTS rule 11).
  const rationaleJudge: IntrinsicDifficultyJudgmentPort = {
    model: "stub-judge",
    async judge(input) {
      return { neuralScore: 0.4, rationale: `${input.derivedNodeId} is moderately abstract` };
    }
  };
  // Isolated single node: no edges, defs=1/mentions=0 → structuralScore = (0+0+0+1)/4 = 0.25.
  const difficulties = await createIntrinsicDifficultyPort(rationaleJudge).score({ nodes: [node("a")], prerequisiteEdges: [] });
  assert.equal(difficulties.length, 1);
  assert.equal(difficulties[0].neuralRationale, "a is moderately abstract");
  // Same fused formula as before the field was added: 0.55*neural + 0.45*structural
  // (in-range, so the port's clamp is identity here).
  assert.equal(difficulties[0].score, 0.55 * 0.4 + 0.45 * 0.25);
  // The rationale lives beside, never inside, the strictly-numeric components (KTD3).
  assert.equal(Object.values(difficulties[0].components).every((value) => typeof value === "number"), true);
});

test("llm_grounded node context is scored from generated grounding text", async () => {
  const seen: DifficultyNodeContext[] = [];
  const port = createIntrinsicDifficultyPort({
    model: "stub-judge",
    async judge(input) {
      seen.push(input);
      return { neuralScore: 0.5, rationale: "stub" };
    }
  });
  const difficulties = await port.score({ nodes: [llmGroundedNode("generated")], prerequisiteEdges: [] });
  assert.equal(difficulties.length, 1);
  assert.equal(seen[0].groundingOrigin, "llm_grounded");
  assert.deepEqual(seen[0].definitions, ["generated generated definition"]);
});
