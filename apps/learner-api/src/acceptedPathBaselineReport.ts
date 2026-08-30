import {
  lessonGroundingShape,
  resolveExpeditionSourceCues,
  type ExpeditionInstructionalSourceCue,
  type ExpeditionRouteLeg
} from "@lrnki/application";
import type {
  ConceptLesson,
  ConceptLessonSection,
  SourceLocator,
  StudyItemType
} from "@lrnki/domain-core";
import type {
  AcceptedPathPackage,
  DerivedGraphEdge,
  DerivedGraphNode,
  SourceEvidenceReadPort
} from "@lrnki/ports";

type JsonRow = Record<string, unknown>;

type DerivedNodeRow = JsonRow & {
  aliases: string[];
  canonical_label: string;
  declared_domain: string;
  derived_node_id: string;
  grounding_origin: DerivedGraphNode["groundingOrigin"];
  node_kind: DerivedGraphNode["nodeKind"];
  role: DerivedGraphNode["role"];
};

type DifficultyRow = JsonRow & {
  components: { band?: number; contested?: number | boolean };
  derived_node_id: string;
  neural_rationale: string | null;
  score: number | null;
};

type EdgeRow = JsonRow & {
  confidence: number;
  dependent_derived_node_id: string;
  judge_model: string;
  prerequisite_derived_node_id: string;
  uncertain: boolean;
};

type StudyItemRow = JsonRow & {
  derived_node_id: string;
  item_type: StudyItemType;
  study_item_id: string;
};

type RejectedStudyItemRow = JsonRow & {
  derived_node_id: string;
  item_type: StudyItemType;
  reason: string;
};

type ConceptLessonRow = JsonRow & {
  canonical_label: string;
  concept_lesson_id: string;
  config_hash: string;
  derived_node_id: string;
  enrichment_id: string;
  explorable_terms: ConceptLesson["explorableTerms"];
  generating_model: string;
  graph_version_id: string | null;
};

type ConceptLessonSectionRow = JsonRow & {
  body_text: string;
  concept_lesson_id: string;
  concept_lesson_section_id: string;
  diagram_caption: string | null;
  diagram_spec: string | null;
  grounding_provenance: ConceptLessonSection["groundingProvenance"];
  items: string[] | null;
  kind: ConceptLessonSection["kind"];
  ordinal: number;
};

type ConceptLessonCitationRow = JsonRow & {
  concept_lesson_section_id: string;
  derived_node_id: string | null;
  evidence_quote: string | null;
  generated_passage_text: string | null;
  match_kind: "exact" | "normalized" | null;
  provenance: "source" | "generated";
  source_block_id: string | null;
  source_resource_id: string | null;
};

type SourceBlockRow = JsonRow & {
  block_id: string;
  block_type: string;
  heading_path: string[];
  locator: SourceLocator;
  source_block_id: string;
  source_document_id: string;
  text: string;
};

type SourceDocumentRow = JsonRow & {
  source_document_id: string;
  source_resource_id: string;
};

type SourceResourceRow = JsonRow & {
  source_resource_id: string;
  title: string;
};

export type AcceptedPathBaselineReport = {
  catalogKey: string;
  title: string;
  packageSha256: string;
  assetConfigHash: string;
  assetSetIdentity: string;
  conceptCount: number;
  trustedEdgeCount: number;
  trustedTopologicalViolationCount: number;
  legCount: number;
  singletonLegCount: number;
  legSizeHistogram: Record<string, number>;
  fullBankFamilyCounts: Record<StudyItemType, number>;
  currentFamilyCounts: Record<StudyItemType, number>;
  mixedLegCount: number;
  longestBonusUncoveredRun: number;
  lessonGroundingPassageHistogram: Record<string, number>;
  rejectionReasonCounts: Array<{ itemType: StudyItemType; reason: string; count: number }>;
  sourceCueCount: number;
  sourceOrderBacktrackCount: number;
  sourceMajorHeadingTransitionsInsideLegs: number;
  projectedRoute: {
    policyIdentity: string;
    orderedConcepts: Array<{
      derivedNodeId: string;
      canonicalLabel: string;
      sourceDocumentId: string | null;
      blockId: string | null;
      headingPath: string[];
      locator: SourceLocator | null;
    }>;
    legs: ExpeditionRouteLeg[];
    summitDerivedNodeId: string | null;
  };
  targetContract: {
    routePlanPresent: boolean;
    everyLegHasThreeToFiveConcepts: boolean;
    everyLegHasMixedPractice: boolean;
    expeditionUsesEveryFamily: boolean;
    honestConceptCount: boolean;
    routeSensitiveIdentity: boolean;
  };
};

