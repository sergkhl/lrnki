import { createHash } from "node:crypto";
import type { ZodIssue } from "zod";

import {
  authoredCatalogSchema,
  authoredExpeditionSchema,
  type AuthoredActivity,
  type AuthoredCatalog,
  type AuthoredExpedition,
  type AuthoredMatching,
  type AuthoredStop,
  type SourceCredit
} from "./contentSchema";

export type CatalogDiagnostic = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type LearnerActivityProjection =
  | Readonly<{
      family: "option_select";
      key: string;
      prompt: string;
      options: ReadonlyArray<Readonly<{ key: string; text: string }>>;
    }>
  | Readonly<{
      family: "matching";
      key: string;
      prompt: string;
      left: ReadonlyArray<Readonly<{ key: string; text: string }>>;
      right: ReadonlyArray<Readonly<{ key: string; text: string }>>;
    }>
  | Readonly<{
      family: "impostor";
      key: string;
      prompt: string;
      statements: ReadonlyArray<Readonly<{ key: string; text: string }>>;
    }>;

export type LearnerExpeditionProjection = Readonly<{
  key: string;
  contentRevision: string;
  title: string;
  teaser: string;
  declaredDomain: string;
  audience: string;
  sourceCredits: ReadonlyArray<SourceCredit>;
  legs: ReadonlyArray<
    Readonly<{
      key: string;
      title: string;
      stops: ReadonlyArray<
        Readonly<{
          key: string;
          label: string;
          requires: ReadonlyArray<string>;
          difficultyBand: 1 | 2 | 3 | 4 | 5;
          lesson: Readonly<{
            sections: ReadonlyArray<
              Readonly<{
                key: string;
                title: string;
                body: string;
                sourceCreditKeys: ReadonlyArray<string>;
                explorableTerms: ReadonlyArray<
                  Readonly<{ term: string; supportPathKey: string }>
                >;
              }>
            >;
          }>;
          activities: ReadonlyArray<LearnerActivityProjection>;
          supportPaths: ReadonlyArray<Readonly<{ key: string; term: string }>>;
        }>
      >;
    }>
  >;
}>;

const qualifiedCatalogBrand: unique symbol = Symbol("QualifiedCatalog");

type QualifiedExpedition = Readonly<{
  document: AuthoredExpedition;
  contentRevision: string;
  learnerProjection: LearnerExpeditionProjection;
}>;

export type QualifiedCatalog = Readonly<{
  catalogRevision: string;
  orderedKeys: ReadonlyArray<string>;
  readonly [qualifiedCatalogBrand]: true;
}>;

const qualifiedExpeditionsByCatalog = new WeakMap<
  QualifiedCatalog,
  ReadonlyMap<string, QualifiedExpedition>
>();

export type CatalogQualification =
  | Readonly<{ ok: true; catalog: QualifiedCatalog }>
  | Readonly<{ ok: false; diagnostics: ReadonlyArray<CatalogDiagnostic> }>;

type QualificationInput = Readonly<{
  catalog: unknown;
  expeditions: ReadonlyMap<string, unknown>;
}>;

function issuePath(prefix: string, issue: ZodIssue): string {
  const suffix = issue.path.map(String).join(".");
  return suffix.length === 0 ? prefix : `${prefix}.${suffix}`;
}

function schemaDiagnostics(prefix: string, issues: ReadonlyArray<ZodIssue>): CatalogDiagnostic[] {
  return issues.map((issue) => ({
    code: "schema_invalid",
    path: issuePath(prefix, issue),
    message: issue.message
  }));
}

function addDiagnostic(
  diagnostics: CatalogDiagnostic[],
  code: string,
  path: string,
  message: string
): void {
  diagnostics.push({ code, path, message });
}

function duplicateValues(values: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates].sort();
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)])
    );
  }
  return value;
}

export function canonicalContentRevision(expedition: AuthoredExpedition): string {
  const canonicalDocument = JSON.stringify(stableValue(expedition));
  return createHash("sha256")
    .update("lrnki-authored-expedition-v2\0", "utf8")
    .update(canonicalDocument, "utf8")
    .digest("hex");
}

