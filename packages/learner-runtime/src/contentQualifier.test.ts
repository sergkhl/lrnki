import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  canonicalContentRevision,
  projectQualifiedCatalog,
  qualifiedExpeditionRevision,
  qualifyCatalog,
  type CatalogQualification,
  type QualifiedCatalog
} from "./contentQualifier";
import {
  type AuthoredActivity,
  type AuthoredExpedition,
  type AuthoredImpostor,
  type AuthoredMatching,
  type AuthoredOptionSelect,
  type AuthoredStop
} from "./contentSchema";
import {
  CatalogQualificationError,
  loadQualifiedCatalogOrThrow
} from "./contentLoader";
import {
  createLearnerRuntime,
  MemoryLearnerStateStore
} from "./runtimeNode";

const baseCatalog = { schemaVersion: 1, expeditionKeys: ["critical-thinking"] } as const;

function sourceCreditKey(legNumber: number, stopNumber: number): "source-a" | "source-b" {
  return (legNumber + stopNumber) % 2 === 0 ? "source-a" : "source-b";
}

function optionSelect(stopKey: string, creditKey: string): AuthoredOptionSelect {
  return {
    family: "option_select",
    key: `${stopKey}-choice`,
    prompt: `Which interpretation best applies the distinction taught at ${stopKey}?`,
    options: [
      { key: `${stopKey}-correct`, text: "Use the stated distinction and preserve its limits." },
      { key: `${stopKey}-nearby`, text: "Use a nearby rule and ignore the stated limits." }
    ],
    answerKey: `${stopKey}-correct`,
    explanation: {
      text: "The keyed interpretation applies the taught distinction without extending it.",
      sourceCreditKeys: [creditKey]
    }
  };
}

function matching(stopKey: string, creditKey: string): AuthoredMatching {
  return {
    family: "matching",
    key: `${stopKey}-match`,
    prompt: "Match each reasoning move to its bounded consequence.",
    pairs: [
      { key: `${stopKey}-match-one`, left: "State the reference group", right: "Limits the conclusion" },
      { key: `${stopKey}-match-two`, left: "Name the assumption", right: "Exposes what could fail" }
    ],
    explanation: {
      text: "Reference groups bound scope, while assumptions expose conditions behind the inference.",
      sourceCreditKeys: [creditKey]
    }
  };
}

function impostor(stopKey: string, creditKey: string): AuthoredImpostor {
  return {
    family: "impostor",
    key: `${stopKey}-impostor`,
    prompt: "Find the statement that exceeds the evidence.",
    statements: [
      { key: `${stopKey}-truth-one`, text: "The conclusion is limited to the stated conditions.", kind: "truth" },
      { key: `${stopKey}-truth-two`, text: "A changed assumption can change the conclusion.", kind: "truth" },
      { key: `${stopKey}-false`, text: "One result settles every related case without qualification.", kind: "impostor" }
    ],
    explanation: {
      text: "The impostor removes the conditions that make the two bounded statements defensible.",
      sourceCreditKeys: [creditKey]
    }
  };
}

