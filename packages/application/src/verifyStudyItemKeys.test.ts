import assert from "node:assert/strict";
import { test } from "node:test";
import type { ImpostorItem, ImpostorStatement, OptionSelectItem, StudyItemCandidateVerdict } from "@lrnki/domain-core";
import type { StudyItemKeyVerificationPort } from "@lrnki/ports";
import {
  impostorKeyVetoReason,
  optionSelectKeyVetoReason,
  verifyStudyItemKeys,
  type KeyVerificationRegeneration,
  type KeyVerificationSubject
} from "./verifyStudyItemKeys";

// Study Item Key Verification (plan 2026-08-05-001 U3). Two things are under test and they are
// independent: the two answer-key uniqueness RULES (deterministic functions of verdicts), and
// the phase CONTROL FLOW around them (one informed regeneration, per-type unavailability).

const itemBase = {
  studyItemId: "item-1",
  graphVersionId: null,
  enrichmentId: "enr-1",
  derivedNodeId: "node-1",
  groundingProvenance: "generated" as const,
  generatingModel: "mock-gen",
  configHash: "cfg-1",
  explorableTerms: []
};

function optionSelectItem(options: { text: string; isCorrect: boolean }[]): OptionSelectItem {
  return {
    ...itemBase,
    itemType: "option_select",
    question: "Which statement describes this concept?",
    explanation: "An explanation.",
    options: options.map((option, index) => ({
      optionId: `opt-${index}`,
      text: option.text,
      isCorrect: option.isCorrect,
      provenance: "generated",
      ...(option.isCorrect ? { citation: { provenance: "generated" as const, derivedNodeId: "node-1", passageText: "A passage." } } : {})
    }))
  };
}

function impostorItem(statements: { text: string; isImpostor: boolean }[]): ImpostorItem {
  return {
    ...itemBase,
    itemType: "impostor",
    question: "Which statement is false?",
    statements: statements.map((statement, ordinal): ImpostorStatement =>
      statement.isImpostor
        ? { statementId: `st-${ordinal}`, ordinal, text: statement.text, isImpostor: true, provenance: "generated", reveal: "It is false.", lieSource: "generated" }
        : { statementId: `st-${ordinal}`, ordinal, text: statement.text, isImpostor: false, provenance: "generated", citation: { provenance: "generated", derivedNodeId: "node-1", passageText: "A passage." } })
  };
}

function verdicts(entries: Record<number, StudyItemCandidateVerdict["verdict"]>): StudyItemCandidateVerdict[] {
  return Object.entries(entries).map(([ordinal, verdict]) => ({ ordinal: Number(ordinal), verdict, reason: `judged ${verdict}` }));
}

// --- The rules ------------------------------------------------------------------------

test("option-select: a distractor judged true vetoes and the reason names it", () => {
  const item = optionSelectItem([
    { text: "The keyed correct answer.", isCorrect: true },
    { text: "A distractor that is also true.", isCorrect: false },
    { text: "A false distractor.", isCorrect: false },
    { text: "Another false distractor.", isCorrect: false }
  ]);
  const reason = optionSelectKeyVetoReason(item, verdicts({ 0: "claim_true", 1: "claim_true", 2: "claim_false", 3: "claim_false" }));
  assert.ok(reason);
  assert.match(reason, /distractor "A distractor that is also true\." was judged true/);
  // The keyed answer being true is not itself a defect — only the second true answer is.
  assert.equal(/keyed correct answer/.test(reason), false);
});

test("option-select: a keyed answer judged false vetoes", () => {
  const item = optionSelectItem([
    { text: "The keyed correct answer.", isCorrect: true },
    { text: "A distractor.", isCorrect: false },
    { text: "Another distractor.", isCorrect: false },
    { text: "A third distractor.", isCorrect: false }
  ]);
  const reason = optionSelectKeyVetoReason(item, verdicts({ 0: "claim_false", 1: "claim_false", 2: "claim_false", 3: "claim_false" }));
  assert.ok(reason);
  assert.match(reason, /the keyed correct answer "The keyed correct answer\." was judged false/);
});

test("option-select: unclear never vetoes, and neither does a verdict the judge never returned", () => {
  const item = optionSelectItem([
    { text: "The keyed correct answer.", isCorrect: true },
    { text: "A distractor.", isCorrect: false },
    { text: "Another distractor.", isCorrect: false },
    { text: "A third distractor.", isCorrect: false }
  ]);
  assert.equal(optionSelectKeyVetoReason(item, verdicts({ 0: "unclear", 1: "unclear", 2: "unclear", 3: "unclear" })), null);
  // A short response leaves ordinals 1–3 unjudged. "The judge did not say" is exactly as weak
  // a guarantee as "the judge was unsure", so neither may subtract an item (AGENTS rule 16).
  assert.equal(optionSelectKeyVetoReason(item, verdicts({ 0: "claim_true" })), null);
});

