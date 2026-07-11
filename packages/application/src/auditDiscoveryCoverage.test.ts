import assert from "node:assert/strict";
import test from "node:test";
import type { DiscoveryCoverageMiss } from "@lrnki/domain-core";
import type { RunInspection, SourceInspection } from "@lrnki/ports";
import {
  aggregateDiscoveryCoverageMisses,
  auditDiscoveryCoverage,
  normalizeObjectiveLabel
} from "./auditDiscoveryCoverage";

const miss = (missedObjective: string): DiscoveryCoverageMiss => ({
  missedObjective,
  sourceGrounding: `grounding for ${missedObjective}`,
  whyStandalone: `standalone because ${missedObjective}`
});

test("aggregates recurrence by normalized objective across samples", () => {
  const aggregated = aggregateDiscoveryCoverageMisses([
    { sampleIndex: 0, misses: [miss("The Water Cycle"), miss("Cloud formation")] },
    { sampleIndex: 1, misses: [miss("the water cycle!"), miss("the water cycle")] },
    { sampleIndex: 2, misses: [] }
  ]);

  assert.equal(aggregated.length, 2);
  const waterCycle = aggregated[0];
  assert.equal(waterCycle?.normalizedObjective, "the water cycle");
  // The repeated wording inside sample 1 counts once: occurrences are per-sample.
  assert.equal(waterCycle?.occurrences, 2);
  assert.equal(waterCycle?.recurring, true);
  assert.equal(waterCycle?.instances.length, 3);

  const cloud = aggregated[1];
  assert.equal(cloud?.normalizedObjective, "cloud formation");
  assert.equal(cloud?.occurrences, 1);
  assert.equal(cloud?.recurring, false);
});

test("misses sharing one verbatim grounding merge across samples despite different labels", () => {
  // Measured on the first real audit: the same one-sentence source rule recurred 3/3
  // under three different objective wordings with an identical grounding quote.
  const quote = "Rust won't let us annotate a type with Copy if it implements Drop.";
  const aggregated = aggregateDiscoveryCoverageMisses([
    { sampleIndex: 0, misses: [{ missedObjective: "Drop excludes Copy", sourceGrounding: quote, whyStandalone: "w" }] },
    { sampleIndex: 1, misses: [{ missedObjective: "Copy/Drop exclusion rule", sourceGrounding: quote, whyStandalone: "w" }] },
    { sampleIndex: 2, misses: [{ missedObjective: "Types with Drop cannot be Copy", sourceGrounding: quote, whyStandalone: "w" }] }
  ]);
  assert.equal(aggregated.length, 1);
  assert.equal(aggregated[0]?.occurrences, 3);
  assert.equal(aggregated[0]?.recurring, true);
  assert.equal(aggregated[0]?.instances.length, 3);

  // Distinct groundings with distinct labels stay separate groups.
  const separate = aggregateDiscoveryCoverageMisses([
    { sampleIndex: 0, misses: [{ missedObjective: "A", sourceGrounding: "quote one", whyStandalone: "w" }] },
    { sampleIndex: 1, misses: [{ missedObjective: "B", sourceGrounding: "quote two", whyStandalone: "w" }] }
  ]);
  assert.equal(separate.length, 2);
});

test("normalizes objective labels case-, punctuation-, and whitespace-insensitively", () => {
  assert.equal(normalizeObjectiveLabel("  DNA-Ligase   function! "), "dna ligase function");
  assert.equal(normalizeObjectiveLabel("Émile's Rôle"), "émile s rôle");
});

const runInspection: RunInspection = {
  run: {
    runId: "run-1",
    sourceResourceId: "source-1",
    sourceTitle: "A Source",
    declaredDomain: "a domain",
    status: "succeeded",
    degraded: false,
    latencyMs: 10,
    startedAt: "2026-07-11T00:00:00Z",
    candidateCount: 3,
    coreCount: 1,
    profileCount: 2,
    completeProfileCount: 2,
    definitionCount: 1,
    mentionCount: 1,
    assertionCount: 0
  },
  pipelineConfigHash: "hash",
  candidates: [
    candidate("kept_core", "core", "Kept Core"),
    candidate("kept_optional", "optional", "Kept Optional"),
    candidate("dropped", "reject", "Dropped")
  ],
  qualityIssues: [],
  profiles: [
    {
      candidateKey: "kept_core",
      conceptLabel: "Kept Core",
      tier: "core",
      complete: true,
      definitions: [passage("definition", "A definition passage for the kept core concept.")],
      mentions: [],
      assertions: []
    },
    {
      candidateKey: "kept_optional",
      conceptLabel: "Kept Optional",
      tier: "optional",
      complete: true,
      definitions: [],
      mentions: [passage("mention", "A mention passage for the optional concept.")],
      assertions: []
    }
  ]
};

