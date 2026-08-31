import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type {
  AuthoredExpedition,
  AuthoredImpostor,
  AuthoredMatching,
  AuthoredOptionSelect,
  AuthoredStop
} from "./contentSchema";
import {
  canonicalContentRevision,
  projectQualifiedCatalog,
  qualifiedExpeditionRevision,
  qualifyCatalog,
  type CatalogQualification,
  type QualifiedCatalog
} from "./contentQualifier";
import {
  CatalogQualificationError,
  loadAndQualifyCatalog,
  loadQualifiedCatalogOrThrow
} from "./contentLoader";

const repositoryRoot = new URL("../../../", import.meta.url);
const contentRoot = new URL("content/", repositoryRoot);
const baseCatalog = JSON.parse(
  await readFile(new URL("catalog.json", contentRoot), "utf8")
) as unknown;
const baseDocument = JSON.parse(
  await readFile(
    new URL("expeditions/critical-thinking/expedition.json", contentRoot),
    "utf8"
  )
) as AuthoredExpedition;
const baseSource = await readFile(
  new URL("expeditions/critical-thinking/source.md", contentRoot),
  "utf8"
);

function cloneDocument(): AuthoredExpedition {
  return structuredClone(baseDocument);
}

function stop(document: AuthoredExpedition, key: string): AuthoredStop {
  const found = document.legs.flatMap((leg) => leg.stops).find((item) => item.key === key);
  assert.ok(found, `expected Stop ${key}`);
  return found;
}

function optionSelect(document: AuthoredExpedition, key: string): AuthoredOptionSelect {
  const found = document.legs
    .flatMap((leg) => leg.stops)
    .flatMap((item) => item.activities)
    .find((activity) => activity.key === key);
  assert.equal(found?.family, "option_select");
  return found;
}

function matching(document: AuthoredExpedition, key: string): AuthoredMatching {
  const found = document.legs
    .flatMap((leg) => leg.stops)
    .flatMap((item) => item.activities)
    .find((activity) => activity.key === key);
  assert.equal(found?.family, "matching");
  return found;
}

function impostor(document: AuthoredExpedition, key: string): AuthoredImpostor {
  const found = document.legs
    .flatMap((leg) => leg.stops)
    .flatMap((item) => item.activities)
    .find((activity) => activity.key === key);
  assert.equal(found?.family, "impostor");
  return found;
}

function qualify(
  document: unknown = cloneDocument(),
  source = baseSource,
  catalog: unknown = baseCatalog,
  extraExpeditions: ReadonlyMap<string, unknown> = new Map(),
  extraSources: ReadonlyMap<string, string> = new Map()
): CatalogQualification {
  return qualifyCatalog({
    catalog,
    expeditions: new Map<string, unknown>([
      ["critical-thinking", document],
      ...extraExpeditions
    ]),
    sources: new Map<string, string>([
      ["critical-thinking", source],
      ...extraSources
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
  if (Array.isArray(value)) {
    return value.map(reverseObjectKeys);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, nested]) => [key, reverseObjectKeys(nested)])
    );
  }
  return value;
}

test("the checked-in Critical Thinking document qualifies as one opaque ordered catalog", () => {
  const catalog = mustQualify(qualify());
  assert.deepEqual(catalog.orderedKeys, ["critical-thinking"]);
  assert.match(catalog.catalogRevision, /^[a-f0-9]{64}$/);
  assert.match(
    qualifiedExpeditionRevision(catalog, "critical-thinking") ?? "",
    /^[a-f0-9]{64}$/
  );
  assert.ok(Object.isFrozen(catalog));
  assert.ok(Object.isFrozen(projectQualifiedCatalog(catalog)[0]));
});

