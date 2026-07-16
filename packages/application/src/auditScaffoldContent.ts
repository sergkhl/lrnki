import type { ScaffoldContentCongruenceVerdict, ScaffoldNodePayload } from "@lrnki/domain-core";
import type { GeneratedScaffoldStepForAudit, ScaffoldContentCongruencePort } from "@lrnki/ports";
import { mapWithConcurrency } from "./mapWithConcurrency";

// Scaffold-content audit (plan 2026-07-16-001 U2, KTD2). Classifies the two 2026-07-13 Support
// Step content defects over PERSISTED generated steps (never regenerating — rule 18), each with
// the epistemics its defect class demands:
//   (a) FORMATTING ARTIFACTS — the plain-text learner surface renders markup raw, so markup in a
//       lesson/question/option field is a format-contract violation, objectively decidable. A
//       deterministic detector REPORTS every markdown token it finds; it never gates (rule 16).
//   (b) LABEL↔CONTENT CONGRUENCE — whether the content teaches its own step label and is a
//       genuinely simpler prerequisite is judgment-based quality, so it is judged neurally by the
//       cross-family independent judge, K-sampled with the discovery-coverage recurrence rule
//       (ADR-0028). The audit never auto-verdicts; human inspection of the report decides
//       (ADR-0013).

// A congruence problem recurs on a step when at least this many of the K samples answer NO on a
// dimension — the same majority-of-samples rule DISCOVERY_COVERAGE_RECURRENCE_THRESHOLD uses, so a
// stable judgment separates from one-off judge noise at the default K=3 without demanding unanimity
// from a non-deterministic method (ADR-0028).
export const SCAFFOLD_CONTENT_CONGRUENCE_RECURRENCE_THRESHOLD = 2;

export type FormattingArtifactType =
  | "bold"
  | "italic"
  | "code_fence"
  | "inline_code"
  | "heading"
  | "link"
  | "list_marker";

export type ScaffoldContentField = "microLesson" | "question" | "explanation" | "option";

export type FormattingArtifactFinding = {
  field: ScaffoldContentField;
  tokenType: FormattingArtifactType;
  // The offending excerpt exactly as persisted, so a human can confirm it against the report.
  excerpt: string;
};

export type ScaffoldContentCongruenceSample = {
  sampleIndex: number;
  verdict: ScaffoldContentCongruenceVerdict;
};

export type ScaffoldContentStepAudit = {
  detourId: string;
  scaffoldStepId: string;
  enrichmentId: string;
  declaredDomain: string;
  term: string;
  parentLabel: string;
  stepLabel: string;
  // Deterministic (a): every markdown token found in any content field. Empty = clean.
  artifacts: FormattingArtifactFinding[];
  // Neural (b): the K congruence samples in sample order.
  samples: ScaffoldContentCongruenceSample[];
  notTeachingCount: number;
  notSimplerCount: number;
  // The step has a recurring congruence problem when EITHER dimension recurred as a NO.
  congruenceRecurring: boolean;
};

export type ScaffoldContentAuditReport = {
  // The audited enrichment, or null when the whole store was swept.
  enrichmentId: string | null;
  judgeModel: string;
  k: number;
  generatedAt: string;
  stepCount: number;
  steps: ScaffoldContentStepAudit[];
  // Steps with at least one formatting artifact, and per-token-type totals across all steps.
  artifactStepCount: number;
  artifactTotals: Record<FormattingArtifactType, number>;
  congruenceRecurringStepCount: number;
};

export type ScaffoldContentAuditSampleProgress = {
  stepIndex: number;
  stepCount: number;
  sampleIndex: number;
  verdict: ScaffoldContentCongruenceVerdict;
};

// Deterministic markdown-token detectors (KTD2a). Each detects a PAIRED or STRUCTURAL markdown
// form the plain-text surface would render raw; lone stray punctuation (a hyphen mid-sentence, a
// standalone asterisk) is deliberately NOT flagged so the report stays inspectable rather than
// noisy. Ordered so a code fence is not also double-reported as inline code.
const ARTIFACT_DETECTORS: readonly { tokenType: FormattingArtifactType; pattern: RegExp }[] = [
  { tokenType: "bold", pattern: /\*\*[^*\n]+\*\*|__[^_\n]+__/g },
  { tokenType: "italic", pattern: /(?<![*\w])\*[^*\s][^*\n]*\*(?![*\w])/g },
  { tokenType: "code_fence", pattern: /```/g },
  { tokenType: "inline_code", pattern: /`[^`\n]+`/g },
  { tokenType: "heading", pattern: /^[ \t]*#{1,6}[ \t]+\S/gm },
  { tokenType: "link", pattern: /\[[^\]\n]+\]\([^)\n]+\)/g },
  { tokenType: "list_marker", pattern: /^[ \t]*(?:[-*+][ \t]+|\d+\.[ \t]+)\S/gm }
];

const EXCERPT_MAX = 80;

// The persisted micro-lesson text: the generated lesson sections joined, including any list items
// (the plain-text surface renders section text and items as one plain block). PURE.
export function scaffoldMicroLessonText(payload: ScaffoldNodePayload): string {
  return payload.lesson
    .map((section) => [section.text, ...(section.items ?? [])].filter((part) => part.trim().length > 0).join("\n"))
    .filter((block) => block.length > 0)
    .join("\n\n");
}