export async function acceptedPathBaselineReport(
  acceptedPackage: AcceptedPathPackage,
  packageSha256: string
): Promise<AcceptedPathBaselineReport> {
  const tables = packageTables(acceptedPackage);
  const route = acceptedPackage.qualification.routePlan;
  const trailNodeIds = new Set(route.orderedDerivedNodeIds);
  const currentStudyItemIds = new Set(
    acceptedPackage.qualification.expectedAssets.currentStudyItemIds
  );
  const currentConceptLessonIds = new Set(
    acceptedPackage.qualification.expectedAssets.currentConceptLessonIds
  );
  const studyItems = rows<StudyItemRow>(tables, "study_items")
    .filter((row) => trailNodeIds.has(row.derived_node_id));
  const currentStudyItems = studyItems.filter((row) =>
    currentStudyItemIds.has(row.study_item_id)
  );
  const currentItemNodeIds = new Set(
    currentStudyItems.map((row) => row.derived_node_id)
  );
  const difficultyByNode = new Map(
    rows<DifficultyRow>(tables, "concept_difficulties")
      .map((row) => [row.derived_node_id, row] as const)
  );
  const nodes: DerivedGraphNode[] = rows<DerivedNodeRow>(tables, "derived_graph_nodes")
    .filter((row) => trailNodeIds.has(row.derived_node_id))
    .map((row) => {
      const difficulty = difficultyByNode.get(row.derived_node_id);
      return {
        derivedNodeId: row.derived_node_id,
        label: row.canonical_label,
        aliases: row.aliases,
        declaredDomain: row.declared_domain,
        difficulty: difficulty?.score ?? null,
        difficultyRationale: difficulty?.neural_rationale ?? null,
        difficultyBand: difficulty?.components.band ?? null,
        difficultyContested: difficulty?.components.contested === undefined
          ? null
          : Boolean(difficulty.components.contested),
        nodeKind: row.node_kind,
        groundingOrigin: row.grounding_origin,
        role: row.role,
        hasStudyItem: currentItemNodeIds.has(row.derived_node_id),
        grounding: null
      };
    });
  requireExactSet(
    nodes.map((node) => node.derivedNodeId),
    trailNodeIds,
    `${acceptedPackage.catalog.catalogKey} trail nodes`
  );

  const edges: DerivedGraphEdge[] = rows<EdgeRow>(tables, "inferred_prerequisite_edges")
    .filter((row) =>
      trailNodeIds.has(row.prerequisite_derived_node_id) &&
      trailNodeIds.has(row.dependent_derived_node_id)
    )
    .map((row) => ({
      prerequisiteDerivedNodeId: row.prerequisite_derived_node_id,
      dependentDerivedNodeId: row.dependent_derived_node_id,
      confidence: row.confidence,
      uncertain: row.uncertain,
      judgeModel: row.judge_model
    }));
  const trustedEdges = edges.filter((edge) => !edge.uncertain);

  const lessons = reconstructCurrentLessons(tables, currentConceptLessonIds);
  requireExactSet(
    lessons.map((lesson) => lesson.conceptLessonId),
    currentConceptLessonIds,
    `${acceptedPackage.catalog.catalogKey} current lessons`
  );
  const passageCounts = lessons.map((lesson) =>
    lessonGroundingShape(lesson)?.passages.length ?? 0
  );
  const cueResolution = await resolveExpeditionSourceCues({
    lessons,
    sourceEvidenceRead: packageSourceEvidenceRead(tables)
  });
  if (!cueResolution.resolved) {
    throw new Error(
      `${acceptedPackage.catalog.catalogKey} source cue resolution failed: ${JSON.stringify(cueResolution)}`
    );
  }
  const sourceCues = new Map(cueResolution.cues.map((cue) => [
    cue.derivedNodeId,
    cue
  ] as const));
  const routeNodeIds = route.orderedDerivedNodeIds;
  requireExactSet(
    routeNodeIds,
    trailNodeIds,
    `${acceptedPackage.catalog.catalogKey} projected route nodes`
  );
  const routePosition = new Map(
    routeNodeIds.map((derivedNodeId, index) => [derivedNodeId, index] as const)
  );
  const trustedTopologicalViolationCount = trustedEdges.filter((edge) =>
    requiredPosition(routePosition, edge.prerequisiteDerivedNodeId) >=
    requiredPosition(routePosition, edge.dependentDerivedNodeId)
  ).length;
  const currentFamiliesByNode = familySetsByNode(currentStudyItems);
  const fullFamiliesByNode = familySetsByNode(studyItems);
  const mixedLegCount = route.legs.filter((leg) =>
    leg.derivedNodeIds.some((derivedNodeId) =>
      hasBonusFamily(currentFamiliesByNode.get(derivedNodeId))
    )
  ).length;
  const longestBonusUncoveredRun = longestRun(
    routeNodeIds.map((derivedNodeId) =>
      !hasBonusFamily(fullFamiliesByNode.get(derivedNodeId))
    )
  );
  const orderedSourceCues = routeNodeIds.flatMap((derivedNodeId) => {
    const cue = sourceCues.get(derivedNodeId);
    return cue ? [cue] : [];
  });
  const sourceOrderBacktrackCount = orderedSourceCues.slice(1).filter((cue, index) => {
    const previous = orderedSourceCues[index];
    return previous.sourceDocumentId === cue.sourceDocumentId &&
      typeof previous.locator.characterStart === "number" &&
      typeof cue.locator.characterStart === "number" &&
      previous.locator.characterStart > cue.locator.characterStart;
  }).length;
  const sourceMajorHeadingTransitionsInsideLegs = route.legs.reduce(
    (total, leg) => total + leg.derivedNodeIds.slice(1).filter((derivedNodeId, index) => {
      const previousCue = sourceCues.get(leg.derivedNodeIds[index]);
      const cue = sourceCues.get(derivedNodeId);
      return Boolean(
        previousCue && cue &&
        previousCue.sourceDocumentId === cue.sourceDocumentId &&
        majorHeading(previousCue) !== majorHeading(cue)
      );
    }).length,
    0
  );
  const nodeById = new Map(nodes.map((node) => [node.derivedNodeId, node] as const));

  const currentFamilies = familyCounts(currentStudyItems);
  const everyLegHasThreeToFiveConcepts = route.legs.every((leg) =>
    leg.derivedNodeIds.length >= 3 && leg.derivedNodeIds.length <= 5
  );
  const everyLegHasMixedPractice = mixedLegCount === route.legs.length;
  const expeditionUsesEveryFamily = Object.values(currentFamilies).every((count) => count > 0);
  const honestConceptCount = acceptedPackage.qualification.totalConceptCount === trailNodeIds.size;

  return {
    catalogKey: acceptedPackage.catalog.catalogKey,
    title: acceptedPackage.catalog.title,
    packageSha256,
    assetConfigHash: acceptedPackage.catalog.acceptedAssetConfigHash,
    assetSetIdentity: acceptedPackage.catalog.acceptedAssetSetIdentity,
    conceptCount: trailNodeIds.size,
    trustedEdgeCount: trustedEdges.length,
    trustedTopologicalViolationCount,
    legCount: route.legs.length,
    singletonLegCount: route.legs.filter((leg) =>
      leg.derivedNodeIds.length === 1
    ).length,
    legSizeHistogram: histogram(
      route.legs.map((leg) => leg.derivedNodeIds.length)
    ),
    fullBankFamilyCounts: familyCounts(studyItems),
    currentFamilyCounts: currentFamilies,
    mixedLegCount,
    longestBonusUncoveredRun,
    lessonGroundingPassageHistogram: histogram(passageCounts),
    rejectionReasonCounts: rejectionReasonCounts(
      rows<RejectedStudyItemRow>(tables, "rejected_study_items")
        .filter((row) => trailNodeIds.has(row.derived_node_id))
    ),
    sourceCueCount: sourceCues.size,
    sourceOrderBacktrackCount,
    sourceMajorHeadingTransitionsInsideLegs,
    projectedRoute: {
      policyIdentity: route.policyIdentity,
      orderedConcepts: routeNodeIds.map((derivedNodeId) => {
        const cue = sourceCues.get(derivedNodeId);
        return {
          derivedNodeId,
          canonicalLabel: nodeById.get(derivedNodeId)?.label ?? derivedNodeId,
          sourceDocumentId: cue?.sourceDocumentId ?? null,
          blockId: cue?.blockId ?? null,
          headingPath: cue?.headingPath ?? [],
          locator: cue?.locator ?? null
        };
      }),
      legs: route.legs,
      summitDerivedNodeId: route.summitDerivedNodeId
    },
    targetContract: {
      routePlanPresent: true,
      everyLegHasThreeToFiveConcepts,
      everyLegHasMixedPractice,
      expeditionUsesEveryFamily,
      honestConceptCount,
      routeSensitiveIdentity: acceptedPackage.catalog.acceptedAssetSetIdentity ===
        acceptedPackage.qualification.expectedAssets.assetSetIdentity
    }
  };
}

