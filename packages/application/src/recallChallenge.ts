import { randomUUID } from "node:crypto";
import { neutralResponses, type MatchingItem, type ResponseLogRow, type StudyItem } from "@lrnki/domain-core";
import type {
  NewRecallChallengeEvent,
  RecallChallengeEvent,
  RecallChallenge,
  RecallChallengeLineupEntry,
  RecallChallengeRecord,
  RecallChallengeScopeKind,
  RecallChallengeStorePort,
  ResponseLogStorePort
} from "@lrnki/ports";
import { deriveFlooredExpedition } from "./expeditionSections";
import { keyedCorrectIdFor, keyedMatchIdFor } from "./gradedSelectionOutcome";
import { ENRICHMENT_LINEUP_MAX, SECTION_LINEUP_MAX } from "./recallLineupBudget";
import { studyItemToView, type StudyItemView } from "./studySessionProjection";
import type { OpenedSourceExpedition, SourceExpeditionModule } from "./sourceExpedition";

// The PURE half of the Recall Challenge deep module (plan 2026-07-13-003 U1; KTD1, KTD5, KTD6).
// Everything here is data-in/data-out: lineup selection, the combat-state fold over the
// append-only event history, turn validity, and the learner-safe challenge view. No store,
// port instance, clock, or randomness is imported, so the exact fight state is replayable from
// the immutable lineup + ordered events alone — reconnect and resume never depend on cached
// client state. Persisted/port/application vocabulary stays plain (`recall challenge`,
// `section|enrichment`, `active|recovery|won`); only the Learner App maps these to Guardian,
// Leg/Expedition, and Last Stand language (ADR-0033).

// The three-segment miss buffer (the crystal shield, client-side). The R2 lineup maxima it
// sits beside are the scope ward budget in `recallLineupBudget.ts`; the shield is the
// learner's, not a lineup budget, so it stays here.
export const RECALL_MISS_BUFFER = 3;

// --- Selection (KTD5) -------------------------------------------------------

// One eligible candidate: a CURRENT neutral Study Item whose latest acquisition outcome is
// correct, tagged with its concept, its trail section (the Leg identity used only by
// enrichment-scope coverage), and how many prior challenge lineups it appeared in.
export type RecallEligibleItem = {
  studyItemId: string;
  derivedNodeId: string;
  sectionIndex: number;
  priorChallengeExposure: number;
};