function candidateDocument(stopsPerLeg = 4): AuthoredExpedition {
  const legs = [1, 2, 3].map((legNumber) => {
    const legKey = `leg-${legNumber}`;
    const stops = Array.from({ length: stopsPerLeg }, (_, index): AuthoredStop => {
      const stopNumber = index + 1;
      const stopKey = `${legKey}-stop-${stopNumber}`;
      const previousStopKey = stopNumber > 1
        ? `${legKey}-stop-${stopNumber - 1}`
        : legNumber > 1
          ? `leg-${legNumber - 1}-stop-${stopsPerLeg}`
          : null;
      const creditKey = sourceCreditKey(legNumber, stopNumber);
      const activities: AuthoredActivity[] = [optionSelect(stopKey, creditKey)];
      if (stopNumber === stopsPerLeg && legNumber !== 2) {
        activities.push(matching(stopKey, creditKey));
      }
      if (stopNumber === stopsPerLeg && legNumber === 2) {
        activities.push(impostor(stopKey, creditKey));
      }
      const hasSupport = stopNumber === 2 && previousStopKey !== null;
      const term = "diagnostic contrast";
      const sectionKey = `${stopKey}-section`;
      const supportPathKey = `${stopKey}-support`;
      return {
        key: stopKey,
        label: `Leg ${legNumber} Stop ${stopNumber}`,
        requires: previousStopKey ? [previousStopKey] : [],
        difficultyBand: Math.min(5, stopNumber) as 1 | 2 | 3 | 4 | 5,
        lesson: {
          sections: [{
            key: sectionKey,
            title: `A bounded distinction for Stop ${stopNumber}`,
            body: `Use a ${term} to separate the intended claim from a nearby misconception at ${stopKey}.`,
            sourceCreditKeys: [creditKey],
            explorableTerms: hasSupport ? [{ term, supportPathKey }] : []
          }]
        },
        activities,
        supportPaths: hasSupport ? [{
          key: supportPathKey,
          term,
          sectionKey,
          steps: [{
            stopKey: previousStopKey,
            activityKey: `${previousStopKey}-choice`
          }]
        }] : []
      };
    });
    const lastStopKey = `${legKey}-stop-${stopsPerLeg}`;
    return {
      key: legKey,
      title: `Mastery arc ${legNumber}`,
      stops,
      guardianActivityKeys: [
        `${lastStopKey}-choice`,
        legNumber === 2 ? `${lastStopKey}-impostor` : `${lastStopKey}-match`
      ]
    };
  });

  return {
    schemaVersion: 2,
    key: "critical-thinking",
    title: "Critical Thinking contract candidate",
    teaser: "Exercise the complete authored-document contract without changing the live catalog.",
    declaredDomain: "Critical thinking",
    audience: "Adult learners",
    sourceCredits: [
      {
        key: "source-a",
        title: "Open reasoning guide",
        url: "https://example.org/reasoning-guide",
        publisher: "Example Institute",
        publishedAt: "2026-08-15",
        accessedAt: "2026-09-01",
        license: "CC BY 4.0"
      },
      {
        key: "source-b",
        title: "Evidence and decisions",
        url: "https://example.edu/evidence-and-decisions",
        author: "Example Faculty",
        version: "2026 edition",
        accessedAt: "2026-09-01",
        note: "Used only as a contract fixture."
      }
    ],
    legs,
    expeditionGuardianActivityKeys: [
      "leg-1-stop-1-choice",
      `leg-1-stop-${stopsPerLeg}-match`,
      `leg-2-stop-${stopsPerLeg}-impostor`
    ]
  };
}

const baseDocument = candidateDocument();

function cloneDocument(): AuthoredExpedition {
  return structuredClone(baseDocument);
}

function stop(document: AuthoredExpedition, key: string): AuthoredStop {
  const found = document.legs.flatMap((leg) => leg.stops).find((item) => item.key === key);
  assert.ok(found, `expected Stop ${key}`);
  return found;
}

function activity<T extends AuthoredActivity["family"]>(
  document: AuthoredExpedition,
  key: string,
  family: T
): Extract<AuthoredActivity, { family: T }> {
  const found = document.legs
    .flatMap((leg) => leg.stops)
    .flatMap((item) => item.activities)
    .find((item) => item.key === key);
  assert.equal(found?.family, family);
  return found as Extract<AuthoredActivity, { family: T }>;
}

function qualify(
  document: unknown = cloneDocument(),
  catalog: unknown = baseCatalog,
  extraExpeditions: ReadonlyMap<string, unknown> = new Map()
): CatalogQualification {
  return qualifyCatalog({
    catalog,
    expeditions: new Map<string, unknown>([
      ["critical-thinking", document],
      ...extraExpeditions
    ])
  });
}

function mustQualify(result: CatalogQualification): QualifiedCatalog {
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.diagnostics));
  return result.catalog;
}

