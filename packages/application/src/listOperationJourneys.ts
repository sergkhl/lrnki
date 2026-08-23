import type {
  JourneyDisplay,
  JourneyLineage,
  JourneyLineageReadPort,
  OperationTimelineDetail,
  OperationTimelineReadPort,
  OperationTimelineSummary,
  OperationType
} from "@lrnki/ports";

export interface OperationJourney {
  enrichmentId: string;
  display: JourneyDisplay;
  members: OperationTimelineDetail[];
  status: OperationTimelineSummary["status"];
  startedAt: string;
  completedAt: string | null;
  elapsedMs: number;
}

export interface OperationJourneyList {
  journeys: OperationJourney[];
  ungrouped: OperationTimelineDetail[];
}

type OperationRef = { operationId: string; operationType: OperationType };

export async function listOperationJourneys(input: {
  timelineRead: OperationTimelineReadPort;
  journeyLineageRead: JourneyLineageReadPort;
  now?: Date;
}): Promise<OperationJourneyList> {
  const summaries = await input.timelineRead.listOperationTimelines();
  const resolved = await Promise.all(
    summaries.map((summary) => input.timelineRead.getOperationTimeline(summary.operationId, summary.operationType))
  );
  const details = resolved.filter((detail): detail is OperationTimelineDetail => detail !== undefined);
  const byOperation = new Map(details.map((detail) => [operationKey(detail.summary), detail]));
  const assigned = new Set<string>();
  const journeys: OperationJourney[] = [];
  const now = input.now ?? new Date();

  const enrichmentDetails = details.filter((detail) => detail.summary.operationType === "enrichment");
  const lineageResults = await Promise.all(
    enrichmentDetails.map((detail) => input.journeyLineageRead.resolveJourney(detail.summary.operationId))
  );

  for (const lineage of lineageResults) {
    if (!lineage) continue;
    const members = membersForLineage(lineage, byOperation);
    if (members.length === 0) continue;
    for (const member of members) assigned.add(operationKey(member.summary));
    journeys.push({
      enrichmentId: lineage.enrichmentId,
      display: { enrichmentId: lineage.enrichmentId, kind: lineage.graphVersionId ? "document" : "synthetic", title: null },
      members,
      ...journeyStatusAndDuration(members, now)
    });
  }

  const displays = await input.journeyLineageRead.resolveJourneyDisplay(journeys.map((journey) => journey.enrichmentId));
  const displayById = new Map(displays.map((display) => [display.enrichmentId, display]));
  return {
    journeys: journeys.map((journey) => ({ ...journey, display: displayById.get(journey.enrichmentId) ?? journey.display })),
    ungrouped: details.filter((detail) => !assigned.has(operationKey(detail.summary)))
  };
}

function membersForLineage(
  lineage: JourneyLineage,
  byOperation: ReadonlyMap<string, OperationTimelineDetail>
): OperationTimelineDetail[] {
  const refs: OperationRef[] = [
    ...lineage.extractionRunIds.map((operationId): OperationRef => ({ operationId, operationType: "extraction" })),
    ...(lineage.canonicalizationOperationId
      ? [{ operationId: lineage.canonicalizationOperationId, operationType: "canonicalization" } satisfies OperationRef]
      : []),
    ...(lineage.graphVersionId ? [{ operationId: lineage.graphVersionId, operationType: "minting" } satisfies OperationRef] : []),
    { operationId: lineage.enrichmentId, operationType: "enrichment" },
    { operationId: lineage.enrichmentId, operationType: "study_items" }
  ];
  return refs.flatMap((ref) => {
    const detail = byOperation.get(operationKey(ref));
    return detail ? [detail] : [];
  });
}

function operationKey(input: { operationId: string; operationType: OperationType }): string {
  return `${input.operationType}:${input.operationId}`;
}

function journeyStatusAndDuration(
  members: OperationTimelineDetail[],
  now: Date
): Pick<OperationJourney, "status" | "startedAt" | "completedAt" | "elapsedMs"> {
  const status = members.some((member) => member.summary.status === "failed")
    ? "failed"
    : members.some((member) => member.summary.status === "running")
      ? "running"
      : "succeeded";
  const startedAt = members.reduce((earliest, member) =>
    Date.parse(member.summary.startedAt) < Date.parse(earliest) ? member.summary.startedAt : earliest,
    members[0]!.summary.startedAt
  );
  const completedAt = status === "running"
    ? null
    : members.reduce((latest, member) => {
        if (!member.summary.completedAt) return latest;
        return !latest || Date.parse(member.summary.completedAt) > Date.parse(latest)
          ? member.summary.completedAt
          : latest;
      }, null as string | null);
  const end = completedAt ? Date.parse(completedAt) : now.getTime();
  return {
    status,
    startedAt,
    completedAt,
    elapsedMs: Math.max(0, end - Date.parse(startedAt))
  };
}