test("impostor: the captured Deep ocean return flow verdict set is rejected for a SECOND false statement", () => {
  // The exact defect this whole plan exists for, frozen in the plan's defect table: a stored
  // TRUE statement (ordinal 2) that is actually false, beside the keyed lie (ordinal 3). The
  // lie-only judge it replaces saw ordinal 3 alone and shipped the item, marking a learner
  // wrong for knowing that the DWBC is one limb OF the return flow, not a synonym for it.
  const item = impostorItem([
    { text: "Deep ocean return flow is the slow, continuous movement of cold, dense water masses along the ocean floor from high-latitude regions toward the equator and into other ocean basins.", isImpostor: false },
    { text: "Deep ocean return flow completes the lower limb of the global thermohaline circulation, balancing the surface currents that transport warm water poleward.", isImpostor: false },
    { text: "Deep ocean return flow is also known as the deep western boundary current.", isImpostor: false },
    { text: "Deep ocean return flow is driven primarily by wind-induced convergence of surface currents that pushes water downward into the ocean interior.", isImpostor: true }
  ]);
  const reason = impostorKeyVetoReason(item, verdicts({ 0: "claim_true", 1: "claim_true", 2: "claim_false", 3: "claim_false" }));
  assert.ok(reason, "an item with two false statements must not be admitted");
  assert.match(reason, /the true statement "Deep ocean return flow is also known as the deep western boundary current\." was judged false/);
  // The keyed lie WAS proven false, so the affirmative half of the rule is satisfied — the
  // veto comes entirely from the uniqueness half, which is what the old judge could not see.
  assert.equal(/planted lie/.test(reason), false);
});

test("impostor: a proven lie with three unclear truths is admitted", () => {
  const item = impostorItem([
    { text: "A true statement.", isImpostor: false },
    { text: "The planted lie.", isImpostor: true },
    { text: "Another true statement.", isImpostor: false },
    { text: "A third true statement.", isImpostor: false }
  ]);
  assert.equal(impostorKeyVetoReason(item, verdicts({ 0: "unclear", 1: "claim_false", 2: "unclear", 3: "unclear" })), null);
});

test("impostor: an unproven lie is not admitted, because proving it false is a standing requirement", () => {
  // NOT "unclear vetoes": the impostor's affirmative requirement predates this plan
  // (ADR-0026 — a true 'lie' teaches a falsehood; impostor-absent is the safe state).
  const item = impostorItem([
    { text: "A true statement.", isImpostor: false },
    { text: "The planted lie.", isImpostor: true },
    { text: "Another true statement.", isImpostor: false },
    { text: "A third true statement.", isImpostor: false }
  ]);
  for (const lieVerdict of ["unclear", "claim_true"] as const) {
    const reason = impostorKeyVetoReason(item, verdicts({ 0: "claim_true", 1: lieVerdict, 2: "claim_true", 3: "claim_true" }));
    assert.ok(reason, lieVerdict);
    assert.match(reason, /the planted lie "The planted lie\." was not judged false/);
  }
});

// --- The phase control flow -----------------------------------------------------------

function subject(text: string, regenerate: KeyVerificationSubject<OptionSelectItem>["regenerate"], citationRung: "verbatim" | "generated_passage_fallback" = "verbatim"): KeyVerificationSubject<OptionSelectItem> {
  const item = optionSelectItem([
    { text, isCorrect: true },
    { text: "A distractor.", isCorrect: false },
    { text: "Another distractor.", isCorrect: false },
    { text: "A third distractor.", isCorrect: false }
  ]);
  return {
    request: {
      itemType: "option_select",
      declaredDomain: "sentinel domain",
      node: { derivedNodeId: "node-1", canonicalLabel: "Node", aliases: [] },
      question: item.question,
      candidates: item.options.map((option, ordinal) => ({ ordinal, text: option.text })),
      groundingPassages: [],
      siblings: []
    },
    item,
    citationRung,
    regenerate
  };
}

function verifierReturning(sequence: StudyItemCandidateVerdict[][]): { port: StudyItemKeyVerificationPort; calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    port: {
      model: "mock-verifier",
      async verify() {
        const next = sequence[Math.min(calls, sequence.length - 1)];
        calls += 1;
        return next;
      }
    }
  };
}