function codes(result: CatalogQualification): Set<string> {
  assert.equal(result.ok, false, "expected catalog refusal");
  return new Set(result.diagnostics.map((diagnostic) => diagnostic.code));
}

function expectCode(result: CatalogQualification, code: string): void {
  assert.ok(codes(result).has(code), `expected diagnostic ${code}`);
}

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, nested]) => [key, reverseObjectKeys(nested)])
    );
  }
  return value;
}

test("the isolated three-Leg candidate qualifies as one opaque ordered catalog", () => {
  const catalog = mustQualify(qualify());
  assert.deepEqual(catalog.orderedKeys, ["critical-thinking"]);
  assert.match(catalog.catalogRevision, /^[a-f0-9]{64}$/);
  assert.match(qualifiedExpeditionRevision(catalog, "critical-thinking") ?? "", /^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(catalog));
  assert.ok(Object.isFrozen(projectQualifiedCatalog(catalog)[0]));
});

test("the final route contract accepts 4 and 7 Stops per Leg and refuses every adjacent size", () => {
  mustQualify(qualify(candidateDocument(4)));
  mustQualify(qualify(candidateDocument(7)));

  const twoLegs = cloneDocument();
  twoLegs.legs.pop();
  expectCode(qualify(twoLegs), "schema_invalid");

  const fourLegs = cloneDocument();
  fourLegs.legs.push(structuredClone(fourLegs.legs[0]!));
  expectCode(qualify(fourLegs), "schema_invalid");

  const threeStops = cloneDocument();
  threeStops.legs[0]!.stops.pop();
  expectCode(qualify(threeStops), "schema_invalid");

  const eightStops = candidateDocument(7);
  eightStops.legs[0]!.stops.push(structuredClone(eightStops.legs[0]!.stops[0]!));
  expectCode(qualify(eightStops), "schema_invalid");
});

test("canonical identity ignores JSON property order but includes every semantic and citation class", () => {
  const baseline = qualifiedExpeditionRevision(mustQualify(qualify()), "critical-thinking");
  assert.ok(baseline);
  const reordered = reverseObjectKeys(cloneDocument()) as AuthoredExpedition;
  assert.equal(canonicalContentRevision(baseDocument), canonicalContentRevision(reordered));
  assert.equal(qualifiedExpeditionRevision(mustQualify(qualify(reordered)), "critical-thinking"), baseline);

  const mutations: Array<Readonly<{ name: string; apply: (document: AuthoredExpedition) => void }>> = [
    { name: "lesson", apply: (document) => { stop(document, "leg-1-stop-1").lesson.sections[0]!.body += " Apply it deliberately."; } },
    { name: "answer", apply: (document) => { activity(document, "leg-1-stop-1-choice", "option_select").answerKey = "leg-1-stop-1-nearby"; } },
    { name: "order", apply: (document) => { activity(document, "leg-1-stop-1-choice", "option_select").options.reverse(); } },
    { name: "key", apply: (document) => { activity(document, "leg-1-stop-1-choice", "option_select").options[1]!.key = "leg-1-stop-1-revised"; } },
    { name: "prerequisite", apply: (document) => { stop(document, "leg-1-stop-2").requires = []; } },
    {
      name: "Support",
      apply: (document) => {
        const supported = stop(document, "leg-1-stop-2");
        supported.supportPaths[0]!.key = "leg-1-stop-2-revised-support";
        supported.lesson.sections[0]!.explorableTerms[0]!.supportPathKey = "leg-1-stop-2-revised-support";
      }
    },
    { name: "Guardian", apply: (document) => { document.expeditionGuardianActivityKeys.reverse(); } },
    { name: "source metadata", apply: (document) => { document.sourceCredits[0]!.note = "Revised scope note."; } },
    { name: "source assignment", apply: (document) => { stop(document, "leg-1-stop-1").lesson.sections[0]!.sourceCreditKeys = ["source-b"]; } }
  ];

  for (const mutation of mutations) {
    const document = cloneDocument();
    mutation.apply(document);
    const revision = qualifiedExpeditionRevision(mustQualify(qualify(document)), "critical-thinking");
    assert.notEqual(revision, baseline, mutation.name);
  }
});

