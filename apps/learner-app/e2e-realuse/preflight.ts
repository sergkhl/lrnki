import { buildTrailView, type StudySession } from "@lrnki/application/projection";

// Capability-based catalog selection for the durable real-use gate (plan 2026-07-15-001 U2, R6-R7).
// It NEVER generates: it authenticates as the disposable probe learner over public routes, reads
// the shared `/catalog`, and picks the first ready enrichment whose real Study Session renders a
// reachable one-tap auto-graded stop (option_select or impostor). Selection is by typed capability,
// not by title or domain, so the integration journey stays content-neutral across mixed domains
// (H1). An empty or unsuitable catalog throws with an actionable message and starts no journey.

export type GradedKind = "option_select" | "impostor";

export type SelectedCandidate = {
  enrichmentId: string;
  title: string;
  declaredDomain: string;
  totalStopCount: number;
  // Which one-tap graded kind the journey will target on this trail (the spec taps that checkpoint
  // by its typed kind, not by any generated concept label).
  gradedKind: GradedKind;
};

type CatalogCandidate = { enrichmentId: string; title: string; declaredDomain: string; totalStopCount: number };

// Only the first N candidates are probed so a large catalog can't make preflight open-ended.
const MAX_PROBE_CANDIDATES = 25;

async function authedJson<T>(base: string, path: string, token: string): Promise<{ status: number; body: T | null }> {
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = res.ok ? ((await res.json()) as T) : null;
  return { status: res.status, body };
}

// A ready expedition is suitable when its trail has a non-locked one-tap graded stop — the exact
// projection the client renders, so "renderable" here means renderable there too. Returns the kind
// of that first reachable stop (so the journey knows which checkpoint to tap), or null if none.
function reachableGradedKind(session: StudySession): GradedKind | null {
  const trail = buildTrailView(session);
  for (const concept of trail.concepts) {
    for (const stop of concept.stops) {
      if ((stop.kind === "option_select" || stop.kind === "impostor") && stop.state !== "locked") {
        return stop.kind;
      }
    }
  }
  return null;
}

export async function selectCandidate(opts: {
  apiBase: string;
  probeRef: string;
  pin: string;
}): Promise<SelectedCandidate> {
  const { apiBase, probeRef, pin } = opts;

  const sessionRes = await fetch(`${apiBase}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent: "create", learnerStateRef: probeRef, pin, displayName: probeRef })
  });
  if (!sessionRes.ok) {
    throw new Error(`[preflight] could not register the probe learner (${sessionRes.status}). Is the real-use API up on ${apiBase}?`);
  }
  const { token } = (await sessionRes.json()) as { token: string };

  const catalog = await authedJson<{ candidates: CatalogCandidate[] }>(apiBase, "/catalog", token);
  if (catalog.status !== 200 || !catalog.body) {
    throw new Error(`[preflight] /catalog returned ${catalog.status}; expected an authenticated catalog list.`);
  }
  const candidates = catalog.body.candidates;
  if (candidates.length === 0) {
    throw new Error("[preflight] the catalog is empty. Seed at least one ready enrichment before running the real-use gate; this suite never generates one.");
  }

  for (const candidate of candidates.slice(0, MAX_PROBE_CANDIDATES)) {
    const detail = await authedJson<{ session: StudySession }>(apiBase, `/expedition/${candidate.enrichmentId}`, token);
    if (detail.status !== 200 || !detail.body) continue;
    const gradedKind = reachableGradedKind(detail.body.session);
    if (gradedKind) {
      return {
        enrichmentId: candidate.enrichmentId,
        title: candidate.title,
        declaredDomain: candidate.declaredDomain,
        totalStopCount: candidate.totalStopCount,
        gradedKind
      };
    }
  }

  throw new Error(
    `[preflight] no suitable ready enrichment found among ${candidates.length} candidate(s): none exposes a reachable one-tap auto-graded stop. This suite selects by capability and never generates content.`
  );
}
