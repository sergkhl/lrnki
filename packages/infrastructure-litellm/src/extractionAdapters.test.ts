import assert from "node:assert/strict";
import test from "node:test";
import type { SourceBlock } from "@lrnki/domain-core";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { LiteLlmAdmissionLabelJudgmentAdapter, LiteLlmAssertionEntailmentJudgmentAdapter, LiteLlmDefinitionPassageQualityJudgmentAdapter, renderBlocks } from "./extractionAdapters";
import { admissionLabelJudgmentValidator, definitionPassageQualityJudgmentValidator } from "./toolSchemas";

function sourceBlock(blockId: string, text: string, headingPath: string[] = []): SourceBlock {
  return {
    blockId,
    blockType: "paragraph",
    text,
    headingPath,
    locator: {}
  };
}

test("renderBlocks emits prev and next ids for middle blocks", () => {
  const rendered = renderBlocks([
    sourceBlock("b1", "First."),
    sourceBlock("b2", "Second."),
    sourceBlock("b3", "Third.")
  ]);

  assert.match(rendered, /^\[b1 type=paragraph next=b2\] First\./m);
  assert.match(rendered, /^\[b2 type=paragraph prev=b1 next=b3\] Second\./m);
  assert.match(rendered, /^\[b3 type=paragraph prev=b2\] Third\./m);
});

test("renderBlocks keeps heading output alongside adjacency", () => {
  assert.equal(
    renderBlocks([
      sourceBlock("b1", "First.", ["Method", "Selector"]),
      sourceBlock("b2", "Second.", ["Method", "Selector"])
    ]),
    '[b1 type=paragraph heading="Method › Selector" next=b2] First.\n[b2 type=paragraph heading="Method › Selector" prev=b1] Second.'
  );
});

test("renderBlocks can use full-document adjacency for filtered neighborhoods", () => {
  const b1 = sourceBlock("b1", "First.");
  const b2 = sourceBlock("b2", "Hidden middle.");
  const b3 = sourceBlock("b3", "Third.");

  assert.equal(
    renderBlocks([b1, b3], { adjacencyBlocks: [b1, b2, b3] }),
    "[b1 type=paragraph next=b2] First.\n[b3 type=paragraph prev=b2] Third."
  );
});

test("renderBlocks omits heading and adjacency for a single block when absent", () => {
  assert.equal(renderBlocks([sourceBlock("b1", "Only.")]), "[b1 type=paragraph] Only.");
});

function adapterReturning(result: {
  subjectMatch: "exact_or_interchangeable" | "qualified_variant" | "different_or_absent";
  subjectSpan: string;
  definitionEntailed: boolean;
  entailingSpan: string;
  rationale: string;
}) {
  const client = {
    call: async (input: { toolName: string }) => {
      assert.equal(input.toolName, "submit_definition_entailment_judgment");
      return result;
    }
  } as unknown as LiteLlmForcedToolClient;
  return new LiteLlmAssertionEntailmentJudgmentAdapter(client);
}

const generalizationInput = {
  declaredDomain: "machine learning systems",
  subject: { canonicalLabel: "generalization gap", aliases: [] },
  definition: "the discrepancy between validation score and test set performance due to finite sample effects",
  evidenceQuotes: [
    "Due to finite sample effects, the validation score is not perfectly predictive of performance on the test set-a discrepancy known as the generalization gap."
  ]
};

test("definition judge accepts an identified subject and formatting-normalized grounded span", async () => {
  const adapter = adapterReturning({
    subjectMatch: "exact_or_interchangeable",
    subjectSpan: "the generalization gap",
    definitionEntailed: true,
    entailingSpan: "Due to finite sample effects, the validation score is not perfectly predictive of performance on the test set—a discrepancy known as the generalization gap.",
    rationale: "appositive definition"
  });

  const result = await adapter.judgeDefinition(generalizationInput);
  assert.equal(result.entailed, true);
});

test("definition judge rejects evidence that defines an anonymous different subject", async () => {
  const adapter = adapterReturning({
    subjectMatch: "different_or_absent",
    subjectSpan: "",
    definitionEntailed: true,
    entailingSpan: "an agent that operates by searching a directed graph",
    rationale: "requested framework is not identified"
  });

  const result = await adapter.judgeDefinition({
    declaredDomain: "machine learning systems",
    subject: { canonicalLabel: "graph-based search framework", aliases: [] },
    definition: "an agent that operates by searching a directed graph",
    evidenceQuotes: ["We consider an agent that operates by searching a directed graph."]
  });
  assert.equal(result.entailed, false);
});