function packageTables(acceptedPackage: AcceptedPathPackage): Record<string, unknown[]> {
  const projection = acceptedPackage.projection as {
    tables?: Record<string, unknown>;
  };
  if (!projection || typeof projection !== "object" || !projection.tables) {
    throw new Error("Accepted path projection tables are required for the baseline report.");
  }
  const tables: Record<string, unknown[]> = {};
  for (const [name, value] of Object.entries(projection.tables)) {
    if (!Array.isArray(value)) {
      throw new Error(`Accepted path projection table ${JSON.stringify(name)} is not an array.`);
    }
    tables[name] = value;
  }
  return tables;
}

function rows<T>(tables: Record<string, unknown[]>, name: string): T[] {
  const value = tables[name];
  if (!value) throw new Error(`Accepted path projection is missing table ${JSON.stringify(name)}.`);
  return value as T[];
}

function familyCounts(rows: readonly StudyItemRow[]): Record<StudyItemType, number> {
  const counts: Record<StudyItemType, number> = {
    option_select: 0,
    matching: 0,
    impostor: 0
  };
  for (const row of rows) counts[row.item_type] += 1;
  return counts;
}

function familySetsByNode(rows: readonly StudyItemRow[]): Map<string, Set<StudyItemType>> {
  const result = new Map<string, Set<StudyItemType>>();
  for (const row of rows) {
    const families = result.get(row.derived_node_id) ?? new Set<StudyItemType>();
    families.add(row.item_type);
    result.set(row.derived_node_id, families);
  }
  return result;
}

