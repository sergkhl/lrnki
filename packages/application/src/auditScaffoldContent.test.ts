import assert from "node:assert/strict";
import test from "node:test";
import type { ScaffoldContentCongruenceVerdict, ScaffoldNodePayload } from "@lrnki/domain-core";
import type { GeneratedScaffoldStepForAudit, ScaffoldContentCongruencePort } from "@lrnki/ports";
import { auditScaffoldContent, detectFormattingArtifacts, scaffoldMicroLessonText } from "./auditScaffoldContent";

function payload(overrides: Partial<{ label: string; microLesson: string; question: string; explanation: string; options: string[] }> = {}): ScaffoldNodePayload {
  const options = overrides.options ?? ["Correct", "Wrong one", "Wrong two", "Wrong three"];
  return {
    scaffoldNodeId: "n1",
    label: overrides.label ?? "Base case",
    lesson: [{ kind: "definition", text: overrides.microLesson ?? "A plain explanation with an example.", groundingProvenance: "generated" }],
    item: {
      scaffoldItemId: "i1",
      question: overrides.question ?? "What is a base case?",
      explanation: overrides.explanation ?? "Because it terminates the recursion.",
      options: options.map((text, index) => ({ optionId: `o${index}`, text, isCorrect: index === 0 }))
    }
  };
}

function step(id: string, over: Parameters<typeof payload>[0] = {}, context: Partial<GeneratedScaffoldStepForAudit> = {}): GeneratedScaffoldStepForAudit {
  return {
    detourId: `d-${id}`,
    scaffoldStepId: id,
    enrichmentId: context.enrichmentId ?? "enr-1",
    declaredDomain: context.declaredDomain ?? "computer science",
    term: context.term ?? "recursion",
    parentLabel: context.parentLabel ?? "Recursive function",
    payload: payload(over)
  };
}

// A scripted judge: returns the verdict its script maps for (stepLabel, sampleIndex). Records the
// exact inputs so the KTD3 contract (options sorted + correct-not-flagged, microLesson joined) is
// assertable. Sample index is inferred from per-label call count.
function scriptedJudge(
  script: (stepLabel: string, sampleIndex: number) => ScaffoldContentCongruenceVerdict
): ScaffoldContentCongruencePort & { calls: Parameters<ScaffoldContentCongruencePort["judge"]>[0][] } {
  const calls: Parameters<ScaffoldContentCongruencePort["judge"]>[0][] = [];
  const perLabel = new Map<string, number>();
  return {
    model: "kg-independent-judge",
    calls,
    async judge(input) {
      calls.push(input);
      const sampleIndex = perLabel.get(input.stepLabel) ?? 0;
      perLabel.set(input.stepLabel, sampleIndex + 1);
      return script(input.stepLabel, sampleIndex);
    }
  };
}

const yesYes: ScaffoldContentCongruenceVerdict = { teachesStepLabel: true, isSimplerPrerequisite: true, rationale: "ok" };

test("deterministic classifier flags markdown tokens per field and leaves clean content untouched", () => {
  const dirty = payload({
    microLesson: "This is **bold** and a [link](http://x) plus\n- a list item\n# A heading\nand `inline` code and ```fence```",
    question: "Plain question?",
    explanation: "Plain explanation.",
    options: ["A *starred* option", "clean b", "clean c", "clean d"]
  });
  const findings = detectFormattingArtifacts(dirty);
  const types = new Set(findings.map((f) => f.tokenType));
  assert.ok(types.has("bold"), "detects **bold**");
  assert.ok(types.has("link"), "detects a markdown link");
  assert.ok(types.has("list_marker"), "detects a list marker");
  assert.ok(types.has("heading"), "detects a heading");
  assert.ok(types.has("inline_code"), "detects inline code");
  assert.ok(types.has("code_fence"), "detects a code fence");
  assert.ok(findings.some((f) => f.field === "option" && f.tokenType === "italic"), "detects italic in an option");
  assert.equal(findings.find((f) => f.tokenType === "bold")?.excerpt, "**bold**", "the excerpt is the offending token");

  assert.deepEqual(detectFormattingArtifacts(payload()), [], "plain prose produces no findings");
});