test("definition judge rejects a definition of a qualified variant", async () => {
  const adapter = adapterReturning({
    subjectMatch: "qualified_variant",
    subjectSpan: "MLE-bench lite",
    definitionEntailed: true,
    entailingSpan: "a curated subset of 22 tasks selected from the full benchmark",
    rationale: "lite is not the full benchmark"
  });

  const result = await adapter.judgeDefinition({
    declaredDomain: "machine learning systems",
    subject: { canonicalLabel: "MLE-bench", aliases: [] },
    definition: "a curated subset of 22 tasks selected from the full benchmark",
    evidenceQuotes: ["MLE-bench lite—a curated subset of 22 tasks selected from the full benchmark."]
  });
  assert.equal(result.entailed, false);
});

// --- Concept-vs-proposition admission judge (ADR-0005) --------------------

function admissionAdapterReturning(result: {
  labelKind: "concept" | "proposition_or_claim";
  underlyingNounPhrase: string;
  groundingSpan: string;
  rationale: string;
}) {
  const client = {
    call: async (input: { toolName: string }) => {
      assert.equal(input.toolName, "submit_admission_label_judgment");
      return result;
    }
  } as unknown as LiteLlmForcedToolClient;
  return new LiteLlmAdmissionLabelJudgmentAdapter(client);
}

const operatorSetInput = {
  declaredDomain: "machine learning systems",
  label: "Operator Set as Bottleneck to Performance",
  aliases: [],
  evidenceQuotes: ["The operator set is the bottleneck to performance in this system."]
};

test("admission judge demotes a grounded proposition label to its underlying noun phrase", async () => {
  const adapter = admissionAdapterReturning({
    labelKind: "proposition_or_claim",
    underlyingNounPhrase: "Operator Set",
    groundingSpan: "operator set is the bottleneck to performance",
    rationale: "asserts a claim about the operator set"
  });

  const result = await adapter.judge(operatorSetInput);
  assert.equal(result.labelKind, "proposition_or_claim");
  assert.equal(result.underlyingNounPhrase, "Operator Set");
});

test("admission judge keeps a concept label as concept with empty spans", async () => {
  const adapter = admissionAdapterReturning({
    labelKind: "concept",
    underlyingNounPhrase: "ignored",
    groundingSpan: "ignored",
    rationale: "names a search algorithm"
  });

  const result = await adapter.judge({
    declaredDomain: "machine learning systems",
    label: "Monte Carlo Tree Search",
    aliases: ["MCTS"],
    evidenceQuotes: ["Monte Carlo Tree Search explores the game tree by sampling."]
  });
  assert.equal(result.labelKind, "concept");
  assert.equal(result.underlyingNounPhrase, "");
  assert.equal(result.groundingSpan, "");
});

test("admission judge coerces an ungrounded proposition verdict back to concept (fail closed)", async () => {
  const adapter = admissionAdapterReturning({
    labelKind: "proposition_or_claim",
    underlyingNounPhrase: "Operator Set",
    groundingSpan: "operator set causes all latency", // absent from the evidence
    rationale: "claimed predication is not in the cited evidence"
  });

  const result = await adapter.judge(operatorSetInput);
  assert.equal(result.labelKind, "concept");
  assert.equal(result.underlyingNounPhrase, "");
});

test("admission judge grounding tolerates markdown and typographic-quote noise", async () => {
  const adapter = admissionAdapterReturning({
    labelKind: "proposition_or_claim",
    underlyingNounPhrase: "operator set",
    groundingSpan: 'operator set is the "bottleneck" to performance',
    rationale: "predication grounded despite formatting"
  });

  const result = await adapter.judge({
    ...operatorSetInput,
    evidenceQuotes: ["The **operator set** is the “bottleneck” to performance."]
  });
  assert.equal(result.labelKind, "proposition_or_claim");
});

test("admission label validator rejects a verdict missing labelKind (fail-closed arg validation)", () => {
  assert.equal(
    admissionLabelJudgmentValidator.safeParse({ underlyingNounPhrase: "", groundingSpan: "", rationale: "x" }).success,
    false
  );
  assert.equal(
    admissionLabelJudgmentValidator.safeParse({ labelKind: "concept", underlyingNounPhrase: "", groundingSpan: "", rationale: "x" }).success,
    true
  );
});

// --- Definition-Passage quality judge (ADR-0007 extension) -----------------
// The canned judgments below are INPUT to the adapter's deterministic grounding and
// index-mapping transform (AGENTS rule 11); the assertions check that transform —
// the verbatim grounding of a veto and the fail-closed-to-keep coercion — never the
// model's judgment content.

function definitionQualityAdapterReturning(judgments: {
  index: number;
  establishesMeaning: boolean;
  category: "establishes_meaning" | "bare_name_repetition" | "heading_or_title" | "citation_or_bibliographic";
  judgedSpan: string;
  rationale: string;
}[]) {
  const client = {
    call: async (input: { toolName: string }) => {
      assert.equal(input.toolName, "submit_definition_passage_quality_judgments");
      return { judgments };
    }
  } as unknown as LiteLlmForcedToolClient;
  return new LiteLlmDefinitionPassageQualityJudgmentAdapter(client);
}

