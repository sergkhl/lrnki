import Link from "next/link";
import { AdminShell } from "../../../../../components/AdminShell";
import { getSourceInspection } from "../../../../../lib/inspection";

// Server component: read-only Source Explorer over one registered source —
// identity, parser provenance, and the parsed block structure that evidence
// quotes resolve against (ADR-0004, ADR-0011).
export const dynamic = "force-dynamic";

export default async function SourceExplorerPage({ params }: { params: Promise<{ sourceResourceId: string }> }) {
  const { sourceResourceId } = await params;
  const inspection = await getSourceInspection(sourceResourceId);
  if (!inspection) {
    return (
      <AdminShell active="sources">
        <section className="panel"><h2>Source not found</h2><p className="muted">No registered source {sourceResourceId}. <Link href="/admin/lab/sources">Back to sources</Link>.</p></section>
      </AdminShell>
    );
  }
  const { source, blocks } = inspection;
  return (
    <AdminShell active="sources">
      <section className="panel">
        <div className="panel-heading">
          <h2>{source.title}</h2>
          <span className="badge">{source.declaredDomain} · {source.contentType}</span>
        </div>
        <dl className="run-facts">
          <dt>Source</dt><dd>{source.sourceResourceId}</dd>
          <dt>Hash</dt><dd className="mono">{source.contentHash}</dd>
          <dt>Parser</dt><dd>{inspection.parserName} {inspection.parserVersion}</dd>
          <dt>Blocks</dt><dd>{source.blockCount} blocks · {source.runCount} extraction runs</dd>
        </dl>

        <h3>Parsed blocks</h3>
        <table className="data">
          <thead><tr><th>Block</th><th>Type</th><th>Heading path</th><th>Text</th></tr></thead>
          <tbody>
            {blocks.map((block) => (
              <tr key={block.blockId}>
                <td className="mono">{block.blockId}</td>
                <td>{block.blockType}</td>
                <td>{block.headingPath.join(" › ") || "—"}</td>
                <td className="quote">{block.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
