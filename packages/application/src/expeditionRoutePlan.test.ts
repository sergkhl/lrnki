import assert from "node:assert/strict";
import test from "node:test";
import type { ConceptLesson, SourceLocator } from "@lrnki/domain-core";
import type { SourceEvidenceReadPort, SourceEvidenceRecord } from "@lrnki/ports";
import {
  planExpeditionRoute,
  resolveExpeditionSourceCues,
  type ExpeditionInstructionalSourceCue,
  type ExpeditionRouteConcept,
  type ExpeditionRouteEdge,
  type ExpeditionRoutePlan,
  type ExpeditionRoutePlanningResult,
  type ExpeditionRouteStudyItemCandidate
} from "./expeditionRoutePlan";

function concept(
  derivedNodeId: string,
  difficulty = 1,
  canonicalLabel = derivedNodeId.toUpperCase()
): ExpeditionRouteConcept {
  return { derivedNodeId, difficulty, canonicalLabel };
}

function edge(
  prerequisiteDerivedNodeId: string,
  dependentDerivedNodeId: string
): ExpeditionRouteEdge {
  return { prerequisiteDerivedNodeId, dependentDerivedNodeId };
}

function cue(
  derivedNodeId: string,
  position: number,
  options: {
    document?: string;
    heading?: string;
    locator?: SourceLocator;
    blockId?: string;
  } = {}
): ExpeditionInstructionalSourceCue {
  return {
    derivedNodeId,
    sourceResourceId: `resource-${options.document ?? "one"}`,
    sourceDocumentId: options.document ?? "document-one",
    sourceBlockId: `source-block-${derivedNodeId}`,
    blockId: options.blockId ?? `block-${position}`,
    headingPath: ["Document title", options.heading ?? "One"],
    locator: options.locator ?? { characterStart: position }
  };
}

function bonus(
  studyItemId: string,
  derivedNodeId: string,
  itemType: "matching" | "impostor"
): ExpeditionRouteStudyItemCandidate {
  return { studyItemId, derivedNodeId, itemType };
}

