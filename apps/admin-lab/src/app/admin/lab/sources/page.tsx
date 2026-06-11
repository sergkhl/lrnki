import Link from "next/link";
import { AdminShell } from "../../../../components/AdminShell";
import { listSourcesWithStats } from "../../../../lib/inspection";

// Server component: read-only list of registered curated sources (ADR-0004, ADR-0011).
export const dynamic = "force-dynamic";

export default async function SourceListPage() {
  const sources = await listSourcesWithStats();
  return (
    <AdminShell active="sources">
      <section className="panel">
        <div className="panel-heading"><h2>Curated sources</h2><span className="badge">{sources ? `${sources.length} sources` : "database unavailable"}</span></div>
        {sources && sources.length > 0 ? (
          <table className="data">
            <thead><tr><th>Title</th><th>Declared Domain</th><th>Content type</th><th>Blocks</th><th>Runs</th><th>Content hash</th></tr></thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.sourceResourceId}>
                  <td><Link href={`/admin/lab/sources/${source.sourceResourceId}`}>{source.title}</Link></td>
                  <td>{source.declaredDomain}</td>
                  <td>{source.contentType}</td>
                  <td>{source.blockCount}</td>
                  <td>{source.runCount}</td>
                  <td className="mono">{source.contentHash.slice(0, 16)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No sources registered{sources ? "" : " (set DATABASE_URL)"}.</p>
        )}
      </section>
    </AdminShell>
  );
}