test("online source credits and their assignments fail closed", () => {
  const insecure = cloneDocument();
  insecure.sourceCredits[0]!.url = "http://example.org/reasoning-guide";
  expectCode(qualify(insecure), "schema_invalid");

  const unidentified = cloneDocument();
  delete unidentified.sourceCredits[0]!.author;
  delete unidentified.sourceCredits[0]!.publisher;
  expectCode(qualify(unidentified), "schema_invalid");

  const duplicateCredit = cloneDocument();
  duplicateCredit.sourceCredits.push(structuredClone(duplicateCredit.sourceCredits[0]!));
  expectCode(qualify(duplicateCredit), "source_credit_key_duplicate");

  const dangling = cloneDocument();
  stop(dangling, "leg-1-stop-1").lesson.sections[0]!.sourceCreditKeys = ["missing-source"];
  expectCode(qualify(dangling), "source_credit_reference_missing");

  const duplicateReference = cloneDocument();
  stop(duplicateReference, "leg-1-stop-1").lesson.sections[0]!.sourceCreditKeys = ["source-a", "source-a"];
  expectCode(qualify(duplicateReference), "source_credit_reference_duplicate");

  const emptyReference = cloneDocument();
  stop(emptyReference, "leg-1-stop-1").lesson.sections[0]!.sourceCreditKeys = [];
  expectCode(qualify(emptyReference), "schema_invalid");

  const unreferenced = cloneDocument();
  unreferenced.sourceCredits.push({
    key: "source-c",
    title: "Unused source",
    url: "https://example.net/unused",
    publisher: "Example Publisher",
    accessedAt: "2026-09-01"
  });
  expectCode(qualify(unreferenced), "source_credit_unreferenced");
});

test("catalog membership is exact and refusal is all-or-nothing", () => {
  expectCode(
    qualify(cloneDocument(), { schemaVersion: 1, expeditionKeys: ["critical-thinking", "critical-thinking"] }),
    "catalog_key_duplicate"
  );
  expectCode(qualify(cloneDocument(), baseCatalog, new Map([["unlisted", cloneDocument()]])), "catalog_expedition_extra");
  const missing = qualifyCatalog({ catalog: baseCatalog, expeditions: new Map() });
  assert.ok(codes(missing).has("catalog_expedition_missing"));
  assert.equal("catalog" in missing && missing.catalog, false);
});

test("schemas refuse malformed versions, unknown fields, and mismatched keys", () => {
  const malformed = cloneDocument();
  Object.assign(malformed, { schemaVersion: 3, unexpected: true });
  expectCode(qualify(malformed), "schema_invalid");

  const mismatched = cloneDocument();
  mismatched.key = "different-key";
  expectCode(qualify(mismatched), "expedition_key_mismatch");
});

test("authored keys and prerequisite references are unique, resolvable, acyclic, and ordered", () => {
  const duplicateStop = cloneDocument();
  stop(duplicateStop, "leg-1-stop-2").key = "leg-1-stop-1";
  expectCode(qualify(duplicateStop), "stop_key_duplicate");

  const missing = cloneDocument();
  stop(missing, "leg-1-stop-2").requires = ["missing-stop"];
  expectCode(qualify(missing), "prerequisite_missing");

  const outOfOrder = cloneDocument();
  stop(outOfOrder, "leg-1-stop-1").requires = ["leg-1-stop-2"];
  const outOfOrderCodes = codes(qualify(outOfOrder));
  assert.ok(outOfOrderCodes.has("prerequisite_order_invalid"));
  assert.ok(outOfOrderCodes.has("prerequisite_cycle"));

  const duplicateRequire = cloneDocument();
  stop(duplicateRequire, "leg-1-stop-2").requires = ["leg-1-stop-1", "leg-1-stop-1"];
  expectCode(qualify(duplicateRequire), "prerequisite_duplicate");
});