function excerpt(match: string): string {
  const collapsed = match.replace(/\s+/g, " ").trim();
  return collapsed.length <= EXCERPT_MAX ? collapsed : `${collapsed.slice(0, EXCERPT_MAX - 1)}…`;
}

function scanField(field: ScaffoldContentField, text: string): FormattingArtifactFinding[] {
  const findings: FormattingArtifactFinding[] = [];
  for (const detector of ARTIFACT_DETECTORS) {
    for (const match of text.matchAll(detector.pattern)) {
      findings.push({ field, tokenType: detector.tokenType, excerpt: excerpt(match[0]) });
    }
  }
  return findings;
}

// Deterministic formatting-artifact classifier (KTD2a). Scans every learner-visible content field
// of one generated step for markdown tokens. PURE — reporting only, never a gate (rule 16).
export function detectFormattingArtifacts(payload: ScaffoldNodePayload): FormattingArtifactFinding[] {
  return [
    ...scanField("microLesson", scaffoldMicroLessonText(payload)),
    ...scanField("question", payload.item.question),
    ...scanField("explanation", payload.item.explanation),
    ...payload.item.options.flatMap((option) => scanField("option", option.text))
  ];
}

// The judge's option view (KTD3): every option text, correct answer NOT distinguished, sorted so
// position (persisted correct-first) leaks no answer-key signal to the judge.
function judgeOptions(payload: ScaffoldNodePayload): string[] {
  return payload.item.options.map((option) => option.text).sort((a, b) => a.localeCompare(b));
}

function emptyArtifactTotals(): Record<FormattingArtifactType, number> {
  return { bold: 0, italic: 0, code_fence: 0, inline_code: 0, heading: 0, link: 0, list_marker: 0 };
}

export async function auditScaffoldContent(input: {
  steps: GeneratedScaffoldStepForAudit[];
  judge: ScaffoldContentCongruencePort;
  enrichmentId?: string;
  k?: number;
  concurrency?: number;
  now?: Date;
  onSample?: (progress: ScaffoldContentAuditSampleProgress) => void;
}): Promise<ScaffoldContentAuditReport> {
  const k = input.k ?? 3;
  if (!Number.isInteger(k) || k < 1) {
    throw new Error(`scaffold-content audit requires a positive integer K, got ${k}.`);
  }
  const stepCount = input.steps.length;

  // Deterministic artifact classification first (no LLM): pure per-step scans.
  const artifactsByStep = input.steps.map((step) => detectFormattingArtifacts(step.payload));

  // Neural congruence: K samples per step. Flatten to (step, sample) jobs so total in-flight judge
  // calls stay bounded regardless of step count; group verdicts back per step afterwards.
  type Job = { stepIndex: number; sampleIndex: number };
  const jobs: Job[] = input.steps.flatMap((_, stepIndex) =>
    Array.from({ length: k }, (_, sampleIndex) => ({ stepIndex, sampleIndex }))
  );
  const verdicts = await mapWithConcurrency(jobs, input.concurrency ?? 4, async (job) => {
    const step = input.steps[job.stepIndex];
    const verdict = await input.judge.judge({
      declaredDomain: step.declaredDomain,
      term: step.term,
      parentLabel: step.parentLabel,
      stepLabel: step.payload.label,
      microLesson: scaffoldMicroLessonText(step.payload),
      question: step.payload.item.question,
      explanation: step.payload.item.explanation,
      options: judgeOptions(step.payload)
    });
    input.onSample?.({ stepIndex: job.stepIndex, stepCount, sampleIndex: job.sampleIndex, verdict });
    return verdict;
  });

  const samplesByStep: ScaffoldContentCongruenceSample[][] = input.steps.map(() => []);
  jobs.forEach((job, jobIndex) => {
    samplesByStep[job.stepIndex].push({ sampleIndex: job.sampleIndex, verdict: verdicts[jobIndex] });
  });

  const steps: ScaffoldContentStepAudit[] = input.steps.map((step, stepIndex) => {
    const samples = samplesByStep[stepIndex].sort((a, b) => a.sampleIndex - b.sampleIndex);
    const notTeachingCount = samples.filter((sample) => !sample.verdict.teachesStepLabel).length;
    const notSimplerCount = samples.filter((sample) => !sample.verdict.isSimplerPrerequisite).length;
    return {
      detourId: step.detourId,
      scaffoldStepId: step.scaffoldStepId,
      enrichmentId: step.enrichmentId,
      declaredDomain: step.declaredDomain,
      term: step.term,
      parentLabel: step.parentLabel,
      stepLabel: step.payload.label,
      artifacts: artifactsByStep[stepIndex],
      samples,
      notTeachingCount,
      notSimplerCount,
      congruenceRecurring:
        notTeachingCount >= SCAFFOLD_CONTENT_CONGRUENCE_RECURRENCE_THRESHOLD ||
        notSimplerCount >= SCAFFOLD_CONTENT_CONGRUENCE_RECURRENCE_THRESHOLD
    };
  });

  const artifactTotals = emptyArtifactTotals();
  for (const step of steps) {
    for (const finding of step.artifacts) artifactTotals[finding.tokenType] += 1;
  }

  return {
    enrichmentId: input.enrichmentId ?? null,
    judgeModel: input.judge.model,
    k,
    generatedAt: (input.now ?? new Date()).toISOString(),
    stepCount,
    steps,
    artifactStepCount: steps.filter((step) => step.artifacts.length > 0).length,
    artifactTotals,
    congruenceRecurringStepCount: steps.filter((step) => step.congruenceRecurring).length
  };
}
