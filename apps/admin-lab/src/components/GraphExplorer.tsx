"use client";
import { useState } from "react";
import type { GraphSnapshot } from "@lrnki/domain-core";

const positions: Record<string, { x: number; y: number }> = { calculus: { x: 160, y: 180 }, derivative: { x: 360, y: 110 }, integral: { x: 360, y: 260 }, limit: { x: 570, y: 180 } };

function formatClaimObject(snapshot: GraphSnapshot, claim: GraphSnapshot["claims"][number]): string | undefined {
  const object = claim.object;
  if (object.kind === "concept") return snapshot.concepts.find((concept) => concept.conceptId === object.conceptId)?.canonicalLabel;
  if (object.kind === "literal") return String(object.value);
  return object.text;
}

export function GraphExplorer({ snapshot }: Readonly<{ snapshot: GraphSnapshot }>) {
  const [selectedId, setSelectedId] = useState(snapshot.concepts[0]?.conceptId);
  const selected = snapshot.concepts.find((concept) => concept.conceptId === selectedId);
  return <section className="workspace">
    <div className="panel graph-panel"><div className="panel-heading"><div><p className="eyebrow">Published graph version</p><h2>{snapshot.graphVersionId}</h2></div><span className="badge">{snapshot.concepts.length} concepts · {snapshot.claims.length} claims</span></div>
      <svg className="graph" viewBox="0 0 740 380" role="img" aria-label="Demo concept graph">
        {snapshot.claims.map((claim) => { const target = claim.object.kind === "concept" ? positions[claim.object.conceptId] : undefined; const source = positions[claim.subjectConceptId]; return source && target ? <g key={claim.claimId}><line x1={source.x} y1={source.y} x2={target.x} y2={target.y} /><text x={(source.x+target.x)/2} y={(source.y+target.y)/2 - 8}>{claim.predicate}</text></g> : null; })}
        {snapshot.concepts.map((concept) => { const point=positions[concept.conceptId] ?? {x:80,y:80}; return <g key={concept.conceptId} className={selectedId===concept.conceptId ? "node selected" : "node"} onClick={() => setSelectedId(concept.conceptId)}><circle cx={point.x} cy={point.y} r="46"/><text x={point.x} y={point.y+5}>{concept.canonicalLabel}</text></g>; })}
      </svg>
    </div>
    <aside className="panel details"><p className="eyebrow">Concept details</p><h2>{selected?.canonicalLabel ?? "Select a concept"}</h2>{selected ? <><dl><dt>IRI</dt><dd>{selected.iri}</dd><dt>Trust tier</dt><dd>{selected.trustTier}</dd><dt>Aliases</dt><dd>{selected.aliases.join(", ") || "None"}</dd></dl><h3>Claims</h3><ul>{snapshot.claims.filter((claim)=>claim.subjectConceptId===selected.conceptId).map((claim)=><li key={claim.claimId}><strong>{claim.predicate}</strong><br/><span>{formatClaimObject(snapshot, claim)}</span></li>)}</ul></> : null}</aside>
  </section>;
}