test("every Stop, Leg, and Expedition carries the required activity-family shape", () => {
  const noOption = cloneDocument();
  const replacement = structuredClone(activity(noOption, "leg-1-stop-4-match", "matching"));
  replacement.key = "leg-1-stop-1-replacement-match";
  stop(noOption, "leg-1-stop-1").activities = [replacement];
  expectCode(qualify(noOption), "stop_option_select_missing");

  const optionOnly = cloneDocument();
  for (const leg of optionOnly.legs) {
    for (const item of leg.stops) {
      item.activities = item.activities.filter((candidate) => candidate.family === "option_select");
    }
    leg.guardianActivityKeys = [`${leg.key}-stop-4-choice`];
  }
  optionOnly.expeditionGuardianActivityKeys = ["leg-1-stop-1-choice"];
  const optionOnlyCodes = codes(qualify(optionOnly));
  assert.ok(optionOnlyCodes.has("leg_non_option_activity_missing"));
  assert.ok(optionOnlyCodes.has("guardian_non_option_activity_missing"));
  assert.ok(optionOnlyCodes.has("expedition_activity_family_missing"));
  assert.ok(optionOnlyCodes.has("expedition_guardian_family_missing"));
});

test("option-select, matching, and impostor keys remain structurally unambiguous", () => {
  const missingAnswer = cloneDocument();
  activity(missingAnswer, "leg-1-stop-1-choice", "option_select").answerKey = "not-an-option";
  expectCode(qualify(missingAnswer), "answer_key_invalid");

  const duplicateText = cloneDocument();
  const options = activity(duplicateText, "leg-1-stop-1-choice", "option_select").options;
  options[1]!.text = options[0]!.text;
  expectCode(qualify(duplicateText), "option_text_duplicate");

  const nonBijection = cloneDocument();
  const pairs = activity(nonBijection, "leg-1-stop-4-match", "matching").pairs;
  pairs[1]!.right = pairs[0]!.right;
  expectCode(qualify(nonBijection), "matching_right_duplicate");

  const twoLies = cloneDocument();
  activity(twoLies, "leg-2-stop-4-impostor", "impostor").statements[0]!.kind = "impostor";
  expectCode(qualify(twoLies), "impostor_key_invalid");
});

test("Explorable Terms and Support Paths refuse missing, mismatched, parent, and non-option targets", () => {
  const notRendered = cloneDocument();
  stop(notRendered, "leg-1-stop-2").lesson.sections[0]!.explorableTerms[0]!.term = "missing rendered term";
  const renderedCodes = codes(qualify(notRendered));
  assert.ok(renderedCodes.has("explorable_term_not_rendered"));
  assert.ok(renderedCodes.has("explorable_support_mismatch"));

  const parentTarget = cloneDocument();
  stop(parentTarget, "leg-1-stop-2").supportPaths[0]!.steps[0] = {
    stopKey: "leg-1-stop-2",
    activityKey: "leg-1-stop-2-choice"
  };
  expectCode(qualify(parentTarget), "support_parent_target_invalid");

  const missingTarget = cloneDocument();
  stop(missingTarget, "leg-1-stop-2").supportPaths[0]!.steps[0]!.activityKey = "missing-activity";
  expectCode(qualify(missingTarget), "support_activity_missing");

  const wrongFamily = cloneDocument();
  stop(wrongFamily, "leg-1-stop-2").supportPaths[0]!.steps[0] = {
    stopKey: "leg-1-stop-4",
    activityKey: "leg-1-stop-4-match"
  };
  expectCode(qualify(wrongFamily), "support_activity_family_invalid");
});

