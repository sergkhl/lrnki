import { normalizeConceptLabel, type ScaffoldDetourStatus } from "@lrnki/domain-core";
import type {
  ConceptLessonStorePort,
  ScaffoldDetourStorePort,
  StudyItemBankStorePort
} from "@lrnki/ports";
import {
  resolveExactScaffoldReference,
  type ScaffoldOpeningStudySession
} from "./learnerScaffoldGeneration";
import {
  learnerKnowledgeCapabilityIsAvailable,
  type LearnerKnowledgeAvailability
} from "./learnerKnowledgeAvailability";
import type { SourceExpeditionModule } from "./sourceExpedition";

// Request-or-restore a learner-scoped Scaffold Detour (plan 2026-07-12-002 U5, F1, R4-R5). The
// server NEVER trusts a client-sent term: it verifies the active ready expedition, resolves the
// source block from server-owned neutral content, confirms parent membership, and confirms the
// term is one the current asset actually advertised (its `explorableTerms`). Only then does it
// idempotently upsert the detour; the API wakes the supervisor after a determinate create. Every
// refusal is a reason CODE (ADR-0033 keeps learner copy at the surface).

// The source block a term was advertised from: a Concept Lesson section (keyed by its node) or a
// Study Item question stem (keyed by the item). Both resolve to the parent Concept Marker node.
export type ScaffoldTermSource =
  | { kind: "lesson"; derivedNodeId: string }
  | { kind: "study_item"; studyItemId: string };

export type RequestScaffoldRefusal =
  | "invalid_input"
  | "expedition_inactive"
  | "source_not_found"
  | "node_not_in_enrichment"
  | "term_not_advertised"
  | "generated_support_step_unavailable"
  | "reference_support_step_unavailable";

export type RequestLearnerScaffoldResult =
  | { created: true; detourId: string; status: ScaffoldDetourStatus }
  | { created: false; refused: RequestScaffoldRefusal };

type RequestScaffoldPorts = {
  sourceExpeditions: Pick<SourceExpeditionModule, "authorizeActive">;
  studyItemStore: StudyItemBankStorePort;
  conceptLessonStore: ConceptLessonStorePort;
  scaffoldStore: ScaffoldDetourStorePort;
  learnerKnowledgeAvailability: LearnerKnowledgeAvailability;
  readStudySession: (input: {
    enrichmentId: string;
    learnerStateRef: string;
  }) => Promise<ScaffoldOpeningStudySession | undefined>;
};

// Resolve the source block to its parent node id + the exact terms it advertised, or a refusal.
async function resolveSource(
  input: {
    enrichmentId: string;
    source: ScaffoldTermSource;
    qualifiedConceptLessonIds: ReadonlySet<string>;
    qualifiedStudyItemIds: ReadonlySet<string>;
  },
  ports: RequestScaffoldPorts
): Promise<{ parentDerivedNodeId: string; advertisedTerms: string[] } | RequestScaffoldRefusal> {
  if (input.source.kind === "study_item") {
    if (!input.qualifiedStudyItemIds.has(input.source.studyItemId)) return "source_not_found";
    const item = await ports.studyItemStore.getStudyItemById(input.source.studyItemId);
    if (!item || item.enrichmentId !== input.enrichmentId) return "source_not_found";
    return { parentDerivedNodeId: item.derivedNodeId, advertisedTerms: item.explorableTerms };
  }
  const lesson = await ports.conceptLessonStore.getLesson(input.source.derivedNodeId);
  if (!lesson || lesson.enrichmentId !== input.enrichmentId ||
      !input.qualifiedConceptLessonIds.has(lesson.conceptLessonId)) return "source_not_found";
  // A lesson advertises `{ term, sectionKind }`; the detour keys on the term text only.
  return { parentDerivedNodeId: input.source.derivedNodeId, advertisedTerms: lesson.explorableTerms.map((entry) => entry.term) };
}

