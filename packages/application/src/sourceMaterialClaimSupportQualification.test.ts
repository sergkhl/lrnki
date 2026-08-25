import assert from "node:assert/strict";
import { test } from "node:test";
import type { SourceMaterialClaimSupportVerificationPort } from "@lrnki/ports";
import {
  parseSourceMaterialClaimSupportQualificationMatrix,
  qualifySourceMaterialClaimSupport,
  type SourceMaterialClaimSupportQualificationMatrix
} from "./sourceMaterialClaimSupportQualification";

const source = {
  path: "fixtures/example.txt",
  contentType: "text/plain",
  sourceClass: "project_diagnostic" as const,
  declaredDomain: "sentinel domain",
  subject: { canonicalLabel: "Sentinel subject", aliases: ["sentinel alias"] }
};

function matrix(cases: SourceMaterialClaimSupportQualificationMatrix["cases"]): SourceMaterialClaimSupportQualificationMatrix {
  return {
    schemaVersion: "lrnki.source-material-claim-support-qualification.v1",
    drawsPerCase: 2,
    maximumFalseAcceptances: 0,
    maximumFalseRejectionRate: 0.25,
    sources: [source],
    cases
  };
}

const supportedCase = {
  id: "supported",
  source: source.path,
  harmClass: "supported_claim",
  expected: "supported" as const,
  evidenceQuotes: ["The source establishes the sentinel condition."],
  claim: "The sentinel condition is established."
};

const unsupportedCase = {
  id: "unsupported",
  source: source.path,
  harmClass: "contradiction",
  expected: "unsupported" as const,
  evidenceQuotes: ["The source rejects the contrary condition."],
  claim: "The contrary condition holds."
};

test("the qualification parser preserves the closed matrix and rejects duplicate ids", () => {
  const parsed = parseSourceMaterialClaimSupportQualificationMatrix(matrix([supportedCase, unsupportedCase]));
  assert.equal(parsed.drawsPerCase, 2);
  assert.deepEqual(parsed.cases.map((entry) => entry.id), ["supported", "unsupported"]);
  assert.throws(
    () => parseSourceMaterialClaimSupportQualificationMatrix(matrix([supportedCase, supportedCase])),
    /case ids must be unique/
  );
  assert.throws(
    () => parseSourceMaterialClaimSupportQualificationMatrix({
      ...matrix([supportedCase, unsupportedCase]),
      maximumFalseAcceptances: 1
    }),
    /maximumFalseAcceptances must be an integer from 0 through 0/
  );
});

test("qualification uses the exact one-claim production port and records repeated agreement", async () => {
  const inputs: Parameters<SourceMaterialClaimSupportVerificationPort["verify"]>[0][] = [];
  const verifier: SourceMaterialClaimSupportVerificationPort = {
    model: "qualified-model",
    async verify(input) {
      inputs.push(input);
      return input.claim.claimKey === supportedCase.id
        ? { disposition: "supported", reason: "Every material field is established." }
        : { disposition: "unsupported", reason: "The evidence contradicts the claim." };
    }
  };
  const report = await qualifySourceMaterialClaimSupport({
    matrix: matrix([supportedCase, unsupportedCase]),
    verifier,
    resolveEvidence
  });
  assert.equal(report.summary.passed, true);
  assert.equal(report.summary.completedDraws, 4);
  assert.equal(report.summary.falseAcceptances, 0);
  assert.equal(report.summary.falseRejections, 0);
  assert.deepEqual(report.caseAgreement.map((entry) => entry.unanimous), [true, true]);
  assert.equal(inputs[0]?.claim.statement, supportedCase.claim);
  assert.equal(inputs[0]?.evidence[0]?.blockText, `Complete block: ${supportedCase.evidenceQuotes[0]}`);
  assert.equal(inputs[0]?.evidence[0]?.citedQuote, supportedCase.evidenceQuotes[0]);
  assert.equal(inputs[0]?.evidence[0]?.direct, true);
});

test("qualification stops on the first material false acceptance", async () => {
  let calls = 0;
  const report = await qualifySourceMaterialClaimSupport({
    matrix: matrix([unsupportedCase, supportedCase]),
    resolveEvidence,
    verifier: {
      model: "unsafe-model",
      async verify() {
        calls += 1;
        return { disposition: "supported", reason: "Unsafe over-acceptance." };
      }
    }
  });
  assert.equal(calls, 1);
  assert.equal(report.summary.stoppedEarly, true);
  assert.equal(report.summary.complete, false);
  assert.equal(report.summary.falseAcceptances, 1);
  assert.equal(report.summary.passed, false);
});

test("qualification records transport unavailability and stops without calling it correctness", async () => {
  const report = await qualifySourceMaterialClaimSupport({
    matrix: matrix([supportedCase, unsupportedCase]),
    resolveEvidence,
    verifier: {
      model: "unavailable-model",
      async verify() {
        throw new Error("provider unavailable");
      }
    }
  });
  assert.equal(report.summary.completedDraws, 1);
  assert.equal(report.summary.unavailableDraws, 1);
  assert.equal(report.observations[0]?.correct, false);
  assert.equal(report.summary.passed, false);
});

function resolveEvidence(testCase: SourceMaterialClaimSupportQualificationMatrix["cases"][number]) {
  return testCase.evidenceQuotes.map((citedQuote) => ({
    blockText: `Complete block: ${citedQuote}`,
    citedQuote
  }));
}