test("Guardian pools refuse missing, duplicate, and family-incomplete references", () => {
  const missing = cloneDocument();
  missing.legs[0]!.guardianActivityKeys = ["missing-activity"];
  expectCode(qualify(missing), "guardian_activity_invalid");

  const duplicate = cloneDocument();
  duplicate.expeditionGuardianActivityKeys.push("leg-1-stop-1-choice");
  expectCode(qualify(duplicate), "guardian_activity_duplicate");

  const incomplete = cloneDocument();
  incomplete.expeditionGuardianActivityKeys = ["leg-1-stop-1-choice"];
  expectCode(qualify(incomplete), "expedition_guardian_family_missing");
});

test("learner projection exposes Lesson citations but keeps grading and explanation citations private", () => {
  const projection = projectQualifiedCatalog(mustQualify(qualify()))[0]!;
  assert.deepEqual(projection.sourceCredits.map((credit) => credit.key), ["source-a", "source-b"]);
  assert.equal(projection.sourceCredits[0]!.url, "https://example.org/reasoning-guide");
  assert.deepEqual(projection.legs[0]!.stops[0]!.lesson.sections[0]!.sourceCreditKeys, ["source-a"]);

  const projectedActivities = projection.legs.flatMap((leg) => leg.stops.flatMap((item) => item.activities));
  const projectedChoice = projectedActivities.find((item) => item.key === "leg-1-stop-1-choice")!;
  for (const privateField of ["answerKey", "explanation", "sourceCreditKeys", "kind", "pairs"]) {
    assert.equal(Object.hasOwn(projectedChoice, privateField), false, privateField);
  }

  const projectedMatching = projectedActivities.find((item) => item.family === "matching");
  assert.equal(projectedMatching?.family, "matching");
  const leftKeys = new Set(projectedMatching.left.map((item) => item.key));
  assert.ok(projectedMatching.right.every((item) => !leftKeys.has(item.key)));
});

test("learner projection removes authored position as a correctness channel", () => {
  const document = cloneDocument();
  document.legs[0]!.stops[2]!.activities.push(
    impostor("leg-1-stop-3", sourceCreditKey(1, 3))
  );
  const projection = projectQualifiedCatalog(mustQualify(qualify(document)))[0]!;
  const projectedActivities = projection.legs.flatMap((leg) =>
    leg.stops.flatMap((item) => item.activities)
  );

  const optionPositions = document.legs
    .flatMap((leg) => leg.stops)
    .flatMap((item) => item.activities)
    .filter((item): item is AuthoredOptionSelect => item.family === "option_select")
    .map((privateActivity) => {
      const publicActivity = projectedActivities.find((item) => item.key === privateActivity.key);
      assert.equal(publicActivity?.family, "option_select");
      return publicActivity.options.findIndex((option) => option.key === privateActivity.answerKey);
    });
  assert.ok(new Set(optionPositions).size > 1, "option keys retained one universal position");

  const impostorPositions = document.legs
    .flatMap((leg) => leg.stops)
    .flatMap((item) => item.activities)
    .filter((item): item is AuthoredImpostor => item.family === "impostor")
    .map((privateActivity) => {
      const privateKey = privateActivity.statements.find((item) => item.kind === "impostor")?.key;
      const publicActivity = projectedActivities.find((item) => item.key === privateActivity.key);
      assert.ok(privateKey);
      assert.equal(publicActivity?.family, "impostor");
      return publicActivity.statements.findIndex((statement) => statement.key === privateKey);
    });
  assert.ok(new Set(impostorPositions).size > 1, "impostors retained one universal position");

  const matchingPositionMaps = document.legs
    .flatMap((leg) => leg.stops)
    .flatMap((item) => item.activities)
    .filter((item): item is AuthoredMatching => item.family === "matching")
    .map((privateActivity) => {
      const publicActivity = projectedActivities.find((item) => item.key === privateActivity.key);
      assert.equal(publicActivity?.family, "matching");
      return publicActivity.left.map((left) => {
        const pair = privateActivity.pairs.find((candidate) => candidate.left === left.text);
        assert.ok(pair);
        return publicActivity.right.findIndex((right) => right.text === pair.right);
      });
    });
  assert.ok(
    new Set(matchingPositionMaps.map((positions) => JSON.stringify(positions))).size > 1,
    "matching boards retained one universal positional map"
  );

  const reordered = structuredClone(document);
  for (const privateActivity of reordered.legs
    .flatMap((leg) => leg.stops)
    .flatMap((item) => item.activities)) {
    if (privateActivity.family === "option_select") privateActivity.options.reverse();
    if (privateActivity.family === "matching") privateActivity.pairs.reverse();
    if (privateActivity.family === "impostor") privateActivity.statements.reverse();
  }
  const reorderedProjection = projectQualifiedCatalog(mustQualify(qualify(reordered)))[0]!;
  assert.deepEqual(
    reorderedProjection.legs.map((leg) =>
      leg.stops.map((item) => item.activities)
    ),
    projection.legs.map((leg) =>
      leg.stops.map((item) => item.activities)
    ),
    "authored array order changed public answer positions"
  );
});

