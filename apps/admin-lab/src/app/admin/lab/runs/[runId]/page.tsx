import Link from "next/link";
import { AdminShell } from "../../../../../components/AdminShell";
import { getRunInspection } from "../../../../../lib/inspection";

// Server component: read-only Run Inspector over one Extraction Run — candidates
// with admission decisions, claims with validation outcomes and evidence quotes,
// and missing-concept proposals (ADR-0011, ADR-0017).
export const dynamic = "force-dynamic";

export default async function RunInspectorPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const inspection = await getRunInspection(runId);
  if (!inspection) {
    return (
      <AdminShell active="runs">
        <section className="panel"><h2>Run not found</h2><p className="muted">No extraction run {runId}. <Link href="/admin/lab/runs">Back to runs</Link>.</p></section>
      </AdminShell>
    );
  }
  const { run, candidates, claims, proposals } = inspection;
  return (
    <AdminShell active="runs">
      <section className="panel">
        <div className="panel-heading">
          <h2>{run.sourceTitle}</h2>
          <span className="badge">{run.declaredDomain} · {run.status}</span>
        </div>
        <dl className="run-facts">
          <dt>Run</dt><dd>{run.runId}</dd>
          <dt>Config</dt><dd>{inspection.pipelineConfigHash}</dd>
          <dt>Latency</dt><dd>{run.latencyMs !== null ? `${Math.round(run.latencyMs / 1000)}s` : "—"}</dd>
          <dt>Counts</dt><dd>{run.candidateCount} candidates · {run.coreCount} core · {run.verifiedClaimCount} verified / {run.rejectedClaimCount} rejected claims · {run.proposalCount} proposals</dd>
        </dl>

        <h3>Candidates and admission decisions</h3>
        <table className="data">
          <thead><tr><th>Tier</th><th>Label</th><th>Aliases</th><th>Mentions</th><th>Reason codes</th><th>Confidence</th></tr></thead>
          <tbody>
            {candidates.map((candidate) => (
              <tr key={candidate.candidateKey} className={`tier-${candidate.tier}`}>
                <td>{candidate.tier}</td>
                <td>{candidate.canonicalLabel}</td>
                <td>{candidate.aliases.join(", ") || "—"}</td>
                <td>{candidate.mentionCount}</td>
                <td>{candidate.reasonCodes.join(", ")}</td>
                <td>{candidate.confidence.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>Claims</h3>
        <table className="data">
          <thead><tr><th>Outcome</th><th>Subject</th><th>Relation</th><th>Object</th><th>Confidence</th><th>Evidence</th></tr></thead>
          <tbody>
            {claims.map((claim, index) => (
              <tr key={index} className={claim.validationOutcome === "rejected" ? "rejected" : ""}>
                <td>{claim.validationOutcome}</td>
                <td>{claim.subjectLabel}</td>
                <td>{claim.predicate}</td>
                <td>{claim.objectLabel}</td>
                <td>{claim.modelConfidence.toFixed(2)}</td>
                <td className="quote">{claim.evidenceQuotes.length > 0 ? claim.evidenceQuotes.map((quote, i) => <p key={i}>“{quote}”</p>) : <span className="muted">no verifiable quote</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>Missing-concept proposals</h3>
        {proposals.length > 0 ? (
          <table className="data">
            <thead><tr><th>Proposed label</th><th>Rationale</th><th>Evidence</th></tr></thead>
            <tbody>
              {proposals.map((proposal, index) => (
                <tr key={index}>
                  <td>{proposal.proposedLabel}</td>
                  <td>{proposal.rationale}</td>
                  <td className="quote">{proposal.evidenceQuote ? `“${proposal.evidenceQuote}”` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No missing-concept proposals for this run.</p>
        )}
      </section>
    </AdminShell>
  );
}