test("clean prose with stray punctuation is not over-flagged (measurement stays inspectable)", () => {
  const findings = detectFormattingArtifacts(payload({
    microLesson: "Compute a - b, then multiply 5 * 3 to get the area of foo_bar.",
    question: "Is 5 * 3 equal to 15?",
    options: ["Yes 5 * 3 = 15", "No", "Maybe", "Never"]
  }));
  assert.deepEqual(findings, [], "lone hyphens, asterisks with spaces, and underscores in identifiers are not markdown");
});

test("scaffoldMicroLessonText joins sections and list items", () => {
  const p = payload();
  p.lesson = [
    { kind: "definition", text: "First.", groundingProvenance: "generated" },
    { kind: "examples", text: "Examples:", items: ["one", "two"], groundingProvenance: "generated" }
  ];
  assert.equal(scaffoldMicroLessonText(p), "First.\n\nExamples:\none\ntwo");
});

test("congruence recurrence: a NO reaching the threshold marks the step, a lone NO does not", async () => {
  const steps = [
    step("s-mismatch", { label: "Mismatch step" }),
    step("s-onceno", { label: "Once-no step" }),
    step("s-clean", { label: "Clean step" })
  ];
  const judge = scriptedJudge((label, sampleIndex) => {
    if (label === "Mismatch step") return { teachesStepLabel: sampleIndex < 1, isSimplerPrerequisite: true, rationale: "r" };
    if (label === "Once-no step") return { teachesStepLabel: sampleIndex !== 0, isSimplerPrerequisite: true, rationale: "r" };
    return yesYes;
  });
  const report = await auditScaffoldContent({ steps, judge, enrichmentId: "enr-1", k: 3, now: new Date("2026-07-16T00:00:00Z") });

  assert.equal(report.k, 3);
  assert.equal(report.stepCount, 3);
  assert.equal(report.judgeModel, "kg-independent-judge");
  assert.equal(judge.calls.length, 9, "K samples per step");

  const mismatch = report.steps.find((s) => s.stepLabel === "Mismatch step")!;
  assert.equal(mismatch.samples.length, 3);
  assert.equal(mismatch.notTeachingCount, 2, "two of three samples answered NO");
  assert.equal(mismatch.congruenceRecurring, true);

  const onceNo = report.steps.find((s) => s.stepLabel === "Once-no step")!;
  assert.equal(onceNo.notTeachingCount, 1);
  assert.equal(onceNo.congruenceRecurring, false, "a single NO is below the recurrence threshold");

  assert.equal(report.congruenceRecurringStepCount, 1);
  assert.equal(report.artifactStepCount, 0, "these steps carry no markdown");
});

test("the judge sees sorted options with no answer key and the joined micro-lesson", async () => {
  const judge = scriptedJudge(() => yesYes);
  const s = step("s1", {
    label: "Ordering step",
    microLesson: "Line one.",
    options: ["Zebra", "Apple", "Mango", "Banana"]
  });
  await auditScaffoldContent({ steps: [s], judge, k: 1 });
  const [call] = judge.calls;
  assert.deepEqual(call.options, ["Apple", "Banana", "Mango", "Zebra"], "options are sorted so correct-first order leaks nothing");
  assert.equal(call.stepLabel, "Ordering step");
  assert.equal(call.microLesson, "Line one.");
  assert.equal(call.term, "recursion");
  assert.equal(call.parentLabel, "Recursive function");
});

test("aggregated artifact totals count every token across steps", async () => {
  const steps = [
    step("s1", { microLesson: "**one** and **two**" }),
    step("s2", { question: "a [link](http://y)?" })
  ];
  const report = await auditScaffoldContent({ steps, judge: scriptedJudge(() => yesYes), k: 1 });
  assert.equal(report.artifactTotals.bold, 2);
  assert.equal(report.artifactTotals.link, 1);
  assert.equal(report.artifactStepCount, 2);
});

test("K must be a positive integer", async () => {
  await assert.rejects(
    () => auditScaffoldContent({ steps: [step("s1")], judge: scriptedJudge(() => yesYes), k: 0 }),
    /positive integer K/
  );
});