function validateUnique(
  values: ReadonlyArray<string>,
  path: string,
  code: string,
  diagnostics: CatalogDiagnostic[]
): void {
  for (const duplicate of duplicateValues(values)) {
    addDiagnostic(diagnostics, code, path, `duplicate value ${JSON.stringify(duplicate)}`);
  }
}

function activityAtStop(
  stopByKey: ReadonlyMap<string, AuthoredStop>,
  stopKey: string,
  activityKey: string
): AuthoredActivity | undefined {
  return stopByKey.get(stopKey)?.activities.find((activity) => activity.key === activityKey);
}

function detectPrerequisiteCycles(
  expedition: AuthoredExpedition,
  diagnostics: CatalogDiagnostic[]
): void {
  const stopByKey = new Map(
    expedition.legs.flatMap((leg) => leg.stops).map((stop) => [stop.key, stop] as const)
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(stopKey: string, trail: string[]): void {
    if (visiting.has(stopKey)) {
      addDiagnostic(
        diagnostics,
        "prerequisite_cycle",
        `expeditions.${expedition.key}.stops.${stopKey}.requires`,
        `cycle detected: ${[...trail, stopKey].join(" -> ")}`
      );
      return;
    }
    if (visited.has(stopKey)) {
      return;
    }
    const stop = stopByKey.get(stopKey);
    if (!stop) {
      return;
    }
    visiting.add(stopKey);
    for (const required of stop.requires) {
      if (stopByKey.has(required)) {
        visit(required, [...trail, stopKey]);
      }
    }
    visiting.delete(stopKey);
    visited.add(stopKey);
  }

  for (const stopKey of stopByKey.keys()) {
    visit(stopKey, []);
  }
}

function validateSourceCreditReferences(
  sourceCreditKeys: ReadonlyArray<string>,
  availableSourceCreditKeys: ReadonlySet<string>,
  referencedSourceCreditKeys: Set<string>,
  path: string,
  diagnostics: CatalogDiagnostic[]
): void {
  validateUnique(
    sourceCreditKeys,
    path,
    "source_credit_reference_duplicate",
    diagnostics
  );
  for (const sourceCreditKey of sourceCreditKeys) {
    if (!availableSourceCreditKeys.has(sourceCreditKey)) {
      addDiagnostic(
        diagnostics,
        "source_credit_reference_missing",
        path,
        `source credit ${JSON.stringify(sourceCreditKey)} does not exist in this Expedition`
      );
      continue;
    }
    referencedSourceCreditKeys.add(sourceCreditKey);
  }
}

function validateActivity(
  activity: AuthoredActivity,
  path: string,
  availableSourceCreditKeys: ReadonlySet<string>,
  referencedSourceCreditKeys: Set<string>,
  diagnostics: CatalogDiagnostic[]
): void {
  validateSourceCreditReferences(
    activity.explanation.sourceCreditKeys,
    availableSourceCreditKeys,
    referencedSourceCreditKeys,
    `${path}.explanation.sourceCreditKeys`,
    diagnostics
  );

  if (activity.family === "option_select") {
    validateUnique(
      activity.options.map((option) => option.key),
      `${path}.options`,
      "option_key_duplicate",
      diagnostics
    );
    validateUnique(
      activity.options.map((option) => option.text.trim().toLocaleLowerCase()),
      `${path}.options`,
      "option_text_duplicate",
      diagnostics
    );
    const answerCount = activity.options.filter(
      (option) => option.key === activity.answerKey
    ).length;
    if (answerCount !== 1) {
      addDiagnostic(
        diagnostics,
        "answer_key_invalid",
        `${path}.answerKey`,
        "answerKey must resolve to exactly one option"
      );
    }
    return;
  }

  if (activity.family === "matching") {
    validateUnique(
      activity.pairs.map((pair) => pair.key),
      `${path}.pairs`,
      "matching_pair_key_duplicate",
      diagnostics
    );
    validateUnique(
      activity.pairs.map((pair) => pair.left.trim().toLocaleLowerCase()),
      `${path}.pairs`,
      "matching_left_duplicate",
      diagnostics
    );
    validateUnique(
      activity.pairs.map((pair) => pair.right.trim().toLocaleLowerCase()),
      `${path}.pairs`,
      "matching_right_duplicate",
      diagnostics
    );
    return;
  }

  validateUnique(
    activity.statements.map((statement) => statement.key),
    `${path}.statements`,
    "impostor_statement_key_duplicate",
    diagnostics
  );
  validateUnique(
    activity.statements.map((statement) => statement.text.trim().toLocaleLowerCase()),
    `${path}.statements`,
    "impostor_statement_text_duplicate",
    diagnostics
  );
  const impostorCount = activity.statements.filter(
    (statement) => statement.kind === "impostor"
  ).length;
  if (impostorCount !== 1) {
    addDiagnostic(
      diagnostics,
      "impostor_key_invalid",
      `${path}.statements`,
      "an impostor activity must contain exactly one impostor and at least two truths"
    );
  }
}

function validateExpedition(
  expedition: AuthoredExpedition,
  diagnostics: CatalogDiagnostic[]
): void {
  const base = `expeditions.${expedition.key}`;
  const legs = expedition.legs;
  const stops = legs.flatMap((leg) => leg.stops);
  const activities = stops.flatMap((stop) => stop.activities);
  const supportPaths = stops.flatMap((stop) => stop.supportPaths);
  const stopByKey = new Map(stops.map((stop) => [stop.key, stop] as const));
  const activityByKey = new Map(activities.map((activity) => [activity.key, activity] as const));
  const stopOrdinal = new Map(stops.map((stop, index) => [stop.key, index] as const));
  const availableSourceCreditKeys = new Set(
    expedition.sourceCredits.map((sourceCredit) => sourceCredit.key)
  );
  const referencedSourceCreditKeys = new Set<string>();

  validateUnique(
    expedition.sourceCredits.map((sourceCredit) => sourceCredit.key),
    `${base}.sourceCredits`,
    "source_credit_key_duplicate",
    diagnostics
  );

  validateUnique(
    legs.map((leg) => leg.key),
    `${base}.legs`,
    "leg_key_duplicate",
    diagnostics
  );
  validateUnique(
    stops.map((stop) => stop.key),
    `${base}.stops`,
    "stop_key_duplicate",
    diagnostics
  );
  validateUnique(
    stops.flatMap((stop) => stop.lesson.sections.map((section) => section.key)),
    `${base}.lesson.sections`,
    "section_key_duplicate",
    diagnostics
  );
  validateUnique(
    activities.map((activity) => activity.key),
    `${base}.activities`,
    "activity_key_duplicate",
    diagnostics
  );
  validateUnique(
    supportPaths.map((supportPath) => supportPath.key),
    `${base}.supportPaths`,
    "support_path_key_duplicate",
    diagnostics
  );

  detectPrerequisiteCycles(expedition, diagnostics);

  const expeditionFamilies = new Set(activities.map((activity) => activity.family));
  for (const requiredFamily of ["option_select", "matching", "impostor"] as const) {
    if (!expeditionFamilies.has(requiredFamily)) {
      addDiagnostic(
        diagnostics,
        "expedition_activity_family_missing",
        `${base}.legs`,
        `Expedition does not contain ${requiredFamily}`
      );
    }
  }

  for (const [legIndex, leg] of legs.entries()) {
    const legPath = `${base}.legs.${legIndex}`;
    const legActivityKeys = new Set(leg.stops.flatMap((stop) => stop.activities.map((item) => item.key)));
    const legFamilies = new Set(leg.stops.flatMap((stop) => stop.activities.map((item) => item.family)));
    if (!legFamilies.has("matching") && !legFamilies.has("impostor")) {
      addDiagnostic(
        diagnostics,
        "leg_non_option_activity_missing",
        `${legPath}.stops`,
        "each Leg must contain matching or impostor play"
      );
    }
    validateUnique(
      leg.guardianActivityKeys,
      `${legPath}.guardianActivityKeys`,
      "guardian_activity_duplicate",
      diagnostics
    );
    for (const activityKey of leg.guardianActivityKeys) {
      if (!legActivityKeys.has(activityKey)) {
        addDiagnostic(
          diagnostics,
          "guardian_activity_invalid",
          `${legPath}.guardianActivityKeys`,
          `activity ${JSON.stringify(activityKey)} does not belong to this Leg`
        );
      }
    }
    if (
      !leg.guardianActivityKeys.some((key) => {
        const activity = activityByKey.get(key);
        return activity?.family === "matching" || activity?.family === "impostor";
      })
    ) {
      addDiagnostic(
        diagnostics,
        "guardian_non_option_activity_missing",
        `${legPath}.guardianActivityKeys`,
        "each Leg Guardian pool must include matching or impostor play"
      );
    }

    for (const [stopIndex, stop] of leg.stops.entries()) {
      const stopPath = `${legPath}.stops.${stopIndex}`;
      validateUnique(
        stop.requires,
        `${stopPath}.requires`,
        "prerequisite_duplicate",
        diagnostics
      );
      for (const required of stop.requires) {
        const requiredOrdinal = stopOrdinal.get(required);
        const currentOrdinal = stopOrdinal.get(stop.key);
        if (requiredOrdinal === undefined) {
          addDiagnostic(
            diagnostics,
            "prerequisite_missing",
            `${stopPath}.requires`,
            `required Stop ${JSON.stringify(required)} does not exist`
          );
        } else if (currentOrdinal !== undefined && requiredOrdinal >= currentOrdinal) {
          addDiagnostic(
            diagnostics,
            "prerequisite_order_invalid",
            `${stopPath}.requires`,
            `required Stop ${JSON.stringify(required)} does not precede ${JSON.stringify(stop.key)}`
          );
        }
      }

      if (!stop.activities.some((activity) => activity.family === "option_select")) {
        addDiagnostic(
          diagnostics,
          "stop_option_select_missing",
          `${stopPath}.activities`,
          "each Stop must contain option-select acquisition play"
        );
      }

      for (const [sectionIndex, section] of stop.lesson.sections.entries()) {
        const sectionPath = `${stopPath}.lesson.sections.${sectionIndex}`;
        validateSourceCreditReferences(
          section.sourceCreditKeys,
          availableSourceCreditKeys,
          referencedSourceCreditKeys,
          `${sectionPath}.sourceCreditKeys`,
          diagnostics
        );
        for (const [termIndex, term] of section.explorableTerms.entries()) {
          if (!section.body.includes(term.term)) {
            addDiagnostic(
              diagnostics,
              "explorable_term_not_rendered",
              `${sectionPath}.explorableTerms.${termIndex}.term`,
              "Explorable Term must occur exactly in the rendered section body"
            );
          }
          const supportPath = stop.supportPaths.find(
            (candidate) => candidate.key === term.supportPathKey
          );
          if (!supportPath) {
            addDiagnostic(
              diagnostics,
              "explorable_support_missing",
              `${sectionPath}.explorableTerms.${termIndex}.supportPathKey`,
              "Explorable Term must reference a Support Path on its parent Stop"
            );
          } else if (supportPath.term !== term.term || supportPath.sectionKey !== section.key) {
            addDiagnostic(
              diagnostics,
              "explorable_support_mismatch",
              `${sectionPath}.explorableTerms.${termIndex}`,
              "Explorable Term and Support Path term/section must match exactly"
            );
          }
        }
      }

      validateUnique(
        stop.lesson.sections.flatMap((section) =>
          section.explorableTerms.map((term) => term.supportPathKey)
        ),
        `${stopPath}.lesson.sections.explorableTerms`,
        "explorable_support_duplicate",
        diagnostics
      );

      for (const [activityIndex, activity] of stop.activities.entries()) {
        validateActivity(
          activity,
          `${stopPath}.activities.${activityIndex}`,
          availableSourceCreditKeys,
          referencedSourceCreditKeys,
          diagnostics
        );
      }

      for (const [supportIndex, supportPath] of stop.supportPaths.entries()) {
        const supportPathAt = `${stopPath}.supportPaths.${supportIndex}`;
        const parentSection = stop.lesson.sections.find(
          (section) => section.key === supportPath.sectionKey
        );
        if (!parentSection) {
          addDiagnostic(
            diagnostics,
            "support_section_missing",
            `${supportPathAt}.sectionKey`,
            "Support Path sectionKey must resolve on its parent Stop"
          );
        } else if (!parentSection.body.includes(supportPath.term)) {
          addDiagnostic(
            diagnostics,
            "support_term_not_rendered",
            `${supportPathAt}.term`,
            "Support Path term must occur exactly in its parent section body"
          );
        }
        const matchingTerm = parentSection?.explorableTerms.find(
          (term) => term.supportPathKey === supportPath.key
        );
        if (!matchingTerm || matchingTerm.term !== supportPath.term) {
          addDiagnostic(
            diagnostics,
            "support_explorable_missing",
            supportPathAt,
            "Support Path must be named by one exact Explorable Term"
          );
        }
        validateUnique(
          supportPath.steps.map((step) => `${step.stopKey}\0${step.activityKey}`),
          `${supportPathAt}.steps`,
          "support_step_duplicate",
          diagnostics
        );
        for (const [stepIndex, step] of supportPath.steps.entries()) {
          const stepPath = `${supportPathAt}.steps.${stepIndex}`;
          if (step.stopKey === stop.key) {
            addDiagnostic(
              diagnostics,
              "support_parent_target_invalid",
              `${stepPath}.stopKey`,
              "Support destination must not be its parent Stop"
            );
          }
          const targetStop = stopByKey.get(step.stopKey);
          if (!targetStop) {
            addDiagnostic(
              diagnostics,
              "support_stop_missing",
              `${stepPath}.stopKey`,
              `Support destination Stop ${JSON.stringify(step.stopKey)} does not exist`
            );
            continue;
          }
          const targetActivity = activityAtStop(stopByKey, step.stopKey, step.activityKey);
          if (!targetActivity) {
            addDiagnostic(
              diagnostics,
              "support_activity_missing",
              `${stepPath}.activityKey`,
              `Support activity ${JSON.stringify(step.activityKey)} does not belong to its Stop`
            );
          } else if (targetActivity.family !== "option_select") {
            addDiagnostic(
              diagnostics,
              "support_activity_family_invalid",
              `${stepPath}.activityKey`,
              "Support destination activity must be option-select"
            );
          }
        }
      }
    }
  }

  for (const sourceCredit of expedition.sourceCredits) {
    if (!referencedSourceCreditKeys.has(sourceCredit.key)) {
      addDiagnostic(
        diagnostics,
        "source_credit_unreferenced",
        `${base}.sourceCredits`,
        `source credit ${JSON.stringify(sourceCredit.key)} is not referenced by teaching or an explanation`
      );
    }
  }

  validateUnique(
    expedition.expeditionGuardianActivityKeys,
    `${base}.expeditionGuardianActivityKeys`,
    "guardian_activity_duplicate",
    diagnostics
  );
  for (const activityKey of expedition.expeditionGuardianActivityKeys) {
    if (!activityByKey.has(activityKey)) {
      addDiagnostic(
        diagnostics,
        "guardian_activity_invalid",
        `${base}.expeditionGuardianActivityKeys`,
        `activity ${JSON.stringify(activityKey)} does not exist`
      );
    }
  }
  const guardianFamilies = new Set(
    expedition.expeditionGuardianActivityKeys
      .map((key) => activityByKey.get(key)?.family)
      .filter((family): family is AuthoredActivity["family"] => family !== undefined)
  );
  for (const requiredFamily of ["option_select", "matching", "impostor"] as const) {
    if (!guardianFamilies.has(requiredFamily)) {
      addDiagnostic(
        diagnostics,
        "expedition_guardian_family_missing",
        `${base}.expeditionGuardianActivityKeys`,
        `Expedition Guardian pool does not contain ${requiredFamily}`
      );
    }
  }
}

function projectionOrder<T extends Readonly<{ key: string }>>(
  activityKey: string,
  lane: "option" | "matching-left" | "matching-right" | "impostor",
  items: ReadonlyArray<T>
): T[] {
  return [...items].sort((left, right) => {
    const leftRank = createHash("sha256")
      .update(`learner-projection-order-v1\0${activityKey}\0${lane}\0${left.key}`, "utf8")
      .digest("hex");
    const rightRank = createHash("sha256")
      .update(`learner-projection-order-v1\0${activityKey}\0${lane}\0${right.key}`, "utf8")
      .digest("hex");
    return leftRank.localeCompare(rightRank) || left.key.localeCompare(right.key);
  });
}

function matchingProjection(activity: AuthoredMatching): Extract<LearnerActivityProjection, {
  family: "matching";
}> {
  const publicKey = (side: "left" | "right", pairKey: string): string =>
    createHash("sha256")
      .update(`${activity.key}\0${side}\0${pairKey}`, "utf8")
      .digest("hex")
      .slice(0, 16);
  return {
    family: "matching",
    key: activity.key,
    prompt: activity.prompt,
    left: projectionOrder(activity.key, "matching-left", activity.pairs).map((pair) => ({
      key: publicKey("left", pair.key),
      text: pair.left
    })),
    right: projectionOrder(activity.key, "matching-right", activity.pairs).map((pair) => ({
      key: publicKey("right", pair.key),
      text: pair.right
    }))
  };
}

function activityProjection(activity: AuthoredActivity): LearnerActivityProjection {
  if (activity.family === "option_select") {
    return {
      family: activity.family,
      key: activity.key,
      prompt: activity.prompt,
      options: projectionOrder(activity.key, "option", activity.options).map((option) => ({
        key: option.key,
        text: option.text
      }))
    };
  }
  if (activity.family === "matching") {
    return matchingProjection(activity);
  }
  return {
    family: activity.family,
    key: activity.key,
    prompt: activity.prompt,
    statements: projectionOrder(activity.key, "impostor", activity.statements).map((statement) => ({
      key: statement.key,
      text: statement.text
    }))
  };
}

function learnerProjection(
  expedition: AuthoredExpedition,
  contentRevision: string
): LearnerExpeditionProjection {
  return {
    key: expedition.key,
    contentRevision,
    title: expedition.title,
    teaser: expedition.teaser,
    declaredDomain: expedition.declaredDomain,
    audience: expedition.audience,
    sourceCredits: expedition.sourceCredits,
    legs: expedition.legs.map((leg) => ({
      key: leg.key,
      title: leg.title,
      stops: leg.stops.map((stop) => ({
        key: stop.key,
        label: stop.label,
        requires: stop.requires,
        difficultyBand: stop.difficultyBand,
        lesson: {
          sections: stop.lesson.sections.map((section) => ({
            key: section.key,
            title: section.title,
            body: section.body,
            sourceCreditKeys: section.sourceCreditKeys,
            explorableTerms: section.explorableTerms
          }))
        },
        activities: stop.activities.map(activityProjection),
        supportPaths: stop.supportPaths.map((supportPath) => ({
          key: supportPath.key,
          term: supportPath.term
        }))
      }))
    }))
  };
}

function freezeDeep<Value>(value: Value): Value {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      freezeDeep(nested);
    }
  }
  return value;
}

