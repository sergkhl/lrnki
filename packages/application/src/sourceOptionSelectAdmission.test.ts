import assert from "node:assert/strict";
import test from "node:test";
import type {
  ConceptLesson,
  OptionSelectItem,
  StudyItemCandidateVerdict
} from "@lrnki/domain-core";
import type {
  AnswerKeyVerificationPort,
  SourceMaterialClaimSupportVerificationPort
} from "@lrnki/ports";
import { admitSourceOptionSelectItems } from "./sourceOptionSelectAdmission";
import { qualifiedSourceExpeditionAssetConfigHash } from "./sourceExpedition";

const citation = {
  provenance: "source" as const,
  sourceResourceId: "resource-1",
  sourceBlockId: "block-1",
  evidenceQuote: "A permit remains valid through noon only when the signed exception is present.",
  matchKind: "exact" as const
};

function lesson(): ConceptLesson {
  return {
    conceptLessonId: "lesson-1",
    derivedNodeId: "node-1",
    graphVersionId: "graph-1",
    enrichmentId: "enrichment-1",
    generatingModel: "lesson-test",
    configHash: qualifiedSourceExpeditionAssetConfigHash("base-config"),
    canonicalLabel: "Conditional permit",
    sections: [{
      kind: "definition",
      text: "The permit remains valid through noon only when the signed exception is present.",
      groundingProvenance: "source_cep",
      citation
    }],
    explorableTerms: []
  };
}

function candidate(): OptionSelectItem {
  return {
    studyItemId: "item-1",
    graphVersionId: "graph-1",
    enrichmentId: "enrichment-1",
    derivedNodeId: "node-1",
    groundingProvenance: "source_cep",
    generatingModel: "item-test",
    configHash: "base-config",
    explorableTerms: [],
    itemType: "option_select",
    question: "When does the permit remain valid through noon?",
    explanation: "The signed exception is required for noon validity.",
    options: [
      { optionId: "wrong-3", text: "Whenever it is unsigned", isCorrect: false, provenance: "generated" },
      { optionId: "key", text: "When the signed exception is present", isCorrect: true, provenance: "source", citation },
      { optionId: "wrong-2", text: "Only after noon", isCorrect: false, provenance: "generated" },
      { optionId: "wrong-1", text: "Under every condition", isCorrect: false, provenance: "generated" }
    ]
  };
}

const nodes = [{
  derivedNodeId: "node-1",
  label: "Conditional permit",
  aliases: ["Time-limited permit"],
  declaredDomain: "policy interpretation"
}];

const sourceEvidenceRead = {
  async readSourceEvidence() {
    return [{
      sourceResourceId: "resource-1",
      sourceTitle: "Generated permit policy",
      sourceBlockId: "block-1",
      blockType: "paragraph",
      headingPath: ["Validity"],
      text: "A permit remains valid through noon only when the signed exception is present."
    }];
  }
};

function sourceVerifier(
  dispositionFor: (claim: string) => "supported" | "unsupported" | "unclear" = () => "supported"
): SourceMaterialClaimSupportVerificationPort {
  return {
    model: "source-support-test",
    async verify(input) {
      const disposition = dispositionFor(input.claim.statement);
      return { disposition, reason: `test ${disposition} decision` };
    }
  };
}

function answerVerifier(
  truthFor: (candidateText: string) => StudyItemCandidateVerdict["verdict"] =
    (text) => text === "When the signed exception is present" ? "claim_true" : "claim_false",
  requests: Parameters<AnswerKeyVerificationPort["verify"]>[0][] = []
): AnswerKeyVerificationPort {
  return {
    model: "answer-key-test",
    async verify(input) {
      requests.push(input);
      return input.candidates.map((entry) => ({
        ordinal: entry.ordinal,
        verdict: truthFor(entry.text),
        reason: "test truth decision"
      }));
    }
  };
}