test("canonical identity ignores JSON property order and formatting", () => {
  const original = mustQualify(qualify());
  const reordered = mustQualify(qualify(reverseObjectKeys(cloneDocument())));
  assert.equal(
    qualifiedExpeditionRevision(original, "critical-thinking"),
    qualifiedExpeditionRevision(reordered, "critical-thinking")
  );
  assert.equal(original.catalogRevision, reordered.catalogRevision);
  assert.equal(
    canonicalContentRevision(baseDocument, baseSource),
    canonicalContentRevision(reverseObjectKeys(baseDocument) as AuthoredExpedition, baseSource)
  );
});

test("every semantic content and source identity class invalidates the revision", () => {
  const baseline = qualifiedExpeditionRevision(mustQualify(qualify()), "critical-thinking");
  assert.ok(baseline);

  const mutations: Array<Readonly<{ name: string; apply: (document: AuthoredExpedition) => void }>> = [
    {
      name: "semantic lesson text",
      apply: (document) => {
        stop(document, "argument-structure").lesson.sections[0]!.body += " Practice makes the structure easier to see.";
      }
    },
    {
      name: "answer",
      apply: (document) => {
        optionSelect(document, "identify-conclusion").answerKey = "southern-road-open";
      }
    },
    {
      name: "ordering",
      apply: (document) => {
        optionSelect(document, "identify-conclusion").options.reverse();
      }
    },
    {
      name: "authored key",
      apply: (document) => {
        optionSelect(document, "identify-conclusion").options[0]!.key = "flooded-northern-road";
      }
    },
    {
      name: "prerequisite",
      apply: (document) => {
        stop(document, "evidence-quality").requires = [];
      }
    },
    {
      name: "Support",
      apply: (document) => {
        const evidence = stop(document, "evidence-quality");
        evidence.supportPaths[0]!.key = "revisit-support-relationship";
        evidence.lesson.sections[1]!.explorableTerms[0]!.supportPathKey =
          "revisit-support-relationship";
      }
    },
    {
      name: "Guardian",
      apply: (document) => {
        document.expeditionGuardianActivityKeys.reverse();
      }
    },
    {
      name: "source disclosure",
      apply: (document) => {
        document.sourceCredits[0]!.note = "Revised local playtest disclosure.";
      }
    }
  ];

  for (const mutation of mutations) {
    const document = cloneDocument();
    mutation.apply(document);
    const revision = qualifiedExpeditionRevision(
      mustQualify(qualify(document)),
      "critical-thinking"
    );
    assert.notEqual(revision, baseline, mutation.name);
  }

  const sourceRevision = qualifiedExpeditionRevision(
    mustQualify(qualify(cloneDocument(), `${baseSource}\n`)),
    "critical-thinking"
  );
  assert.notEqual(sourceRevision, baseline, "source bytes");
});

test("catalog membership is exact and refusal is all-or-nothing", () => {
  expectCode(
    qualify(
      cloneDocument(),
      baseSource,
      { schemaVersion: 1, expeditionKeys: ["critical-thinking", "critical-thinking"] }
    ),
    "catalog_key_duplicate"
  );
  expectCode(
    qualify(
      cloneDocument(),
      baseSource,
      baseCatalog,
      new Map([["unlisted", cloneDocument()]]),
      new Map([["unlisted", baseSource]])
    ),
    "catalog_expedition_extra"
  );
  const missing = qualifyCatalog({
    catalog: baseCatalog,
    expeditions: new Map(),
    sources: new Map()
  });
  const missingCodes = codes(missing);
  assert.ok(missingCodes.has("catalog_expedition_missing"));
  assert.ok(missingCodes.has("catalog_source_missing"));
  assert.equal("catalog" in missing && missing.catalog, false);
});

test("schemas refuse malformed versions, unknown fields, Leg sizes, and mismatched keys", () => {
  const malformed = cloneDocument();
  Object.assign(malformed, { schemaVersion: 2, unexpected: true });
  expectCode(qualify(malformed), "schema_invalid");

  const smallLeg = cloneDocument();
  smallLeg.legs[0]!.stops.pop();
  expectCode(qualify(smallLeg), "schema_invalid");

  const mismatched = cloneDocument();
  mismatched.key = "different-key";
  expectCode(qualify(mismatched), "expedition_key_mismatch");
});