function catalogDigest(catalog: AuthoredCatalog, expeditions: ReadonlyMap<string, QualifiedExpedition>): string {
  const identity = catalog.expeditionKeys.map((key) => ({
    key,
    revision: expeditions.get(key)?.contentRevision
  }));
  return createHash("sha256")
    .update("lrnki-authored-catalog-v1\0", "utf8")
    .update(JSON.stringify(identity), "utf8")
    .digest("hex");
}

export function qualifyCatalog(input: QualificationInput): CatalogQualification {
  const diagnostics: CatalogDiagnostic[] = [];
  const parsedCatalog = authoredCatalogSchema.safeParse(input.catalog);
  if (!parsedCatalog.success) {
    diagnostics.push(...schemaDiagnostics("catalog", parsedCatalog.error.issues));
    return { ok: false, diagnostics: freezeDeep(diagnostics) };
  }

  const catalog = parsedCatalog.data;
  validateUnique(
    catalog.expeditionKeys,
    "catalog.expeditionKeys",
    "catalog_key_duplicate",
    diagnostics
  );
  const membership = new Set(catalog.expeditionKeys);
  for (const key of catalog.expeditionKeys) {
    if (!input.expeditions.has(key)) {
      addDiagnostic(
        diagnostics,
        "catalog_expedition_missing",
        `expeditions.${key}`,
        "catalog member has no Expedition document"
      );
    }
  }
  for (const key of input.expeditions.keys()) {
    if (!membership.has(key)) {
      addDiagnostic(
        diagnostics,
        "catalog_expedition_extra",
        `expeditions.${key}`,
        "Expedition document is absent from catalog membership"
      );
    }
  }
  const parsedExpeditions = new Map<string, AuthoredExpedition>();
  for (const key of catalog.expeditionKeys) {
    const raw = input.expeditions.get(key);
    if (raw === undefined) {
      continue;
    }
    const parsed = authoredExpeditionSchema.safeParse(raw);
    if (!parsed.success) {
      diagnostics.push(...schemaDiagnostics(`expeditions.${key}`, parsed.error.issues));
      continue;
    }
    if (parsed.data.key !== key) {
      addDiagnostic(
        diagnostics,
        "expedition_key_mismatch",
        `expeditions.${key}.key`,
        `document key ${JSON.stringify(parsed.data.key)} does not match catalog key`
      );
    }
    parsedExpeditions.set(key, parsed.data);
  }

  for (const expedition of parsedExpeditions.values()) {
    validateExpedition(expedition, diagnostics);
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics: freezeDeep(diagnostics) };
  }

  const qualifiedExpeditions = new Map<string, QualifiedExpedition>();
  for (const key of catalog.expeditionKeys) {
    const document = parsedExpeditions.get(key);
    if (!document) {
      throw new Error("qualified catalog construction reached an impossible missing member");
    }
    const contentRevision = canonicalContentRevision(document);
    qualifiedExpeditions.set(
      key,
      freezeDeep({
        document,
        contentRevision,
        learnerProjection: learnerProjection(document, contentRevision)
      })
    );
  }

  const result: QualifiedCatalog = freezeDeep({
    catalogRevision: catalogDigest(catalog, qualifiedExpeditions),
    orderedKeys: freezeDeep([...catalog.expeditionKeys]),
    [qualifiedCatalogBrand]: true as const
  });
  qualifiedExpeditionsByCatalog.set(result, qualifiedExpeditions);
  return { ok: true, catalog: result };
}

function qualifiedExpeditions(
  catalog: QualifiedCatalog
): ReadonlyMap<string, QualifiedExpedition> {
  const expeditions = qualifiedExpeditionsByCatalog.get(catalog);
  if (!expeditions) {
    throw new Error("QualifiedCatalog was not created by qualifyCatalog");
  }
  return expeditions;
}

export function projectQualifiedCatalog(
  catalog: QualifiedCatalog
): ReadonlyArray<LearnerExpeditionProjection> {
  const expeditions = qualifiedExpeditions(catalog);
  return catalog.orderedKeys.map((key) => {
    const expedition = expeditions.get(key);
    if (!expedition) {
      throw new Error(`qualified catalog is missing ${key}`);
    }
    return expedition.learnerProjection;
  });
}

export function qualifiedExpeditionDocument(
  catalog: QualifiedCatalog,
  expeditionKey: string
): AuthoredExpedition | undefined {
  return qualifiedExpeditions(catalog).get(expeditionKey)?.document;
}

export function qualifiedExpeditionRevision(
  catalog: QualifiedCatalog,
  expeditionKey: string
): string | undefined {
  return qualifiedExpeditions(catalog).get(expeditionKey)?.contentRevision;
}
