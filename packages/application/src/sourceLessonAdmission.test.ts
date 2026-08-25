import assert from "node:assert/strict";
import test from "node:test";
import type { ConceptLesson } from "@lrnki/domain-core";
import type {
  SourceEvidenceReadPort,
  SourceMaterialClaimSupportVerificationPort
} from "@lrnki/ports";
import { admitSourceConceptLessons } from "./sourceLessonAdmission";
import { qualifiedSourceExpeditionAssetConfigHash } from "./sourceExpedition";

const citation = {
  provenance: "source" as const,
  sourceResourceId: "resource-1",
  sourceBlockId: "block-1",
  evidenceQuote: "A bounded authorization retains the stated exception and deadline.",
  matchKind: "exact" as const
};

function candidateLesson(): ConceptLesson {
  return {
    conceptLessonId: "lesson-1",
    derivedNodeId: "node-1",
    graphVersionId: "graph-1",
    enrichmentId: "enrichment-1",
    generatingModel: "lesson-generator-test",
    configHash: "base-config",
    canonicalLabel: "Bounded authorization",
    sections: [
      {
        kind: "definition",
        text: "A bounded authorization retains the stated exception and deadline.",
        items: ["Keep this supported condition.", "DROP this unsupported condition."],
        groundingProvenance: "source_cep",
        citation,
        diagram: {
          caption: "Keep this supported caption.",
          spec: "DROP this unsupported diagram specification."
        }
      },
      {
        kind: "examples",
        text: "A supported paraphrase contains the retained term.",
        groundingProvenance: "generated"
      },
      {
        kind: "applications",
        text: "DROP this optional section and its removed term.",
        groundingProvenance: "generated"
      }
    ],
    explorableTerms: [
      { term: "retained term", sectionKind: "examples" },
      { term: "removed term", sectionKind: "applications" }
    ]
  };
}

const nodes = [{
  derivedNodeId: "node-1",
  label: "Bounded authorization",
  aliases: ["Limited authorization"],
  declaredDomain: "policy interpretation"
}];

const sourceEvidenceRead: SourceEvidenceReadPort = {
  async readSourceEvidence() {
    return [{
      sourceResourceId: "resource-1",
      sourceTitle: "Generated policy source",
      sourceBlockId: "block-1",
      blockType: "paragraph",
      headingPath: ["Authorization"],
      text: "A bounded authorization retains the stated exception and deadline. Keep this supported condition. Keep this supported caption. A supported paraphrase contains the retained term."
    }];
  }
};

function verifierRejectingDropMarkers(calls: string[]): SourceMaterialClaimSupportVerificationPort {
  return {
    model: "source-support-test",
    async verify(input) {
      calls.push(input.claim.claimKey);
      return input.claim.statement.includes("DROP")
        ? { disposition: "unsupported", reason: "The source does not support this exact field." }
        : { disposition: "supported", reason: "The source supports this exact field." };
    }
  };
}

test("lesson admission omits unsupported optional fields and assigns qualification only to the settled payload", async () => {
  const candidate = candidateLesson();
  const calls: string[] = [];
  const result = await admitSourceConceptLessons({
    candidates: [candidate],
    nodes,
    baseConfigHash: "base-config",
    sourceEvidenceRead,
    sourceSupportVerifier: verifierRejectingDropMarkers(calls)
  });

  assert.deepEqual(result.candidates, [candidate], "the exact pre-settlement payload remains available for artifact inspection");
  assert.equal(result.lessons.length, 1);
  assert.deepEqual(result.absent, []);
  assert.equal(result.evaluation.calls, calls.length);
  assert.equal(result.evaluation.calls, result.evaluation.decisions.length);

  const admitted = result.lessons[0]!;
  assert.equal(admitted.configHash, qualifiedSourceExpeditionAssetConfigHash("base-config"));
  assert.deepEqual(admitted.sections.map((section) => section.kind), ["definition", "examples"]);
  assert.deepEqual(admitted.sections[0]?.items, ["Keep this supported condition."]);
  assert.equal(admitted.sections[0]?.diagram, undefined, "a diagram is indivisible when either field lacks support");
  assert.equal(admitted.sections[1]?.groundingProvenance, "generated");
  assert.equal(admitted.sections[1]?.citation, undefined, "support never fabricates verbatim citation provenance");
  assert.deepEqual(admitted.explorableTerms, [{ term: "retained term", sectionKind: "examples" }]);
  assert.deepEqual(candidate, candidateLesson(), "settlement does not mutate the raw candidate");
});

test("an absent verifier preserves the candidate but admits no source-backed lesson", async () => {
  const result = await admitSourceConceptLessons({
    candidates: [candidateLesson()],
    nodes,
    baseConfigHash: "base-config",
    sourceEvidenceRead
  });

  assert.equal(result.lessons.length, 0);
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.absent, [{
    derivedNodeId: "node-1",
    canonicalLabel: "Bounded authorization",
    reason: "source-support verifier is not activated; the candidate remains inspection-only"
  }]);
  assert.equal(result.evaluation.calls, 0);
  assert.ok(result.evaluation.decisions.every((decision) =>
    decision.disposition === "not_evaluated" &&
    decision.reasonCode === "source_support_verifier_not_activated"
  ));
});

test("a source-evidence read failure is explicit and fail-closed", async () => {
  const result = await admitSourceConceptLessons({
    candidates: [candidateLesson()],
    nodes,
    baseConfigHash: "base-config",
    sourceEvidenceRead: {
      async readSourceEvidence() { throw new Error("source store unavailable"); }
    },
    sourceSupportVerifier: verifierRejectingDropMarkers([])
  });

  assert.equal(result.lessons.length, 0);
  assert.match(result.absent[0]?.reason ?? "", /source evidence could not be read/);
  assert.equal(result.evaluation.calls, 0);
  assert.ok(result.evaluation.decisions.every((decision) =>
    decision.disposition === "not_evaluated" &&
    decision.reasonCode === "source_evidence_read_unavailable"
  ));
});

test("an unsupported substantive body settles the lesson as absent without verifier-authored repair", async () => {
  const candidate = candidateLesson();
  candidate.sections = [
    {
      kind: "gist",
      text: "A supported optional overview.",
      groundingProvenance: "generated"
    },
    {
      kind: "definition",
      text: "DROP the only substantive body.",
      groundingProvenance: "source_cep",
      citation
    }
  ];
  candidate.explorableTerms = [];
  const result = await admitSourceConceptLessons({
    candidates: [candidate],
    nodes,
    baseConfigHash: "base-config",
    sourceEvidenceRead,
    sourceSupportVerifier: verifierRejectingDropMarkers([])
  });

  assert.equal(result.lessons.length, 0);
  assert.match(result.absent[0]?.reason ?? "", /retained no substantive section/);
  assert.equal(result.candidates[0]?.sections[1]?.text, "DROP the only substantive body.");
});
