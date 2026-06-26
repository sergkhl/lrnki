import { AdminShell } from "../../../components/AdminShell";
import { GraphExplorer } from "../../../components/GraphExplorer";
import { IdentityDecisionsTable } from "../../../components/IdentityDecisionsTable";
import { getConceptIdentityDecisions } from "../../../lib/inspection";
import { loadPublishedSnapshot } from "../../../lib/publishedSnapshot";

// Server component: read-only Graph Explorer over the latest published version, plus the
// identity-resolution decisions recorded for that version (plan U4).
export const dynamic = "force-dynamic";

export default async function AdminLabPage() {
  const { snapshot, live } = await loadPublishedSnapshot();
  // Identity decisions are only meaningful for a real published version; the demo
  // snapshot has none.
  const decisions = live ? (await getConceptIdentityDecisions(snapshot.graphVersionId)) ?? [] : [];
  return (
    <AdminShell>
      <GraphExplorer snapshot={snapshot} live={live} key={live ? snapshot.graphVersionId : "demo"} />
      {live ? <IdentityDecisionsTable decisions={decisions} /> : null}
    </AdminShell>
  );
}
