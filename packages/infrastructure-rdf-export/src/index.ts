import type { GraphSnapshot } from "@lrnki/domain-core";
export function exportGraphAsJsonLd(snapshot: GraphSnapshot) {
  return {
    "@context": { lrnki: "https://lrnki.local/ontology/", skos: "http://www.w3.org/2004/02/skos/core#", label: "skos:prefLabel" },
    "@id": `https://lrnki.local/graph/${snapshot.graphVersionId}`,
    "@graph": snapshot.concepts.map((concept) => ({ "@id": concept.iri, "@type": "skos:Concept", label: concept.canonicalLabel, "skos:altLabel": concept.aliases }))
  };
}