test("authored keys and prerequisite references are unique, resolvable, acyclic, and ordered", () => {
  const duplicateStop = cloneDocument();
  stop(duplicateStop, "evidence-quality").key = "argument-structure";
  expectCode(qualify(duplicateStop), "stop_key_duplicate");

  const missing = cloneDocument();
  stop(missing, "evidence-quality").requires = ["missing-stop"];
  expectCode(qualify(missing), "prerequisite_missing");

  const outOfOrder = cloneDocument();
  stop(outOfOrder, "argument-structure").requires = ["causal-claims"];
  const outOfOrderCodes = codes(qualify(outOfOrder));
  assert.ok(outOfOrderCodes.has("prerequisite_order_invalid"));
  assert.ok(outOfOrderCodes.has("prerequisite_cycle"));

  const duplicateRequire = cloneDocument();
  stop(duplicateRequire, "causal-claims").requires = ["evidence-quality", "evidence-quality"];
  expectCode(qualify(duplicateRequire), "prerequisite_duplicate");
});

test("every Stop, Leg, and Expedition must carry the required activity-family shape", () => {
  const noOption = cloneDocument();
  const replacementMatching = structuredClone(matching(noOption, "map-argument-parts"));
  replacementMatching.key = "causal-role-matching";
  stop(noOption, "causal-claims").activities = [replacementMatching];
  const noOptionCodes = codes(qualify(noOption));
  assert.ok(noOptionCodes.has("stop_option_select_missing"));
  assert.ok(noOptionCodes.has("guardian_activity_invalid"));

  const optionOnly = cloneDocument();
  for (const item of optionOnly.legs[0]!.stops) {
    item.activities = item.activities.filter((activity) => activity.family === "option_select");
  }
  optionOnly.legs[0]!.guardianActivityKeys = ["identify-conclusion"];
  optionOnly.expeditionGuardianActivityKeys = ["identify-conclusion"];
  const optionOnlyCodes = codes(qualify(optionOnly));
  assert.ok(optionOnlyCodes.has("leg_non_option_activity_missing"));
  assert.ok(optionOnlyCodes.has("guardian_non_option_activity_missing"));
  assert.ok(optionOnlyCodes.has("expedition_activity_family_missing"));
  assert.ok(optionOnlyCodes.has("expedition_guardian_family_missing"));
});

test("option-select refuses ambiguous labels and a missing answer key", () => {
  const missingAnswer = cloneDocument();
  optionSelect(missingAnswer, "identify-conclusion").answerKey = "not-an-option";
  expectCode(qualify(missingAnswer), "answer_key_invalid");

  const duplicateText = cloneDocument();
  const activity = optionSelect(duplicateText, "identify-conclusion");
  activity.options[1]!.text = activity.options[0]!.text;
  expectCode(qualify(duplicateText), "option_text_duplicate");
});

test("matching refuses a non-bijection and impostor refuses any shape but one lie", () => {
  const nonBijection = cloneDocument();
  const pairs = matching(nonBijection, "map-argument-parts").pairs;
  pairs[1]!.right = pairs[0]!.right;
  expectCode(qualify(nonBijection), "matching_right_duplicate");

  const twoLies = cloneDocument();
  impostor(twoLies, "spot-evidence-impostor").statements[0]!.kind = "impostor";
  expectCode(qualify(twoLies), "impostor_key_invalid");
});

test("source anchors require one exact heading and a byte-exact quote under it", () => {
  const missingHeading = cloneDocument();
  stop(missingHeading, "argument-structure").lesson.sections[0]!.sourceAnchor.heading =
    "Missing heading";
  expectCode(qualify(missingHeading), "source_heading_missing");

  const missingQuote = cloneDocument();
  stop(missingQuote, "argument-structure").lesson.sections[0]!.sourceAnchor.quote =
    "An argument vaguely connects claims.";
  expectCode(qualify(missingQuote), "source_quote_missing");

  const duplicatedHeadingSource = `${baseSource}\n## 5. Causal Reasoning\nDuplicate heading.\n`;
  expectCode(qualify(cloneDocument(), duplicatedHeadingSource), "source_heading_ambiguous");
});

