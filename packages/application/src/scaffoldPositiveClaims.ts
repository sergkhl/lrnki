import type {
  ConceptLessonDiagramDescriptor,
  ConceptLessonSection,
  ScaffoldItemPayload,
  ScaffoldNodePayload,
  ScaffoldOption
} from "@lrnki/domain-core";
import type { PositiveClaimTarget } from "./claimAdmission";

type ClaimTreatment =
  | "exclude"
  | "project"
  | "recurse"
  | "project_with_keyed_answer"
  | "project_if_keyed"
  | "select_key";

// Versioned in Scaffold Generation's operation config identity. A question is not itself a
// positive factual proposition: project the learner-visible question and its keyed answer as one
// declarative QA-pair claim so admission settles answerability/answer consistency together.
export type ScaffoldPositiveClaimProjection = "question_answer_pair_v1";
export const SCAFFOLD_POSITIVE_CLAIM_PROJECTION: ScaffoldPositiveClaimProjection = "question_answer_pair_v1";

// These exact owner maps are compile-time tripwires. Adding any learner-facing payload field
// fails typechecking until this projector explicitly marks how that field is treated.
const payloadFieldTreatment = {
  scaffoldNodeId: "exclude",
  label: "exclude",
  lesson: "recurse",
  item: "recurse"
} as const satisfies Record<keyof ScaffoldNodePayload, ClaimTreatment>;

const lessonSectionFieldTreatment = {
  kind: "exclude",
  text: "project",
  items: "project",
  groundingProvenance: "exclude",
  citation: "exclude",
  diagram: "recurse"
} as const satisfies Record<keyof ConceptLessonSection, ClaimTreatment>;

const diagramFieldTreatment = {
  caption: "project",
  spec: "project"
} as const satisfies Record<keyof ConceptLessonDiagramDescriptor, ClaimTreatment>;

const itemFieldTreatment = {
  scaffoldItemId: "exclude",
  question: "project_with_keyed_answer",
  explanation: "project",
  options: "recurse"
} as const satisfies Record<keyof ScaffoldItemPayload, ClaimTreatment>;

const optionFieldTreatment = {
  optionId: "exclude",
  text: "project_if_keyed",
  isCorrect: "select_key"
} as const satisfies Record<keyof ScaffoldOption, ClaimTreatment>;

void payloadFieldTreatment;
void lessonSectionFieldTreatment;
void diagramFieldTreatment;
void itemFieldTreatment;
void optionFieldTreatment;

// Exhaustive learner-facing positive-claim projection for one generated Support Step. The label
// was already admitted through Source-less Grounding Admission. IDs, provenance/citation markers,
// and intentionally false distractors are excluded; every other positive learner assertion is
// settled atomically by the shared claim-admission implementation.
export function projectScaffoldPositiveClaims(
  payload: ScaffoldNodePayload,
  projection: ScaffoldPositiveClaimProjection = SCAFFOLD_POSITIVE_CLAIM_PROJECTION
): readonly PositiveClaimTarget[] {
  if (projection !== "question_answer_pair_v1") {
    throw new Error(`Unknown generated Support Step positive-claim projection ${JSON.stringify(projection)}.`);
  }
  const targets: PositiveClaimTarget[] = [];
  const add = (targetKey: string, targetPurpose: PositiveClaimTarget["targetPurpose"], text: string): void => {
    const normalized = text.trim();
    if (!normalized) throw new Error(`Generated Support Step positive target ${JSON.stringify(targetKey)} is empty.`);
    targets.push({ targetKey, targetPurpose, text: normalized });
  };

  payload.lesson.forEach((section, sectionIndex) => {
    add(
      `lesson:${sectionIndex}:text`,
      section.kind === "definition" ? "definition" : "support",
      section.text
    );
    section.items?.forEach((item, itemIndex) => {
      add(`lesson:${sectionIndex}:item:${itemIndex}`, "support", item);
    });
    if (section.diagram) {
      add(`lesson:${sectionIndex}:diagram:caption`, "support", section.diagram.caption);
      add(`lesson:${sectionIndex}:diagram:spec`, "support", section.diagram.spec);
    }
  });

  const keyed = payload.item.options.filter((option) => option.isCorrect);
  if (keyed.length !== 1) {
    throw new Error(`Generated Support Step positive-claim projection requires exactly one keyed option, got ${keyed.length}.`);
  }
  const question = payload.item.question.trim();
  const keyedAnswer = keyed[0]!.text.trim();
  if (!question || !keyedAnswer) {
    throw new Error("Generated Support Step question and keyed answer must both be non-empty before positive-claim projection.");
  }
  add(
    "item:question-keyed-answer",
    "support",
    `For the learner question ${JSON.stringify(question)}, the correct answer is ${JSON.stringify(keyedAnswer)}`
  );
  add("item:explanation", "support", payload.item.explanation);

  return targets;
}
