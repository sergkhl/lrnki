import assert from "node:assert/strict";
import { test } from "node:test";
import { createConceptLessonGenerationPort } from "./conceptLessonGenerationAdapters";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";

type Captured = { toolName: string; tags: string[]; parameters: unknown; messages: { content: string }[] };

function fakeClient(response: unknown, sink: Captured[]): LiteLlmForcedToolClient {
  return {
    async call(input: Captured) {
      sink.push(input);
      return response;
    }
  } as unknown as LiteLlmForcedToolClient;
}

const baseInput = {
  declaredDomain: "software engineering",
  node: { derivedNodeId: "n1", canonicalLabel: "Borrowing", aliases: ["borrow"] },
  groundingProvenance: "source_cep" as const,
  groundingPassages: [
    { passageId: "b1", kind: "definition" as const, text: "Borrowing lends a reference without taking ownership.", sourceResourceId: "res-1", sourceBlockId: "b1" }
  ],
  neighbors: {
    parents: [{ label: "Ownership", snippet: "each value has a single owner" }],
    children: [{ label: "Lifetimes", snippet: "how long a reference is valid" }],
    siblings: [{ label: "Slices", snippet: "a view into contiguous data" }]
  }
};

test("generate issues one call with the lesson tool name, schema, and stage tag", async () => {
  const calls: Captured[] = [];
  const client = fakeClient({
    sections: [
      { kind: "gist", text: "Borrowing accesses a value without owning it.", citationPassageId: null, citationEvidenceQuote: null, diagramCaption: null, diagramSpec: null },
      { kind: "definition", text: "Borrowing lends a reference without taking ownership.", citationPassageId: "b1", citationEvidenceQuote: "Borrowing lends a reference without taking ownership.", diagramCaption: null, diagramSpec: null },
      { kind: "applications", text: "Lifetimes build on borrowing.", citationPassageId: null, citationEvidenceQuote: null, diagramCaption: null, diagramSpec: null }
    ],
    explorableTerms: []
  }, calls);
  const adapter = createConceptLessonGenerationPort(client);

  const draft = await adapter.generate(baseInput);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].toolName, "submit_concept_lesson");
  assert.deepEqual(calls[0].tags, ["concept-lesson-generation"]);
  assert.ok(JSON.stringify(calls[0].parameters).includes("maxLength"));
  assert.equal(draft.sections.length, 3);
  // A source-supported section with both citation fields carries a draft citation.
  const definition = draft.sections.find((s) => s.kind === "definition");
  assert.deepEqual(definition?.citation, { passageId: "b1", evidenceQuote: "Borrowing lends a reference without taking ownership." });
  // A synthesized section carries no citation passed through.
  assert.equal(draft.sections.find((s) => s.kind === "gist")?.citation, undefined);
});

test("source-backed generation renders grounding but withholds neighbor prose", async () => {
  const calls: Captured[] = [];
  const client = fakeClient({ sections: [], explorableTerms: [] }, calls);
  const adapter = createConceptLessonGenerationPort(client);

  await adapter.generate(baseInput);
  const user = calls[0].messages.map((m) => m.content).join("\n");
  assert.ok(user.includes("b1"));
  assert.match(user, /withheld; source grounding passages are the sole factual authority/);
  assert.doesNotMatch(user, /Ownership|Lifetimes|Slices/);
});

test("generated grounding retains directional neighbor context", async () => {
  const calls: Captured[] = [];
  const client = fakeClient({ sections: [], explorableTerms: [] }, calls);
  const adapter = createConceptLessonGenerationPort(client);

  await adapter.generate({ ...baseInput, groundingProvenance: "generated" });
  const user = calls[0].messages.map((m) => m.content).join("\n");
  assert.match(user, /Ownership/);
  assert.match(user, /Lifetimes/);
  assert.match(user, /Slices/);
});

test("a partial citation (passage id without quote) is dropped rather than passed through", async () => {
  const calls: Captured[] = [];
  const client = fakeClient({
    sections: [
      { kind: "definition", text: "A definition.", citationPassageId: "b1", citationEvidenceQuote: null, diagramCaption: null, diagramSpec: null }
    ],
    explorableTerms: []
  }, calls);
  const adapter = createConceptLessonGenerationPort(client);
  const draft = await adapter.generate(baseInput);
  assert.equal(draft.sections[0].citation, undefined);
});

test("a diagram descriptor with both caption and spec is carried through", async () => {
  const calls: Captured[] = [];
  const client = fakeClient({
    sections: [
      { kind: "examples", text: "An example.", citationPassageId: null, citationEvidenceQuote: null, diagramCaption: "Owned vs borrowed", diagramSpec: "A relates to B" }
    ],
    explorableTerms: []
  }, calls);
  const adapter = createConceptLessonGenerationPort(client);
  const draft = await adapter.generate(baseInput);
  assert.deepEqual(draft.sections[0].diagram, { caption: "Owned vs borrowed", spec: "A relates to B" });
});

test("the system prompt names no domain and asserts no section is mandatory (R4)", async () => {
  const calls: Captured[] = [];
  const client = fakeClient({ sections: [], explorableTerms: [] }, calls);
  const adapter = createConceptLessonGenerationPort(client);
  await adapter.generate(baseInput);
  const system = calls[0].messages.find((m) => (m as { role?: string }).role === "system")?.content
    ?? calls[0].messages[0].content;
  assert.ok(/never assume a section applies/i.test(system));
  assert.ok(/one precise substantive section.*complete lesson/is.test(system));
  assert.ok(/work closed-book/i.test(system));
  assert.ok(/collective versus distributive/i.test(system));
  assert.ok(/do not unpack a domain term or relation/i.test(system));
  assert.ok(/diagram caption and every element/i.test(system));
  assert.ok(/at most two short sentences/i.test(system));
  assert.ok(/Every definition, examples, or formulas section must carry both citation fields/i.test(system));
  assert.ok(/neighbor's presence proves only the displayed graph relationship/i.test(system));
  // No fixture term leaks into the system instruction.
  for (const term of ["ownership", "rust", "market"]) {
    assert.equal(system.toLowerCase().includes(term), false);
  }
});
