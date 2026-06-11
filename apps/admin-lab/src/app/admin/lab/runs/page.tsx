import Link from "next/link";
import { AdminShell } from "../../../../components/AdminShell";
import { listRuns } from "../../../../lib/inspection";

// Server component: read-only list of Extraction Runs (ADR-0011, ADR-0017).
export const dynamic = "force-dynamic";

export default async function RunListPage() {
  const runs = await listRuns();
  return (
    <AdminShell active="runs">
      <section className="panel">
        <div className="panel-heading"><h2>Extraction runs</h2><span className="badge">{runs ? `${runs.length} runs` : "database unavailable"}</span></div>
        {runs && runs.length > 0 ? (
          <table className="data">
            <thead><tr><th>Source</th><th>Domain</th><th>Status</th><th>Candidates</th><th>Core</th><th>Claims ✓/✗</th><th>Proposals</th><th>Latency</th><th>Started</th></tr></thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.runId}>
                  <td><Link href={`/admin/lab/runs/${run.runId}`}>{run.sourceTitle}</Link></td>
                  <td>{run.declaredDomain}</td>
                  <td>{run.status}</td>
                  <td>{run.candidateCount}</td>
                  <td>{run.coreCount}</td>
                  <td>{run.verifiedClaimCount}/{run.rejectedClaimCount}</td>
                  <td>{run.proposalCount}</td>
                  <td>{run.latencyMs !== null ? `${Math.round(run.latencyMs / 1000)}s` : "—"}</td>
                  <td>{run.startedAt.slice(0, 19).replace("T", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No extraction runs recorded{runs ? "" : " (set DATABASE_URL)"}.</p>
        )}
      </section>
    </AdminShell>
  );
}