test("source option admission requires every support, distractor, and unique-key decision", async () => {
  const raw = candidate();
  const requests: Parameters<AnswerKeyVerificationPort["verify"]>[0][] = [];
  const result = await admitSourceOptionSelectItems({
    candidates: [raw],
    lessons: [lesson()],
    nodes,
    baseConfigHash: "base-config",
    sourceEvidenceRead,
    sourceSupportVerifier: sourceVerifier(),
    answerKeyVerifier: answerVerifier(undefined, requests),
    relatedConceptsForNode: () => [{ label: "Neighbor", snippet: "Related source concept" }]
  });

  assert.deepEqual(result.candidates, [raw]);
  assert.deepEqual(result.rejected, []);
  assert.equal(result.studyItems.length, 1);
  assert.equal(
    result.studyItems[0]?.configHash,
    qualifiedSourceExpeditionAssetConfigHash("base-config")
  );
  assert.deepEqual(
    { ...result.studyItems[0], configHash: "base-config" },
    raw,
    "admission changes only the qualification identity"
  );
  assert.equal(result.sourceSupport.calls, 2);
  assert.equal(result.optionTruth.calls, 1);
  assert.ok(result.sourceSupport.decisions.every((decision) => decision.disposition === "accepted"));
  assert.ok(result.optionTruth.distractorInvalidity.every((decision) => decision.disposition === "accepted"));
  assert.equal(result.optionTruth.keyUniqueness[0]?.reasonCode, "unique_key_verified");
  assert.deepEqual(requests[0]?.candidates.map((entry) => entry.text), [
    "Only after noon",
    "Under every condition",
    "When the signed exception is present",
    "Whenever it is unsigned"
  ]);
  assert.doesNotMatch(
    JSON.stringify(requests[0]),
    /isCorrect|optionId|derivedNodeId|wrong-1|wrong-2|wrong-3|"key"/
  );
});

test("an unsupported explanation preserves the exact candidate and records a concrete rejection", async () => {
  const raw = candidate();
  const result = await admitSourceOptionSelectItems({
    candidates: [raw],
    lessons: [lesson()],
    nodes,
    baseConfigHash: "base-config",
    sourceEvidenceRead,
    sourceSupportVerifier: sourceVerifier((claim) =>
      claim.includes("explanation:") ? "unsupported" : "supported"
    ),
    answerKeyVerifier: answerVerifier()
  });

  assert.deepEqual(result.candidates, [raw]);
  assert.deepEqual(result.studyItems, []);
  assert.equal(result.optionTruth.calls, 0, "failed source support short-circuits answer-key spend");
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0]?.reason ?? "", /option_select_explanation: source_support_rejected/);
  assert.deepEqual(raw, candidate(), "settlement never patches the rejected payload");
});

test("one true distractor rejects both distractor invalidity and key uniqueness", async () => {
  const result = await admitSourceOptionSelectItems({
    candidates: [candidate()],
    lessons: [lesson()],
    nodes,
    baseConfigHash: "base-config",
    sourceEvidenceRead,
    sourceSupportVerifier: sourceVerifier(),
    answerKeyVerifier: answerVerifier((text) =>
      text === "When the signed exception is present" || text === "Only after noon"
        ? "claim_true"
        : "claim_false"
    )
  });

  assert.deepEqual(result.studyItems, []);
  assert.match(result.rejected[0]?.reason ?? "", /distractor_valid_for_question/);
  assert.match(result.rejected[0]?.reason ?? "", /multiple_true_answers/);
});

test("an absent support verifier fails closed before qualified persistence", async () => {
  const result = await admitSourceOptionSelectItems({
    candidates: [candidate()],
    lessons: [lesson()],
    nodes,
    baseConfigHash: "base-config",
    sourceEvidenceRead,
    answerKeyVerifier: answerVerifier()
  });

  assert.deepEqual(result.studyItems, []);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.sourceSupport.calls, 0);
  assert.equal(result.optionTruth.calls, 0);
  assert.match(result.rejected[0]?.reason ?? "", /source_support_verifier_not_activated/);
});

test("answer-key transport failure is an explicit non-admission", async () => {
  const result = await admitSourceOptionSelectItems({
    candidates: [candidate()],
    lessons: [lesson()],
    nodes,
    baseConfigHash: "base-config",
    sourceEvidenceRead,
    sourceSupportVerifier: sourceVerifier(),
    answerKeyVerifier: {
      model: "answer-key-test",
      async verify() { throw new Error("verifier unavailable"); }
    }
  });

  assert.deepEqual(result.studyItems, []);
  assert.match(result.rejected[0]?.reason ?? "", /answer_key_verifier_unavailable/);
});