export async function requestLearnerScaffold(
  input: { learnerStateRef: string; enrichmentId: string; source: ScaffoldTermSource; term: string },
  ports: RequestScaffoldPorts
): Promise<RequestLearnerScaffoldResult> {
  const term = input.term.trim();
  if (!input.learnerStateRef || !input.enrichmentId || term.length === 0) return { created: false, refused: "invalid_input" };

  const source = await ports.sourceExpeditions.authorizeActive({
    learnerStateRef: input.learnerStateRef,
    enrichmentId: input.enrichmentId
  });
  if (source.status !== "available") return { created: false, refused: "expedition_inactive" };

  const resolved = await resolveSource({
    enrichmentId: input.enrichmentId,
    source: input.source,
    qualifiedConceptLessonIds: source.qualifiedConceptLessonIds,
    qualifiedStudyItemIds: source.qualifiedStudyItemIds
  }, ports);
  if (typeof resolved === "string") return { created: false, refused: resolved };

  // Parent membership in the active enrichment (R5). Study-item sources already carry a matching
  // enrichmentId, but a lesson source's node is re-verified so a stale/foreign node cannot attach.
  if (!source.trailNodeIds.has(resolved.parentDerivedNodeId)) {
    return { created: false, refused: "node_not_in_enrichment" };
  }

  // The term must be exactly one the current asset advertised — the deterministic validator already
  // proved these are distinct exact rendered substrings, so an exact membership test is sufficient.
  if (!resolved.advertisedTerms.includes(term)) return { created: false, refused: "term_not_advertised" };

  // Current production publishes only an exact pinned reference. Prove that outcome against the
  // same finished Study Session the generator will reopen before creating or waking a detour; an
  // absent/colliding term returns a stable refusal with no queue write and therefore no neural call.
  if (!learnerKnowledgeCapabilityIsAvailable(ports.learnerKnowledgeAvailability, "generatedSupportSteps")) {
    if (!learnerKnowledgeCapabilityIsAvailable(ports.learnerKnowledgeAvailability, "referenceSupportSteps")) {
      return { created: false, refused: "reference_support_step_unavailable" };
    }
    const session = await ports.readStudySession({
      enrichmentId: input.enrichmentId,
      learnerStateRef: input.learnerStateRef
    });
    const parent = session?.detail.nodes.find((node) => node.derivedNodeId === resolved.parentDerivedNodeId);
    if (!session || !parent) return { created: false, refused: "reference_support_step_unavailable" };
    if (resolveExactScaffoldReference(term, session, parent).kind !== "reference") {
      return { created: false, refused: "generated_support_step_unavailable" };
    }
  }

  const detour = await ports.scaffoldStore.upsertPending({
    learnerStateRef: input.learnerStateRef,
    enrichmentId: input.enrichmentId,
    parentDerivedNodeId: resolved.parentDerivedNodeId,
    term,
    normalizedTerm: normalizeConceptLabel(term)
  });
  return { created: true, detourId: detour.detourId, status: detour.status };
}

// Retry a FAILED detour (R16, F4): reuse the detour identity and return it to `generating` for a
// fresh claim. Scoped to the owning learner by the store, so a learner cannot retry another's row.
export async function retryLearnerScaffold(
  input: { learnerStateRef: string; detourId: string },
  ports: {
    scaffoldStore: ScaffoldDetourStorePort;
    learnerKnowledgeAvailability: LearnerKnowledgeAvailability;
  }
): Promise<
  | { retried: true }
  | { retried: false; refused?: "generated_support_step_unavailable" }
> {
  if (!input.learnerStateRef || !input.detourId) return { retried: false };
  if (!learnerKnowledgeCapabilityIsAvailable(ports.learnerKnowledgeAvailability, "generatedSupportSteps")) {
    return { retried: false, refused: "generated_support_step_unavailable" };
  }
  const detour = await ports.scaffoldStore.restartGenerating({ detourId: input.detourId, learnerStateRef: input.learnerStateRef });
  return { retried: detour !== undefined };
}

// Hide a ready detour or dismiss a failed one (R18, F4). Content + evidence are preserved; a later
// reselection of the same term restores it. Scoped to the owning learner by the store.
export async function hideLearnerScaffold(
  input: { learnerStateRef: string; detourId: string },
  ports: { scaffoldStore: ScaffoldDetourStorePort }
): Promise<{ hidden: boolean }> {
  if (!input.learnerStateRef || !input.detourId) return { hidden: false };
  const hidden = await ports.scaffoldStore.hide({ detourId: input.detourId, learnerStateRef: input.learnerStateRef });
  return { hidden };
}
