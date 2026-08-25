import { buildTrailView, type StudySession } from "@lrnki/application/projection";

// Capability-based catalog selection for the durable real-use gate (plan 2026-07-15-001 U2, R6-R7).
// It NEVER generates: it authenticates as the disposable probe learner over public routes, reads
// the shared `/catalog`, and picks the first ready enrichment whose real Study Session renders a
// reachable one-tap auto-graded stop (option_select or impostor). Selection is by typed capability,
// not by title or domain, so the integration journey stays content-neutral across mixed domains
// (H1). An empty or unsuitable catalog throws with an actionable message and starts no journey.
//
// It registers through Better Auth's email + password route — the same one the browser journey
// and the API suite drive, and the only one any rig ever drives (ADR-0041). Google is never
// automated. The probe carries the run's reserved address so teardown finds it by the run id
// alone; its generated `user.id` is Better Auth's to choose and is never asserted here.

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

async function authedJson<T>(base: string, path: string, cookie: string): Promise<{ status: number; body: T | null }> {
  const res = await fetch(`${base}${path}`, { headers: { cookie } });
  const body = res.ok ? ((await res.json()) as T) : null;
  return { status: res.status, body };
}

// Collapse a `Set-Cookie` response into the `Cookie` request header the next call sends. Node's
// fetch exposes the multi-valued header only through `getSetCookie()`; reading `.get("set-cookie")`
// would silently fold several cookies into one comma-joined value the server cannot parse.
function sessionCookie(res: Response): string {
  return res.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
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
  probeEmail: string;
  password: string;
}): Promise<SelectedCandidate> {
  const { apiBase, probeEmail, password } = opts;

  // `origin` is the API's own base URL, which Better Auth always trusts (it seeds trustedOrigins
  // from `baseURL`). A scripted client sends no origin unless told to, and Better Auth refuses a
  // cookie-bearing write that arrives without one — so setting it here keeps this call shaped like
  // every other write the gate makes rather than relying on sign-up's laxer path.
  const signUpRes = await fetch(`${apiBase}/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: apiBase },
    // The display name is the address's local part: run-unique, domain-neutral, and readable in
    // the DB while a run is live. `profileComplete` skips the first-run naming screen, exactly as
    // the app's own email sign-up does (D7) — the probe never renders a UI at all.
    body: JSON.stringify({ email: probeEmail, password, name: probeEmail.split("@")[0], profileComplete: true })
  });
  if (!signUpRes.ok) {
    throw new Error(`[preflight] could not register the probe learner (${signUpRes.status}). Is the real-use API up on ${apiBase}?`);
  }
  const cookie = sessionCookie(signUpRes);
  if (!cookie) {
    throw new Error("[preflight] sign-up succeeded but issued no session cookie; the API is not configured for cookie sessions.");
  }

  const catalog = await authedJson<{ candidates: CatalogCandidate[] }>(apiBase, "/catalog", cookie);
  if (catalog.status !== 200 || !catalog.body) {
    throw new Error(`[preflight] /catalog returned ${catalog.status}; expected an authenticated catalog list.`);
  }
  const candidates = catalog.body.candidates;
  if (candidates.length === 0) {
    throw new Error("[preflight] the catalog is empty. Seed at least one ready enrichment before running the real-use gate; this suite never generates one.");
  }

  for (const candidate of candidates.slice(0, MAX_PROBE_CANDIDATES)) {
    const adoption = await fetch(`${apiBase}/expedition/choose`, {
      method: "POST",
      headers: { cookie, origin: apiBase, "content-type": "application/json" },
      body: JSON.stringify({ enrichmentId: candidate.enrichmentId })
    });
    if (!adoption.ok) continue;
    const detail = await authedJson<{ session: StudySession }>(apiBase, `/expedition/${candidate.enrichmentId}`, cookie);
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
