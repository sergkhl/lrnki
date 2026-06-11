import { AdminShell } from "../../../components/AdminShell";
import { GraphExplorer } from "../../../components/GraphExplorer";
import { loadPublishedSnapshot } from "../../../lib/publishedSnapshot";

// Server component: read-only Graph Explorer over the latest published version.
export const dynamic = "force-dynamic";

export default async function AdminLabPage() {
  const { snapshot, live } = await loadPublishedSnapshot();
  return <AdminShell><GraphExplorer snapshot={snapshot} key={live ? snapshot.graphVersionId : "demo"} /></AdminShell>;
}
