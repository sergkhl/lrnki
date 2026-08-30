import assert from "node:assert/strict";
import test from "node:test";
import type {
  ConceptLesson,
  ImpostorItem,
  MatchingAssignmentVerdict,
  MatchingItem,
  OptionSelectItem,
  StudyItem,
  StudyItemCandidateVerdict
} from "@lrnki/domain-core";
import type {
  AnswerKeyVerificationPort,
  MatchingAssignmentVerificationPort,
  SourceMaterialClaimSupportVerificationPort
} from "@lrnki/ports";
import {
  SOURCE_MATERIAL_CLAIM_SUPPORT_ACCEPTANCE_DRAWS,
  type ProjectedSourceSupportEvaluation,
  type SourceAssetEvaluationStage
} from "./sourceAssetEvaluation";
import { qualifiedSourceExpeditionAssetConfigHash } from "./sourceExpedition";
import { sourceOptionExactReferenceQuestion } from "./sourceOptionExactReference";
import { admitSourceStudyItems } from "./sourceStudyItemAdmission";

const sourceText = [
  "A permit remains valid through noon only when the signed exception is present.",
  "The issuer may renew the permit with a second signature.",
  "An unsigned permit expires before noon."
].join(" ");
const generatedRelationship = "A renewal record identifies the issuer and the renewed deadline.";
const sourceCitation = {
  provenance: "source" as const,
  sourceResourceId: "resource-1",
  sourceBlockId: "block-1",
  evidenceQuote: sourceText,
  matchKind: "exact" as const
};
const generatedCitation = {
  provenance: "generated" as const,
  derivedNodeId: "node-1",
  passageText: generatedRelationship
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
    sections: [
      {
        kind: "definition",
        text: sourceText,
        groundingProvenance: "source_cep",
        citation: sourceCitation
      },
      {
        kind: "examples",
        text: generatedRelationship,
        groundingProvenance: "generated",
        citation: generatedCitation
      }
    ],
    explorableTerms: []
  };
}

function optionCandidate(): OptionSelectItem {
  return {
    studyItemId: "option-1",
    graphVersionId: "graph-1",
    enrichmentId: "enrichment-1",
    derivedNodeId: "node-1",
    groundingProvenance: "source_cep",
    generatingModel: "item-test",
    configHash: "base-config",
    explorableTerms: [],
    itemType: "option_select",
    question: sourceOptionExactReferenceQuestion("Conditional permit"),
    explanation: sourceText,
    options: [
      { optionId: "wrong-3", text: "Whenever it is unsigned", isCorrect: false, provenance: "generated" },
      { optionId: "key", text: sourceText, isCorrect: true, provenance: "source", citation: sourceCitation },
      { optionId: "wrong-2", text: "Only after noon", isCorrect: false, provenance: "generated" },
      { optionId: "wrong-1", text: "Under every condition", isCorrect: false, provenance: "generated" }
    ]
  };
}

function matchingCandidate(): MatchingItem {
  return {
    studyItemId: "matching-1",
    graphVersionId: "graph-1",
    enrichmentId: "enrichment-1",
    derivedNodeId: "node-1",
    groundingProvenance: "source_cep",
    generatingModel: "item-test",
    configHash: "base-config",
    explorableTerms: [],
    itemType: "matching",
    question: "Match each policy aspect to its description.",
    pairs: [
      {
        pairId: "pair-1",
        matchId: "match-1",
        promptText: "Validity window",
        matchText: "The permit lasts through noon when the exception is signed.",
        citation: sourceCitation
      },
      {
        pairId: "pair-2",
        matchId: "match-2",
        promptText: "Renewal authority",
        matchText: "The issuer may renew with a second signature.",
        citation: sourceCitation
      },
      {
        pairId: "pair-3",
        matchId: "match-3",
        promptText: "Renewal record",
        matchText: "The record identifies the issuer and renewed deadline.",
        citation: generatedCitation
      }
    ]
  };
}