test("a vetoed subject is regenerated exactly once and the SECOND verification judges the new candidates", async () => {
  const verifier = verifierReturning([
    verdicts({ 0: "claim_false" }),
    verdicts({ 0: "claim_true" })
  ]);
  const feedbacks: string[] = [];
  let regenerations = 0;
  const first = subject("The first keyed answer.", async (feedback): Promise<KeyVerificationRegeneration<OptionSelectItem>> => {
    feedbacks.push(feedback);
    regenerations += 1;
    return { ok: true, subject: subject("The regenerated keyed answer.", async () => ({ ok: false, reason: "a third round must never happen" })) };
  });

  const outcomes = await verifyStudyItemKeys([first], {
    verifier: verifier.port,
    vetoReason: (candidate, seen) => optionSelectKeyVetoReason(candidate.item, seen),
    onUnavailable: () => ({ admitted: false, reason: "unreachable in this test" })
  });

  assert.equal(regenerations, 1);
  assert.equal(verifier.calls(), 2);
  assert.match(feedbacks[0], /the keyed correct answer "The first keyed answer\." was judged false/);
  assert.equal(outcomes.length, 1);
  assert.ok(outcomes[0].admitted);
  assert.equal(outcomes[0].item.options[0].text, "The regenerated keyed answer.");
});

test("a failed regeneration rejects with the regeneration's own reason, and never re-verifies", async () => {
  const verifier = verifierReturning([verdicts({ 0: "claim_false" })]);
  const only = subject("The keyed answer.", async () => ({ ok: false, reason: "option-select generation failed: upstream 429" }));

  const outcomes = await verifyStudyItemKeys([only], {
    verifier: verifier.port,
    vetoReason: (candidate, seen) => optionSelectKeyVetoReason(candidate.item, seen),
    onUnavailable: () => ({ admitted: false, reason: "unreachable in this test" })
  });

  assert.equal(verifier.calls(), 1);
  assert.deepEqual(outcomes, [{ admitted: false, reason: "option-select generation failed: upstream 429" }]);
});

test("a thrown judge can never reach the uniqueness rule and routes to the per-type disposition", async () => {
  // gateByJudgment's load-bearing invariant, asserted at this caller: only a CONFIDENT verdict
  // may subtract an item, so `vetoReason` must be unreachable when the judge throws.
  let ruleCalls = 0;
  const throwing: StudyItemKeyVerificationPort = {
    model: "mock-verifier",
    async verify() { throw new Error("judge offline"); }
  };
  const anchored = subject("Anchored.", async () => ({ ok: false, reason: "unreachable" }));
  const unanchored = subject("Unanchored.", async () => ({ ok: false, reason: "unreachable" }), "generated_passage_fallback");

  const outcomes = await verifyStudyItemKeys([anchored, unanchored], {
    verifier: throwing,
    vetoReason: (candidate, seen) => { ruleCalls += 1; return optionSelectKeyVetoReason(candidate.item, seen); },
    onUnavailable: (candidate, error) =>
      candidate.citationRung === "verbatim"
        ? { admitted: true, item: candidate.item }
        : { admitted: false, reason: `no verbatim anchor: ${error instanceof Error ? error.message : String(error)}` }
  });

  assert.equal(ruleCalls, 0);
  assert.equal(outcomes[0].admitted, true);
  assert.deepEqual(outcomes[1], { admitted: false, reason: "no verbatim anchor: judge offline" });
});

test("outcomes stay index-aligned to the input when only some subjects are vetoed", async () => {
  // The merge back into per-node results walks the pending subset by cursor, so a gate that
  // reordered its outputs would silently attach one node's verdict to another node's item.
  let call = 0;
  const verifier: StudyItemKeyVerificationPort = {
    model: "mock-verifier",
    async verify(input) {
      const index = call;
      call += 1;
      // Resolve out of order: the second subject's judgment lands first.
      await new Promise((resolve) => setTimeout(resolve, index === 0 ? 12 : 0));
      return input.candidates[0].text.startsWith("Second") ? verdicts({ 0: "claim_false" }) : verdicts({ 0: "claim_true" });
    }
  };
  const subjects = [
    subject("First keyed answer.", async () => ({ ok: false, reason: "first regeneration failed" })),
    subject("Second keyed answer.", async () => ({ ok: false, reason: "second regeneration failed" })),
    subject("Third keyed answer.", async () => ({ ok: false, reason: "third regeneration failed" }))
  ];

  const outcomes = await verifyStudyItemKeys(subjects, {
    verifier,
    vetoReason: (candidate, seen) => optionSelectKeyVetoReason(candidate.item, seen),
    onUnavailable: () => ({ admitted: false, reason: "unreachable in this test" })
  });

  assert.equal(outcomes[0].admitted, true);
  assert.deepEqual(outcomes[1], { admitted: false, reason: "second regeneration failed" });
  assert.equal(outcomes[2].admitted, true);
});
