import assert from "node:assert/strict";
import test from "node:test";
import type { ConceptLesson, OptionSelectItem } from "@lrnki/domain-core";
import {
  projectSourceMaterialClaims,
  renderSourceMaterialClaim
} from "./sourceMaterialClaims";

const authorizationCitation = {
  provenance: "source" as const,
  sourceResourceId: "resource-policy",
  sourceBlockId: "block-expiry",
  evidenceQuote: "Authorization remains valid only until 17:00 UTC unless the issuer renews it.",
  matchKind: "exact" as const
};

const lesson: ConceptLesson = {
  conceptLessonId: "lesson-authorization",
  derivedNodeId: "node-authorization",
  graphVersionId: "graph-1",
  enrichmentId: "enrichment-1",
  generatingModel: "test-generator",
  configHash: "qualified:test",
  canonicalLabel: "Expiring authorization",
  sections: [
    {
      kind: "definition",
      text: "Authorization is valid only until 17:00 UTC, unless the issuer renews it.",
      items: ["At 17:01 UTC, the unrenewed authorization is no longer valid."],
      groundingProvenance: "source_cep",
      citation: authorizationCitation,
      diagram: {
        caption: "Validity changes at the stated deadline.",
        spec: "Show valid before 17:00 UTC and invalid afterward unless renewed."
      }
    },
    {
      kind: "applications",
      text: "A check at 16:59 UTC cannot establish validity at 17:01 UTC.",
      groundingProvenance: "source_cep"
    }
  ],
  explorableTerms: []
};

const item: OptionSelectItem = {
  studyItemId: "item-authorization",
  graphVersionId: "graph-1",
  enrichmentId: "enrichment-1",
  derivedNodeId: "node-authorization",
  groundingProvenance: "source_cep",
  generatingModel: "test-generator",
  configHash: "qualified:test",
  explorableTerms: [],
  itemType: "option_select",
  question: "When is an unrenewed authorization still valid?",
  explanation: "The deadline and renewal exception both control the result.",
  options: [
    {
      optionId: "option-after",
      text: "After 17:00 UTC",
      isCorrect: false,
      provenance: "generated"
    },
    {
      optionId: "option-before",
      text: "Before 17:00 UTC",
      isCorrect: true,
      provenance: "source",
      citation: authorizationCitation
    },
    {
      optionId: "option-forever",
      text: "Indefinitely",
      isCorrect: false,
      provenance: "generated"
    },
    {
      optionId: "option-never",
      text: "Never",
      isCorrect: false,
      provenance: "generated"
    }
  ]
};

test("projects every material source-asset field without losing qualifiers or citation identity", () => {
  const result = projectSourceMaterialClaims({ lessons: [lesson], optionSelectItems: [item] });

  assert.equal(result.projection, "source_material_claims_v1");
  assert.equal(result.evidence.length, 1, "the shared section/key citation is one evidence row");
  assert.equal(result.evidence[0]?.passageKind, "definition");
  assert.equal(result.claims.length, 10);
  assert.equal(result.claims.filter((claim) => claim.purpose === "source_support").length, 7);
  assert.equal(result.claims.filter((claim) => claim.purpose === "distractor_invalidity").length, 3);

  const section = result.claims.find((claim) => claim.claimKey.endsWith("section:0:text"));
  assert.deepEqual(section?.subject, {
    kind: "lesson_section",
    sectionKind: "definition",
    sectionText: "Authorization is valid only until 17:00 UTC, unless the issuer renews it."
  });
  assert.match(section?.statement ?? "", /only until 17:00 UTC, unless the issuer renews it/);
  assert.deepEqual(section?.directEvidenceKeys, [result.evidence[0]?.evidenceKey]);

  const bullet = result.claims.find((claim) => claim.claimKey.endsWith("item:0"));
  assert.equal(bullet?.subject.kind, "lesson_section_item");
  assert.deepEqual(bullet?.evidenceKeys, [result.evidence[0]?.evidenceKey]);
  assert.deepEqual(bullet?.directEvidenceKeys, [], "generated section items do not masquerade as direct quotes");

  const questionKey = result.claims.find((claim) => claim.subject.kind === "option_select_question_key");
  assert.deepEqual(questionKey?.subject, {
    kind: "option_select_question_key",
    question: "When is an unrenewed authorization still valid?",
    keyedAnswer: "Before 17:00 UTC"
  });
  assert.deepEqual(questionKey?.directEvidenceKeys, [result.evidence[0]?.evidenceKey]);

  const distractors = result.claims
    .filter((claim) => claim.subject.kind === "option_select_distractor")
    .map((claim) => claim.subject.kind === "option_select_distractor" ? claim.subject.proposedAnswer : "");
  assert.deepEqual(distractors, ["After 17:00 UTC", "Indefinitely", "Never"]);
});

test("projection is deterministic across asset input order and renders only exact subject fields", () => {
  const secondLesson = { ...lesson, conceptLessonId: "lesson-z-copy" };
  const first = projectSourceMaterialClaims({
    lessons: [secondLesson, lesson],
    optionSelectItems: [item]
  });
  const second = projectSourceMaterialClaims({
    lessons: [lesson, secondLesson],
    optionSelectItems: [item]
  });
  assert.deepEqual(first, second);

  const subject = {
    kind: "option_select_explanation" as const,
    question: "Does the condition still apply?",
    keyedAnswer: "Only while the stated exception is absent.",
    explanation: "Both the condition and exception are material."
  };
  const rendered = renderSourceMaterialClaim(subject);
  assert.match(rendered, /Does the condition still apply/);
  assert.match(rendered, /Only while the stated exception is absent/);
  assert.match(rendered, /Both the condition and exception are material/);
});

