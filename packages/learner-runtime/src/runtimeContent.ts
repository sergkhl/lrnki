import {
  projectQualifiedCatalog,
  qualifiedExpeditionDocument,
  qualifiedExpeditionRevision,
  type LearnerActivityProjection,
  type LearnerExpeditionProjection,
  type QualifiedCatalog
} from "./contentQualifier";
import type {
  AuthoredActivity,
  AuthoredExpedition,
  AuthoredLeg,
  AuthoredStop,
  AuthoredSupportPath
} from "./contentSchema";
import type { ExpeditionJourneyState, LearnerStateV1 } from "./learnerState";

export type ActivityLocation = Readonly<{
  leg: AuthoredLeg;
  stop: AuthoredStop;
  activity: AuthoredActivity;
  publicActivity: LearnerActivityProjection;
}>;

export type SupportLocation = Readonly<{
  leg: AuthoredLeg;
  stop: AuthoredStop;
  supportPath: AuthoredSupportPath;
}>;

export type RuntimeExpedition = Readonly<{
  document: AuthoredExpedition;
  projection: LearnerExpeditionProjection;
  revision: string;
  stops: ReadonlyMap<string, AuthoredStop>;
  stopLegs: ReadonlyMap<string, AuthoredLeg>;
  legs: ReadonlyMap<string, AuthoredLeg>;
  activities: ReadonlyMap<string, ActivityLocation>;
  supportPaths: ReadonlyMap<string, SupportLocation>;
}>;

export type RuntimeCatalog = Readonly<{
  qualified: QualifiedCatalog;
  projections: ReadonlyArray<LearnerExpeditionProjection>;
  expeditions: ReadonlyMap<string, RuntimeExpedition>;
}>;

export function buildRuntimeCatalog(qualified: QualifiedCatalog): RuntimeCatalog {
  const projections = projectQualifiedCatalog(qualified);
  const projectionByKey = new Map(projections.map((projection) => [projection.key, projection]));
  const expeditions = new Map<string, RuntimeExpedition>();

  for (const expeditionKey of qualified.orderedKeys) {
    const document = qualifiedExpeditionDocument(qualified, expeditionKey);
    const revision = qualifiedExpeditionRevision(qualified, expeditionKey);
    const projection = projectionByKey.get(expeditionKey);
    if (!document || !revision || !projection) {
      throw new Error(`qualified catalog is missing runtime member ${expeditionKey}`);
    }

    const stops = new Map<string, AuthoredStop>();
    const stopLegs = new Map<string, AuthoredLeg>();
    const legs = new Map<string, AuthoredLeg>();
    const activities = new Map<string, ActivityLocation>();
    const supportPaths = new Map<string, SupportLocation>();

    for (let legIndex = 0; legIndex < document.legs.length; legIndex += 1) {
      const leg = document.legs[legIndex];
      const publicLeg = projection.legs[legIndex];
      if (!publicLeg || publicLeg.key !== leg.key) {
        throw new Error(`qualified projection for ${expeditionKey} changed authored Leg order`);
      }
      legs.set(leg.key, leg);
      for (let stopIndex = 0; stopIndex < leg.stops.length; stopIndex += 1) {
        const stop = leg.stops[stopIndex];
        const publicStop = publicLeg.stops[stopIndex];
        if (!publicStop || publicStop.key !== stop.key) {
          throw new Error(`qualified projection for ${expeditionKey} changed authored Stop order`);
        }
        stops.set(stop.key, stop);
        stopLegs.set(stop.key, leg);
        for (let activityIndex = 0; activityIndex < stop.activities.length; activityIndex += 1) {
          const activity = stop.activities[activityIndex];
          const publicActivity = publicStop.activities[activityIndex];
          if (!publicActivity || publicActivity.key !== activity.key) {
            throw new Error(`qualified projection for ${expeditionKey} changed authored Activity order`);
          }
          activities.set(activity.key, { leg, stop, activity, publicActivity });
        }
        for (const supportPath of stop.supportPaths) {
          supportPaths.set(supportPath.key, { leg, stop, supportPath });
        }
      }
    }
    expeditions.set(expeditionKey, {
      document,
      projection,
      revision,
      stops,
      stopLegs,
      legs,
      activities,
      supportPaths
    });
  }

  return { qualified, projections, expeditions };
}

export function evidenceMasteredStopKeys(
  expedition: RuntimeExpedition,
  journey: ExpeditionJourneyState
): Set<string> {
  const mastered = new Set<string>();
  for (const stop of expedition.stops.values()) {
    if (!journey.firstLessonReadAt[stop.key]) continue;
    if (
      stop.activities.every(
        (activity) => journey.latestActivityOutcomes[activity.key]?.correct === true
      )
    ) {
      mastered.add(stop.key);
    }
  }
  return mastered;
}

export function knownClosureStopKeys(
  expedition: RuntimeExpedition,
  journey: ExpeditionJourneyState
): Set<string> {
  const closure = new Set<string>();
  const visit = (stopKey: string): void => {
    if (closure.has(stopKey)) return;
    const stop = expedition.stops.get(stopKey);
    if (!stop) return;
    closure.add(stopKey);
    for (const required of stop.requires) visit(required);
  };
  for (const stopKey of journey.calibrationKnownStopKeys) visit(stopKey);
  return closure;
}

export function masteredStopKeys(
  expedition: RuntimeExpedition,
  journey: ExpeditionJourneyState
): Set<string> {
  return new Set([
    ...evidenceMasteredStopKeys(expedition, journey),
    ...knownClosureStopKeys(expedition, journey)
  ]);
}

export function prerequisiteAncestors(
  expedition: RuntimeExpedition,
  stopKey: string
): Set<string> {
  const ancestors = new Set<string>();
  const visit = (candidateKey: string): void => {
    const stop = expedition.stops.get(candidateKey);
    if (!stop) return;
    for (const required of stop.requires) {
      if (ancestors.has(required)) continue;
      ancestors.add(required);
      visit(required);
    }
  };
  visit(stopKey);
  return ancestors;
}

export function restorationStopKeys(
  expedition: RuntimeExpedition,
  journey: ExpeditionJourneyState,
  stopKey: string
): string[] {
  const stop = expedition.stops.get(stopKey);
  if (!stop) return [];
  const struggling = stop.activities.some(
    (activity) => journey.latestActivityOutcomes[activity.key]?.correct === false
  );
  if (!struggling) return [];
  const ancestors = prerequisiteAncestors(expedition, stopKey);
  return journey.calibrationKnownStopKeys
    .filter((knownStopKey) => ancestors.has(knownStopKey))
    .sort();
}

export function journeyContentChanged(
  runtimeCatalog: RuntimeCatalog,
  state: Readonly<LearnerStateV1>,
  expeditionKey: string
): boolean {
  const journey = state.expeditions[expeditionKey];
  const runtime = runtimeCatalog.expeditions.get(expeditionKey);
  return Boolean(journey && runtime && journey.contentRevision !== runtime.revision);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)])
    );
  }
  return value;
}

export function stableIdentity(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function stableFingerprint(value: unknown): string {
  const text = stableIdentity(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function deterministicId(...parts: readonly string[]): string {
  const first = stableFingerprint(parts);
  const second = stableFingerprint([...parts].reverse());
  const third = stableFingerprint(parts.map((part) => `${part.length}:${part}`));
  const fourth = stableFingerprint(parts.map((part, index) => `${index}:${part}`));
  return `${first}-${second}-${third}-${fourth}`;
}