test("Explorable Terms and Support Paths refuse missing, mismatched, parent, and non-option targets", () => {
  const notRendered = cloneDocument();
  stop(notRendered, "evidence-quality").lesson.sections[1]!.explorableTerms[0]!.term =
    "missing rendered term";
  const renderedCodes = codes(qualify(notRendered));
  assert.ok(renderedCodes.has("explorable_term_not_rendered"));
  assert.ok(renderedCodes.has("explorable_support_mismatch"));

  const parentTarget = cloneDocument();
  stop(parentTarget, "evidence-quality").supportPaths[0]!.steps[0] = {
    stopKey: "evidence-quality",
    activityKey: "evaluate-sample"
  };
  expectCode(qualify(parentTarget), "support_parent_target_invalid");

  const missingTarget = cloneDocument();
  stop(missingTarget, "causal-claims").supportPaths[0]!.steps[0]!.activityKey =
    "missing-activity";
  expectCode(qualify(missingTarget), "support_activity_missing");

  const wrongFamily = cloneDocument();
  stop(wrongFamily, "evidence-quality").supportPaths[0]!.steps[0]!.activityKey =
    "map-argument-parts";
  expectCode(qualify(wrongFamily), "support_activity_family_invalid");
});

test("Guardian pools refuse cross-Leg, missing, duplicate, and family-incomplete references", () => {
  const missing = cloneDocument();
  missing.legs[0]!.guardianActivityKeys = ["missing-activity"];
  expectCode(qualify(missing), "guardian_activity_invalid");

  const duplicate = cloneDocument();
  duplicate.expeditionGuardianActivityKeys.push("identify-conclusion");
  expectCode(qualify(duplicate), "guardian_activity_duplicate");

  const incomplete = cloneDocument();
  incomplete.expeditionGuardianActivityKeys = ["identify-conclusion"];
  expectCode(qualify(incomplete), "expedition_guardian_family_missing");
});

test("pre-answer projections contain playable identifiers but no keyed correctness or paired answer map", () => {
  const projection = projectQualifiedCatalog(mustQualify(qualify()))[0];
  assert.ok(projection);
  const serialized = JSON.stringify(projection);
  for (const privateField of ["answerKey", "explanation", "sourceAnchor", "kind", "pairs"]) {
    assert.equal(serialized.includes(`\"${privateField}\"`), false, privateField);
  }

  const projectedActivities = projection.legs.flatMap((leg) =>
    leg.stops.flatMap((item) => item.activities)
  );
  const projectedMatching = projectedActivities.find(
    (activity) => activity.family === "matching"
  );
  assert.equal(projectedMatching?.family, "matching");
  const leftKeys = new Set(projectedMatching.left.map((item) => item.key));
  assert.ok(projectedMatching.right.every((item) => !leftKeys.has(item.key)));
});

test("the filesystem seam accepts the checked-in tree and refuses startup before returning a partial catalog", async () => {
  const checkedIn = await loadAndQualifyCatalog(new URL("content/", repositoryRoot).pathname);
  assert.equal(checkedIn.ok, true);

  const root = await mkdtemp(join(tmpdir(), "lrnki-authored-content-"));
  try {
    const expeditionRoot = join(root, "expeditions", "critical-thinking");
    await mkdir(expeditionRoot, { recursive: true });
    await writeFile(join(root, "catalog.json"), JSON.stringify(baseCatalog), "utf8");
    await writeFile(
      join(expeditionRoot, "expedition.json"),
      JSON.stringify(baseDocument),
      "utf8"
    );
    await writeFile(join(expeditionRoot, "source.md"), baseSource, "utf8");
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
