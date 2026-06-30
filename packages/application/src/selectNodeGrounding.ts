import type {
  DerivedGraphNode,
  GraphSnapshot,
  PublishedConceptEvidenceProfile,
  StudyItemGroundingProvenance
} from "@lrnki/domain-core";

// Per-node grounding selection (KTD3, rule 18). Extracted from generateStudyItemBank so the
// Concept Lesson is the SINGLE consumer of raw passages: the lesson grounds from here, and
// option-select reads the lesson instead (U7). A provenance-tagged passage carries either
// source ids (a verbatim-verifiable source quote) or a derivedNodeId (generated grounding).
export type GroundingPassage =
  | { passageId: string; kind: "definition" | "mention"; text: string; sourceResourceId: string; sourceBlockId: string }
  | { passageId: string; kind: "definition" | "mention"; text: string; derivedNodeId: string };

export type NodeGrounding = {
  provenance: StudyItemGroundingProvenance;
  passages: GroundingPassage[];
  definesLiteral: string | null;
};

export function selectNodeGrounding(
  node: DerivedGraphNode,
  snapshot: GraphSnapshot,
  profileByConcept: Map<string, PublishedConceptEvidenceProfile>
): NodeGrounding | undefined {
  if (node.nodeKind === "anchor") {
    const profile = profileByConcept.get(node.conceptId);
    const passages: GroundingPassage[] = [
      ...(profile?.definitions ?? []).map((passage) => ({
        passageId: passage.sourceBlockId,
        kind: "definition" as const,
        text: passage.evidenceQuote,
        sourceResourceId: passage.sourceResourceId,
        sourceBlockId: passage.sourceBlockId
      })),
      ...(profile?.mentions ?? []).map((passage) => ({
        passageId: passage.sourceBlockId,
        kind: "mention" as const,
        text: passage.evidenceQuote,
        sourceResourceId: passage.sourceResourceId,
        sourceBlockId: passage.sourceBlockId
      }))
    ];
    return {
      provenance: "source_cep",
      passages,
      definesLiteral: profile?.assertions.find((assertion) => assertion.type === "defines")?.literalValue ?? null
    };
  }

  if (node.groundingOrigin === "source_mentioned") {
    return {
      provenance: "source_mentioned",
      passages: node.groundingPassages
        .filter((passage) => passage.verbatimCheck.disposition === "verified")
        .map((passage) => ({
          passageId: passage.sourceBlockId,
          kind: passage.passageType,
          text: passage.evidenceQuote,
          sourceResourceId: passage.sourceResourceId,
          sourceBlockId: passage.sourceBlockId
        })),
      definesLiteral: null
    };
  }

  const generated = [
    ...node.groundingBundle.definitions.map((passage, index) => ({ passage, kind: "definition" as const, index })),
    ...node.groundingBundle.mentions.map((passage, index) => ({ passage, kind: "mention" as const, index }))
  ];
  return {
    provenance: "generated",
    passages: generated.map(({ passage, kind, index }) => ({
      passageId: `${node.derivedNodeId}:${kind}:${index}`,
      kind,
      text: passage.text,
      derivedNodeId: node.derivedNodeId
    })),
    definesLiteral: node.groundingBundle.definitions[0]?.text ?? null
  };
}