function hasBonusFamily(families: ReadonlySet<StudyItemType> | undefined): boolean {
  return Boolean(families?.has("matching") || families?.has("impostor"));
}

function histogram(values: readonly number[]): Record<string, number> {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries(
    [...counts].sort(([left], [right]) => left - right)
      .map(([value, count]) => [String(value), count])
  );
}

function longestRun(values: readonly boolean[]): number {
  let longest = 0;
  let current = 0;
  for (const value of values) {
    current = value ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function requiredPosition(positions: ReadonlyMap<string, number>, id: string): number {
  const position = positions.get(id);
  if (position === undefined) throw new Error(`Route position is missing for ${JSON.stringify(id)}.`);
  return position;
}

function requireExactSet(values: readonly string[], expected: ReadonlySet<string>, label: string): void {
  const actual = new Set(values);
  if (actual.size !== values.length || actual.size !== expected.size ||
      [...expected].some((value) => !actual.has(value))) {
    throw new Error(`${label} do not have exact one-row closure.`);
  }
}

function reconstructCurrentLessons(
  tables: Record<string, unknown[]>,
  currentConceptLessonIds: ReadonlySet<string>
): ConceptLesson[] {
  const sectionRows = rows<ConceptLessonSectionRow>(tables, "concept_lesson_sections");
  const citationBySection = new Map(
    rows<ConceptLessonCitationRow>(tables, "concept_lesson_section_citations")
      .map((row) => [row.concept_lesson_section_id, row] as const)
  );
  const sectionsByLesson = new Map<string, ConceptLessonSectionRow[]>();
  for (const row of sectionRows) {
    const sections = sectionsByLesson.get(row.concept_lesson_id) ?? [];
    sections.push(row);
    sectionsByLesson.set(row.concept_lesson_id, sections);
  }
  return rows<ConceptLessonRow>(tables, "concept_lessons")
    .filter((row) => currentConceptLessonIds.has(row.concept_lesson_id))
    .map((row) => ({
      conceptLessonId: row.concept_lesson_id,
      derivedNodeId: row.derived_node_id,
      graphVersionId: row.graph_version_id,
      enrichmentId: row.enrichment_id,
      generatingModel: row.generating_model,
      configHash: row.config_hash,
      canonicalLabel: row.canonical_label,
      sections: [...(sectionsByLesson.get(row.concept_lesson_id) ?? [])]
        .sort((left, right) => left.ordinal - right.ordinal)
        .map((section): ConceptLessonSection => {
          const citation = citationBySection.get(section.concept_lesson_section_id);
          return {
            kind: section.kind,
            text: section.body_text,
            ...(section.items ? { items: section.items } : {}),
            groundingProvenance: section.grounding_provenance,
            ...(citation?.provenance === "source"
              ? {
                  citation: {
                    provenance: "source" as const,
                    sourceResourceId: requiredString(citation.source_resource_id, "source resource"),
                    sourceBlockId: requiredString(citation.source_block_id, "source block"),
                    evidenceQuote: requiredString(citation.evidence_quote, "source evidence quote"),
                    matchKind: citation.match_kind === "normalized" ? "normalized" as const : "exact" as const
                  }
                }
              : citation?.provenance === "generated"
                ? {
                    citation: {
                      provenance: "generated" as const,
                      derivedNodeId: requiredString(citation.derived_node_id, "generated citation node"),
                      passageText: requiredString(citation.generated_passage_text, "generated passage")
                    }
                  }
                : {}),
            ...(section.diagram_caption && section.diagram_spec
              ? { diagram: { caption: section.diagram_caption, spec: section.diagram_spec } }
              : {})
          };
        }),
      explorableTerms: row.explorable_terms
    }));
}

function packageSourceEvidenceRead(
  tables: Record<string, unknown[]>
): SourceEvidenceReadPort {
  const documentById = new Map(rows<SourceDocumentRow>(tables, "source_documents").map((row) => [
    row.source_document_id,
    row
  ] as const));
  const resourceById = new Map(rows<SourceResourceRow>(tables, "source_resources").map((row) => [
    row.source_resource_id,
    row
  ] as const));
  const blockById = new Map(rows<SourceBlockRow>(tables, "source_blocks").map((row) => [
    row.source_block_id,
    row
  ] as const));
  return {
    async readSourceEvidence(references) {
      return [...new Map(references.map((reference) => [
        `${reference.sourceResourceId}\u0000${reference.sourceBlockId}`,
        reference
      ] as const)).values()].flatMap((reference) => {
        const block = blockById.get(reference.sourceBlockId);
        const document = block ? documentById.get(block.source_document_id) : undefined;
        if (!block || !document || document.source_resource_id !== reference.sourceResourceId) {
          return [];
        }
        const resource = resourceById.get(document.source_resource_id);
        if (!resource) return [];
        return [{
          sourceResourceId: resource.source_resource_id,
          sourceTitle: resource.title,
          sourceDocumentId: document.source_document_id,
          sourceBlockId: block.source_block_id,
          blockId: block.block_id,
          blockType: block.block_type,
          headingPath: block.heading_path,
          locator: block.locator,
          text: block.text
        }];
      });
    }
  };
}

function majorHeading(cue: ExpeditionInstructionalSourceCue): string {
  return cue.headingPath[1] ?? cue.headingPath[0] ?? "";
}

function rejectionReasonCounts(
  rejected: readonly RejectedStudyItemRow[]
): Array<{ itemType: StudyItemType; reason: string; count: number }> {
  const counts = new Map<string, { itemType: StudyItemType; reason: string; count: number }>();
  for (const row of rejected) {
    const key = `${row.item_type}\u0000${row.reason}`;
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { itemType: row.item_type, reason: row.reason, count: 1 });
  }
  return [...counts.values()].sort((left, right) =>
    right.count - left.count ||
    left.itemType.localeCompare(right.itemType) ||
    left.reason.localeCompare(right.reason)
  );
}

function requiredString(value: string | null, label: string): string {
  if (!value) throw new Error(`Accepted path ${label} is missing.`);
  return value;
}
