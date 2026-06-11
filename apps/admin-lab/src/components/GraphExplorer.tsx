"use client";
import { useMemo, useState } from "react";
import type { GraphSnapshot } from "@lrnki/domain-core";

function formatClaimObject(snapshot: GraphSnapshot, claim: GraphSnapshot["claims"][number]): string | undefined {
  const object = claim.object;
  if (object.kind === "concept") return snapshot.concepts.find((concept) => concept.conceptId === object.conceptId)?.canonicalLabel;
  return String(object.value);
}

// Deterministic circular layout so any published snapshot renders without
// hand-placed coordinates. Read-only: the Admin Lab never mutates the graph (ADR-0011).
function layout(snapshot: GraphSnapshot): Record<string, { x: number; y: number }> {
  const n = Math.max(snapshot.concepts.length, 1);
  const r = Math.min(150, 60 + n * 6);
  const positions: Record<string, { x: number; y: number }> = {};
  snapshot.concepts.forEach((concept, index) => {
    const angle = (index / n) * Math.PI * 2 - Math.PI / 2;
    positions[concept.conceptId] = { x: 370 + r * Math.cos(angle), y: 190 + r * Math.sin(angle) };
  });
  return positions;
}

export function GraphExplorer({ snapshot }: Readonly<{ snapshot: GraphSnapshot }>) {
  const [selectedId, setSelectedId] = useState(snapshot.concepts[0]?.conceptId);
  const [query, setQuery] = useState("");
  const positions = useMemo(() => layout(snapshot), [snapshot]);
  const selected = snapshot.concepts.find((concept) => concept.conceptId === selectedId);
  const matches = query
    ? snapshot.concepts.filter((concept) => concept.canonicalLabel.toLowerCase().includes(query.toLowerCase()) || concept.aliases.some((alias) => alias.toLowerCase().includes(query.toLowerCase())))
    : snapshot.concepts;

  return <section className="workspace">
    <div className="panel graph-panel">
      <div className="panel-heading"><div><p className="eyebrow">Published graph version</p><h2>{snapshot.graphVersionId}</h2></div><span className="badge">{snapshot.concepts.length} concepts · {snapshot.claims.length} claims</span></div>
      <svg className="graph" viewBox="0 0 740 380" role="img" aria-label="Concept graph">
        {snapshot.claims.map((claim) => { const target = claim.object.kind === "concept" ? positions[claim.object.conceptId] : undefined; const source = positions[claim.subjectConceptId]; return source && target ? <g key={claim.claimId}><line x1={source.x} y1={source.y} x2={target.x} y2={target.y} /><text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 8}>{claim.predicate}</text></g> : null; })}
        {snapshot.concepts.map((concept) => { const point = positions[concept.conceptId] ?? { x: 80, y: 80 }; return <g key={concept.conceptId} className={selectedId === concept.conceptId ? "node selected" : "node"} onClick={() => setSelectedId(concept.conceptId)}><circle cx={point.x} cy={point.y} r="34" /><text x={point.x} y={point.y + 5}>{concept.canonicalLabel}</text></g>; })}
      </svg>
    </div>
    <aside className="panel details">
      <p className="eyebrow">Concept search</p>
      <input className="search" value={query} placeholder="Filter concepts…" onChange={(event) => setQuery(event.target.value)} />
      <ul className="concept-list">{matches.map((concept) => <li key={concept.conceptId}><button type="button" onClick={() => setSelectedId(concept.conceptId)}>{concept.canonicalLabel} <span className="muted">[{concept.declaredDomain}]</span></button></li>)}</ul>
      <h2>{selected?.canonicalLabel ?? "Select a concept"}</h2>
      {selected ? <>
        <dl><dt>IRI</dt><dd>{selected.iri}</dd><dt>Domain</dt><dd>{selected.declaredDomain}</dd><dt>Trust tier</dt><dd>{selected.trustTier}{selected.homograph ? " · homograph" : ""}</dd><dt>Aliases</dt><dd>{selected.aliases.join(", ") || "None"}</dd></dl>
        <h3>Claims</h3>
        <ul>{snapshot.claims.filter((claim) => claim.subjectConceptId === selected.conceptId).map((claim) => <li key={claim.claimId}><strong>{claim.predicate}</strong> <span>{formatClaimObject(snapshot, claim)}</span></li>)}</ul>
      </> : null}
    </aside>
  </section>;
}