const ownershipPassages = {
  declaredDomain: "software engineering",
  subject: { canonicalLabel: "Ownership", aliases: [] },
  passages: [
    { sourceBlockId: "b1", evidenceQuote: "Ownership is the rule that each value has a single owner that frees it when it goes out of scope.", blockType: "paragraph", headingPath: ["Memory"] },
    { sourceBlockId: "b2", evidenceQuote: "Ownership", blockType: "heading", headingPath: ["Memory"] }
  ]
};

test("definition quality judge keeps a defining passage and vetoes a grounded hollow one, index-aligned", async () => {
  const adapter = definitionQualityAdapterReturning([
    { index: 0, establishesMeaning: true, category: "establishes_meaning", judgedSpan: "", rationale: "states the rule" },
    { index: 1, establishesMeaning: false, category: "heading_or_title", judgedSpan: "Ownership", rationale: "bare heading" }
  ]);
  const result = await adapter.judgeDefinitions(ownershipPassages);
  assert.equal(result.length, 2);
  assert.equal(result[0].establishesMeaning, true);
  assert.equal(result[1].establishesMeaning, false);
  assert.equal(result[1].category, "heading_or_title");
  assert.equal(result[1].judgedSpan, "Ownership");
});

test("definition quality judge coerces an ungrounded veto back to keep (fail closed)", async () => {
  const adapter = definitionQualityAdapterReturning([
    { index: 0, establishesMeaning: true, category: "establishes_meaning", judgedSpan: "", rationale: "fine" },
    { index: 1, establishesMeaning: false, category: "heading_or_title", judgedSpan: "text not in the passage", rationale: "claims a span absent from the quote" }
  ]);
  const result = await adapter.judgeDefinitions(ownershipPassages);
  assert.equal(result[1].establishesMeaning, true);
  assert.equal(result[1].category, "establishes_meaning");
});

test("definition quality judge keeps a passage with no returned verdict (fail closed)", async () => {
  const adapter = definitionQualityAdapterReturning([
    { index: 0, establishesMeaning: true, category: "establishes_meaning", judgedSpan: "", rationale: "fine" }
    // no verdict for index 1
  ]);
  const result = await adapter.judgeDefinitions(ownershipPassages);
  assert.equal(result.length, 2);
  assert.equal(result[1].establishesMeaning, true);
});

test("definition quality judge grounding tolerates markdown and typographic-quote noise", async () => {
  const adapter = definitionQualityAdapterReturning([
    { index: 0, establishesMeaning: false, category: "citation_or_bibliographic", judgedSpan: 'see "Smith et al."', rationale: "citation" }
  ]);
  const result = await adapter.judgeDefinitions({
    declaredDomain: "software engineering",
    subject: { canonicalLabel: "Evolutionary Search", aliases: [] },
    passages: [{ sourceBlockId: "b1", evidenceQuote: "Evolutionary Search; see **“Smith et al.”** for details.", blockType: "paragraph", headingPath: [] }]
  });
  assert.equal(result[0].establishesMeaning, false);
  assert.equal(result[0].category, "citation_or_bibliographic");
});

test("definition quality validator rejects malformed batched arguments (fail-closed arg validation)", () => {
  assert.equal(
    definitionPassageQualityJudgmentValidator.safeParse({
      judgments: [{ index: 0, establishesMeaning: true, category: "establishes_meaning", judgedSpan: "", rationale: "ok" }]
    }).success,
    true
  );
  // missing category
  assert.equal(
    definitionPassageQualityJudgmentValidator.safeParse({ judgments: [{ index: 0, establishesMeaning: true, judgedSpan: "", rationale: "x" }] }).success,
    false
  );
  // unknown enum value
  assert.equal(
    definitionPassageQualityJudgmentValidator.safeParse({ judgments: [{ index: 0, establishesMeaning: false, category: "weird", judgedSpan: "x", rationale: "x" }] }).success,
    false
  );
  // extra property (additionalProperties: false)
  assert.equal(
    definitionPassageQualityJudgmentValidator.safeParse({ judgments: [{ index: 0, establishesMeaning: true, category: "establishes_meaning", judgedSpan: "", rationale: "x", extra: 1 }] }).success,
    false
  );
  // empty rationale
  assert.equal(
    definitionPassageQualityJudgmentValidator.safeParse({ judgments: [{ index: 0, establishesMeaning: true, category: "establishes_meaning", judgedSpan: "", rationale: "" }] }).success,
    false
  );
});
