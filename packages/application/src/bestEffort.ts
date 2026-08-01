// The one best-effort cleanup wrapper. A terminal write on a FAILURE path is bookkeeping about an
// error, so it must never be able to replace that error: the original throw is the diagnosis and a
// failed cleanup is a symptom (the classical lost-exception antipattern — Java's throwing `finally`
// before try-with-resources, .NET CA2219). JavaScript has no `addSuppressed`, so swallowing at the
// cleanup site is the conventional expression; every caller rethrows the error it caught.
//
// Only for cleanup that a later mechanism repairs. Callers here are covered by the fencing token
// (a lost claim means someone else owns the row) or the staleness reap (a run left `running` is
// failed within OPERATION_HEARTBEAT_STALE_AFTER_MS). Never wrap a write nothing else recovers.
export async function bestEffort(write: () => Promise<unknown>): Promise<void> {
  try {
    await write();
  } catch {
    // Swallowed: the original error is rethrown by the caller.
  }
}