test("the learner-runtime interface reveals explanation citations only in the graded effect", async () => {
  const catalog = mustQualify(qualify());
  const store = new MemoryLearnerStateStore([{ learnerRef: "learner-a", displayName: "Explorer A" }]);
  const runtime = createLearnerRuntime({
    catalog,
    stateStore: store,
    now: () => new Date("2026-09-01T00:00:00.000Z")
  });
  const adopt = await runtime.dispatch("learner-a", {
    requestId: "adopt",
    expectedStateVersion: 0n,
    command: { kind: "adopt_expedition", expeditionKey: "critical-thinking" }
  });
  assert.equal(adopt.status, "applied");
  assert.deepEqual(adopt.effect.feedbackSourceCreditKeys, []);

  const lesson = await runtime.dispatch("learner-a", {
    requestId: "lesson",
    expectedStateVersion: adopt.stateVersion,
    command: { kind: "record_lesson_read", expeditionKey: "critical-thinking", stopKey: "leg-1-stop-1" }
  });
  assert.equal(lesson.status, "applied");

  const command = {
    kind: "answer_option_select" as const,
    expeditionKey: "critical-thinking",
    stopKey: "leg-1-stop-1",
    activityKey: "leg-1-stop-1-choice",
    chosenOptionKey: "leg-1-stop-1-correct",
    source: { kind: "trail" as const }
  };
  const answered = await runtime.dispatch("learner-a", {
    requestId: "answer",
    expectedStateVersion: lesson.stateVersion,
    command
  });
  assert.equal(answered.status, "applied");
  assert.equal(answered.effect.feedback, "The keyed interpretation applies the taught distinction without extending it.");
  assert.deepEqual(answered.effect.feedbackSourceCreditKeys, ["source-a"]);

  const replayed = await runtime.dispatch("learner-a", {
    requestId: "answer",
    expectedStateVersion: answered.stateVersion,
    command
  });
  assert.equal(replayed.status, "applied");
  assert.equal(replayed.replayed, true);
  assert.deepEqual(replayed.effect.feedbackSourceCreditKeys, ["source-a"]);
});

test("the filesystem seam needs only catalog.json and the exact Expedition document", async () => {
  const root = await mkdtemp(join(tmpdir(), "lrnki-authored-content-v2-"));
  try {
    const expeditionRoot = join(root, "expeditions", "critical-thinking");
    await mkdir(expeditionRoot, { recursive: true });
    await writeFile(join(root, "catalog.json"), JSON.stringify(baseCatalog), "utf8");
    await writeFile(join(expeditionRoot, "expedition.json"), JSON.stringify(baseDocument), "utf8");
    const accepted = await loadQualifiedCatalogOrThrow(root);
    assert.deepEqual(accepted.orderedKeys, ["critical-thinking"]);

    await writeFile(join(expeditionRoot, "expedition.json"), "{", "utf8");
    await assert.rejects(
      () => loadQualifiedCatalogOrThrow(root),
      (error: unknown) =>
        error instanceof CatalogQualificationError &&
        error.diagnostics.some((diagnostic) => diagnostic.code === "content_json_invalid")
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