function impostorCandidate(): ImpostorItem {
  return {
    studyItemId: "impostor-1",
    graphVersionId: "graph-1",
    enrichmentId: "enrichment-1",
    derivedNodeId: "node-1",
    groundingProvenance: "source_cep",
    generatingModel: "item-test",
    configHash: "base-config",
    explorableTerms: [],
    itemType: "impostor",
    question: "Which statement is false?",
    statements: [
      {
        statementId: "statement-1",
        ordinal: 0,
        text: "A signed exception can keep the permit valid through noon.",
        isImpostor: false,
        provenance: "source",
        citation: sourceCitation
      },
      {
        statementId: "statement-2",
        ordinal: 1,
        text: "The issuer can renew the permit with another signature.",
        isImpostor: false,
        provenance: "source",
        citation: sourceCitation
      },
      {
        statementId: "statement-3",
        ordinal: 2,
        text: "The renewal record identifies its issuer and deadline.",
        isImpostor: false,
        provenance: "generated",
        citation: generatedCitation
      },
      {
        statementId: "statement-4",
        ordinal: 3,
        text: "An unsigned permit remains valid indefinitely.",
        isImpostor: true,
        provenance: "generated",
        reveal: "The source says an unsigned permit expires before noon.",
        lieSource: "generated"
      }
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
      sourceDocumentId: "document-1",
      sourceBlockId: "block-1",
      blockId: "block-1",
      blockType: "paragraph",
      headingPath: ["Validity"],
      locator: {},
      text: sourceText
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
  verdictFor: (text: string, itemType: "option_select" | "impostor") =>
    StudyItemCandidateVerdict["verdict"] =
      (text, itemType) => itemType === "impostor" && text.includes("indefinitely")
        ? "claim_false"
        : "claim_true",
  calls: Parameters<AnswerKeyVerificationPort["verify"]>[0][] = []
): AnswerKeyVerificationPort {
  return {
    model: "answer-key-test",
    async verify(input) {
      calls.push(input);
      return input.candidates.map((candidate) => ({
        ordinal: candidate.ordinal,
        verdict: verdictFor(candidate.text, input.itemType),
        reason: "test truth decision"
      }));
    }
  };
}

function matchingVerifier(
  transform: (verdicts: MatchingAssignmentVerdict[]) => MatchingAssignmentVerdict[] =
    (verdicts) => verdicts,
  calls: Parameters<MatchingAssignmentVerificationPort["verify"]>[0][] = []
): MatchingAssignmentVerificationPort {
  const expected = new Map(matchingCandidate().pairs.map((pair) => [
    pair.promptText,
    pair.matchText
  ] as const));
  return {
    model: "matching-assignment-test",
    async verify(input) {
      calls.push(input);
      return transform(input.prompts.flatMap((prompt) => input.matches.map((match) => ({
        promptOrdinal: prompt.ordinal,
        matchOrdinal: match.ordinal,
        verdict: expected.get(prompt.text) === match.text ? "fits" as const : "does_not_fit" as const,
        reason: "test assignment decision"
      }))));
    }
  };
}

async function admit(
  candidates: readonly StudyItem[],
  overrides: {
    sourceSupportVerifier?: SourceMaterialClaimSupportVerificationPort;
    answerKeyVerifier?: AnswerKeyVerificationPort;
    matchingAssignmentVerifier?: MatchingAssignmentVerificationPort;
    sourceRead?: typeof sourceEvidenceRead;
  } = {}
) {
  return admitSourceStudyItems({
    candidates,
    lessons: [lesson()],
    nodes,
    baseConfigHash: "base-config",
    sourceEvidenceRead: overrides.sourceRead ?? sourceEvidenceRead,
    sourceSupportVerifier: overrides.sourceSupportVerifier ?? sourceVerifier(),
    answerKeyVerifier: overrides.answerKeyVerifier ?? answerVerifier(),
    matchingAssignmentVerifier: overrides.matchingAssignmentVerifier ?? matchingVerifier()
  });
}

test("family-complete admission qualifies supported option, matching, and impostor candidates", async () => {
  const raw = [optionCandidate(), matchingCandidate(), impostorCandidate()];
  const answerCalls: Parameters<AnswerKeyVerificationPort["verify"]>[0][] = [];
  const matchingCalls: Parameters<MatchingAssignmentVerificationPort["verify"]>[0][] = [];
  const result = await admit(raw, {
    answerKeyVerifier: answerVerifier(undefined, answerCalls),
    matchingAssignmentVerifier: matchingVerifier(undefined, matchingCalls)
  });

  assert.deepEqual(result.rejected, []);
  assert.deepEqual(result.studyItems.map((item) => item.itemType), [
    "option_select",
    "matching",
    "impostor"
  ]);
  assert.ok(result.studyItems.every((item) =>
    item.configHash === qualifiedSourceExpeditionAssetConfigHash("base-config")
  ));
  assert.equal(
    result.sourceSupport.calls,
    9 * SOURCE_MATERIAL_CLAIM_SUPPORT_ACCEPTANCE_DRAWS
  );
  assert.equal(result.optionTruth.calls, 0, "the exact-reference option remains deterministic");
  assert.equal(answerCalls.length, 1, "only impostor needs Answer-Key Verification");
  assert.equal(matchingCalls.length, 1);
  assert.equal(result.matchingAssignments[0]?.reasonCode, "matching_assignment_verified");
  assert.equal(result.impostorTruth[0]?.reasonCode, "impostor_key_verified");
  const admittedMatching = result.studyItems.find((item): item is MatchingItem =>
    item.itemType === "matching"
  );
  assert.equal(admittedMatching?.pairs[2]?.citation.provenance, "generated");
  const admittedImpostor = result.studyItems.find((item): item is ImpostorItem =>
    item.itemType === "impostor"
  );
  assert.equal(
    admittedImpostor?.statements.find((statement) => statement.statementId === "statement-3")?.provenance,
    "generated",
    "accepted support never rewrites honest generated provenance into a source quote"
  );
});

test("strict generation-stage prequalification is consumed once without reopening semantic judges", async () => {
  let answerCalls = 0;
  let matchingCalls = 0;
  const result = await admitSourceStudyItems({
    candidates: [matchingCandidate(), impostorCandidate()],
    lessons: [lesson()],
    nodes,
    baseConfigHash: "base-config",
    sourceEvidenceRead,
    sourceSupportVerifier: sourceVerifier(),
    answerKeyVerifier: {
      model: "answer-key-test",
      async verify() {
        answerCalls += 1;
        throw new Error("prequalified impostor must not be reverified");
      }
    },
    matchingAssignmentVerifier: {
      model: "matching-assignment-test",
      async verify() {
        matchingCalls += 1;
        throw new Error("prequalified matching board must not be reverified");
      }
    },
    semanticPrequalification: {
      matching: {
        studyItemIds: ["matching-1"],
        verifierModel: "matching-assignment-test"
      },
      impostor: {
        studyItemIds: ["impostor-1"],
        verifierModel: "answer-key-test"
      }
    }
  });

  assert.deepEqual(result.studyItems.map((item) => item.itemType), ["matching", "impostor"]);
  assert.equal(answerCalls, 0);
  assert.equal(matchingCalls, 0);
  assert.equal(result.matchingAssignments[0]?.reasonCode, "matching_assignment_verified");
  assert.equal(result.impostorTruth[0]?.reasonCode, "impostor_key_verified");
});

test("immutable source blocks settle matching and impostor source citations without relabeling generated relationships", async () => {
  const normalizedBlockRead = {
    async readSourceEvidence() {
      return [{
        sourceResourceId: "resource-1",
        sourceTitle: "Generated permit policy",
        sourceDocumentId: "document-1",
        sourceBlockId: "block-1",
        blockId: "block-1",
        blockType: "paragraph",
        headingPath: ["Validity"],
        locator: {},
        text: sourceText.replaceAll(" ", "\n")
      }];
    }
  };
  const result = await admit([matchingCandidate(), impostorCandidate()], {
    sourceRead: normalizedBlockRead
  });

  assert.deepEqual(result.rejected, []);
  const matching = result.studyItems.find((item): item is MatchingItem => item.itemType === "matching");
  assert.ok(matching);
  assert.ok(matching.pairs.slice(0, 2).every((pair) =>
    pair.citation.provenance === "source" && pair.citation.matchKind === "normalized"
  ));
  assert.equal(matching.pairs[2]?.citation.provenance, "generated");
  const impostor = result.studyItems.find((item): item is ImpostorItem => item.itemType === "impostor");
  assert.ok(impostor);
  assert.ok(impostor.statements.filter((statement) =>
    !statement.isImpostor && statement.provenance === "source"
  ).every((statement) =>
    !statement.isImpostor && statement.citation.provenance === "source" &&
      statement.citation.matchKind === "normalized"
  ));
  assert.equal(
    impostor.statements.find((statement) => !statement.isImpostor && statement.provenance === "generated")?.provenance,
    "generated"
  );
});

test("an unsupported corrective reveal rejects the impostor before key-verifier spend", async () => {
  const answerCalls: Parameters<AnswerKeyVerificationPort["verify"]>[0][] = [];
  const result = await admit([impostorCandidate()], {
    sourceSupportVerifier: sourceVerifier((claim) =>
      claim.includes("corrective reveal") ? "unsupported" : "supported"
    ),
    answerKeyVerifier: answerVerifier(undefined, answerCalls)
  });

  assert.deepEqual(result.studyItems, []);
  assert.equal(answerCalls.length, 0);
  assert.match(result.rejected[0]?.reason ?? "", /impostor_reveal: source_support_rejected/);
});

test("missing or unresolved source decisions fail closed for every family", async () => {
  const missingVerifier = await admitSourceStudyItems({
    candidates: [optionCandidate(), matchingCandidate(), impostorCandidate()],
    lessons: [lesson()],
    nodes,
    baseConfigHash: "base-config",
    sourceEvidenceRead,
    answerKeyVerifier: answerVerifier(),
    matchingAssignmentVerifier: matchingVerifier()
  });
  assert.equal(missingVerifier.studyItems.length, 0);
  assert.equal(missingVerifier.rejected.length, 3);
  assert.ok(missingVerifier.rejected.every((row) =>
    row.reason.includes("source_support_verifier_not_activated")
  ));

  const missingDecision = await admitSourceStudyItems({
    candidates: [matchingCandidate()],
    lessons: [lesson()],
    nodes,
    baseConfigHash: "base-config",
    sourceEvidenceRead,
    sourceSupportVerifier: sourceVerifier(),
    sourceSupportStage: (async <T>(work: () => Promise<T>) => {
      const evaluated = await work() as ProjectedSourceSupportEvaluation;
      return { ...evaluated, decisions: evaluated.decisions.slice(1) } as T;
    }) as SourceAssetEvaluationStage,
    answerKeyVerifier: answerVerifier(),
    matchingAssignmentVerifier: matchingVerifier()
  });
  assert.deepEqual(missingDecision.studyItems, []);
  assert.match(missingDecision.rejected[0]?.reason ?? "", /matching_relationship: missing source-support decision/);

  const unresolved = await admit([matchingCandidate()], {
    sourceRead: { async readSourceEvidence() { return []; } }
  });
  assert.deepEqual(unresolved.studyItems, []);
  assert.match(unresolved.rejected[0]?.reason ?? "", /unresolved_source_evidence/);
});

test("dishonest item or relationship provenance is rejected without semantic spend", async () => {
  const generatedItem = { ...matchingCandidate(), groundingProvenance: "generated" as const };
  const misattributed = matchingCandidate();
  misattributed.pairs = misattributed.pairs.map((pair, index) => index === 0
    ? {
        ...pair,
        citation: {
          ...sourceCitation,
          sourceBlockId: "different-block"
        }
      }
    : pair
  );
  const calls: Parameters<MatchingAssignmentVerificationPort["verify"]>[0][] = [];
  const result = await admit([generatedItem, { ...misattributed, studyItemId: "matching-2" }], {
    matchingAssignmentVerifier: matchingVerifier(undefined, calls)
  });

  assert.deepEqual(result.studyItems, []);
  assert.equal(calls.length, 0);
  assert.match(result.rejected[0]?.reason ?? "", /grounding_provenance/);
  assert.match(result.rejected[1]?.reason ?? "", /citation does not resolve against lesson grounding/);
});

test("surface-cued or ambiguous matching boards and missing grid cells are rejected", async () => {
  const surfaceCued = matchingCandidate();
  surfaceCued.pairs = surfaceCued.pairs.map((pair, index) => index === 0
    ? { ...pair, promptText: "permit lasts", matchText: "the permit lasts through noon" }
    : pair
  );
  const surfaceResult = await admit([surfaceCued]);
  assert.match(surfaceResult.rejected[0]?.reason ?? "", /surface-cued/);

  const ambiguous = await admit([matchingCandidate()], {
    matchingAssignmentVerifier: matchingVerifier((verdicts) => {
      const firstNonKeyed = verdicts.findIndex((verdict) => verdict.verdict === "does_not_fit");
      return verdicts.map((verdict, index) =>
        index === firstNonKeyed ? { ...verdict, verdict: "fits" } : verdict
      );
    })
  });
  assert.match(ambiguous.rejected[0]?.reason ?? "", /matching_assignment_ambiguous/);

  const missing = await admit([matchingCandidate()], {
    matchingAssignmentVerifier: matchingVerifier((verdicts) => verdicts.slice(0, -1))
  });
  assert.match(missing.rejected[0]?.reason ?? "", /matching_assignment_unclear/);
});

test("a true lie, false truth, or missing impostor verdict fails strict source admission", async () => {
  const trueLie = await admit([impostorCandidate()], {
    answerKeyVerifier: answerVerifier((text) => text.includes("indefinitely")
      ? "claim_true"
      : "claim_true")
  });
  assert.match(trueLie.rejected[0]?.reason ?? "", /impostor_planted_lie_true/);

  const falseTruth = await admit([impostorCandidate()], {
    answerKeyVerifier: answerVerifier((text) => text.includes("renew the permit")
      ? "claim_false"
      : text.includes("indefinitely")
        ? "claim_false"
        : "claim_true")
  });
  assert.match(falseTruth.rejected[0]?.reason ?? "", /impostor_truth_false/);

  const incompleteVerifier: AnswerKeyVerificationPort = {
    model: "incomplete-answer-key-test",
    async verify(input) {
      return input.candidates.slice(0, 3).map((candidate) => ({
        ordinal: candidate.ordinal,
        verdict: "claim_true" as const,
        reason: "partial response"
      }));
    }
  };
  const missing = await admit([impostorCandidate()], {
    answerKeyVerifier: incompleteVerifier
  });
  assert.match(missing.rejected[0]?.reason ?? "", /impostor_truth_unclear/);
});

test("an option candidate still needs its exact source-backed key and all support decisions", async () => {
  const wrongKey = optionCandidate();
  wrongKey.options = wrongKey.options.map((option) => option.isCorrect
    ? { ...option, text: "Only when a signature exists" }
    : option
  );
  wrongKey.explanation = "Only when a signature exists";
  const wrongKeyResult = await admit([wrongKey]);
  assert.match(
    wrongKeyResult.rejected[0]?.reason ?? "",
    /must exactly repeat the code-selected source-backed lesson text/
  );

  const nonUnique = optionCandidate();
  nonUnique.options = nonUnique.options.map((option, index) => index === 0
    ? { ...option, text: sourceText.toLocaleUpperCase("en") }
    : option
  );
  const nonUniqueResult = await admit([nonUnique]);
  assert.match(nonUniqueResult.rejected[0]?.reason ?? "", /normalized texts must be unique/);

  const unsupported = await admit([optionCandidate()], {
    sourceSupportVerifier: sourceVerifier((claim) =>
      claim.includes("explanation:") ? "unsupported" : "supported"
    )
  });
  assert.match(unsupported.rejected[0]?.reason ?? "", /option_select_explanation/);
});
