import assert from "node:assert/strict";
import test from "node:test";
import type { AdmissionLabelJudgment, CandidateTier, RunCandidate } from "@lrnki/domain-core";
import type { AdmissionLabelJudgmentPort } from "@lrnki/ports";
import { applyAdmissionLabelJudge } from "./applyAdmissionLabelJudge";

function candidate(tier: CandidateTier = "core", overrides: Partial<RunCandidate> = {}): RunCandidate {
  return {
    candidateKey: "operator-set",
    parentCandidateKey: "operator-set",
    discoveredLabel: "Operator Set",
    canonicalLabel: "Operator Set as Bottleneck to Performance",
    normalizedLabel: "operator set as bottleneck to performance",
    aliases: ["Operator Set"],
    mentions: [{ blockId: "block-1", evidenceQuote: "The operator set is the bottleneck to performance." }],
    admission: {
      modelTier: "core",
      tier,
      sourceRole: "declared_domain_concept",
      proposedCanonicalLabel: "Operator Set as Bottleneck to Performance",
      standaloneLearningObjective: { modelPassed: true, passed: true, rationale: "", submittedEvidence: [], evidence: [] },
      establishedDomainMeaning: { modelPassed: true, passed: true, rationale: "", submittedEvidence: [], evidence: [] },
      definitionBearingTreatment: { modelPassed: true, passed: true, rationale: "", submittedEvidence: [], evidence: [] },
      organizingPower: { modelPassed: true, passed: true, rationale: "", submittedAspects: [], aspects: [] },
      coreSelected: true,
      selectionReasonCode: "source_level_core",
      reasonCodes: [],
      boundaryReasonCodes: [],
      confidence: 0.9
    },
    ...overrides
  };
}

type Verdict = () => Promise<AdmissionLabelJudgment> | AdmissionLabelJudgment;

function judgePort(verdict?: Verdict): AdmissionLabelJudgmentPort {
  return {
    model: "fake-admission-judge",
    judge: async () => (verdict ?? (() => { throw new Error("judge() not expected"); }))()
  };
}

const conceptVerdict: AdmissionLabelJudgment = { labelKind: "concept", underlyingNounPhrase: "", groundingSpan: "", rationale: "names a concept" };
const propositionVerdict: AdmissionLabelJudgment = {
  labelKind: "proposition_or_claim",
  underlyingNounPhrase: "Operator Set",
  groundingSpan: "operator set is the bottleneck to performance",
  rationale: "asserts a claim"
};

test("demotes a core candidate judged a proposition to optional with the underlying noun phrase", async () => {
  const judge = judgePort(() => propositionVerdict);
  const [result] = await applyAdmissionLabelJudge({ candidates: [candidate()], declaredDomain: "machine learning", judge });
  assert.equal(result.admission.tier, "optional");
  assert.ok(result.admission.boundaryReasonCodes.includes("proposition_label_judged"));
  assert.ok(result.admission.boundaryReasonCodes.some((code) => code.includes("Operator Set")));
});

test("keeps a core candidate judged a concept as core", async () => {
  const judge = judgePort(() => conceptVerdict);
  const [result] = await applyAdmissionLabelJudge({ candidates: [candidate()], declaredDomain: "machine learning", judge });
  assert.equal(result.admission.tier, "core");
  assert.deepEqual(result.admission.boundaryReasonCodes, []);
});

test("fails closed to core when the judge transport throws (preserve recall)", async () => {
  const judge = judgePort(() => { throw new Error("boom"); });
  const [result] = await applyAdmissionLabelJudge({ candidates: [candidate()], declaredDomain: "machine learning", judge });
  assert.equal(result.admission.tier, "core");
});

test("only judges core candidates; optional/reject/quarantine are untouched", async () => {
  let calls = 0;
  const judge = judgePort(() => { calls++; return propositionVerdict; });
  const candidates = [
    candidate("optional", { candidateKey: "opt" }),
    candidate("reject", { candidateKey: "rej" }),
    candidate("quarantine", { candidateKey: "quar" })
  ];
  const result = await applyAdmissionLabelJudge({ candidates, declaredDomain: "machine learning", judge });
  assert.equal(calls, 0);
  assert.deepEqual(result.map((c) => c.admission.tier), ["optional", "reject", "quarantine"]);
});