const sourceInspection: SourceInspection = {
  source: {
    sourceResourceId: "source-1",
    title: "A Source",
    declaredDomain: "a domain",
    contentType: "text/markdown",
    contentHash: "abc",
    blockCount: 3,
    runCount: 1
  },
  parserName: "markdown",
  parserVersion: "1",
  blocks: [
    { blockId: "b1", blockType: "heading", headingPath: ["Intro"], text: "Intro" },
    { blockId: "b2", blockType: "paragraph", headingPath: ["Intro"], text: "Teachable body text." },
    { blockId: "b3", blockType: "reference", headingPath: [], text: "Bibliography entry." }
  ],
  runs: []
};

function candidate(candidateKey: string, tier: string, label: string): RunInspection["candidates"][number] {
  const criterion = { modelPassed: true, passed: true, rationale: "r", submittedEvidence: [], evidence: [{ blockId: "b2", evidenceQuote: `${label} admission evidence.` }] };
  return {
    candidateKey,
    discoveredLabel: label,
    canonicalLabel: label,
    aliases: [],
    mentionCount: 1,
    modelTier: "production",
    tier,
    proposedCanonicalLabel: label,
    standaloneLearningObjective: criterion,
    establishedDomainMeaning: criterion,
    definitionBearingTreatment: criterion,
    organizingPower: { aspects: [], summary: "s" } as unknown as RunInspection["candidates"][number]["organizingPower"],
    coreSelected: tier === "core",
    selectionReasonCode: "source_level_core",
    reasonCodes: [],
    boundaryReasonCodes: [],
    confidence: 0.9
  };
}

function passage(kind: "definition" | "mention", quote: string) {
  return { kind, sourceBlockId: "b2", headingPath: ["Intro"], evidenceQuote: quote, salienceRank: 1 };
}

test("audits K samples over admitted concepts and teachable blocks only", async () => {
  const auditInputs: { declaredDomain: string; blocks: { blockType: string }[]; admittedConcepts: { label: string; gist: string }[] }[] = [];
  let call = 0;
  const report = await auditDiscoveryCoverage({
    runId: "run-1",
    k: 3,
    runInspectionRead: { getRunInspection: async () => runInspection },
    sourceInspectionRead: { listSourceSummaries: async () => [], getSourceInspection: async () => sourceInspection },
    audit: {
      model: "judge-model",
      audit: async (input) => {
        auditInputs.push(input);
        call += 1;
        // Samples 1 and 2 agree on one miss; sample 3 reports nothing.
        return call <= 2 ? [miss("An uncovered objective")] : [];
      }
    },
    now: new Date("2026-07-11T12:00:00Z")
  });

  assert.equal(report.k, 3);
  assert.equal(report.judgeModel, "judge-model");
  assert.equal(report.sourceResourceId, "source-1");
  assert.equal(auditInputs.length, 3);
  // Reject-tier candidates are excluded; gists come from CEP passages.
  assert.deepEqual(report.admittedConcepts.map((concept) => concept.label), ["Kept Core", "Kept Optional"]);
  assert.equal(report.admittedConcepts[0]?.gist, "A definition passage for the kept core concept.");
  assert.equal(report.admittedConcepts[1]?.gist, "A mention passage for the optional concept.");
  // Non-teachable blocks (reference) never reach the judge.
  assert.deepEqual(auditInputs[0]?.blocks.map((block) => block.blockType), ["heading", "paragraph"]);
  assert.equal(report.aggregated.length, 1);
  assert.equal(report.aggregated[0]?.occurrences, 2);
  assert.equal(report.aggregated[0]?.recurring, true);
  assert.equal(report.recurringCount, 1);
  assert.equal(report.generatedAt, "2026-07-11T12:00:00.000Z");
});

test("fails loudly for an unknown run", async () => {
  await assert.rejects(
    auditDiscoveryCoverage({
      runId: "missing",
      runInspectionRead: { getRunInspection: async () => undefined },
      sourceInspectionRead: { listSourceSummaries: async () => [], getSourceInspection: async () => sourceInspection },
      audit: { model: "judge-model", audit: async () => [] }
    }),
    /extraction run not found/
  );
});