// Deterministic server-side tie-break derived from challenge identity (KTD5): FNV-1a over
// `challengeId:studyItemId`. Stable for a given challenge, varies across challenges so
// rematches do not fossilize one ordering, and never leaves the server.
function challengeTieBreak(challengeId: string, studyItemId: string): number {
  const text = `${challengeId}:${studyItemId}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

// Coverage-first lineup selection (KTD5). Group by concept, reserve an eligible anchor, then
// round-robin distinct concepts — and, for enrichment scope, distinct Legs — before repeats.
// Equally eligible candidates rank by least prior challenge exposure, then the stable
// challenge-identity tie-break. The R2 maxima truncate AFTER coverage ordering. An empty
// result means the scope is `unavailable` (`no_eligible_items`) — never a fabricated lineup.
export function selectRecallLineup(input: {
  challengeId: string;
  scopeKind: RecallChallengeScopeKind;
  anchorDerivedNodeId: string;
  eligible: RecallEligibleItem[];
}): { studyItemId: string; derivedNodeId: string }[] {
  if (input.eligible.length === 0) return [];
  const max = input.scopeKind === "section" ? SECTION_LINEUP_MAX : ENRICHMENT_LINEUP_MAX;

  const rank = (a: RecallEligibleItem, b: RecallEligibleItem): number =>
    a.priorChallengeExposure - b.priorChallengeExposure ||
    challengeTieBreak(input.challengeId, a.studyItemId) - challengeTieBreak(input.challengeId, b.studyItemId) ||
    a.studyItemId.localeCompare(b.studyItemId);

  // Per-concept queues, each internally rank-ordered; concepts ordered by their best item,
  // with the eligible anchor concept forced first so its item is reserved as lineup[0].
  const byConcept = new Map<string, RecallEligibleItem[]>();
  for (const item of input.eligible) {
    const queue = byConcept.get(item.derivedNodeId);
    if (queue) queue.push(item);
    else byConcept.set(item.derivedNodeId, [item]);
  }
  const conceptQueues = [...byConcept.values()].map((items) => [...items].sort(rank));
  conceptQueues.sort((a, b) => (a[0].derivedNodeId === input.anchorDerivedNodeId ? -1 : b[0].derivedNodeId === input.anchorDerivedNodeId ? 1 : rank(a[0], b[0])));

  // Round-robin pop across an ordered list of queues: one item per queue per cycle until the
  // budget or the pool is exhausted.
  const roundRobin = (queues: RecallEligibleItem[][]): RecallEligibleItem[] => {
    const picked: RecallEligibleItem[] = [];
    while (picked.length < max && queues.some((queue) => queue.length > 0)) {
      for (const queue of queues) {
        if (picked.length >= max) break;
        const next = queue.shift();
        if (next) picked.push(next);
      }
    }
    return picked;
  };

  let picked: RecallEligibleItem[];
  if (input.scopeKind === "section") {
    picked = roundRobin(conceptQueues);
  } else {
    // Enrichment scope: distinct Legs before repeats. Legs cycle in best-item order (the
    // anchor's Leg first, carried by its forced-first concept queue); each Leg-turn pops from
    // that Leg's own concept round-robin.
    const legs = new Map<number, RecallEligibleItem[][]>();
    for (const queue of conceptQueues) {
      const leg = legs.get(queue[0].sectionIndex);
      if (leg) leg.push(queue);
      else legs.set(queue[0].sectionIndex, [queue]);
    }
    const legQueues = [...legs.values()];
    picked = [];
    while (picked.length < max && legQueues.some((leg) => leg.some((queue) => queue.length > 0))) {
      for (const leg of legQueues) {
        if (picked.length >= max) break;
        const queue = leg.find((candidate) => candidate.length > 0);
        const next = queue?.shift();
        if (next) picked.push(next);
        // Rotate this Leg's concept order so its next turn starts at the following concept.
        if (queue) leg.push(...leg.splice(leg.indexOf(queue), 1));
      }
    }
  }
  return picked.map((item) => ({ studyItemId: item.studyItemId, derivedNodeId: item.derivedNodeId }));
}

// The latest-correct acquisition fold over neutral graded responses — the eligibility half of
// KTD5's pool: an item enters a lineup only when the learner's most recent neutral graded
// answer for it is `correct`.
export function latestCorrectStudyItemIds(rows: ResponseLogRow[]): Set<string> {
  const latestBySeq = new Map<string, { attemptSeq: number; correct: boolean }>();
  for (const row of neutralResponses(rows)) {
    if (row.signalType !== "graded" || !row.judgedOutcome) continue;
    const current = latestBySeq.get(row.studyItemId);
    if (current && row.attemptSeq <= current.attemptSeq) continue;
    latestBySeq.set(row.studyItemId, { attemptSeq: row.attemptSeq, correct: row.judgedOutcome === "correct" });
  }
  return new Set([...latestBySeq.entries()].filter(([, latest]) => latest.correct).map(([studyItemId]) => studyItemId));
}

// Pure eligibility assembly over already-loaded data (KTD5): the module's port reads and the
// Study Session reader both feed this, so `/challenge/scopes` and the `/expedition/:id`
// projection derive IDENTICAL pools from one definition. `sectionIndexFor` doubles as the
// scope filter — undefined means the item's concept is out of scope.
export function eligibleRecallItems(input: {
  items: readonly StudyItem[];
  rows: ResponseLogRow[];
  exposure: Record<string, number>;
  sectionIndexFor: (derivedNodeId: string) => number | undefined;
}): RecallEligibleItem[] {
  const passed = latestCorrectStudyItemIds(input.rows);
  const eligible: RecallEligibleItem[] = [];
  for (const item of input.items) {
    const sectionIndex = input.sectionIndexFor(item.derivedNodeId);
    if (sectionIndex === undefined || !passed.has(item.studyItemId)) continue;
    eligible.push({
      studyItemId: item.studyItemId,
      derivedNodeId: item.derivedNodeId,
      sectionIndex,
      priorChallengeExposure: input.exposure[item.studyItemId] ?? 0
    });
  }
  return eligible;
}

// --- Combat fold (KTD6) -----------------------------------------------------

export type RecallCombatPhase = "active" | "recovery" | "won";

// Mid-board Matching progress, preserved by the fold so retreat/reload resumes the exact
// board. `roundIndex` increments on every dirty-round completion — the client keys its
// reshuffle to it so a recovery board re-randomizes deterministically per round.
export type RecallMatchingBoard = {
  studyItemId: string;
  matchedPromptIds: string[];
  roundHasMiss: boolean;
  roundIndex: number;
};

export type RecallCombatState = {
  phase: RecallCombatPhase;
  remainingMissBuffer: number;
  // Queue order; the head is the single current turn. Miss rotates the head behind the other
  // unresolved items where possible (KTD6 "queue ward").
  unresolvedItemIds: string[];
  resolvedItemIds: string[];
  retreated: boolean;
  abandoned: boolean;
  // The current item's Matching board when one is mid-round, else null.
  matching: RecallMatchingBoard | null;
};

// Replay the immutable lineup + ordered events into the canonical combat state. Defensive by
// construction: an answer event for a non-current item is ignored (turn validity is enforced
// at the write boundary; the fold never lets a stray event corrupt state). `pairCountFor`
// supplies each Matching item's pair count so round completion needs no answer keys.
export function foldRecallChallenge(input: {
  lineup: Pick<RecallChallengeLineupEntry, "studyItemId">[];
  events: RecallChallengeEvent[];
  pairCountFor: (studyItemId: string) => number;
}): RecallCombatState {
  const state: RecallCombatState = {
    phase: "active",
    remainingMissBuffer: RECALL_MISS_BUFFER,
    unresolvedItemIds: input.lineup.map((entry) => entry.studyItemId),
    resolvedItemIds: [],
    retreated: false,
    abandoned: false,
    matching: null
  };
  // Per-item round counters survive rotation so a returning Matching item keeps its reshuffle
  // history.
  const roundIndexByItem = new Map<string, number>();

  const miss = (): void => {
    if (state.remainingMissBuffer > 0) state.remainingMissBuffer -= 1;
    if (state.unresolvedItemIds.length > 1) state.unresolvedItemIds.push(state.unresolvedItemIds.shift() as string);
    state.matching = null;
  };
  const resolve = (): void => {
    const wasRecovery = state.remainingMissBuffer === 0;
    state.resolvedItemIds.push(state.unresolvedItemIds.shift() as string);
    // The correct response that resolves the item in recovery also restores exactly one
    // buffer unit and leaves recovery (KTD6) — never more, never a full reset.
    if (wasRecovery) state.remainingMissBuffer = 1;
    state.matching = null;
  };

  for (const event of [...input.events].sort((a, b) => a.seq - b.seq)) {
    if (event.kind !== "selection_answer" && event.kind !== "matching_pair") {
      if (event.kind === "retreat") state.retreated = true;
      else if (event.kind === "resume") state.retreated = false;
      else state.abandoned = true;
      continue;
    }
    const currentItemId = state.unresolvedItemIds[0];
    if (!currentItemId || event.studyItemId !== currentItemId) continue;

    if (event.kind === "selection_answer") {
      if (event.correct) resolve();
      else miss();
      continue;
    }
    // matching_pair: single shield hit only at completed-round resolution (KTD6); a wrong pair
    // marks the round dirty and feedback is per-pair at the seam.
    if (state.matching?.studyItemId !== currentItemId) {
      state.matching = { studyItemId: currentItemId, matchedPromptIds: [], roundHasMiss: false, roundIndex: roundIndexByItem.get(currentItemId) ?? 0 };
    }
    const board = state.matching;
    if (!event.correct) { board.roundHasMiss = true; continue; }
    if (event.promptId && !board.matchedPromptIds.includes(event.promptId)) board.matchedPromptIds.push(event.promptId);
    const pairCount = input.pairCountFor(currentItemId);
    if (pairCount > 0 && board.matchedPromptIds.length >= pairCount) {
      if (board.roundHasMiss) {
        // The completed dirty round is ONE miss; recovery presents a reshuffled board — the
        // fold resets progress and bumps the round counter (the client's reshuffle key).
        roundIndexByItem.set(currentItemId, board.roundIndex + 1);
        miss();
      } else {
        resolve();
      }
    }
  }

  state.phase = state.unresolvedItemIds.length === 0 ? "won" : state.remainingMissBuffer === 0 ? "recovery" : "active";
  return state;
}

// The single valid answer target: the head of the unresolved queue. Answers naming any other
// item are stale/out-of-turn and rejected without appending an event.
export function currentTurnItemId(state: RecallCombatState): string | null {
  return state.phase === "won" || state.abandoned ? null : (state.unresolvedItemIds[0] ?? null);
}

// --- Learner-safe view (KTD7) -----------------------------------------------

// One discriminated challenge view crosses the HTTP seam. It reuses the projection's key-free
// `StudyItemView` for the current item, so no pre-answer/future-item key, raw keyed item, or
// store row can leak by construction. The Learner App maps `recovery`, `unresolvedItemCount`,
// and `remainingMissBuffer` to Last Stand, wards, and the crystal shield.
export type RecallMatchingProgressView = { matchedPromptIds: string[]; roundIndex: number };

export type RecallChallengeView =
  | {
      state: "active" | "recovery";
      challengeId: string;
      enrichmentId: string;
      scopeKind: RecallChallengeScopeKind;
      anchorDerivedNodeId: string;
      wardTotal: number;
      unresolvedItemCount: number;
      resolvedItemCount: number;
      remainingMissBuffer: number;
      missBufferTotal: number;
      retreated: boolean;
      currentItem: StudyItemView;
      matchingProgress: RecallMatchingProgressView | null;
    }
  | {
      state: "won";
      challengeId: string;
      enrichmentId: string;
      scopeKind: RecallChallengeScopeKind;
      anchorDerivedNodeId: string;
      wardTotal: number;
    };

export function projectRecallChallengeView(input: {
  challenge: { challengeId: string; enrichmentId: string; scopeKind: RecallChallengeScopeKind; scopeAnchorDerivedNodeId: string };
  lineup: Pick<RecallChallengeLineupEntry, "studyItemId">[];
  state: RecallCombatState;
  itemById: ReadonlyMap<string, StudyItem>;
}): RecallChallengeView {
  const shared = {
    challengeId: input.challenge.challengeId,
    enrichmentId: input.challenge.enrichmentId,
    scopeKind: input.challenge.scopeKind,
    anchorDerivedNodeId: input.challenge.scopeAnchorDerivedNodeId,
    wardTotal: input.lineup.length
  };
  if (input.state.phase === "won") return { state: "won", ...shared };
  const currentItemId = input.state.unresolvedItemIds[0];
  const item = input.itemById.get(currentItemId);
  if (!item) throw new Error(`recall challenge ${input.challenge.challengeId} lineup item ${currentItemId} failed to hydrate.`);
  return {
    state: input.state.phase,
    ...shared,
    unresolvedItemCount: input.state.unresolvedItemIds.length,
    resolvedItemCount: input.state.resolvedItemIds.length,
    remainingMissBuffer: input.state.remainingMissBuffer,
    missBufferTotal: RECALL_MISS_BUFFER,
    retreated: input.state.retreated,
    currentItem: studyItemToView(item),
    matchingProgress: input.state.matching && input.state.matching.studyItemId === currentItemId
      ? { matchedPromptIds: [...input.state.matching.matchedPromptIds], roundIndex: input.state.matching.roundIndex }
      : null
  };
}

// Post-commit feedback for the attempted CURRENT item only (KTD7): a selection answer reveals
// its keyed-correct id after the event is committed; a Matching pair reveals only that pair's
// correct match. Future items stay key-free.
export type RecallAnswerFeedback =
  | { kind: "selection"; correct: boolean; chosenId: string; keyedCorrectId: string }
  | {
      kind: "matching_pair";
      correct: boolean;
      promptId: string;
      chosenMatchId: string;
      keyedMatchId: string;
      roundComplete: boolean;
      roundClean: boolean;
    };

// --- Deep-module orchestration (KTD1) -----------------------------------------

// The one public application boundary for Recall Challenges. The factory binds the narrow
// read/store ports ONCE and exposes use-case-shaped operations; selection, grading dispatch,
// state folding, and view projection stay internal. Routes perform authentication and
// transport mapping only. No response-log writer is bound (KTD4): a challenge answer is
// structurally incapable of touching neutral mastery, points, or prerequisite access.
export type RecallChallengeDeps = {
  sourceExpeditions: Pick<SourceExpeditionModule, "openActive">;
  responseLog: ResponseLogStorePort;
  challengeStore: RecallChallengeStorePort;
};

// One scope's server-owned status: what the trail projection and the Guardian entry read.
// `locked` applies only to the enrichment scope while a winnable Leg's formation is missing; a
// scope with zero eligible items is honestly `unavailable` (never auto-won, never fabricated).
export type RecallScopeStatus = {
  scopeKind: RecallChallengeScopeKind;
  anchorDerivedNodeId: string;
  anchorLabel: string;
  sectionIndex: number | null;
  eligibleItemCount: number;
  state: "unavailable" | "locked" | "available" | "active" | "won";
  reason?: "no_eligible_items";
  activeChallengeId?: string;
  // The FIRST victory's identity — permanent formation, stable across rematches (KTD3).
  wonChallengeId?: string;
};

// Pure per-scope status projection over already-loaded data (plan 2026-07-13-003 U4): every
// Leg (section milestone) plus the Expedition (summit) scope. The module's `scopeStatus`
// loads through its ports and calls this; `getStudySession` reuses the rows it already loaded
// and calls the same function, so the trail's Guardian facts cannot drift from the challenge
// routes. Victory identity is FIRST-win-wins (KTD3): a duplicate won scope in the input never
// re-keys the permanent formation.
//
// The enrichment scope stays `locked` until every WINNABLE Leg has a formation (plan
// 2026-07-31-003 KTD11). Winnable is `ExpeditionSection.hasStudyItems` — whether the scope can
// ever produce a lineup — and section derivation already merges away any item-less Leg, so on a
// real layer every Leg is winnable and the gate is the familiar "every Leg won". The exception
// is a layer with NO Study Items at all, which no boundary edit can repair: there is no winnable
// Leg, the summit is not locked behind an unsatisfiable precondition, and it falls through to
// its own eligibility — honestly `unavailable` / `no_eligible_items`. Winnability is not the
// full Guardian precondition: the Leg must also reach `complete`, which the trail owns.
export function projectRecallScopeStatuses(input: {
  nodes: readonly { derivedNodeId: string; label: string }[];
  sections: readonly { sectionIndex: number; milestoneDerivedNodeId: string; hasStudyItems: boolean }[];
  summit: { derivedNodeId: string } | null;
  eligible: readonly RecallEligibleItem[];
  challenges: readonly Pick<RecallChallenge, "challengeId" | "status" | "scopeKind" | "scopeAnchorDerivedNodeId">[];
  wonScopes: readonly { scopeKind: RecallChallengeScopeKind; scopeAnchorDerivedNodeId: string; challengeId: string }[];
}): RecallScopeStatus[] {
  const labelOf = new Map(input.nodes.map((node) => [node.derivedNodeId, node.label] as const));
  const wonBy = new Map<string, string>();
  for (const scope of input.wonScopes) {
    const key = `${scope.scopeKind} ${scope.scopeAnchorDerivedNodeId}`;
    if (!wonBy.has(key)) wonBy.set(key, scope.challengeId);
  }
  const activeBy = new Map<string, string>(
    input.challenges
      .filter((challenge) => challenge.status === "active")
      .map((challenge) => [`${challenge.scopeKind} ${challenge.scopeAnchorDerivedNodeId}`, challenge.challengeId] as const)
  );

  const statusFor = (
    scopeKind: RecallChallengeScopeKind,
    anchorDerivedNodeId: string,
    sectionIndex: number | null,
    eligibleItemCount: number,
    locked: boolean
  ): RecallScopeStatus => {
    const key = `${scopeKind} ${anchorDerivedNodeId}`;
    const wonChallengeId = wonBy.get(key);
    const activeChallengeId = activeBy.get(key);
    const state: RecallScopeStatus["state"] = activeChallengeId
      ? "active"
      : wonChallengeId
        ? "won"
        : locked
          ? "locked"
          : eligibleItemCount === 0
            ? "unavailable"
            : "available";
    return {
      scopeKind,
      anchorDerivedNodeId,
      anchorLabel: labelOf.get(anchorDerivedNodeId) ?? anchorDerivedNodeId,
      sectionIndex,
      eligibleItemCount,
      state,
      ...(state === "unavailable" ? { reason: "no_eligible_items" as const } : {}),
      ...(activeChallengeId ? { activeChallengeId } : {}),
      ...(wonChallengeId ? { wonChallengeId } : {})
    };
  };

  const sectionStatuses = input.sections.map((section) => {
    const count = input.eligible.filter((item) => item.sectionIndex === section.sectionIndex).length;
    return statusFor("section", section.milestoneDerivedNodeId, section.sectionIndex, count, false);
  });
  // Ranges over winnable Legs only, so the gate can never be unsatisfiable: with no winnable Leg
  // there is nothing to wait for and the summit is not locked.
  const summitLocked = sectionStatuses.some((section, index) => input.sections[index].hasStudyItems && !section.wonChallengeId);
  const summitStatuses = input.summit
    ? [statusFor("enrichment", input.summit.derivedNodeId, null, input.eligible.length, summitLocked)]
    : [];
  return [...sectionStatuses, ...summitStatuses];
}

export type RecallChallengeRefusal =
  | "not_found"
  | "invalid_scope"
  | "scope_locked"
  | "no_eligible_items"
  | "challenge_not_active"
  | "out_of_turn"
  | "item_type_mismatch"
  | "invalid_input";

export type RecallCreateResult =
  | { created: true; view: RecallChallengeView }
  | { created: false; refused: "active_challenge_exists"; activeChallengeId: string }
  | { created: false; refused: Exclude<RecallChallengeRefusal, "out_of_turn" | "item_type_mismatch" | "challenge_not_active"> };

export type RecallReadResult =
  | { found: true; view: RecallChallengeView }
  | { found: false; refused: "not_found" };

export type RecallAnswerResult =
  | { answered: true; replayed: boolean; feedback: RecallAnswerFeedback | null; view: RecallChallengeView }
  | { answered: false; refused: RecallChallengeRefusal };

export type RecallLifecycleResult =
  | { applied: true; view: RecallChallengeView }
  | { applied: false; refused: "not_found" | "challenge_not_active" };

export type RecallChallengeModule = ReturnType<typeof createRecallChallenge>;

export function createRecallChallenge(deps: RecallChallengeDeps) {
  // The scope skeleton for one enrichment: section milestones (Legs) + the derived summit
  // (Expedition), each with its floored stop set. Scope identity is the milestone/summit
  // node id — stable across re-ordering (KTD2).
  const loadScopes = async (input: { learnerStateRef: string; enrichmentId: string }) => {
    const opened = await deps.sourceExpeditions.openActive(input);
    if (opened.status !== "available") return undefined;
    const { summit, sections } = deriveFlooredExpedition(opened.assets.detail);
    return { opened, detail: opened.assets.detail, summit, sections };
  };

  // The KTD5 eligible pool: CURRENT bank items on this scope's stops whose latest neutral
  // graded outcome is correct, decorated with Leg identity and prior challenge exposure.
  const loadEligible = async (input: {
    learnerStateRef: string;
    enrichmentId: string;
    assetSetIdentity: string;
    studyItems: readonly StudyItem[];
    nodeIdsInScope: (derivedNodeId: string) => number | undefined;
  }): Promise<RecallEligibleItem[]> => {
    const [rows, exposure] = await Promise.all([
      deps.responseLog.listForLearner(input.learnerStateRef),
      deps.challengeStore.priorExposure({
        learnerStateRef: input.learnerStateRef,
        enrichmentId: input.enrichmentId,
        assetSetIdentity: input.assetSetIdentity
      })
    ]);
    return eligibleRecallItems({
      items: input.studyItems,
      rows,
      exposure,
      sectionIndexFor: input.nodeIdsInScope
    });
  };

  const currentItemMap = (opened: OpenedSourceExpedition) =>
    new Map(opened.assets.studyItems.map((item) => [item.studyItemId, item.derivedNodeId] as const));

  const lineupMatchesCurrentAssets = (
    record: RecallChallengeRecord,
    opened: OpenedSourceExpedition
  ): boolean => {
    if (record.challenge.assetSetIdentity !== opened.assets.expectedAssets.assetSetIdentity ||
        record.lineup.length === 0) return false;
    const current = currentItemMap(opened);
    return record.lineup.every((entry) => current.get(entry.studyItemId) === entry.derivedNodeId);
  };

  const pairCounts = (items: readonly StudyItem[]) => {
    const byId = new Map(items.map((item) => [item.studyItemId, item] as const));
    return {
      itemById: byId,
      pairCountFor: (studyItemId: string): number => {
        const item = byId.get(studyItemId);
        return item?.itemType === "matching" ? item.pairs.length : 0;
      }
    };
  };

  const foldRecord = async (record: RecallChallengeRecord) => {
    const items = await deps.challengeStore.hydrateLineupItems({ challengeId: record.challenge.challengeId });
    const { itemById, pairCountFor } = pairCounts(items);
    const state = foldRecallChallenge({ lineup: record.lineup, events: record.events, pairCountFor });
    return { itemById, pairCountFor, state };
  };

  const viewOf = (record: RecallChallengeRecord, state: RecallCombatState, itemById: ReadonlyMap<string, StudyItem>): RecallChallengeView =>
    projectRecallChallengeView({ challenge: record.challenge, lineup: record.lineup, state, itemById });

  const nextSeq = (record: RecallChallengeRecord): number =>
    record.events.reduce((max, event) => Math.max(max, event.seq), 0) + 1;

  const reload = async (input: { learnerStateRef: string; challengeId: string }) => {
    const record = await deps.challengeStore.getForLearner(input);
    if (!record) return undefined;
    const opened = await deps.sourceExpeditions.openActive({
      learnerStateRef: input.learnerStateRef,
      enrichmentId: record.challenge.enrichmentId
    });
    if (opened.status !== "available" || !lineupMatchesCurrentAssets(record, opened)) {
      return undefined;
    }
    const folded = await foldRecord(record);
    return { record, opened, ...folded };
  };

  const scopeState = async (input: {
    learnerStateRef: string;
    enrichmentId: string;
    scopes: Awaited<ReturnType<typeof loadScopes>> & {};
  }) => {
    const assetSetIdentity = input.scopes.opened.assets.expectedAssets.assetSetIdentity;
    const sectionOf = new Map<string, number>();
    for (const section of input.scopes.sections) {
      for (const nodeId of section.stepDerivedNodeIds) sectionOf.set(nodeId, section.sectionIndex);
    }
    const storeInput = {
      learnerStateRef: input.learnerStateRef,
      enrichmentId: input.enrichmentId,
      assetSetIdentity
    };
    const [challenges, won, eligible] = await Promise.all([
      deps.challengeStore.listForLearnerEnrichment(storeInput),
      deps.challengeStore.listWonScopes(storeInput),
      loadEligible({
        ...storeInput,
        studyItems: input.scopes.opened.assets.studyItems,
        nodeIdsInScope: (nodeId) => sectionOf.get(nodeId)
      })
    ]);
    return { assetSetIdentity, sectionOf, challenges, won, eligible };
  };

  // Shared answer transition (KTD2/KTD6/KTD7): load + fold, replay a duplicate attempt as the
  // committed view, validate the turn, grade server-side, append with the expected sequence,
  // and materialize `won` in the same transaction when the final ward breaks.
  const transition = async (input: {
    learnerStateRef: string;
    challengeId: string;
    attemptRef: string;
    studyItemId: string;
    responseDurationMs: number | null;
    grade: (item: StudyItem) => { ok: false; refused: "item_type_mismatch" | "invalid_input" } | {
      ok: true;
      promptId: string | null;
      chosenId: string;
      correct: boolean;
      feedback: (stateAfter: RecallCombatState) => RecallAnswerFeedback;
    };
  }): Promise<RecallAnswerResult> => {
    const loaded = await reload(input);
    if (!loaded) return { answered: false, refused: "not_found" };
    const { record, state, itemById, pairCountFor } = loaded;

    const duplicate = record.events.find((event) => "attemptRef" in event && event.attemptRef === input.attemptRef);
    if (duplicate) return { answered: true, replayed: true, feedback: null, view: viewOf(record, state, itemById) };

    if (record.challenge.status !== "active" || state.abandoned) return { answered: false, refused: "challenge_not_active" };
    const currentItemId = currentTurnItemId(state);
    if (!currentItemId || input.studyItemId !== currentItemId) return { answered: false, refused: "out_of_turn" };
    const item = itemById.get(currentItemId);
    if (!item) return { answered: false, refused: "not_found" };

    const graded = input.grade(item);
    if (!graded.ok) return { answered: false, refused: graded.refused };

    const event: NewRecallChallengeEvent = {
      kind: graded.promptId === null ? "selection_answer" : "matching_pair",
      attemptRef: input.attemptRef,
      studyItemId: input.studyItemId,
      promptId: graded.promptId,
      chosenId: graded.chosenId,
      correct: graded.correct,
      recoveryPhase: state.phase === "recovery",
      responseDurationMs: input.responseDurationMs
    };
    const committedSeq = nextSeq(record);
    const stateAfter = foldRecallChallenge({
      lineup: record.lineup,
      events: [...record.events, { ...event, seq: committedSeq }],
      pairCountFor
    });
    const result = await deps.challengeStore.appendEvent({
      challengeId: input.challengeId,
      learnerStateRef: input.learnerStateRef,
      expectedSeq: committedSeq,
      event,
      ...(stateAfter.phase === "won" ? { materializeStatus: "won" as const } : {})
    });
    if (result === "appended") {
      const committed: RecallChallengeRecord = {
        ...record,
        challenge: { ...record.challenge, status: stateAfter.phase === "won" ? "won" : record.challenge.status },
        events: [...record.events, { ...event, seq: committedSeq }]
      };
      return { answered: true, replayed: false, feedback: graded.feedback(stateAfter), view: viewOf(committed, stateAfter, itemById) };
    }
    if (result === "duplicate" || result === "stale") {
      // The world moved on under us: reload and either replay this attempt or reject the turn.
      const fresh = await reload(input);
      if (!fresh) return { answered: false, refused: "not_found" };
      const committed = fresh.record.events.some((committedEvent) => "attemptRef" in committedEvent && committedEvent.attemptRef === input.attemptRef);
      if (committed) return { answered: true, replayed: true, feedback: null, view: viewOf(fresh.record, fresh.state, fresh.itemById) };
      return { answered: false, refused: "out_of_turn" };
    }
    return { answered: false, refused: "challenge_not_active" };
  };

  // State-edge lifecycle writes (KTD2): repeating retreat while retreated or resume while
  // engaged appends NOTHING, so refresh/poll behavior cannot inflate Flow evidence.
  const lifecycle = async (input: {
    learnerStateRef: string;
    challengeId: string;
    operationRef: string;
    kind: "retreat" | "resume" | "abandon";
  }): Promise<RecallLifecycleResult> => {
    const loaded = await reload(input);
    if (!loaded) return { applied: false, refused: "not_found" };
    const { record, state, itemById } = loaded;
    const alreadyCommitted = record.events.some((event) => "operationRef" in event && event.operationRef === input.operationRef);
    const noOp =
      alreadyCommitted ||
      (input.kind === "retreat" && state.retreated) ||
      (input.kind === "resume" && !state.retreated) ||
      (input.kind === "abandon" && state.abandoned);
    if (noOp) return { applied: true, view: viewOf(record, state, itemById) };
    if (record.challenge.status !== "active") return { applied: false, refused: "challenge_not_active" };

    const result = await deps.challengeStore.appendEvent({
      challengeId: input.challengeId,
      learnerStateRef: input.learnerStateRef,
      expectedSeq: nextSeq(record),
      event: { kind: input.kind, operationRef: input.operationRef },
      ...(input.kind === "abandon" ? { materializeStatus: "abandoned" as const } : {})
    });
    if (result === "appended" || result === "duplicate" || result === "stale") {
      const fresh = await reload(input);
      if (!fresh) return { applied: false, refused: "not_found" };
      return { applied: true, view: viewOf(fresh.record, fresh.state, fresh.itemById) };
    }
    return { applied: false, refused: "challenge_not_active" };
  };

  const operations = {
    // Per-scope status for one enrichment: every Leg (section milestone) plus the Expedition
    // (summit) scope. Undefined = unknown enrichment.
    async scopeStatus(input: { learnerStateRef: string; enrichmentId: string }): Promise<RecallScopeStatus[] | undefined> {
      const scopes = await loadScopes(input);
      if (!scopes) return undefined;
      const { challenges, won, eligible } = await scopeState({ ...input, scopes });
      return projectRecallScopeStatuses({
        nodes: scopes.detail.nodes,
        sections: scopes.sections,
        summit: scopes.summit,
        eligible,
        challenges,
        wonScopes: won
      });
    },

    // Create or conflict (KTD2/KTD5): a fresh start over an active challenge is a conflict
    // until a confirmed abandon succeeds; zero eligible items is `unavailable`.
    async create(input: {
      learnerStateRef: string;
      enrichmentId: string;
      scopeKind: RecallChallengeScopeKind;
      anchorDerivedNodeId: string;
    }): Promise<RecallCreateResult> {
      const scopes = await loadScopes(input);
      if (!scopes) return { created: false, refused: "not_found" };
      const section = scopes.sections.find((candidate) => candidate.milestoneDerivedNodeId === input.anchorDerivedNodeId);
      const isSummit = scopes.summit?.derivedNodeId === input.anchorDerivedNodeId;
      if ((input.scopeKind === "section" && !section) || (input.scopeKind === "enrichment" && !isSummit)) {
        return { created: false, refused: "invalid_scope" };
      }

      const state = await scopeState({ ...input, scopes });
      const scopeStatuses = projectRecallScopeStatuses({
        nodes: scopes.detail.nodes,
        sections: scopes.sections,
        summit: scopes.summit,
        eligible: state.eligible,
        challenges: state.challenges,
        wonScopes: state.won
      });
      const scope = scopeStatuses?.find((candidate) => candidate.scopeKind === input.scopeKind && candidate.anchorDerivedNodeId === input.anchorDerivedNodeId);
      if (!scope) return { created: false, refused: "invalid_scope" };
      if (scope.activeChallengeId) return { created: false, refused: "active_challenge_exists", activeChallengeId: scope.activeChallengeId };
      if (scope.state === "locked") return { created: false, refused: "scope_locked" };

      const inScope = new Set(input.scopeKind === "section" ? (section?.stepDerivedNodeIds ?? []) : scopes.sections.flatMap((candidate) => candidate.stepDerivedNodeIds));
      const sectionOf = new Map<string, number>();
      for (const candidate of scopes.sections) {
        for (const nodeId of candidate.stepDerivedNodeIds) sectionOf.set(nodeId, candidate.sectionIndex);
      }
      const eligible = await loadEligible({
        learnerStateRef: input.learnerStateRef,
        enrichmentId: input.enrichmentId,
        assetSetIdentity: state.assetSetIdentity,
        studyItems: scopes.opened.assets.studyItems,
        nodeIdsInScope: (nodeId) => (inScope.has(nodeId) ? sectionOf.get(nodeId) : undefined)
      });
      if (eligible.length === 0) return { created: false, refused: "no_eligible_items" };

      const challengeId = randomUUID();
      const lineup = selectRecallLineup({ challengeId, scopeKind: input.scopeKind, anchorDerivedNodeId: input.anchorDerivedNodeId, eligible });
      const result = await deps.challengeStore.create({
        challengeId,
        learnerStateRef: input.learnerStateRef,
        enrichmentId: input.enrichmentId,
        assetSetIdentity: state.assetSetIdentity,
        scopeKind: input.scopeKind,
        scopeAnchorDerivedNodeId: input.anchorDerivedNodeId,
        lineup
      });
      if (!result.created) {
        // Lost a concurrent-create race: resume the winner.
        const active = await deps.challengeStore.getActiveForScope({
          learnerStateRef: input.learnerStateRef,
          enrichmentId: input.enrichmentId,
          assetSetIdentity: state.assetSetIdentity,
          scopeKind: input.scopeKind,
          scopeAnchorDerivedNodeId: input.anchorDerivedNodeId
        });
        if (active) return { created: false, refused: "active_challenge_exists", activeChallengeId: active.challenge.challengeId };
        return { created: false, refused: "not_found" };
      }
      const loaded = await reload({ learnerStateRef: input.learnerStateRef, challengeId });
      if (!loaded) return { created: false, refused: "not_found" };
      return { created: true, view: viewOf(loaded.record, loaded.state, loaded.itemById) };
    },

    // A route read resumes the exact challenge (KTD2). Abandoned challenges read as not found:
    // the client returns to the trail rather than synthesizing local state.
    async read(input: { learnerStateRef: string; challengeId: string }): Promise<RecallReadResult> {
      const loaded = await reload(input);
      if (!loaded || loaded.record.challenge.status === "abandoned") return { found: false, refused: "not_found" };
      return { found: true, view: viewOf(loaded.record, loaded.state, loaded.itemById) };
    },

    async answerSelection(input: {
      learnerStateRef: string;
      challengeId: string;
      attemptRef: string;
      studyItemId: string;
      chosenId: string;
      responseDurationMs: number | null;
    }): Promise<RecallAnswerResult> {
      if (!input.chosenId) return { answered: false, refused: "invalid_input" };
      return transition({
        ...input,
        grade: (item) => {
          if (item.itemType === "matching") return { ok: false, refused: "item_type_mismatch" };
          const keyedCorrectId = keyedCorrectIdFor(item);
          if (!keyedCorrectId) return { ok: false, refused: "invalid_input" };
          const correct = input.chosenId === keyedCorrectId;
          return {
            ok: true,
            promptId: null,
            chosenId: input.chosenId,
            correct,
            feedback: () => ({ kind: "selection", correct, chosenId: input.chosenId, keyedCorrectId })
          };
        }
      });
    },

    async answerMatchingPair(input: {
      learnerStateRef: string;
      challengeId: string;
      attemptRef: string;
      studyItemId: string;
      promptId: string;
      chosenMatchId: string;
      responseDurationMs: number | null;
    }): Promise<RecallAnswerResult> {
      if (!input.promptId || !input.chosenMatchId) return { answered: false, refused: "invalid_input" };
      return transition({
        ...input,
        grade: (item) => {
          if (item.itemType !== "matching") return { ok: false, refused: "item_type_mismatch" };
          const keyedMatchId = keyedMatchIdFor(item as MatchingItem, input.promptId);
          if (!keyedMatchId) return { ok: false, refused: "invalid_input" };
          const correct = input.chosenMatchId === keyedMatchId;
          return {
            ok: true,
            promptId: input.promptId,
            chosenId: input.chosenMatchId,
            correct,
            feedback: (stateAfter) => {
              // Round facts read off the post-commit fold: the board resets on completion, so
              // a completed round leaves this item either resolved (clean) or rotated (dirty).
              const stillMidBoard = stateAfter.matching?.studyItemId === item.studyItemId && stateAfter.matching.matchedPromptIds.length > 0;
              const resolved = stateAfter.resolvedItemIds.includes(item.studyItemId);
              const roundComplete = correct && !stillMidBoard;
              return {
                kind: "matching_pair",
                correct,
                promptId: input.promptId,
                chosenMatchId: input.chosenMatchId,
                keyedMatchId,
                roundComplete,
                roundClean: roundComplete && resolved
              };
            }
          };
        }
      });
    },

    async retreat(input: { learnerStateRef: string; challengeId: string; operationRef: string }): Promise<RecallLifecycleResult> {
      return lifecycle({ ...input, kind: "retreat" });
    },
    async resume(input: { learnerStateRef: string; challengeId: string; operationRef: string }): Promise<RecallLifecycleResult> {
      return lifecycle({ ...input, kind: "resume" });
    },
    // Confirmed abandon (KTD7): the only way a fresh start replaces an active challenge.
    async abandon(input: { learnerStateRef: string; challengeId: string; operationRef: string }): Promise<RecallLifecycleResult> {
      return lifecycle({ ...input, kind: "abandon" });
    }
  };
  return operations;
}