function planned(result: ExpeditionRoutePlanningResult): ExpeditionRoutePlan {
  if (result.status !== "planned") {
    assert.fail(`Expected planned route, received ${result.reason}: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.plan;
}

function sourceRoute(input: {
  concepts: readonly ExpeditionRouteConcept[];
  edges?: readonly ExpeditionRouteEdge[];
  cues?: readonly ExpeditionInstructionalSourceCue[];
  candidates: readonly ExpeditionRouteStudyItemCandidate[];
}): ExpeditionRoutePlanningResult {
  return planExpeditionRoute({
    concepts: input.concepts,
    trustedPrerequisiteEdges: input.edges ?? [],
    instructionalSourceCues: input.cues,
    qualifiedStudyItemCandidates: input.candidates,
    policy: "source_expedition"
  });
}

function bothFamiliesFor(ids: readonly string[]): ExpeditionRouteStudyItemCandidate[] {
  return ids.flatMap((derivedNodeId) => [
    bonus(`matching-${derivedNodeId}`, derivedNodeId, "matching"),
    bonus(`impostor-${derivedNodeId}`, derivedNodeId, "impostor")
  ]);
}

test("source cue resolution selects the earliest immutable direct substantive citation", async () => {
  const lessons = [
    lesson("node-b", [
      sourceSection("definition", "resource-1", "late"),
      generatedSection("formulas"),
      sourceSection("examples", "resource-1", "early")
    ]),
    lesson("node-a", [sourceSection("formulas", "resource-2", "page")])
  ];
  const records = [
    evidence("resource-1", "late", {
      sourceDocumentId: "document-1",
      blockId: "block-10",
      headingPath: ["Later"],
      locator: { characterStart: 900 }
    }),
    evidence("resource-1", "early", {
      sourceDocumentId: "document-1",
      blockId: "block-2",
      headingPath: ["Earlier"],
      locator: { characterStart: 20 }
    }),
    evidence("resource-2", "page", {
      sourceDocumentId: "document-2",
      blockId: "page-block",
      headingPath: ["Formula"],
      locator: { page: 3, characterStart: 4 }
    })
  ];
  const requested: Array<{ sourceResourceId: string; sourceBlockId: string }> = [];
  const sourceEvidenceRead: SourceEvidenceReadPort = {
    async readSourceEvidence(references) {
      requested.push(...references);
      return records;
    }
  };

  const result = await resolveExpeditionSourceCues({ lessons, sourceEvidenceRead });

  assert.equal(result.resolved, true);
  if (!result.resolved) return;
  assert.deepEqual(requested, [
    { sourceResourceId: "resource-1", sourceBlockId: "late" },
    { sourceResourceId: "resource-1", sourceBlockId: "early" },
    { sourceResourceId: "resource-2", sourceBlockId: "page" }
  ]);
  assert.deepEqual(result.cues.map((entry) => ({
    derivedNodeId: entry.derivedNodeId,
    sourceDocumentId: entry.sourceDocumentId,
    blockId: entry.blockId,
    headingPath: entry.headingPath,
    locator: entry.locator
  })), [
    {
      derivedNodeId: "node-a",
      sourceDocumentId: "document-2",
      blockId: "page-block",
      headingPath: ["Formula"],
      locator: { page: 3, characterStart: 4 }
    },
    {
      derivedNodeId: "node-b",
      sourceDocumentId: "document-1",
      blockId: "block-2",
      headingPath: ["Earlier"],
      locator: { characterStart: 20 }
    }
  ]);
});

test("source cue resolution fails closed for an unresolved or generated-only Lesson", async () => {
  const result = await resolveExpeditionSourceCues({
    lessons: [
      lesson("missing-block", [sourceSection("definition", "resource-1", "absent")]),
      lesson("generated-only", [generatedSection("definition")])
    ],
    sourceEvidenceRead: { async readSourceEvidence() { return []; } }
  });

  assert.deepEqual(result, {
    resolved: false,
    reason: "source_cue_unavailable",
    missingDerivedNodeIds: ["generated-only", "missing-block"],
    unresolvedReferences: [{ sourceResourceId: "resource-1", sourceBlockId: "absent" }]
  });
});

test("one stable topological order prefers source position within a document", () => {
  const ids = ["late-easy", "early-hard", "middle"];
  const route = planned(sourceRoute({
    concepts: [concept("late-easy", 1), concept("middle", 5), concept("early-hard", 9)],
    cues: [cue("late-easy", 30), cue("early-hard", 10), cue("middle", 20)],
    candidates: bothFamiliesFor(ids)
  }));

  assert.deepEqual(route.orderedDerivedNodeIds, ["early-hard", "middle", "late-easy"]);
});

test("different source documents fall back to difficulty, label, then stable id", () => {
  const ids = ["hard-early-source", "easy-late-source", "label-a", "label-b"];
  const route = planned(sourceRoute({
    concepts: [
      concept("hard-early-source", 9, "A"),
      concept("easy-late-source", 1, "Z"),
      concept("label-b", 5, "Beta"),
      concept("label-a", 5, "Alpha")
    ],
    cues: [
      cue("hard-early-source", 1, { document: "document-a" }),
      cue("easy-late-source", 999, { document: "document-b" }),
      cue("label-a", 2, { document: "document-c" }),
      cue("label-b", 1, { document: "document-d" })
    ],
    candidates: bothFamiliesFor(ids)
  }));

  assert.deepEqual(route.orderedDerivedNodeIds, [
    "easy-late-source",
    "label-a",
    "label-b",
    "hard-early-source"
  ]);
});

test("page, slide, character, XPath, and natural block locators each order same-document peers", () => {
  const pairs: Array<{
    early: ExpeditionInstructionalSourceCue;
    late: ExpeditionInstructionalSourceCue;
  }> = [
    {
      early: cue("page-early", 0, { document: "page-doc", locator: { page: 2, characterStart: 20 } }),
      late: cue("page-late", 0, { document: "page-doc", locator: { page: 2, characterStart: 200 } })
    },
    {
      early: cue("slide-early", 0, { document: "slide-doc", locator: { slide: 3, characterStart: 4 } }),
      late: cue("slide-late", 0, { document: "slide-doc", locator: { slide: 4, characterStart: 1 } })
    },
    {
      early: cue("character-early", 0, { document: "character-doc", locator: { characterStart: 9 } }),
      late: cue("character-late", 0, { document: "character-doc", locator: { characterStart: 90 } })
    },
    {
      early: cue("xpath-early", 0, { document: "xpath-doc", locator: { xpath: "/body/p[2]" } }),
      late: cue("xpath-late", 0, { document: "xpath-doc", locator: { xpath: "/body/p[10]" } })
    },
    {
      early: cue("block-early", 0, { document: "block-doc", locator: {}, blockId: "part-2" }),
      late: cue("block-late", 0, { document: "block-doc", locator: {}, blockId: "part-10" })
    }
  ];
  const ids = pairs.flatMap((pair) => [pair.late.derivedNodeId, pair.early.derivedNodeId]);
  const route = planned(sourceRoute({
    concepts: ids.map((derivedNodeId) => concept(derivedNodeId, 1, "Same")),
    cues: pairs.flatMap((pair) => [pair.late, pair.early]),
    candidates: bothFamiliesFor(ids)
  }));
  const position = new Map(route.orderedDerivedNodeIds.map((derivedNodeId, index) => [
    derivedNodeId,
    index
  ] as const));

  for (const pair of pairs) {
    assert.ok(
      requiredPosition(position, pair.early.derivedNodeId) <
        requiredPosition(position, pair.late.derivedNodeId),
      `${pair.early.derivedNodeId} precedes ${pair.late.derivedNodeId}`
    );
  }
});

test("trusted prerequisites override backward source cues like the Personal Finance edges", () => {
  const ids = ["source-late-prerequisite", "source-early-dependent", "c"];
  const route = planned(sourceRoute({
    concepts: ids.map((derivedNodeId) => concept(derivedNodeId)),
    edges: [edge("source-late-prerequisite", "source-early-dependent")],
    cues: [
      cue("source-late-prerequisite", 300),
      cue("source-early-dependent", 10),
      cue("c", 400)
    ],
    candidates: bothFamiliesFor(ids)
  }));

  assert.ok(
    route.orderedDerivedNodeIds.indexOf("source-late-prerequisite") <
      route.orderedDerivedNodeIds.indexOf("source-early-dependent")
  );
});

test("dense DAGs remain topological and deterministic under shuffled inputs", () => {
  const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const edges = ids.flatMap((prerequisiteDerivedNodeId, index) =>
    ids.slice(index + 1).map((dependentDerivedNodeId) =>
      edge(prerequisiteDerivedNodeId, dependentDerivedNodeId)
    )
  );
  const cues = ids.map((derivedNodeId, index) => cue(derivedNodeId, ids.length - index));
  const candidates = bothFamiliesFor(ids);
  const forward = planned(sourceRoute({
    concepts: ids.map((derivedNodeId) => concept(derivedNodeId)),
    edges,
    cues,
    candidates
  }));
  const reversed = planned(sourceRoute({
    concepts: ids.map((derivedNodeId) => concept(derivedNodeId)).reverse(),
    edges: [...edges].reverse(),
    cues: [...cues].reverse(),
    candidates: [...candidates].reverse()
  }));

  assert.deepEqual(forward, reversed);
  assert.deepEqual(forward.orderedDerivedNodeIds, ids);
});

test("every total from three upward has exact 3-5 coverage and target-four optimization", () => {
  for (let total = 3; total <= 44; total += 1) {
    const ids = Array.from({ length: total }, (_, index) => `c-${String(index).padStart(2, "0")}`);
    const route = planned(sourceRoute({
      concepts: ids.map((derivedNodeId, index) => concept(derivedNodeId, index)),
      cues: ids.map((derivedNodeId, index) => cue(derivedNodeId, index)),
      candidates: bothFamiliesFor(ids)
    }));
    const flattened = route.legs.flatMap((leg) => leg.derivedNodeIds);
    assert.deepEqual(flattened, ids, `total ${total} has exact ordered coverage`);
    assert.ok(route.legs.every((leg) =>
      leg.derivedNodeIds.length >= 3 && leg.derivedNodeIds.length <= 5
    ), `total ${total} stays inside the Leg bounds`);
    assert.equal(
      route.legs.reduce((sum, leg) => sum + Math.abs(leg.derivedNodeIds.length - 4), 0),
      minimumTargetDistance(total),
      `total ${total} has the minimum target-four distance`
    );
    assert.deepEqual(
      route.legs.map((leg) => leg.anchorDerivedNodeId),
      route.legs.map((leg) => leg.derivedNodeIds[leg.derivedNodeIds.length - 1])
    );
    assert.equal(route.summitDerivedNodeId, ids[ids.length - 1]);
    assert.ok(route.legs.every((leg) =>
      leg.selectedBonusStudyItemIds.length >= 1 && leg.selectedBonusStudyItemIds.length <= 2
    ));
    const selected = route.legs.flatMap((leg) => leg.selectedBonusStudyItemIds);
    assert.ok(selected.some((studyItemId) => studyItemId.startsWith("matching-")));
    assert.ok(selected.some((studyItemId) => studyItemId.startsWith("impostor-")));
  }
});

test("source-major-heading coherence outranks target-four sizing", () => {
  const ids = Array.from({ length: 8 }, (_, index) => `c${index + 1}`);
  const route = planned(sourceRoute({
    concepts: ids.map((derivedNodeId, index) => concept(derivedNodeId, index)),
    cues: ids.map((derivedNodeId, index) => cue(derivedNodeId, index, {
      heading: index < 3 ? "First" : "Second"
    })),
    candidates: bothFamiliesFor(ids)
  }));

  assert.deepEqual(route.legs.map((leg) => leg.derivedNodeIds.length), [3, 5]);
});

test("the joint solver selects the minimum stable balanced bonus set", () => {
  const ids = Array.from({ length: 8 }, (_, index) => `c${index + 1}`);
  const route = planned(sourceRoute({
    concepts: ids.map((derivedNodeId, index) => concept(derivedNodeId, index)),
    candidates: [
      bonus("matching-z", "c1", "matching"),
      bonus("matching-a", "c1", "matching"),
      bonus("impostor-first-leg", "c2", "impostor"),
      bonus("impostor-second-leg", "c5", "impostor"),
      bonus("matching-second-leg", "c6", "matching")
    ]
  }));

  assert.deepEqual(route.legs.map((leg) => leg.derivedNodeIds.length), [4, 4]);
  assert.deepEqual(route.legs.map((leg) => leg.selectedBonusStudyItemIds), [
    ["matching-a"],
    ["impostor-second-leg"]
  ]);
});

test("a one-Leg Expedition may select exactly two bonuses to expose both families", () => {
  const ids = ["a", "b", "c"];
  const route = planned(sourceRoute({
    concepts: ids.map((derivedNodeId) => concept(derivedNodeId)),
    candidates: [
      bonus("matching-b", "b", "matching"),
      bonus("impostor-a", "a", "impostor"),
      bonus("matching-c", "c", "matching")
    ]
  }));

  assert.deepEqual(route.legs[0].selectedBonusStudyItemIds, ["impostor-a", "matching-b"]);
});

test("route failures are explicit and retain coverage diagnostics", () => {
  const tooShort = sourceRoute({
    concepts: [concept("a"), concept("b")],
    candidates: bothFamiliesFor(["a", "b"])
  });
  assert.equal(tooShort.status, "unavailable");
  if (tooShort.status === "unavailable") {
    assert.equal(tooShort.reason, "concept_count_below_route_minimum");
  }

  const cycle = sourceRoute({
    concepts: [concept("a"), concept("b"), concept("c")],
    edges: [edge("a", "b"), edge("b", "a")],
    candidates: bothFamiliesFor(["a", "b", "c"])
  });
  assert.equal(cycle.status, "unavailable");
  if (cycle.status === "unavailable") {
    assert.equal(cycle.reason, "trusted_prerequisite_cycle");
    assert.deepEqual(cycle.diagnostics.implicatedIds, ["a", "b"]);
  }

  const uncovered = sourceRoute({
    concepts: ["a", "b", "c", "d", "e", "f"].map((id) => concept(id)),
    candidates: [bonus("matching-a", "a", "matching"), bonus("impostor-b", "b", "impostor")]
  });
  assert.equal(uncovered.status, "unavailable");
  if (uncovered.status === "unavailable") {
    assert.equal(uncovered.reason, "study_item_mix_unavailable");
    assert.deepEqual(uncovered.diagnostics.uncoveredBonusWindows, [{
      startPosition: 2,
      endPosition: 5,
      derivedNodeIds: ["c", "d", "e", "f"]
    }]);
  }

  const oneFamily = sourceRoute({
    concepts: ["a", "b", "c", "d", "e", "f"].map((id) => concept(id)),
    candidates: ["a", "b", "c", "d", "e", "f"].map((id) =>
      bonus(`matching-${id}`, id, "matching")
    )
  });
  assert.equal(oneFamily.status, "unavailable");
  if (oneFamily.status === "unavailable") {
    assert.equal(oneFamily.reason, "study_item_mix_unavailable");
    assert.equal(oneFamily.diagnostics.matchingCandidateCount, 6);
    assert.equal(oneFamily.diagnostics.impostorCandidateCount, 0);
  }
});

function lesson(
  derivedNodeId: string,
  sections: ConceptLesson["sections"]
): ConceptLesson {
  return {
    conceptLessonId: `lesson-${derivedNodeId}`,
    derivedNodeId,
    graphVersionId: "graph-1",
    enrichmentId: "enrichment-1",
    generatingModel: "test",
    configHash: "test",
    canonicalLabel: derivedNodeId,
    sections,
    explorableTerms: []
  };
}

function sourceSection(
  kind: "definition" | "examples" | "formulas",
  sourceResourceId: string,
  sourceBlockId: string
): ConceptLesson["sections"][number] {
  return {
    kind,
    text: `${kind} text`,
    groundingProvenance: "source_cep",
    citation: {
      provenance: "source",
      sourceResourceId,
      sourceBlockId,
      evidenceQuote: `${kind} text`,
      matchKind: "exact"
    }
  };
}

function generatedSection(
  kind: "definition" | "examples" | "formulas"
): ConceptLesson["sections"][number] {
  return {
    kind,
    text: `${kind} generated text`,
    groundingProvenance: "generated",
    citation: {
      provenance: "generated",
      derivedNodeId: "generated-node",
      passageText: `${kind} generated text`
    }
  };
}

function evidence(
  sourceResourceId: string,
  sourceBlockId: string,
  overrides: Partial<SourceEvidenceRecord> = {}
): SourceEvidenceRecord {
  return {
    sourceResourceId,
    sourceTitle: "Test source",
    sourceDocumentId: "document-1",
    sourceBlockId,
    blockId: sourceBlockId,
    blockType: "paragraph",
    headingPath: [],
    locator: {},
    text: "Test source text",
    ...overrides
  };
}

function minimumTargetDistance(total: number): number {
  const distances = new Map<number, number>([[0, 0]]);
  for (let current = 1; current <= total; current += 1) {
    const options = [3, 4, 5].flatMap((size) => {
      const prior = distances.get(current - size);
      return prior === undefined ? [] : [prior + Math.abs(size - 4)];
    });
    if (options.length > 0) distances.set(current, Math.min(...options));
  }
  const distance = distances.get(total);
  if (distance === undefined) throw new Error(`No 3-5 partition for ${total}.`);
  return distance;
}

function requiredPosition(positions: ReadonlyMap<string, number>, id: string): number {
  const position = positions.get(id);
  if (position === undefined) throw new Error(`Missing position for ${id}.`);
  return position;
}
